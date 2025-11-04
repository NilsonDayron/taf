// script.js — TAF com slider 100% estável no iPhone + percurso em canvas + filtro anti-ruído
document.addEventListener('DOMContentLoaded', () => {
  // ===== Constantes do TAF =====
  const TIME_LIMIT_SECONDS = 12 * 60;   // 12 min
  const DISTANCE_GOAL_METERS = 2400;    // (reservado para uso futuro)

  // ===== Filtro anti-ruído do GPS =====
  const GPS_MIN_ACCURACY_M = 25;        // rejeita fixes com precisão > 25 m
  const GPS_MIN_STEP_M     = 3;         // passo mínimo “fixo” (anti-jitter)
  const GPS_MAX_JUMP_M     = 80;        // rejeita saltos > 80 m
  const GPS_MAX_SPEED_MPS  = 8;         // rejeita velocidade > 8 m/s (~28,8 km/h)
  let   lastFixTs = 0;                  // timestamp (ms) do último fix aceito

  // ===== Estado =====
  let appState = 'ready';               // 'ready' | 'running' | 'paused'
  let timerInterval = null;
  let timerStartTime = 0;
  let accumulatedTimeMs = 0;
  let distanceMeters = 0;
  let lastPosition = null;
  let gpsWatchId = null;
  let wakeLock = null;
  let snapshotTaken = false;

  // ===== DOM =====
  const pages = document.querySelectorAll('.page');
  const btnHomem = document.getElementById('btn-homem');
  const btnMulher = document.getElementById('btn-mulher');
  const btnBack   = document.getElementById('btn-back');

  const timerDisplay    = document.getElementById('timer-display');
  const snapshotDisplay = document.getElementById('snapshot-display');
  const instructions    = document.getElementById('instructions');

  const btnStart    = document.querySelector('[data-btn="start"]');
  const btnPause    = document.querySelector('[data-btn="pause"]');
  const btnContinue = document.querySelector('[data-btn="continue"]');
  const btnRestart  = document.querySelector('[data-btn="restart"]');
  const btnDetails  = document.querySelector('[data-btn="details"]');

  // ===== Canvas do percurso =====
  const trackCanvas = document.getElementById('track-canvas');
  const metersLabel = document.getElementById('meters-label');
  let tctx = null;
  let trackPoints = [];                 // [{lat, lon}]
  let canvasDPR = 1;

  // ===== Navegação =====
  function showPage(id) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  if (btnHomem) btnHomem.addEventListener('click', () => showPage('page-main'));
  if (btnMulher) btnMulher.addEventListener('click', () => showPage('page-main'));
  if (btnBack)   btnBack.addEventListener('click',   () => showPage('page-main'));

  // ===== Estado dos botões (mostra/esconde sliders) =====
  function updateButtonState(state) {
    appState = state;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(b => b && (b.style.display = 'none'));
    if (state === 'ready') {
      btnStart && (btnStart.style.display = 'flex');
    } else if (state === 'running') {
      btnPause   && (btnPause.style.display   = 'flex');
      btnRestart && (btnRestart.style.display = 'flex');
    } else if (state === 'paused') {
      btnContinue && (btnContinue.style.display = 'flex');
      btnRestart  && (btnRestart.style.display  = 'flex');
      btnDetails  && (btnDetails.style.display  = 'flex');
    }
  }

  // ===== Cronômetro =====
  function startTimer() {
    timerStartTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 100);
    updateButtonState('running');
    requestWakeLock();
    startGpsTracking();
  }

  function pauseTimer() {
    clearInterval(timerInterval);
    accumulatedTimeMs += Date.now() - timerStartTime;
    updateButtonState('paused');
    releaseWakeLock();
    stopGpsTracking();
  }

  function restartTimer() {
    clearInterval(timerInterval);
    accumulatedTimeMs = 0;
    distanceMeters = 0;
    lastPosition = null;
    snapshotTaken = false;
    lastFixTs = 0;

    if (timerDisplay)    timerDisplay.textContent = '00:00:00';
    if (snapshotDisplay) snapshotDisplay.textContent = '';
    if (instructions)    instructions.style.display = 'block';

    // reset percurso
    trackPoints = [];
    resizeTrackCanvas();
    updateMetersLabel();

    updateButtonState('ready');
    releaseWakeLock();
    stopGpsTracking();
    resetAllSliders(); // <-- Isto já estava correto!
  }

  function updateTimer() {
    const totalMs = accumulatedTimeMs + (Date.now() - timerStartTime);
    const totalSeconds = Math.floor(totalMs / 1000);

    if (totalSeconds >= TIME_LIMIT_SECONDS && !snapshotTaken) {
      snapshotTaken = true;
      vibrate();
      if (snapshotDisplay) snapshotDisplay.textContent = `- 12:00:00 em ${distanceMeters.toFixed(0)} metros`;
      if (instructions)    instructions.style.display = 'none';
    }

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (timerDisplay) {
      timerDisplay.textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  }

  // ===== GPS =====
  function startGpsTracking() {
    if (!navigator.geolocation) {
      if (instructions) instructions.textContent = 'Geolocalização não suportada.';
      return;
    }
    gpsWatchId = navigator.geolocation.watchPosition(
      onGpsSuccess,
      onGpsError,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  function stopGpsTracking() {
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    // mantemos lastPosition como âncora até o restart
  }

  // —— GPS com filtro anti-ruído e velocidade derivada ——
  function onGpsSuccess(position) {
    const c = position && position.coords ? position.coords : {};
    const latitude  = c.latitude;
    const longitude = c.longitude;
    const accuracy  = (typeof c.accuracy === 'number') ? c.accuracy : null;
    const gpsSpeed  = (typeof c.speed === 'number' && isFinite(c.speed)) ? c.speed : null; // m/s
    const ts        = (typeof position.timestamp === 'number') ? position.timestamp : Date.now();

    if (!isFinite(latitude) || !isFinite(longitude)) return;

    // 1) descarta leituras muito imprecisas
    if (accuracy !== null && accuracy > GPS_MIN_ACCURACY_M) return;

    // 2) primeira leitura: só ancora
    if (!lastPosition) {
      lastPosition = { latitude, longitude };
      lastFixTs = ts;
      trackPoints.push({ lat: latitude, lon: longitude });
      drawTrack();
      updateMetersLabel();
      return;
    }

    // 3) passo e Δt
    const step = haversineDistance(
      lastPosition.latitude, lastPosition.longitude, latitude, longitude
    );
    const dtMs = Math.max(0, ts - lastFixTs);
    const dt   = dtMs / 1000;

    // 4) limiar dinâmico baseado na precisão (evita “andar parado”)
    const dynamicMin = accuracy != null
      ? Math.max(GPS_MIN_STEP_M, accuracy * 0.6)   // ex.: acc=10m -> ~6m
      : GPS_MIN_STEP_M;

    if (step < dynamicMin) return;       // ignora e NÃO move a âncora
    if (step > GPS_MAX_JUMP_M) return;   // corta saltos

    // 5) velocidade: usa GPS ou derivada (step/dt)
    let speedToCheck = gpsSpeed;
    if ((speedToCheck === null || !isFinite(speedToCheck)) && dt > 0) {
      speedToCheck = step / dt; // m/s
    }
    if (isFinite(speedToCheck) && speedToCheck > GPS_MAX_SPEED_MPS) return;

    // 6) aceita fix
    distanceMeters += step;
    lastPosition = { latitude, longitude };
    lastFixTs = ts;

    // 7) atualiza UI
    trackPoints.push({ lat: latitude, lon: longitude });
    drawTrack();
    updateMetersLabel();
  }

  function onGpsError(e) {
    console.warn('Erro no GPS:', e && e.message ? e.message : e);
    if (instructions) instructions.textContent = 'Erro no GPS. Tente em área aberta.';
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dphi = (lat2 - lat1) * Math.PI/180;
    const dlmb = (lon2 - lon1) * Math.PI/180;
    const a = Math.sin(dphi/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dlmb/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ===== Vibração & Wake Lock =====
  function vibrate(){ if (navigator.vibrate) navigator.vibrate([220,120,220]); }
  async function requestWakeLock(){
    if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); }
      catch(e){ console.warn('WakeLock falhou:', e && e.message ? e.message : e); }
    }
  }
  function releaseWakeLock(){ if (wakeLock){ wakeLock.release(); wakeLock = null; } }

  // ===== Canvas do percurso =====
  function resizeTrackCanvas(){
    if (!trackCanvas) return;
    canvasDPR = window.devicePixelRatio || 1;
    const cssW = trackCanvas.clientWidth || 1;
    const cssH = trackCanvas.clientHeight || 1;
    trackCanvas.width  = Math.max(1, Math.floor(cssW * canvasDPR));
    trackCanvas.height = Math.max(1, Math.floor(cssH * canvasDPR));
    tctx = trackCanvas.getContext('2d');
    if (!tctx) return;
    tctx.setTransform(canvasDPR, 0, 0, canvasDPR, 0, 0);
    drawTrack();
  }

  function drawTrack(){
    if (!tctx || !trackCanvas) return;
    const w = trackCanvas.clientWidth;
    const h = trackCanvas.clientHeight;
    tctx.clearRect(0, 0, w, h);

    if (trackPoints.length < 2) return;

    // bounds geográficos
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of trackPoints){
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }

    const pad = 10;
    const geoW = Math.max(1e-12, maxLon - minLon);
    const geoH = Math.max(1e-12, maxLat - minLat);
    const sx = (w - pad*2) / geoW;
    const sy = (h - pad*2) / geoH;
    const s  = Math.min(sx, sy);

    const toXY = (lat, lon) => {
      const x = pad + (lon - minLon) * s;
      const y = h - pad - (lat - minLat) * s; // Y “sobe”
      return {x, y};
    };

    // trilha
    tctx.lineWidth = 3;
    tctx.lineJoin = 'round';
    tctx.lineCap  = 'round';
    tctx.strokeStyle = '#3b82f6';
    tctx.beginPath();
    const p0 = toXY(trackPoints[0].lat, trackPoints[0].lon);
    tctx.moveTo(p0.x, p0.y);
    for (let i=1;i<trackPoints.length;i++){
      const p = toXY(trackPoints[i].lat, trackPoints[i].lon);
      tctx.lineTo(p.x, p.y);
    }
    tctx.stroke();

    // ponto atual
    const last = trackPoints[trackPoints.length - 1];
    const plast = toXY(last.lat, last.lon);
    tctx.fillStyle = '#ef4444';
    tctx.beginPath();
    tctx.arc(plast.x, plast.y, 4, 0, Math.PI*2);
    tctx.fill();
  }

  function updateMetersLabel(){
    if (!metersLabel) return;
    const m = Math.round(distanceMeters);
    metersLabel.textContent = m < 1000 ? `${m} m` : `${(m/1000).toFixed(2)} km`;
a }

  // ===== Sliders (drag estável no iPhone) =====
  function initSliders(){
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }

  // Implementação sem Pointer Capture (iOS-friendly) usando mouse/touch + rAF
  function attachSliderBehavior(slider){
    const handle = slider.querySelector('.slide-handle');

    // Proteções iOS: impedir que o navegador “roube” o gesto
    slider.style.touchAction = 'none';
    slider.style.webkitUserSelect = 'none';
    slider.style.userSelect = 'none';
    if (handle) {
      handle.style.touchAction = 'none';
      handle.style.webkitUserSelect = 'none';
      handle.style.userSelect = 'none';
      handle.style.willChange = 'transform';
    }

    const PADDING = 4;
    const HANDLE_W = 48;

    let dragging = false;
    let startX = 0;
    let baseX  = 0;
    let x = 0;                 // posição atual
    let targetX = 0;           // posição desejada (suavizada por rAF)
    let rafId = null;

    function maxX(){
      return slider.clientWidth - HANDLE_W - PADDING * 2;
    }

    function setXImmediate(v){
      x = v;
      if (handle) handle.style.transform = `translate3d(${x}px,0,0)`;
    }

    function animate(){
      if (rafId) cancelAnimationFrame(rafId);
      const step = () => {
        // aproxima rapidamente sem overshoot (linear)
        const diff = targetX - x;
        if (Math.abs(diff) > 0.3) {
          x += diff * 0.45; // fator de suavização
          if (handle) handle.style.transform = `translate3d(${x}px,0,0)`;
          rafId = requestAnimationFrame(step);
        } else {
          setXImmediate(targetX);
          rafId = null;
        }
      };
      rafId = requestAnimationFrame(step);
a   }

    function getClientX(e){
      if (e.touches && e.touches.length) return e.touches[0].clientX;
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
      return e.clientX;
    }

    function onDown(e){
      if (e.type === 'mousedown' && e.button !== 0) return;
      dragging = true;
      slider.classList.add('dragging');
      if (handle) handle.style.transition = 'none';
      startX = getClientX(e);
      baseX  = targetX = x; // começa do ponto atual
      e.preventDefault();
      document.addEventListener('mousemove', onMove, {passive:false});
      document.addEventListener('mouseup',   onUp,   {passive:false});
      document.addEventListener('touchmove', onMove, {passive:false});
a     document.addEventListener('touchend',  onUp,   {passive:false});
    }

    function onMove(e){
      if (!dragging) return;
      e.preventDefault();
      const delta = getClientX(e) - startX;
      let next = baseX + delta;
      const mx = maxX();
      if (next < 0) next = 0;
      if (next > mx) next = mx;
      targetX = next;
      animate(); // aplica via rAF (suave e estável)
    }

    function snapTo(pos, cb){
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (handle) handle.style.transition = 'transform .14s cubic-bezier(.2,.8,.2,1)';
      setXImmediate(pos);
      const once = () => {
        if (handle) handle.style.transition = 'none';
        handle && handle.removeEventListener('transitionend', once);
        if (cb) cb();
      };
      handle && handle.addEventListener('transitionend', once);
      !handle && cb && cb();
      targetX = pos;
    }

    function onUp(e){
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('dragging');
      e.preventDefault();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend',  onUp);

      const mx = maxX();
      const pct = mx === 0 ? 0 : (x / mx);

      // ----- ALTERAÇÃO PRINCIPAL AQUI -----
      // Dispara a ação apenas se arrastado 90% OU MAIS,
      // E se o arraste foi de mais de 10 pixels (ignora cliques)
      if (pct >= 0.9 && Math.abs(startX - getClientX(e)) > 10) {
        triggerAction(slider.dataset.btn);
        snapTo(mx, () => snapTo(0));
      } else {
        // Se não, apenas volta ao início
        snapTo(0);
      }
    }

    slider.addEventListener('mousedown', onDown, {passive:false});
    slider.addEventListener('touchstart', onDown, {passive:false});

    // API interna para resetar
    slider._reset = () => {
      dragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (handle) handle.style.transition = 'none';
      targetX = 0;
      setXImmediate(0);
      slider.classList.remove('dragging');
    };
  }

  function resetSlider(slider){ slider?._reset && slider._reset(); }
  function resetAllSliders(){ document.querySelectorAll('.control-button').forEach(resetSlider); }

  function triggerAction(action){
    switch(action){
      case 'start':    startTimer();  break;
      case 'pause':    pauseTimer();  break;
      case 'continue': startTimer();  break;
      case 'restart':  restartTimer(); break;
      case 'details':  showPage('page-details'); break;
    }
  }

  // ===== Init =====
  function init(){
    initSliders();
    showPage('page-home');

    // Canvas pronto/responsivo e label zerada
    resizeTrackCanvas();
    window.addEventListener('resize', resizeTrackCanvas);
    updateMetersLabel();

    updateButtonState('ready');
  }
  init();
});