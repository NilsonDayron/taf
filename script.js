const telaInicial = document.getElementById('tela-inicial');
const telaCronometro = document.getElementById('tela-cronometro');
const telaResultado = document.getElementById('tela-resultado');

const btnHomem = document.getElementById('btnHomem');
const btnMulher = document.getElementById('btnMulher');
const iniciar = document.getElementById('iniciar');
const pausar = document.getElementById('pausar');
const parar = document.getElementById('parar');
const novoTeste = document.getElementById('novoTeste');

const tempoDisplay = document.getElementById('tempoDisplay');
const resultadoTempo = document.getElementById('resultado-tempo');
const resultadoDistancia = document.getElementById('resultado-distancia');

let tempo = 0;
let intervalo = null;
let tempoLimite = 14 * 60 + 30; // 14m30s padrão
let running = false;

// === MUDAR DE TELA ===
function mudarTela(atual, proxima) {
  atual.classList.remove('ativa');
  proxima.classList.add('ativa');
}

// === FORMATAR TEMPO ===
function formatarTempo(segundos) {
  const m = Math.floor(segundos / 60).toString().padStart(2, '0');
  const s = (segundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// === ATUALIZAR DISPLAY ===
function atualizarDisplay() {
  tempoDisplay.textContent = formatarTempo(tempo);
}

// === CRONÔMETRO ===
function iniciarCronometro() {
  if (running) return;
  running = true;
  const start = Date.now() - tempo * 1000;

  intervalo = setInterval(() => {
    tempo = Math.floor((Date.now() - start) / 1000);
    atualizarDisplay();

    // Quando atingir 14m30s
    if (tempo === tempoLimite) {
      navigator.vibrate?.([300, 200, 300, 200, 300]);
      alert("⏱️ Tempo limite atingido: 14m30s");
    }
  }, 1000);
}

function pausarCronometro() {
  running = false;
  clearInterval(intervalo);
}

function pararCronometro() {
  clearInterval(intervalo);
  running = false;
  resultadoTempo.textContent = formatarTempo(tempo);
  resultadoDistancia.textContent = "Distância: (em breve)";
  mudarTela(telaCronometro, telaResultado);
}

btnHomem.onclick = () => mudarTela(telaInicial, telaCronometro);
btnMulher.onclick = () => mudarTela(telaInicial, telaCronometro);
iniciar.onclick = iniciarCronometro;
pausar.onclick = pausarCronometro;
parar.onclick = pararCronometro;
novoTeste.onclick = () => location.reload();
