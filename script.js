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
  btnBack.addEventListener('click',  () => showPage('page-main'));

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

  /* ===== Sliders: sem delay, colado no dedo ===== */
  function initSliders() {
    document.querySelectorAll('.control-button').forEach(attachSliderBehavior);
  }

  function attachSliderBehavior(slider) {
    const handle = slider.querySelector('.slide-handle');
    const label  = slider.querySelector('.slide-text');

    const PADDING = 4;            // igual ao CSS
    const HANDLE_W = 48;          // igual ao CSS
    const MAX_X = () => slider.clientWidth - HANDLE_W - PADDING * 2;

    let dragging = false;
    let startX = 0;               // posição do ponteiro no início
    let baseX  = 0;               // posição acumulada do knob (antes do drag)
    let x = 0;                    // posição atual do knob (px)

    // Move imediatamente (sem rAF, sem transição)
    const setX = (val) => {
      x = val;
      handle.style.transform = `translate3d(${x}px,0,0)`;
    };

    const onPointerDown = (e) => {
      // apenas botão primário / toques
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      dragging = true;
      slider.classList.add('dragging');

      // Remover qualquer transição para ficar 1:1 com o dedo
      handle.style.transition = 'none';

      // Captura o ponteiro para receber move/up mesmo fora do elemento
      slider.setPointerCapture(e.pointerId);

      startX = e.clientX;
      baseX  = x;                 // começa de onde parou
      e.preventDefault();         // bloqueia seleção/scroll fantasma
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      e.preventDefault();         // bloqueia scroll vertical no iOS

      const delta = e.clientX - startX;
      let next = baseX + delta;

      if (next < 0) next = 0;
      const max = MAX_X();
      if (next > max) next = max;

      setX(next);

      // sutil: muda opacidade do texto conforme avança
      const pct = max === 0 ? 0 : next / max;
      label.style.opacity = String(0.9 + 0.1 * (1 - pct));
    };

    const snapBack = () => {
      // Snap suave de volta
      handle.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)';
      setX(0);
      label.style.opacity = '1';
      handle.addEventListener('transitionend', () => {
        handle.style.transition = 'none';
      }, { once: true });
    };

    const snapForwardAndTrigger = () => {
      const max = MAX_X();
      handle.style.transition = 'transform .14s cubic-bezier(.2,.8,.2,1)';
      setX(max);
      label.style.opacity = '1';
      handle.addEventListener('transitionend', () => {
        handle.style.transition = 'none';
        // chama ação e retorna o knob
        triggerAction(slider.dataset.btn);
        setTimeout(() => snapBack(), 140);
      }, { once: true });
    };

const onPointerUpOrCancel = (e) => {
  if (!dragging) return;
  dragging = false;
  slider.classList.remove('dragging');
  slider.releasePointerCapture(e.pointerId);

  const max = MAX_X();
  const pct = max === 0 ? 0 : x / max;

  if (pct >= 0.9) {
    // 1) Dispara a ação imediatamente (sem depender de transitionend)
    triggerAction(slider.dataset.btn);

    // 2) Faz um snap rápido até o fim só para feedback visual
    handle.style.transition = 'transform .14s cubic-bezier(.2,.8,.2,1)';
    handle.style.transform  = `translate3d(${max}px,0,0)`;
    label.style.opacity = '1';

    // 3) Volta suavemente o knob depois de um pequeno delay
    setTimeout(() => {
      handle.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)';
      handle.style.transform  = 'translate3d(0,0,0)';
      setTimeout(() => {
        handle.style.transition = 'none';
      }, 180);
    }, 140);
  } else {
    // Volta para o início
    handle.style.transition = 'transform .16s cubic-bezier(.2,.8,.2,1)';
    handle.style.transform  = 'translate3d(0,0,0)';
    label.style.opacity = '1';
    setTimeout(() => { handle.style.transition = 'none'; }, 180);
  }
};


    // Pointer Events: um só código para mouse + toque (iOS/Android/Desktop)
    slider.addEventListener('pointerdown', onPointerDown);
    slider.addEventListener('pointermove', onPointerMove);
    slider.addEventListener('pointerup', onPointerUpOrCancel);
    slider.addEventListener('pointercancel', onPointerUpOrCancel);

    // API de reset usada no “reiniciar”
    slider._reset = () => {
      dragging = false;
      x = 0;
      handle.style.transition = 'none';
      setX(0);
      label.style.opacity = '1';
      slider.classList.remove('dragging');
    };
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
