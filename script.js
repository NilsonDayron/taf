// ======= VARIÁVEIS =======
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
let tempoLimite = 14 * 60 + 30; // 14min30s padrão
let startTime, running = false;

// ======= FUNÇÕES =======

function mudarTela(atual, proxima) {
  atual.classList.remove('ativa');
  proxima.classList.add('ativa');
}

btnHomem.onclick = () => {
  tempoLimite = 14 * 60 + 30;
  mudarTela(telaInicial, telaCronometro);
  alert('🚫 Mantenha a tela ligada durante o teste para medir o tempo e a distância corretamente!');
}

btnMulher.onclick = () => {
  tempoLimite = 15 * 60; // exemplo
  mudarTela(telaInicial, telaCronometro);
  alert('🚫 Mantenha a tela ligada durante o teste para medir o tempo e a distância corretamente!');
}

function atualizarDisplay() {
  const min = Math.floor(tempo / 60).toString().padStart(2, '0');
  const seg = (tempo % 60).toString().padStart(2, '0');
  tempoDisplay.textContent = `${min}:${seg}`;
}

function iniciarCronometro() {
  if (running) return;
  running = true;
  startTime = Date.now() - tempo * 1000;
  intervalo = setInterval(() => {
    tempo = Math.floor((Date.now() - startTime) / 1000);
    atualizarDisplay();

    if (tempo === tempoLimite) {
      navigator.vibrate?.([400, 200, 400]);
    }
  }, 1000);
}

function pausarCronometro() {
  if (!running) return;
  running = false;
  clearInterval(intervalo);
}

function pararCronometro() {
  clearInterval(intervalo);
  running = false;
  resultadoTempo.textContent = tempoDisplay.textContent;
  resultadoDistancia.textContent = "Distância: (calculando...)";
  mudarTela(telaCronometro, telaResultado);
}

iniciar.addEventListener('click', iniciarCronometro);
pausar.addEventListener('click', pausarCronometro);
parar.addEventListener('click', pararCronometro);

novoTeste.onclick = () => location.reload();
