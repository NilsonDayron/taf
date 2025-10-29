document.addEventListener('DOMContentLoaded', () => {
  // ===== Constantes TAF =====
  const TIME_LIMIT_SECONDS = 12 * 60; // 12 min
  const DISTANCE_GOAL_METERS = 2400;

  // ===== Filtro anti-ruído do GPS =====
  const GPS_MIN_ACCURACY_M = 25;  // ignora fixes com precisão pior que 25 m
  const GPS_MIN_STEP_M     = 3;   // ignora "tremidinha" < 3 m
  const GPS_MAX_JUMP_M     = 80;  // ignora saltos > 80 m entre leituras
  const GPS_MAX_SPEED_MPS  = 8;   // ignora se velocidade > 8 m/s (~28,8 km/h)
  let lastFixTs = 0;              // timestamp (ms) do último fix aceito

  // ===== Estado =====
  let appState = 'ready'; // 'ready' | 'running' | 'paused'
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
  const btnBack   = document.getElementById('btn-back');

  const timerDisplay    = document.getElementById('timer-display');
  const snapshotDisplay = document.getElementById('snapshot-display');
  const instructions    = document.getElementById('instructions');

  const btnStart    = document.querySelector('[data-btn="start"]');
  const btnPause    = document.querySelector('[data-btn="pause"]');
  const btnContinue = document.querySelector('[data-btn="continue"]');
  const btnRestart  = document.querySelector('[data-btn="restart"]');
  const btnDetails  = document.querySelector('[data-btn="details"]');

  // ===== Canvas do percurso =====
  const trackCanvas = document.getElementById('track-canvas');
  const metersLabel = document.getElementById('meters-label');
  let tctx = null;
  let trackPoints = [];              // [{lat, lon}]
  let canvasDPR = 1;

  // ===== Navegação =====
  function showPage(id) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  if (btnHomem) btnHomem.addEventListener('click', () => showPage('page-main'));
  if (btnMulher) btnMulher.addEventListener('click', () => showPage('page-main'));
  if (btnBack)   btnBack.addEventListener('click', () => showPage('page-main'));

  // ===== Estado dos botões =====
  function updateButtonState(state) {
    appState = state;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(b => b && (b.style.display = 'none'));

    if (state === 'ready')   btnStart && (btnStart.style.display   = 'flex');
    if (state === 'running') {
      btnPause  && (btnPause.style.display  = 'flex');
      btnRestart&& (btnRestart.style.display= 'flex');
    }
    if (state === 'paused')  {
      btnContinue && (btnContinue.style.display = 'flex');
      btnRestart  && (btnRestart.style.display  = 'flex');
      btnDetails  && (btnDetails.style.display  = 'flex');
    }
  }

  // ===== Cronômetro =====
  function startTimer() {
    timerStartTime = Date.now();
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

    if (timerDisplay)    timerDisplay.textContent = '00:00:00';
    if (snapshotDisplay) snapshotDisplay.textContent = '';
    if (instructions)    instructions.style.display = 'block';

    // reset percurso
    trackPoints = [];
    resizeTrackCanvas();
    updateMetersLabel();

    updateButtonState('ready');
    releaseWakeLock();
    stopGpsTracking();
    resetAllSliders();
  }

  function updateTimer() {
    const totalMs = accumulatedTimeMs + (Date.now() - timerStartTime);
    const totalSeconds = Math.floor(totalMs / 1000);

    if (totalSeconds >= TIME_LIMIT_SECONDS && !snapshotTaken) {
      snapshotTaken = true;
      vibrate();
      if (snapshotDisplay) snapshotDisplay.textContent = `- 12:00:00 em ${distanceMeters.toFixed(0)} metros`;
      if (instructions)    instructions.style.display = 'none';
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
      onGpsSuccess, onGpsError,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  function stopGpsTracking() {
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    lastPosition = null;
  }

  function onGpsSuccess(position) {
    const c = position && position.coords ? position.coords : {};
    const latitude  = c.latitude;
    const longitude = c.longitude;
    const accuracy  = (typeof c.accuracy === 'number') ? c.accuracy : null;
    const gpsSpeed  = (typeof c.speed === 'number' && isFinite(c.speed)) ? c.speed : null; // m/s
    const ts        = (typeof position.timestamp === 'number') ? position.timestamp : Date.now();

    if (!isFinite(latitude) || !isFinite(longitude)) return;

    // 1) descarta leituras muito imprecisas
    if (accuracy !== null && accuracy > GPS_MIN_ACCURACY_M) {
      return;
    }

    // 2) primeira leitura
    if (!lastPosition) {
      lastPosition = { latitude, longitude };
      lastFixTs = ts;
      trackPoints.push({ lat: latitude, lon: longitude });
      drawTrack();
      updateMetersLabel();
      return;
    }

    // 3) calcula passo e Δt
    const step = haversineDistance(
      lastPosition.latitude, lastPosition.longitude, latitude, longitude
    );
    const dtMs = Math.max(0, ts - lastFixTs);
    const dt   = dtMs / 1000; // segundos

    // 4) jitter muito pequeno
    if (step < GPS_MIN_STEP_M) {
      lastPosition = { latitude, longitude };
      lastFixTs = ts;
      return;
    }

    // 5) corta saltos absurdos
    if (step > GPS_MAX_JUMP_M) return;

    // 6) escolhe velocidade a usar (GPS se disponível, senão derivada)
    let speedToCheck = gpsSpeed;
    if ((speedToCheck === null || !isFinite(speedToCheck)) && dt > 0) {
      speedToCheck = step / dt; // m/s
    }

    if (isFinite(speedToCheck) && speedToCheck > GPS_MAX_SPEED_MPS) {
      // velocidade irreal para corrida -> ignora
      return;
    }

    // 7) aceita fix
    distanceMeters += step;
    lastPosition = { latitude, longitude };
    lastFixTs = ts;

    // 8) atualiza UI
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
    trackCanvas.width  = Math.max(1, Math.floor(cssW * canvasDPR));
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
    const s  = Math.min(sx, sy);

    const toXY = (lat, lon) => {
      const x = pad + (lon - minLon) * s;
      const y = h - pad - (lat - minLat) * s;
      return {x, y};
    };

    tctx.lineWidth = 3;
    tctx.lineJoin = 'round';
    tctx.lineCap  = 'round';
    tctx.strokeStyle = '#3b82f6';
    tctx.beginPath();
    const p0 = toXY(trackPoints[0].lat, trackPoints[0].lon);
    tctx.moveTo(p0.x, p0.y);
    for (let i=1;i<trackPoints.length;i++){
      const p = toXY(trackPoints[i].lat, trackPoints[i].lon);
      tctx.lineTo(p.x, p.y);
    }
    tctx.stroke();

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
  }

  // ===== Sliders =====
  function initSliders(){
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }

  function attachSliderBehavior(slider){
    const handle = slider.querySelector('.slide-handle');
    const label  = slider.querySelector('.slide-text');

    const PADDING = 4;
    const HANDLE_W = 48;
    const MAX_X = () => slider.clientWidth - HANDLE_W - PADDING * 2;

    let dragging = false;
    let startX = 0;
    let baseX  = 0;
    let x = 0;

    const setX = v => { x = v; handle.style.transform = `translate3d(${x}px,0,0)`; };

    const onPointerDown = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      slider.classList.add('dragging');
      handle.style.transition = 'none';
      slider.setPointerCapture(e.pointerId);
      startX = e.clientX;
      baseX  = x;
      e.preventDefault();
    };

    const onPointerMove = e => {
      if (!dragging) return;
      e.preventDefault();
      const delta = e.clientX - startX;
      let next = baseX + delta;
      if (next < 0) next = 0;
      const max = MAX_X();
      if (next > max) next = max;
      setX(next);
      const pct = max === 0 ? 0 : next / max;
      if (label) label.style.opacity = String(0.9 + 0.1 * (1 - pct));
    };

    const snapTo = (pos, cb) => {
      handle.style.transition = 'transform .14s cubic-bezier(.2,.8,.2,1)';
      setX(pos);
      const once = () => {
        handle.style.transition = 'none';
        if (cb) cb();
        handle.removeEventListener('transitionend', once);
      };
      handle.addEventListener('transitionend', once);
    };

    const onPointerUpOrCancel = e => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('dragging');
      try { slider.releasePointerCapture(e.pointerId); } catch(_) {}

      const max = MAX_X();
      const pct = max === 0 ? 0 : x / max;

      if (pct >= 0.9) {
        triggerAction(slider.dataset.btn);
        snapTo(max, () => snapTo(0));
      } else {
        snapTo(0);
      }
      if (label) label.style.opacity = '1';
    };

    slider.addEventListener('pointerdown', onPointerDown);
    slider.addEventListener('pointermove', onPointerMove);
    slider.addEventListener('pointerup', onPointerUpOrCancel);
    slider.addEventListener('pointercancel', onPointerUpOrCancel);

    slider._reset = () => {
      dragging = false; x = 0;
      handle.style.transition = 'none';
      setX(0);
      if (label) label.style.opacity = '1';
      slider.classList.remove('dragging');
    };
  }

  function resetSlider(slider){ slider?._reset && slider._reset(); }
  function resetAllSliders(){ document.querySelectorAll('.control-button').forEach(resetSlider); }

  function triggerAction(action){
    switch(action){
      case 'start':    startTimer();  break;
      case 'pause':    pauseTimer();  break;
      case 'continue': startTimer();  break;
      case 'restart':  restartTimer(); break;
      case 'details':  showPage('page-details'); break;
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
