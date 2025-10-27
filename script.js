// Espera o HTML carregar antes de rodar o script
document.addEventListener('DOMContentLoaded', () => {

    // --- OBJETIVO DO TAF ---
    const TIME_LIMIT_SECONDS = 12 * 60; // 12 minutos
    const DISTANCE_GOAL_METERS = 2400; // 2.400 metros

    // --- ESTADO DA APLICAÇÃO ---
    let appState = 'ready'; // 'ready', 'running', 'paused'
    let timerInterval = null;
    let timerStartTime = 0; // Timestamp de quando o timer (re)começou
    let accumulatedTimeMs = 0; // Tempo acumulado em milissegundos
    let distanceMeters = 0;
    let lastPosition = null;
    let gpsWatchId = null;
    let wakeLock = null;
    let snapshotTaken = false;

    // --- ELEMENTOS DO DOM (As "Peças" do HTML) ---
    const pages = document.querySelectorAll('.page');
    const homePage = document.getElementById('page-home');
    const mainPage = document.getElementById('page-main');
    const detailsPage = document.getElementById('page-details');

    // Botões da Home
    const btnHomem = document.getElementById('btn-homem');
    const btnMulher = document.getElementById('btn-mulher');

    // Elementos da Tela Principal
    const timerDisplay = document.getElementById('timer-display');
    const snapshotDisplay = document.getElementById('snapshot-display');
    const instructions = document.getElementById('instructions');
    
    // Botões de Controle (Deslizar)
    const btnStart = document.querySelector('[data-btn="start"]');
    const btnPause = document.querySelector('[data-btn="pause"]');
    const btnContinue = document.querySelector('[data-btn="continue"]');
    const btnRestart = document.querySelector('[data-btn="restart"]');
    const btnDetails = document.querySelector('[data-btn="details"]');

    // Botões de Navegação
    const btnBack = document.getElementById('btn-back');

    // --- 1. LÓGICA DE NAVEGAÇÃO ENTRE TELAS ---

    function showPage(pageId) {
        pages.forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
    }

    // Navegação: Home -> Principal
    btnHomem.addEventListener('click', () => showPage('page-main'));
    btnMulher.addEventListener('click', () => showPage('page-main'));

    // Navegação: Principal -> Detalhes
    // (A lógica de clique do botão 'details' está na seção de GESTOS)

    // Navegação: Detalhes -> Principal
    btnBack.addEventListener('click', () => showPage('page-main'));

    // --- 2. LÓGICA DE ESTADO (Atualiza os botões) ---

    function updateButtonState(newState) {
        appState = newState;
        
        // Esconde todos os botões
        [btnStart, btnPause, btnContinue, btnRestart, btnDetails].forEach(btn => btn.style.display = 'none');

        if (newState === 'ready') {
            btnStart.style.display = 'block';
        } else if (newState === 'running') {
            btnPause.style.display = 'block';
            btnRestart.style.display = 'block';
        } else if (newState === 'paused') {
            btnContinue.style.display = 'block';
            btnRestart.style.display = 'block';
            btnDetails.style.display = 'block';
        }
    }

    // --- 3. LÓGICA DO CRONÔMETRO ---

    function startTimer() {
        timerStartTime = Date.now(); // Marca o tempo de (re)início
        
        // Inicia o loop do timer, atualizando a cada 100ms para mais precisão
        timerInterval = setInterval(updateTimer, 100); 
        
        updateButtonState('running');
        requestWakeLock(); // Pede para a tela ficar acesa
        startGpsTracking(); // Inicia o GPS
    }

    function pauseTimer() {
        clearInterval(timerInterval); // Para o loop
        // Salva o tempo que passou desde o último início
        accumulatedTimeMs += Date.now() - timerStartTime;
        
        updateButtonState('paused');
        releaseWakeLock(); // Libera a tela para apagar
        stopGpsTracking(); // Pausa o GPS
    }

    function restartTimer() {
        clearInterval(timerInterval);
        
        // Reseta todas as variáveis
        accumulatedTimeMs = 0;
        distanceMeters = 0;
        lastPosition = null;
        snapshotTaken = false;
        
        // Reseta a interface
        timerDisplay.textContent = '00:00:00';
        snapshotDisplay.textContent = '';
        instructions.style.display = 'block'; // Mostra as instruções de novo
        
        updateButtonState('ready');
        releaseWakeLock(); // Libera a tela
        stopGpsTracking(); // Para o GPS
    }

    function updateTimer() {
        // Calcula o tempo total (o já acumulado + o que passou desde o último play)
        const totalMs = accumulatedTimeMs + (Date.now() - timerStartTime);
        const totalSeconds = Math.floor(totalMs / 1000);

        // --- AQUI É A LÓGICA PRINCIPAL DO "SNAPSHOT" ---
        if (totalSeconds >= TIME_LIMIT_SECONDS && !snapshotTaken) {
            snapshotTaken = true;
            vibrate();
            // Formata a distância (ex: 3000.5 -> 3.000)
            const distFormatada = distanceMeters.toFixed(0);
            snapshotDisplay.textContent = `- 12:00:00 em ${distFormatada} metros`;
            instructions.style.display = 'none'; // Esconde instruções
        }

        // Atualiza o display formatado
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        timerDisplay.textContent = 
            `${String(hours).padStart(2, '0')}:` +
            `${String(minutes).padStart(2, '0')}:` +
            `${String(seconds).padStart(2, '0')}`;
    }

    // --- 4. LÓGICA DO GPS (Geolocalização) ---

    function startGpsTracking() {
        if (!navigator.geolocation) {
            alert('Geolocalização não é suportada pelo seu navegador.');
            return;
        }
        
        // "Assiste" a posição do usuário mudar
        gpsWatchId = navigator.geolocation.watchPosition(
            onGpsSuccess, 
            onGpsError, 
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }

    function stopGpsTracking() {
        if (gpsWatchId) {
            navigator.geolocation.clearWatch(gpsWatchId);
        }
        lastPosition = null; // Reseta a "última posição"
    }

    function onGpsSuccess(position) {
        const { latitude, longitude } = position.coords;

        if (lastPosition) {
            // Calcula a distância entre o ponto antigo e o novo
            const distanceIncrement = haversineDistance(
                lastPosition.latitude, lastPosition.longitude,
                latitude, longitude
            );
            distanceMeters += distanceIncrement;
        }
        
        // Atualiza a "última posição"
        lastPosition = { latitude, longitude };
        
        // (Opcional) Atualizar um display de distância em tempo real
        // console.log(`Distância total: ${distanceMeters.toFixed(0)}m`);
    }

    function onGpsError(error) {
        console.warn(`Erro no GPS: ${error.message}`);
        instructions.textContent = 'Erro no GPS. Tente em área aberta.';
    }

    // Fórmula de Haversine para calcular distância entre duas coordenadas
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Raio da Terra em metros
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distância em metros
    }

    // --- 5. APIS DO NAVEGADOR (Vibração e Tela Acesa) ---

    function vibrate() {
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500]); // Vibra, pausa, vibra
        }
    }

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock ativado!');
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock liberado.');
        }
    }

    // --- 6. LÓGICA DE GESTOS (Deslizar Botões) ---
    
    function initializeGestureButtons() {
        const buttons = document.querySelectorAll('.control-button');
        const SLIDE_THRESHOLD = 80; // Precisa arrastar 80 pixels para ativar

        buttons.forEach(button => {
            let startX = 0;
            let isSliding = false;

            button.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                isSliding = true;
                e.currentTarget.style.transition = 'none'; // Remove transição ao arrastar
            }, { passive: true });

            button.addEventListener('touchmove', (e) => {
                if (!isSliding) return;
                const currentX = e.touches[0].clientX;
                let deltaX = currentX - startX;
                
                // Só permite arrastar para a direita
                if (deltaX < 0) deltaX = 0;
                
                // (Opcional) Efeito visual de arrastar
                // e.currentTarget.style.transform = `translateX(${deltaX}px)`;

            }, { passive: true });

            button.addEventListener('touchend', (e) => {
                if (!isSliding) return;
                isSliding = false;
                
                const endX = e.changedTouches[0].clientX;
                const deltaX = endX - startX;

                // (Opcional) Reseta efeito visual
                // e.currentTarget.style.transition = 'transform 0.2s';
                // e.currentTarget.style.transform = 'translateX(0)';

                // Verifica se o "deslize" foi longo o suficiente
                if (deltaX > SLIDE_THRESHOLD) {
                    // --- ATIVA A AÇÃO ---
                    const action = e.currentTarget.dataset.btn;
                    triggerAction(action);
                }
            });
        });
    }
    
    // Função central que chama as ações
    function triggerAction(action) {
        switch (action) {
            case 'start':
                startTimer();
                break;
            case 'pause':
                pauseTimer();
                break;
            case 'continue':
                startTimer(); // A função startTimer já lida com o "resume"
                break;
            case 'restart':
                // (Opcional) Pedir confirmação
                // if (confirm('Tem certeza que deseja reiniciar?')) {
                //    restartTimer();
                // }
                restartTimer();
                break;
            case 'details':
                showPage('page-details');
                break;
        }
    }

    // --- 7. INICIALIZAÇÃO ---

    function init() {
        // Configura os botões de "deslizar"
        initializeGestureButtons();
        
        // Define a tela inicial
        showPage('page-home');
        
        // Define o estado inicial dos botões
        updateButtonState('ready');
    }

    init(); // Roda a aplicação!

});