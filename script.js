// ===== VARIÁVEIS =====
const telaInicial = document.getElementById("tela-inicial");
const telaCronometro = document.getElementById("tela-cronometro");
const telaResultado = document.getElementById("tela-resultado");
const btnHomem = document.getElementById("btnHomem");
const btnMulher = document.getElementById("btnMulher");
const novoTeste = document.getElementById("novoTeste");
const tempoDisplay = document.getElementById("tempoDisplay");
const resultadoTempo = document.getElementById("resultado-tempo");

let tempoDecorrido = 0;
let rodando = false;
let inicio = 0;
let intervalo = null;
const tempoLimite = (14 * 60 + 30) * 1000; // 14m30s

// ===== TROCAR DE TELA =====
function mudarTela(atual, proxima) {
  atual.classList.remove("ativa");
  proxima.classList.add("ativa");
}

btnHomem.onclick = () => mudarTela(telaInicial, telaCronometro);
btnMulher.onclick = () => mudarTela(telaInicial, telaCronometro);
novoTeste.onclick = () => location.reload();

// ===== FORMATAR TEMPO =====
function formatarTempo(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s
    .toString()
    .padStart(2,"0")}.${cs.toString().padStart(2,"0")}`;
}

// ===== CRONÔMETRO =====
function iniciarCronometro() {
  if (rodando) return;
  rodando = true;
  inicio = Date.now() - tempoDecorrido;
  intervalo = setInterval(() => {
    tempoDecorrido = Date.now() - inicio;
    tempoDisplay.textContent = formatarTempo(tempoDecorrido);
    if (tempoDecorrido >= tempoLimite) {
      clearInterval(intervalo);
      rodando = false;
      navigator.vibrate?.([200,100,200]);
      alert("⏱️ Tempo limite de 14m30s atingido!");
    }
  }, 10);
}

function pausarCronometro() {
  if (!rodando) return;
  rodando = false;
  clearInterval(intervalo);
}

function pararCronometro() {
  clearInterval(intervalo);
  rodando = false;
  resultadoTempo.textContent = formatarTempo(tempoDecorrido);
  mudarTela(telaCronometro, telaResultado);
}

// ===== GESTOS =====
let startX = 0, startY = 0, endX = 0, endY = 0;
const areaGestos = document.getElementById("tela-cronometro");
const seta = document.createElement("div");
seta.className = "gesto-seta";
document.body.appendChild(seta);

areaGestos.addEventListener("touchstart", e => {
  const t = e.touches[0];
  startX = endX = t.clientX;
  startY = endY = t.clientY;
  seta.textContent = "";
  seta.classList.remove("visivel");
}, { passive: false });

areaGestos.addEventListener("touchmove", e => {
  e.preventDefault();
  const t = e.touches[0];
  endX = t.clientX;
  endY = t.clientY;
  const dx = endX - startX;
  const dy = endY - startY;
  if (Math.abs(dx) > Math.abs(dy)) {
    seta.textContent = dx > 20 ? "➡️" : dx < -20 ? "⬅️" : "";
  } else {
    seta.textContent = dy < -20 ? "⬆️" : "";
  }
  if (seta.textContent) seta.classList.add("visivel");
}, { passive: false });

areaGestos.addEventListener("touchend", () => {
  const dx = endX - startX;
  const dy = endY - startY;
  seta.classList.remove("visivel");
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 50) { iniciarCronometro(); feedback("Iniciar"); }
    else if (dx < -50) { pausarCronometro(); feedback("Pausar"); }
  } else {
    if (dy < -50) { pararCronometro(); feedback("Parar"); }
  }
});

// ===== FEEDBACK VISUAL =====
function feedback(texto) {
  const div = document.createElement("div");
  div.className = "popup-acao";
  div.textContent = texto;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add("visivel"), 10);
  setTimeout(() => div.classList.remove("visivel"), 1000);
  setTimeout(() => div.remove(), 1300);
}
