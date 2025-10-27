document.addEventListener('DOMContentLoaded', () => {
  // ===== Constantes TAF =====
  const TIME_LIMIT_SECONDS = 12 * 60; // 12 min
  const DISTANCE_GOAL_METERS = 2400;

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

  // ===== Navegação =====
  function showPage(id) {
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
  btnHomem.addEventListener('click', () => showPage('page-main'));
  btnMulher.addEventListener('click', () => showPage('page-main'));
  if (btnBack) btnBack.addEventListener('click', () => showPage('page-main'));

  // ===== Estado dos botões =====
  function updateButtonState(state) {
    appState = state;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(b => b.style.display = 'none');

    if (state === 'ready') {
      btnStart.style.display = 'flex';
    }
    if (state === 'running') {
      btnPause.style.display = 'flex';
      btnRestart.style.display = 'flex';
    }
    if (state === 'paused') {
      btnContinue.style.display = 'flex';
      btnRestart.style.display  = 'flex';
      btnDetails.style.display  = 'flex';
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
    timerDisplay.textContent = '00:00:00';
    snapshotDisplay.textContent = '';
    instructions.style.display = 'block';
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
      snapshotDisplay.textContent = `- 12:00:00 em ${distanceMeters.toFixed(0)} metros`;
      instructions.style.display = 'none';
    }

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    timerDisplay.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // ===== GPS =====
  function startGpsTracking() {
    if (!navigator.geolocation) {
      instructions.textContent = 'Geolocalização não suportada.';
      return;
    }
    gpsWatchId = navigator.geolocation.watchPosition(
      onGpsSuccess, onGpsError,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }
  function stopGpsTracking() {
    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    lastPosition = null;
  }
  function onGpsSuccess(position) {
    const { latitude, longitude } = position.coords;
    if (lastPosition) {
      distanceMeters += haversineDistance(lastPosition.latitude, lastPosition.longitude, latitude, longitude);
    }
    lastPosition = { latitude, longitude };
  }
  function onGpsError(e) {
    console.warn('Erro no GPS:', e.message);
    instructions.textContent = 'Erro no GPS. Tente em área aberta.';
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
      catch(e){ console.warn('WakeLock falhou:', e.message); }
    }
  }
  function releaseWakeLock(){ if (wakeLock){ wakeLock.release(); wakeLock = null; } }

  // ===== Sliders (drag suave, zero delay, anti-tremor iPhone) =====
  function initSliders(){
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }

  function attachSliderBehavior(slider){
    const handle = slider.querySelector('.slide-handle');
    const label  = slider.querySelector('.slide-text');

    // Desativa seleção/gesto nativo iOS pelo JS também (belt & suspenders)
    slider.style.touchAction = 'none';
    handle.style.touchAction = 'none';
    slider.style.webkitUserSelect = 'none';
    handle.style.webkitUserSelect = 'none';
    slider.style.userSelect = 'none';
    handle.style.userSelect = 'none';

    const PADDING = 4;
    const HANDLE_W = 48;

    // estado do drag
    let dragging = false;
    let startX = 0;
    let baseX  = 0;
    let x = 0;
    let railMax = 0;

    // rAF para aplicar transform (evita tremor)
    let rafId = null, targetX = 0;
    const applyX = () => { handle.style.transform = `translate3d(${targetX}px,0,0)`; rafId = null; };
    const setX = v => { targetX = v; if (!rafId) rafId = requestAnimationFrame(applyX); };

    // SEM transição por padrão (0 delay)
    handle.style.transition = 'none';

    const onPointerDown = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      slider.classList.add('dragging');
      handle.style.transition = 'none';        // garante 0ms
      slider.setPointerCapture(e.pointerId);
      startX = e.clientX;
      baseX  = x;
      // cache do trilho pra não recalcular a cada move
      railMax = slider.clientWidth - HANDLE_W - PADDING * 2;
      e.preventDefault();
    };

    const onPointerMove = e => {
      if (!dragging) return;
      const delta = e.clientX - startX;
      let next = baseX + delta;
      if (next < 0) next = 0;
      if (next > railMax) next = railMax;
      x = next;
      setX(x);

      // (opcional) evita recalcular layout: não mexemos na opacidade do label
      // Se quiser feedback, pode usar translateY pequeno no label via rAF.
    };

    // Snap instantâneo (0ms). Se quiser 100ms, troque por uma transição curta.
    const snapTo = (pos, cb) => {
      handle.style.transition = 'none';
      x = pos;
      setX(x);
      if (cb) requestAnimationFrame(cb);
    };

    const onPointerUpOrCancel = e => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('dragging');
      slider.releasePointerCapture(e.pointerId);

      const pct = railMax === 0 ? 0 : x / railMax;

      if (pct >= 0.9) {
        // Dispara ação e dá um toque visual (vai ao fim e volta) — tudo sem delay
        triggerAction(slider.dataset.btn);
        snapTo(railMax, () => snapTo(0));
      } else {
        snapTo(0);
      }
    };

    slider.addEventListener('pointerdown', onPointerDown, { passive:false });
    slider.addEventListener('pointermove', onPointerMove, { passive:false });
    slider.addEventListener('pointerup', onPointerUpOrCancel, { passive:false });
    slider.addEventListener('pointercancel', onPointerUpOrCancel, { passive:false });

    // API interna pra resetar
    slider._reset = () => {
      dragging = false; x = 0;
      handle.style.transition = 'none';
      setX(0);
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
    updateButtonState('ready');
  }
  init();
});
