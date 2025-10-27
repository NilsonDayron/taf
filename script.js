// Espera o HTML carregar antes de rodar o script
document.addEventListener('DOMContentLoaded', () => {

  // --- OBJETIVO DO TAF ---
  const TIME_LIMIT_SECONDS = 12 * 60; // 12 minutos
  const DISTANCE_GOAL_METERS = 2400;  // 2.400 metros (em uso na tela de detalhes V2)

  // --- ESTADO DA APLICAÇÃO ---
  let appState = 'ready'; // 'ready', 'running', 'paused'
  let timerInterval = null;
  let timerStartTime = 0;       // Timestamp de quando o timer (re)começou
  let accumulatedTimeMs = 0;    // Tempo acumulado em ms
  let distanceMeters = 0;
  let lastPosition = null;
  let gpsWatchId = null;
  let wakeLock = null;
  let snapshotTaken = false;

  // --- ELEMENTOS DO DOM ---
  const pages = document.querySelectorAll('.page');
  const homePage = document.getElementById('page-home');
  const mainPage = document.getElementById('page-main');

  // Botões da Home
  const btnHomem = document.getElementById('btn-homem');
  const btnMulher = document.getElementById('btn-mulher');

  // Tela Principal
  const timerDisplay = document.getElementById('timer-display');
  const snapshotDisplay = document.getElementById('snapshot-display');
  const instructions = document.getElementById('instructions');

  // Botões (slide)
  const btnStart    = document.querySelector('[data-btn="start"]');
  const btnPause    = document.querySelector('[data-btn="pause"]');
  const btnContinue = document.querySelector('[data-btn="continue"]');
  const btnRestart  = document.querySelector('[data-btn="restart"]');
  const btnDetails  = document.querySelector('[data-btn="details"]');

  // Navegação
  const btnBack = document.getElementById('btn-back');

  // --- 1) Navegação entre telas ---
  function showPage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    const el = document.getElementById(pageId);
    if (el) el.classList.add('active');
  }

  btnHomem.addEventListener('click', () => showPage('page-main'));
  btnMulher.addEventListener('click', () => showPage('page-main'));
  btnBack.addEventListener('click', () => showPage('page-main'));

  // --- 2) Estado dos botões ---
  function updateButtonState(newState) {
    appState = newState;
    [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(btn => btn.style.display = 'none');

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

  // --- 3) Cronômetro ---
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
  }

  function updateTimer() {
    const totalMs = accumulatedTimeMs + (Date.now() - timerStartTime);
    const totalSeconds = Math.floor(totalMs / 1000);

    if (totalSeconds >= TIME_LIMIT_SECONDS && !snapshotTaken) {
      snapshotTaken = true;
      vibrate();
      const distFormatada = distanceMeters.toFixed(0);
      snapshotDisplay.textContent = `- 12:00:00 em ${distFormatada} metros`;
      instructions.style.display = 'none';
    }

    const hours   = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    timerDisplay.textContent =
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}`;
  }

  // --- 4) GPS ---
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

  function onGpsError(err) {
    console.warn('Erro no GPS:', err.message);
    instructions.textContent = 'Erro no GPS. Tente em área aberta.';
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // --- 5) APIs: vibração & Wake Lock ---
  function vibrate() {
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
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

  // --- 6) Gestos (deslizar) ---
  function initializeGestureButtons() {
    const buttons = document.querySelectorAll('.control-button');
    const SLIDE_THRESHOLD = 80;

    buttons.forEach(button => {
      let startX = 0;
      let sliding = false;

      button.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        sliding = true;
      }, { passive: true });

      button.addEventListener('touchend', e => {
        if (!sliding) return;
        sliding = false;
        const endX = e.changedTouches[0].clientX;
        if (endX - startX > SLIDE_THRESHOLD) {
          triggerAction(button.dataset.btn);
        }
      }, { passive: true });
    });
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

  // --- 7) Inicialização ---
  function init() {
    initializeGestureButtons();
    showPage('page-home');     // garante a home ativa
    updateButtonState('ready'); // prepara botões (da página principal)
  }

  init();
});
