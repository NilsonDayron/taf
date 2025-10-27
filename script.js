// Espera o HTML carregar
document.addEventListener('DOMContentLoaded', () => {
  // --- CONSTANTES TAF ---
  const TIME_LIMIT_SECONDS = 12 * 60; // 12 minutos
  const DISTANCE_GOAL_METERS = 2400;

  // --- ESTADO ---
  let appState = 'ready'; // 'ready' | 'running' | 'paused'
  let timerInterval = null;
  let timerStartTime = 0;
  let accumulatedTimeMs = 0;
  let distanceMeters = 0;
  let lastPosition = null;
  let gpsWatchId = null;
  let wakeLock = null;
  let snapshotTaken = false;

  // --- DOM ---
  const pages = document.querySelectorAll('.page');
  const btnHomem = document.getElementById('btn-homem');
  const btnMulher = document.getElementById('btn-mulher');
  const timerDisplay = document.getElementById('timer-display');
  const snapshotDisplay = document.getElementById('snapshot-display');
  const instructions = document.getElementById('instructions');
  const btnBack = document.getElementById('btn-back');

  // sliders
  const btnStart    = document.querySelector('[data-btn="start"]');
  const btnPause    = document.querySelector('[data-btn="pause"]');
  const btnContinue = document.querySelector('[data-btn="continue"]');
  const btnRestart  = document.querySelector('[data-btn="restart"]');
  const btnDetails  = document.querySelector('[data-btn="details"]');

  /* ===== Navegação ===== */
  function showPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(pageId);
    if (el) el.classList.add('active');
  }
  btnHomem.addEventListener('click', () => showPage('page-main'));
  btnMulher.addEventListener('click', () => showPage('page-main'));
  btnBack.addEventListener('click', () => showPage('page-main'));

  /* ===== Estado dos botões ===== */
  function updateButtonState(newState) {
    appState = newState;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails]
      .forEach(b => b.style.display = 'none');

    if (newState === 'ready') {
      btnStart.style.display = 'flex';
    } else if (newState === 'running') {
      btnPause.style.display = 'flex';
      btnRestart.style.display = 'flex';
    } else if (newState === 'paused') {
      btnContinue.style.display = 'flex';
      btnRestart.style.display  = 'flex';
      btnDetails.style.display  = 'flex';
    }
  }

  /* ===== Cronômetro ===== */
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

    timerDisplay.textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  /* ===== GPS ===== */
  function startGpsTracking() {
    if (!navigator.geolocation) {
      instructions.textContent = 'Geolocalização não suportada.';
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
    lastPosition = null;
  }
  function onGpsSuccess(position) {
    const { latitude, longitude } = position.coords;
    if (lastPosition) {
      distanceMeters += haversineDistance(
        lastPosition.latitude, lastPosition.longitude,
        latitude, longitude
      );
    }
    lastPosition = { latitude, longitude };
  }
  function onGpsError(e) {
    console.warn('Erro no GPS:', e.message);
    instructions.textContent = 'Erro no GPS. Tente em área aberta.';
  }
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /* ===== Vibração & Wake Lock ===== */
  function vibrate() { if (navigator.vibrate) navigator.vibrate([220,120,220]); }
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); }
      catch(e) { console.warn('WakeLock falhou:', e.message); }
    }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  /* ===== Sliders com .slide-handle ===== */
  function initSliders() {
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }

  function attachSliderBehavior(slider) {
    const handle = slider.querySelector('.slide-handle');
    const label  = slider.querySelector('.slide-text');
    const PADDING = 4;   // igual ao CSS
    const HANDLE_W = 48; // igual ao CSS

    let startX = 0;
    let currentX = 0;
    let dragging = false;

    const maxX = () => slider.clientWidth - HANDLE_W - PADDING * 2;
    const setX = x => { handle.style.transform = `translateX(${x}px)`; };

    const start = x => { dragging = true; startX = x - currentX; slider.classList.add('dragging'); };
    const move  = x => {
      if (!dragging) return;
      let nx = x - startX;
      if (nx < 0) nx = 0;
      if (nx > maxX()) nx = maxX();
      currentX = nx;
      setX(currentX);

      // sutil: faz o texto “revelar” um pouco conforme avança
      const pct = currentX / maxX();
      label.style.opacity = String(0.9 + 0.1 * (1 - pct));
    };
    const end   = () => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('dragging');

      const pct = currentX / maxX();
      if (pct > 0.9) {
        triggerAction(slider.dataset.btn);
        setTimeout(() => resetSlider(slider), 200);
      } else {
        resetSlider(slider);
      }
    };

    // toque
    slider.addEventListener('touchstart', e => start(e.touches[0].clientX), { passive: true });
    slider.addEventListener('touchmove',  e => move(e.touches[0].clientX),  { passive: true });
    slider.addEventListener('touchend',   end, { passive: true });

    // mouse (teste no desktop)
    slider.addEventListener('mousedown', e => start(e.clientX));
    window.addEventListener('mousemove', e => move(e.clientX));
    window.addEventListener('mouseup',   end);

    slider._reset = () => { currentX = 0; setX(0); label.style.opacity = '1'; };
  }

  function resetSlider(slider) { slider?._reset && slider._reset(); }
  function resetAllSliders() { document.querySelectorAll('.control-button').forEach(resetSlider); }

  function triggerAction(action) {
    switch (action) {
      case 'start':    startTimer();  break;
      case 'pause':    pauseTimer();  break;
      case 'continue': startTimer();  break;
      case 'restart':  restartTimer(); break;
      case 'details':  showPage('page-details'); break;
    }
  }

  /* ===== INIT ===== */
  function init() {
    initSliders();
    showPage('page-home');
    updateButtonState('ready');
  }
  init();
});
