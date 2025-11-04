// script.js — TAF com slider estável (CORRIGIDO) + percurso em canvas
document.addEventListener('DOMContentLoaded', () => {
  // ===== Constantes do TAF =====
  const TIME_LIMIT_SECONDS = 12 * 60;     // 12 min
  const DISTANCE_GOAL_METERS = 2400;      // não usado ainda (futuro)

  // ===== Filtro anti-ruído do GPS =====
  const GPS_MIN_ACCURACY_M = 25;          // rejeita fixes com precisão pior que 25 m
  const GPS_MIN_STEP_M     = 3;           // passo mínimo “fixo” (anti-jitter)
  const GPS_MAX_JUMP_M     = 80;          // rejeita saltos > 80 m
  const GPS_MAX_SPEED_MPS  = 8;           // rejeita velocidade > 8 m/s (~28,8 km/h)
  let   lastFixTs = 0;                    // timestamp (ms) do último fix aceito

  // ===== Estado =====
  let appState = 'ready';                 // 'ready' | 'running' | 'paused'
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
  let trackPoints = [];                   // [{lat, lon}]
  let canvasDPR = 1;

  // ===== Navegação =====
  function showPage(id) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  if (btnHomem) btnHomem.addEventListener('click', () => showPage('page-main'));
  if (btnMulher) btnMulher.addEventListener('click', () => showPage('page-main'));
  if (btnBack)   btnBack.addEventListener('click',   () => showPage('page-main'));

  // ===== Estado dos botões (mostra/esconde sliders) =====
  function updateButtonState(state) {
    appState = state;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(b => b && (b.style.display = 'none'));
    if (state === 'ready') {
      btnStart && (btnStart.style.display = 'flex');
    } else if (state === 'running') {
      btnPause   && (btnPause.style.display   = 'flex');
      btnRestart && (btnRestart.style.display = 'flex');
    } else if (state === 'paused') {
      btnContinue && (btnContinue.style.display = 'flex');
      btnRestart  && (btnRestart.style.display  = 'flex');
      btnDetails  && (btnDetails.style.display  = 'flex');
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
      onGpsSuccess,
      onGpsError,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  function stopGpsTracking() {
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    // NÃO zera lastPosition aqui (mantém âncora até restart)
  }

  // —— GPS com filtro anti-ruído e velocidade derivada ——
  function onGpsSuccess(position) {
    const c = position && position.coords ? position.coords : {};
    const latitude  = c.latitude;
    const longitude = c.longitude;
    const accuracy  = (typeof c.accuracy === 'number') ? c.accuracy : null;
    const gpsSpeed  = (typeof c.speed === 'number' && isFinite(c.speed)) ? c.speed : null; // m/s
    const ts        = (typeof position.timestamp === 'number') ? position.timestamp : Date.now();

    if (!isFinite(latitude) || !isFinite(longitude)) return;

    // 1) descarta leituras muito imprecisas
    if (accuracy !== null && accuracy > GPS_MIN_ACCURACY_M) return;

    // 2) primeira leitura: só ancora (não soma distância)
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
    const dt   = dtMs / 1000;

    // 4) limiar dinâmico baseado na precisão do FIX atual
    //    (evita “andar” parado): ex.: acc=10m -> dynamicMin ~6m
    const dynamicMin = accuracy != null
      ? Math.max(GPS_MIN_STEP_M, accuracy * 0.6)
      : GPS_MIN_STEP_M;

    // Se o passo for menor que o limiar, IGNORA TOTALMENTE (sem mover âncora)
    if (step < dynamicMin) return;

    // 5) corta saltos absurdos
    if (step > GPS_MAX_JUMP_M) return;

    // 6) velocidade: usa a do GPS ou deriva (step/dt)
    let speedToCheck = gpsSpeed;
    if ((speedToCheck === null || !isFinite(speedToCheck)) && dt > 0) {
      speedToCheck = step / dt; // m/s
    }
    if (isFinite(speedToCheck) && speedToCheck > GPS_MAX_SPEED_MPS) return;

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
    const s  = Math.min(sx, sy);

    const toXY = (lat, lon) => {
      const x = pad + (lon - minLon) * s;
      const y = h - pad - (lat - minLat) * s; // Y “sobe”
      return {x, y};
    };

    // trilha
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
  }

  // ===== Sliders (drag estável no iPhone) =====
  // ***** INÍCIO DA CORREÇÃO *****
  // Esta função foi reescrita para usar 'pointer events' de forma mais robusta,
  // que funcionam para mouse E touch, e anexam os eventos de 'move' e 'up'
  // à 'window' para que o deslize não pare se o dedo sair do botão.

  function initSliders(){
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }
  
  function attachSliderBehavior(slider) {
    const handle = slider.querySelector('.slide-handle');
    const label = slider.querySelector('.slide-text');
    if (!handle) return;

    // Estilos para performance e para evitar conflito com o navegador
    slider.style.touchAction = 'none';
    handle.style.touchAction = 'none';
    handle.style.willChange = 'transform';

    const PADDING = 4;
    const HANDLE_W = 48;
    const MAX_X = () => slider.clientWidth - HANDLE_W - PADDING * 2;

    let dragging = false;
    let startX = 0;
    let currentX = 0;

    const setX = (x) => {
      handle.style.transform = `translate3d(${x}px, 0, 0)`;
    };
    
    // Função unificada para Mover
    const onPointerMove = (e) => {
      if (!dragging) return;
      e.preventDefault(); // Impede o navegador de rolar
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let delta = clientX - startX;
      let nextX = delta;

      // Limita o movimento
      if (nextX < 0) nextX = 0;
      const maxX = MAX_X();
      if (nextX > maxX) nextX = maxX;

      currentX = nextX;
      setX(currentX);
    };

    // Função unificada para Soltar
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;

      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      handle.style.transition = 'transform .14s cubic-bezier(.2,.8,.2,1)';
      
      const maxX = MAX_X();
      const pct = maxX === 0 ? 0 : currentX / maxX;

      if (pct >= 0.9) { // Se deslizou > 90%
        triggerAction(slider.dataset.btn);
        // Reseta o botão visualmente
        setTimeout(() => {
            handle.style.transition = 'none';
            setX(0);
        }, 200); // Espera a ação terminar
      } else {
        // Falhou, volta ao início
        setX(0);
      }
    };

    // Função unificada para Iniciar
    const onPointerDown = (e) => {
      dragging = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      currentX = 0; // Começa do 0
      handle.style.transition = 'none'; // Remove transição para o deslize

      // Anexa os listeners GLOBAIS
      window.addEventListener('mousemove', onPointerMove, { passive: false });
      window.addEventListener('mouseup', onPointerUp, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp, { passive: false });
    };

    // Anexa o listener de "início" ao próprio slider
    slider.addEventListener('mousedown', onPointerDown, { passive: true });
    slider.addEventListener('touchstart', onPointerDown, { passive: true });

    // API interna para resetar (usada no 'restartTimer')
    slider._reset = () => {
      currentX = 0;
      handle.style.transition = 'none';
      setX(0);
    };
  }
  // ***** FIM DA CORREÇÃO *****


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
