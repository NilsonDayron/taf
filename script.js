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

  // Controle dos sliders
  const btnStart    = document.querySelector('[data-btn="start"]');
  const btnPause    = document.querySelector('[data-btn="pause"]');
  const btnContinue = document.querySelector('[data-btn="continue"]');
  const btnRestart  = document.querySelector('[data-btn="restart"]');
  const btnDetails  = document.querySelector('[data-btn="details"]');

  /* =========================
     NAVEGAÇÃO ENTRE TELAS
  ==========================*/
  function showPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(pageId);
    if (el) el.classList.add('active');
  }

  btnHomem.addEventListener('click', () => showPage('page-main'));
  btnMulher.addEventListener('click', () => showPage('page-main'));
  btnBack.addEventListener('click', () => showPage('page-main'));

  /* =========================
     ESTADO DOS BOTÕES
  ==========================*/
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
      btnRestart.style.display = 'flex';
      btnDetails.style.display = 'flex';
    }
  }

  /* =========================
     CRONÔMETRO
  ==========================*/
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
    // Reset visual dos sliders
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

  /* =========================
     GPS
  ==========================*/
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

    const a =
      Math.sin(dp/2)**2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /* =========================
     APIs: vibração & Wake Lock
  ==========================*/
  function vibrate() {
    if (navigator.vibrate) navigator.vibrate([220, 120, 220]);
  }

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { wakeLock = await navigator.wakeLock.request('screen'); }
      catch(e) { console.warn('WakeLock falhou:', e.message); }
    }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  }

  /* =========================
     SLIDERS COM KNOB
  ==========================*/
  function initSliders() {
    const sliders = document.querySelectorAll('.control-button');
    sliders.forEach(slider => attachSliderBehavior(slider));
  }

  function attachSliderBehavior(slider) {
    const knob = slider.querySelector('.knob');
    const label = slider.querySelector('.label');
    const padding = 4; // mesmo do CSS
    const knobW = 48; // idem CSS
    let startX = 0;
    let currentX = 0;
    let dragging = false;

    const maxX = () => slider.clientWidth - knobW - padding * 2;
    const setX = (x) => { knob.style.transform = `translateX(${x}px)`; };

    const onStart = (x) => {
      dragging = true;
      slider.classList.add('dragging');
      startX = x - currentX;
    };

    const onMove = (x) => {
      if (!dragging) return;
      let nx = x - startX;
      if (nx < 0) nx = 0;
      if (nx > maxX()) nx = maxX();
      currentX = nx;
      setX(currentX);
      // escurece levemente o texto conforme avança (efeito “revela”)
      const pct = currentX / maxX();
      label.style.opacity = String(0.9 + (0.1 * (1 - pct)));
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove('dragging');

      const pct = currentX / maxX();
      if (pct > 0.9) {
        // aciona
        triggerAction(slider.dataset.btn);
        // pequeno feedback e volta o knob
        setTimeout(() => resetSlider(slider), 200);
      } else {
        // volta
        resetSlider(slider);
      }
    };

    // Suporte a toque
    slider.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
    slider.addEventListener('touchmove',  (e) => onMove(e.touches[0].clientX),  { passive: true });
    slider.addEventListener('touchend',   onEnd, { passive: true });

    // Suporte a mouse (teste no desktop)
    slider.addEventListener('mousedown', (e) => onStart(e.clientX));
    window.addEventListener('mousemove', (e) => onMove(e.clientX));
    window.addEventListener('mouseup', onEnd);

    // guarda no elemento (para reset global)
    slider._reset = () => {
      currentX = 0;
      setX(0);
      label.style.opacity = '1';
    };
  }

  function resetSlider(slider) {
    if (slider?._reset) slider._reset();
  }

  function resetAllSliders() {
    document.querySelectorAll('.control-button').forEach(resetSlider);
  }

  function triggerAction(action) {
    switch (action) {
      case 'start':    startTimer();  break;
      case 'pause':    pauseTimer();  break;
      case 'continue': startTimer();  break;
      case 'restart':  restartTimer(); break;
      case 'details':  showPage('page-details'); break;
    }
  }

  /* =========================
     INIT
  ==========================*/
  function init() {
    initSliders();
    showPage('page-home');
    updateButtonState('ready');
  }

  init();
});
