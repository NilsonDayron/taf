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
