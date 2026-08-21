const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

// Colores ANSI para terminal
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bgDark: '\x1b[40m',
};

console.clear();
console.log(`${C.cyan}${C.bright}
  ███████╗██╗   ██╗██╗    ██████╗  ██████╗ ██████╗ ███████╗
  ██╔════╝██║   ██║██║    ██╔══██╗██╔═══██╗██╔══██╗██╔════╝
  █████╗  ██║   ██║██║    ██████╔╝██║   ██║██████╔╝███████╗
  ██╔══╝  ╚██╗ ██╔╝██║    ██╔══██╗██║   ██║██╔══██╗╚════██║
  ███████╗ ╚████╔╝ ██║    ██████╔╝╚██████╔╝██████╔╝███████║
  ╚══════╝  ╚═══╝  ╚═╝    ╚═════╝  ╚═════╝ ╚═════╝ ╚══════╝
${C.reset}`);
console.log(`${C.gray}  ======================================================${C.reset}`);
console.log(`  ${C.magenta}Asistente Local EVI${C.reset} | ${C.green}Español Peruano${C.reset} | ${C.yellow}RTX 3060 CUDA${C.reset}`);
console.log(`${C.gray}  ======================================================${C.reset}\n`);

// 1. Iniciar Audio Bridge de Python
const pythonPath = 'python';
const bridgeScript = path.join(__dirname, 'audio_bridge.py');
const audioBridge = spawn(pythonPath, [bridgeScript], { stdio: ['pipe', 'pipe', 'pipe'] });

let isRecording = false;
let isAudioBridgeReady = false;

audioBridge.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line.trim());
      if (msg.event === 'ready') {
        isAudioBridgeReady = true;
        console.log(`  ${C.green}✓${C.reset} ${C.gray}Sistema de Audio Windows (WASAPI) iniciado.${C.reset}`);
      } else if (msg.event === 'recording_stopped') {
        if (msg.buffer && msg.buffer.length > 0) {
          process.stdout.write(`\r  ${C.yellow}⚡ Procesando audio con Faster-Whisper...${C.reset}\n`);
          socket.emit('voice_command_audio', { buffer: msg.buffer, rate: msg.rate || 16000 });
        } else {
          console.log(`\n  ${C.yellow}Audio vacío o demasiado breve.${C.reset}`);
          promptUser();
        }
      }
    } catch (e) {}
  }
});

audioBridge.stderr.on('data', (data) => {
  // Ignorar advertencias internas de drivers de audio
});

// 2. Conexión WebSocket al Orquestador NestJS
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
const socket = io(ORCHESTRATOR_URL, { transports: ['websocket'] });

let isStreamingResponse = false;

socket.on('connect', () => {
  console.log(`  ${C.green}✓${C.reset} ${C.gray}Conectado al Orquestador EVI (${ORCHESTRATOR_URL})${C.reset}\n`);
  printHelp();
  promptUser();
});

socket.on('disconnect', () => {
  console.log(`\n  ${C.red}✗ Desconectado del servidor.${C.reset}`);
});

socket.on('stt_transcription', (text) => {
  if (text && text.trim()) {
    console.log(`\n  ${C.bright}${C.blue}👤 Cristian:${C.reset} "${text.trim()}"`);
    process.stdout.write(`  ${C.bright}${C.magenta}🤖 EVI:${C.reset} `);
    isStreamingResponse = true;
  }
});

socket.on('text_token', (token) => {
  if (!isStreamingResponse) {
    process.stdout.write(`\n  ${C.bright}${C.magenta}🤖 EVI:${C.reset} `);
    isStreamingResponse = true;
  }
  process.stdout.write(`${C.cyan}${token}${C.reset}`);
});

socket.on('audio_chunk', (base64Audio) => {
  if (audioBridge && audioBridge.stdin.writable) {
    audioBridge.stdin.write(JSON.stringify({ action: 'play_chunk', data: base64Audio }) + '\n');
  }
});

socket.on('response_finished', () => {
  isStreamingResponse = false;
  console.log('\n');
  promptUser();
});

function printHelp() {
  console.log(`  ${C.bright}Comandos y Modos de Uso:${C.reset}`);
  console.log(`  ${C.yellow}[V]${C.reset} Iniciar / Detener grabación de voz por micrófono`);
  console.log(`  ${C.yellow}[Escribir texto + Enter]${C.reset} Enviar comando escrito directamente`);
  console.log(`  ${C.yellow}[/sync]${C.reset} Re-indexar base de conocimiento RAG (knowledge/)`);
  console.log(`  ${C.yellow}[/exit]${C.reset} Salir del cliente\n`);
}

// 3. Manejo de Entrada por Terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function promptUser() {
  process.stdout.write(`${C.bright}${C.green}EVI > ${C.reset}`);
}

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) {
    promptUser();
    return;
  }

  if (text.toLowerCase() === 'v' || text.toLowerCase() === 'r') {
    toggleVoiceRecording();
    return;
  }

  if (text === '/sync') {
    console.log(`  ${C.yellow}Sincronizando documentos RAG...${C.reset}`);
    socket.emit('sync_knowledge');
    setTimeout(() => promptUser(), 1000);
    return;
  }

  if (text === '/exit' || text === 'exit') {
    cleanupAndExit();
    return;
  }

  // Enviar comando como texto
  console.log(`\n  ${C.bright}${C.blue}👤 Cristian:${C.reset} "${text}"`);
  isStreamingResponse = false;
  socket.emit('voice_command_text', text);
});

function toggleVoiceRecording() {
  if (!isAudioBridgeReady) {
    console.log(`  ${C.red}El puente de audio no está listo aún.${C.reset}`);
    return;
  }

  if (!isRecording) {
    isRecording = true;
    audioBridge.stdin.write(JSON.stringify({ action: 'start_record' }) + '\n');
    console.log(`\n  ${C.red}${C.bright}🔴 [GRABANDO MICROFONO]${C.reset} ${C.yellow}Habla ahora... Escribe 'v' y Enter para enviar.${C.reset}`);
  } else {
    isRecording = false;
    audioBridge.stdin.write(JSON.stringify({ action: 'stop_record' }) + '\n');
  }
}

function cleanupAndExit() {
  console.log(`\n  ${C.gray}Cerrando cliente EVI... Hasta luego, Cristian.${C.reset}`);
  if (audioBridge) {
    audioBridge.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
    audioBridge.kill();
  }
  socket.disconnect();
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
