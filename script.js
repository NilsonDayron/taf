const telaInicial = document.getElementById("tela-inicial");
const telaCronometro = document.getElementById("tela-cronometro");
const telaResultado = document.getElementById("tela-resultado");

const btnHomem = document.getElementById("btnHomem");
const btnMulher = document.getElementById("btnMulher");
const iniciar = document.getElementById("iniciar");
const pausar = document.getElementById("pausar");
const parar = document.getElementById("parar");
const novoTeste = document.getElementById("novoTeste");

const tempoDisplay = document.getElementById("tempoDisplay");
const resultadoTempo = document.getElementById("resultado-tempo");
const resultadoDistancia = document.getElementById("resultado-distancia");

let tempoDecorrido = 0;
let intervalo = null;
let inicio = 0;
let rodando = false;

// Limite de 14m30s (em milissegundos)
const tempoLimite = (14 * 60 + 30) * 1000;

// === TROCAR DE TELA ===
function mudarTela(atual, proxima) {
  atual.classList.remove("ativa");
  proxima.classList.add("ativa");
}

// === FORMATAR TEMPO COMPLETO ===
function formatarTempo(ms) {
  const horas = Math.floor(ms / 3600000);
  const minutos = Math.floor((ms % 3600000) / 60000);
  const segundos = Math.floor((ms % 60000) / 1000);
  const milissegundos = Math.floor((ms % 1000) / 10); // duas casas

  return `${horas.toString().padStart(2, "0")}:${minutos
    .toString()
    .padStart(2, "0")}:${segundos.toString().padStart(2, "0")}.${milissegundos
    .toString()
    .padStart(2, "0")}`;
}

// === ATUALIZAR DISPLAY ===
function atualizarDisplay() {
  tempoDisplay.textContent = formatarTempo(tempoDecorrido);
}

// === INICIAR CRONÔMETRO ===
function iniciarCronometro() {
  if (rodando) return;
  rodando = true;
  inicio = Date.now() - tempoDecorrido;

  intervalo = setInterval(() => {
    tempoDecorrido = Date.now() - inicio;
    atualizarDisplay();

    if (tempoDecorrido >= tempoLimite) {
      navigator.vibrate?.([200, 100, 200, 100, 200]);
      clearInterval(intervalo);
      rodando = false;
      alert("⏱️ Tempo limite de 14m30s atingido!");
    }
  }, 10); // Atualiza a cada 10ms
}

// === PAUSAR CRONÔMETRO ===
function pausarCronometro() {
  if (!rodando) return;
  rodando = false;
  clearInterval(intervalo);
}

// === PARAR CRONÔMETRO ===
function pararCronometro() {
  clearInterval(intervalo);
  rodando = false;
  resultadoTempo.textContent = formatarTempo(tempoDecorrido);
  resultadoDistancia.textContent = "Distância: (em breve)";
  mudarTela(telaCronometro, telaResultado);
}

// === BOTÕES ===
btnHomem.onclick = () => mudarTela(telaInicial, telaCronometro);
btnMulher.onclick = () => mudarTela(telaInicial, telaCronometro);
iniciar.onclick = iniciarCronometro;
pausar.onclick = pausarCronometro;
parar.onclick = pararCronometro;
novoTeste.onclick = () => location.reload();
// === CONTROLE POR GESTOS (TOQUE E ARRASTE) ===
let startX = 0;
let startY = 0;

const areaGestos = document.getElementById("tela-cronometro");

areaGestos.addEventListener("touchstart", (e) => {
  const toque = e.touches[0];
  startX = toque.clientX;
  startY = toque.clientY;
});

areaGestos.addEventListener("touchend", (e) => {
  const toque = e.changedTouches[0];
  const diffX = toque.clientX - startX;
  const diffY = toque.clientY - startY;

  // Verifica direção predominante do gesto
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 50) {
      // → arrastar para a direita
      iniciarCronometro();
      animarAcao("Iniciar");
    } else if (diffX < -50) {
      // ← arrastar para a esquerda
      pausarCronometro();
      animarAcao("Pausar");
    }
  } else {
    if (diffY < -50) {
      // ↑ arrastar para cima
      pararCronometro();
      animarAcao("Parar");
    }
  }
});

// Pequena animação e feedback visual
function animarAcao(texto) {
  const popup = document.createElement("div");
  popup.textContent = texto;
  popup.className = "popup-acao";
  document.body.appendChild(popup);

  setTimeout(() => popup.classList.add("visivel"), 10);
  setTimeout(() => popup.classList.remove("visivel"), 1000);
  setTimeout(() => popup.remove(), 1300);
}
// === CONTROLE POR GESTOS (TOQUE E ARRASTE) ===
let startX = 0;
let startY = 0;

const areaGestos = document.getElementById("tela-cronometro");

areaGestos.addEventListener("touchstart", (e) => {
  const toque = e.touches[0];
  startX = toque.clientX;
  startY = toque.clientY;
});

areaGestos.addEventListener("touchend", (e) => {
  const toque = e.changedTouches[0];
  const diffX = toque.clientX - startX;
  const diffY = toque.clientY - startY;

  // Verifica direção predominante do gesto
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 50) {
      // → arrastar para a direita
      iniciarCronometro();
      animarAcao("Iniciar");
    } else if (diffX < -50) {
      // ← arrastar para a esquerda
      pausarCronometro();
      animarAcao("Pausar");
    }
  } else {
    if (diffY < -50) {
      // ↑ arrastar para cima
      pararCronometro();
      animarAcao("Parar");
    }
  }
});

// Pequena animação e feedback visual
function animarAcao(texto) {
  const popup = document.createElement("div");
  popup.textContent = texto;
  popup.className = "popup-acao";
  document.body.appendChild(popup);

  setTimeout(() => popup.classList.add("visivel"), 10);
  setTimeout(() => popup.classList.remove("visivel"), 1000);
  setTimeout(() => popup.remove(), 1300);
}

// === CONTROLE POR GESTOS (TOQUE E ARRASTE) ===
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;

const areaGestos = document.getElementById("tela-cronometro");

areaGestos.addEventListener(
  "touchstart",
  (e) => {
    const toque = e.touches[0];
    startX = toque.clientX;
    startY = toque.clientY;
  },
  { passive: false }
);

areaGestos.addEventListener(
  "touchmove",
  (e) => {
    // Evita que o navegador role a tela
    e.preventDefault();
    const toque = e.touches[0];
    endX = toque.clientX;
    endY = toque.clientY;
  },
  { passive: false }
);

areaGestos.addEventListener("touchend", (e) => {
  const diffX = endX - startX;
  const diffY = endY - startY;

  // Verifica direção predominante
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 50) {
      iniciarCronometro();
      animarAcao("Iniciar");
    } else if (diffX < -50) {
      pausarCronometro();
      animarAcao("Pausar");
    }
  } else {
    if (diffY < -50) {
      pararCronometro();
      animarAcao("Parar");
    }
  }
});

// Pequena animação e feedback visual
function animarAcao(texto) {
  const popup = document.createElement("div");
  popup.textContent = texto;
  popup.className = "popup-acao";
  document.body.appendChild(popup);

  setTimeout(() => popup.classList.add("visivel"), 10);
  setTimeout(() => popup.classList.remove("visivel"), 1000);
  setTimeout(() => popup.remove(), 1300);
}
