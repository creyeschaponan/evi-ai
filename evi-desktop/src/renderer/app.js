// =====================================================================
// E.V.I. DESKTOP — S.H.I.E.L.D. OS / IRON MAN HUD CONTROLLER
// =====================================================================

const socket = io('http://localhost:3000', { transports: ['websocket'] });

// DOM Elements
const arcReactor = document.getElementById('arcReactor');
const coreCenterNum = document.getElementById('coreCenterNum');
const voicePromptText = document.getElementById('voicePromptText');
const voiceSubtext = document.getElementById('voiceSubtext');
const statusPulseDot = document.getElementById('statusPulseDot');
const statusLabel = document.getElementById('statusLabel');
const dialogueFeed = document.getElementById('dialogueFeed');
const syncRagBtn = document.getElementById('syncRagBtn');
const openMemoryModalBtn = document.getElementById('openMemoryModalBtn');
const memoryModal = document.getElementById('memoryModal');
const closeMemoryModalBtn = document.getElementById('closeMemoryModalBtn');
const saveMemoryBtn = document.getElementById('saveMemoryBtn');
const newMemoryInput = document.getElementById('newMemoryInput');
const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');
const memoryItemsContainer = document.getElementById('memoryItemsContainer');
const btnRefreshBriefing = document.getElementById('btnRefreshBriefing');

// Initial Time Setup
const initTimeElem = document.getElementById('initTime');
if (initTimeElem) {
  initTimeElem.textContent = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// =====================================================================
// Digital Reflection Clock (S.H.I.E.L.D. OS Style)
// =====================================================================
function updateShieldClock() {
  const now = new Date();
  
  // Date in Spanish: "VIERNES, 22 DE AGOSTO DE 2026"
  const dateStr = now.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).toUpperCase();
  
  const clockDateDisplay = document.getElementById('clockDateDisplay');
  if (clockDateDisplay) clockDateDisplay.textContent = dateStr;
  
  // Time 12h format
  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  const minutesStr = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hoursStr}:${minutesStr}`;
  
  const clockTimeDigits = document.getElementById('clockTimeDigits');
  const clockAmPm = document.getElementById('clockAmPm');
  const clockReflection = document.getElementById('clockReflection');
  
  if (clockTimeDigits) clockTimeDigits.textContent = timeStr;
  if (clockAmPm) clockAmPm.textContent = ampm;
  if (clockReflection) clockReflection.textContent = `${timeStr} ${ampm}`;
}
setInterval(updateShieldClock, 1000);
updateShieldClock();

// =====================================================================
// Audio Context & Playback Queue
// =====================================================================
let audioCtx = null;
let isPlayingAudio = false;
const audioQueue = [];
let activeAudioSource = null;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    setCoreState('STANDBY');
    return;
  }

  isPlayingAudio = true;
  setCoreState('SPEAKING');
  const audioData = audioQueue.shift();

  initAudioContext();
  audioCtx.decodeAudioData(
    audioData.buffer.slice(0),
    (buffer) => {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      activeAudioSource = source;

      source.onended = () => {
        activeAudioSource = null;
        playNextInQueue();
      };

      source.start(0);
    },
    (err) => {
      console.warn('Audio decode error:', err);
      playNextInQueue();
    }
  );
}

function stopAndInterruptPlayback() {
  audioQueue.length = 0;
  if (activeAudioSource) {
    try {
      activeAudioSource.stop();
    } catch (e) {}
    activeAudioSource = null;
  }
  isPlayingAudio = false;
  socket.emit('interrupt');
}

// =====================================================================
// Core States (STANDBY, LISTENING, THINKING, SPEAKING)
// =====================================================================
let currentCoreState = 'STANDBY';

function setCoreState(state) {
  currentCoreState = state;
  if (!arcReactor) return;

  arcReactor.classList.remove('state-listening', 'state-thinking', 'state-speaking');

  if (state === 'LISTENING') {
    arcReactor.classList.add('state-listening');
    if (voicePromptText) voicePromptText.textContent = 'ESCUCHANDO TU ORDEN...';
    if (voiceSubtext) voiceSubtext.textContent = 'Habla ahora con naturalidad';
    if (coreCenterNum) coreCenterNum.textContent = 'REC';
  } else if (state === 'THINKING') {
    arcReactor.classList.add('state-thinking');
    if (voicePromptText) voicePromptText.textContent = 'PROCESANDO EN GROQ LLM...';
    if (voiceSubtext) voiceSubtext.textContent = 'Consultando memoria e inferencia';
    if (coreCenterNum) coreCenterNum.textContent = 'AI';
  } else if (state === 'SPEAKING') {
    arcReactor.classList.add('state-speaking');
    if (voicePromptText) voicePromptText.textContent = 'E.V.I. RESPONDIENDO // CAMILA HD';
    if (voiceSubtext) voiceSubtext.textContent = 'Haz clic en el núcleo para interrumpir';
    if (coreCenterNum) coreCenterNum.textContent = 'VOZ';
  } else {
    if (voicePromptText) voicePromptText.textContent = 'TOCA EL NÚCLEO O PRESIONA [ESPACIO] PARA HABLAR';
    if (voiceSubtext) voiceSubtext.textContent = 'Micrófono permanente activado // Audio 16kHz PCM';
    if (coreCenterNum) coreCenterNum.textContent = '41';
  }
}

// =====================================================================
// Circular Tachometers & System Metrics
// =====================================================================
const cpuBadge = document.getElementById('cpuBadge');
const cpuModel = document.getElementById('cpuModel');
const cpuCores = document.getElementById('cpuCores');
const cpuGaugeArc = document.getElementById('cpuGaugeArc');
const cpuGaugeVal = document.getElementById('cpuGaugeVal');

const gpuBadge = document.getElementById('gpuBadge');
const gpuLoad = document.getElementById('gpuLoad');
const gpuGaugeArc = document.getElementById('gpuGaugeArc');
const gpuVram = document.getElementById('gpuVram');
const gpuTemp = document.getElementById('gpuTemp');

const ramBadge = document.getElementById('ramBadge');
const ramUsage = document.getElementById('ramUsage');
const ramGaugeArc = document.getElementById('ramGaugeArc');
const ramGaugeVal = document.getElementById('ramGaugeVal');

function setGaugePercent(arcElem, percent) {
  if (!arcElem) return;
  const circumference = 390;
  const p = Math.min(100, Math.max(0, percent || 0));
  const offset = circumference - (circumference * p) / 100;
  arcElem.style.strokeDashoffset = offset;
}

socket.on('system_metrics', (m) => {
  if (!m) return;
  if (m.cpu) {
    if (cpuBadge) cpuBadge.textContent = `${m.cpu.usagePercent}%`;
    if (cpuGaugeVal) cpuGaugeVal.textContent = `${m.cpu.usagePercent}%`;
    setGaugePercent(cpuGaugeArc, m.cpu.usagePercent);
    if (cpuModel && m.cpu.model) cpuModel.textContent = m.cpu.model.split(' ')[0] + ' ' + (m.cpu.model.split(' ')[1] || '');
    if (cpuCores) cpuCores.textContent = `${m.cpu.cores} Cores`;
  }
  if (m.gpu) {
    if (gpuLoad) gpuLoad.textContent = `${m.gpu.utilizationPercent}%`;
    setGaugePercent(gpuGaugeArc, m.gpu.utilizationPercent);
    if (gpuVram) gpuVram.textContent = `${(m.gpu.memoryUsedMb / 1024).toFixed(1)} / ${(m.gpu.memoryTotalMb / 1024).toFixed(1)} GB`;
    if (gpuTemp) gpuTemp.textContent = `${m.gpu.temperatureC}°C`;
  }
  if (m.ram) {
    if (ramBadge) ramBadge.textContent = `${m.ram.percent}%`;
    if (ramGaugeVal) ramGaugeVal.textContent = `${m.ram.percent}%`;
    setGaugePercent(ramGaugeArc, m.ram.percent);
    if (ramUsage) ramUsage.textContent = `${m.ram.usedGb} / ${m.ram.totalGb} GB`;
  }
});

// Live Weather Updates (Chiclayo)
socket.on('live_weather_update', (data) => {
  if (!data) return;
  const tempElem = document.getElementById('headerWeatherTemp');
  const condElem = document.getElementById('headerWeatherCondition');
  if (tempElem && data.temp !== undefined) tempElem.textContent = `${data.temp}°C`;
  if (condElem && data.condition) condElem.textContent = data.condition.toUpperCase();
});

// Google Workspace Status
socket.on('google_workspace_status', (status) => {
  const googleBadge = document.getElementById('googleWorkspaceBadge');
  if (googleBadge) {
    if (status && status.configured) {
      googleBadge.textContent = 'CONECTADO';
      googleBadge.className = 'widget-badge green';
    } else {
      googleBadge.textContent = 'SIN TOKEN';
      googleBadge.className = 'widget-badge pink';
    }
  }
});

// Latency Masking (Aviso Previo) Dual Mode Switch
const ackModePreLlmBtn = document.getElementById('ackModePreLlmBtn');
const ackModeStaticBtn = document.getElementById('ackModeStaticBtn');
const ackModeLabel = document.getElementById('ackModeLabel');

function setAckModeUI(mode) {
  if (mode === 'pre_llm') {
    ackModePreLlmBtn?.classList.add('active');
    ackModeStaticBtn?.classList.remove('active');
    if (ackModeLabel) {
      ackModeLabel.textContent = 'PRE-LLM (~50ms)';
      ackModeLabel.className = 'metric-val cyan';
    }
  } else {
    ackModeStaticBtn?.classList.add('active');
    ackModePreLlmBtn?.classList.remove('active');
    if (ackModeLabel) {
      ackModeLabel.textContent = 'ESTÁTICO (0ms)';
      ackModeLabel.className = 'metric-val pink';
    }
  }
}

ackModePreLlmBtn?.addEventListener('click', () => {
  setAckModeUI('pre_llm');
  socket.emit('update_ack_mode', { mode: 'pre_llm' });
});

ackModeStaticBtn?.addEventListener('click', () => {
  setAckModeUI('static');
  socket.emit('update_ack_mode', { mode: 'static' });
});

socket.on('ack_mode', (data) => {
  if (data?.mode) setAckModeUI(data.mode);
});

socket.on('ack_mode_updated', (data) => {
  if (data?.mode) setAckModeUI(data.mode);
});

// =====================================================================
// Dialogue UI Helpers (Max 2 Visible Subtitle Turns with Fade-Out)
// =====================================================================
function maintainMaxTwoMessages() {
  if (!dialogueFeed) return;
  const cards = Array.from(dialogueFeed.querySelectorAll('.message-card:not(.fading-out)'));
  if (cards.length > 2) {
    const toRemoveCount = cards.length - 2;
    for (let i = 0; i < toRemoveCount; i++) {
      const oldCard = cards[i];
      oldCard.classList.add('fading-out');
      setTimeout(() => {
        if (oldCard.parentNode) {
          oldCard.remove();
        }
      }, 380);
    }
  }
}

function appendUserMessage(text) {
  maintainMaxTwoMessages();
  const card = document.createElement('div');
  card.className = 'message-card user-message';
  card.innerHTML = `
    <div class="msg-avatar">CR</div>
    <div class="msg-content">
      <div class="msg-sender">CRISTIAN <span class="msg-time">${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  dialogueFeed.appendChild(card);
  maintainMaxTwoMessages();
}

function createEviMessageCard() {
  maintainMaxTwoMessages();
  const card = document.createElement('div');
  card.className = 'message-card evi-message';
  card.innerHTML = `
    <div class="msg-avatar">EVI</div>
    <div class="msg-content">
      <div class="msg-sender">E.V.I. <span class="msg-time">${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div class="msg-text"></div>
    </div>
  `;
  dialogueFeed.appendChild(card);
  maintainMaxTwoMessages();
  return card;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// =====================================================================
// Speech Recognition & Microphone
// =====================================================================
let isRecording = false;
let webSpeechRecognition = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  webSpeechRecognition = new SpeechRecognition();
  webSpeechRecognition.lang = 'es-PE';
  webSpeechRecognition.continuous = false;
  webSpeechRecognition.interimResults = true;

  webSpeechRecognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (final) {
      sendVoiceQuery(final);
    }
  };

  webSpeechRecognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    stopVoiceCapture();
  };

  webSpeechRecognition.onend = () => {
    if (isRecording) {
      stopVoiceCapture();
    }
  };
}

function startVoiceCapture() {
  stopAndInterruptPlayback();
  initAudioContext();
  isRecording = true;
  setCoreState('LISTENING');

  if (webSpeechRecognition) {
    try {
      webSpeechRecognition.start();
    } catch (e) {}
  }
}

function stopVoiceCapture() {
  isRecording = false;
  if (webSpeechRecognition) {
    try {
      webSpeechRecognition.stop();
    } catch (e) {}
  }
  if (currentCoreState === 'LISTENING') {
    setCoreState('STANDBY');
  }
}

function sendVoiceQuery(text) {
  const query = text.trim();
  if (!query) return;

  stopVoiceCapture();
  appendUserMessage(query);
  setCoreState('THINKING');
  socket.emit('voice_command_text', query);
}

// Arc Reactor Click Listener
arcReactor?.addEventListener('click', () => {
  initAudioContext();
  if (currentCoreState === 'SPEAKING' || isPlayingAudio) {
    stopAndInterruptPlayback();
    startVoiceCapture();
  } else if (!isRecording) {
    startVoiceCapture();
  } else {
    stopVoiceCapture();
  }
});

// Push-to-talk con Barra Espaciadora
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isRecording) {
    e.preventDefault();
    startVoiceCapture();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && isRecording) {
    e.preventDefault();
    stopVoiceCapture();
  }
});

// Quick Action Chips
document.querySelectorAll('.chip-btn-cyber').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    if (query) {
      initAudioContext();
      stopAndInterruptPlayback();
      appendUserMessage(query);
      setCoreState('THINKING');
      socket.emit('voice_command_text', query);
    }
  });
});

// =====================================================================
// Socket Streaming, Wake Word & Welcome Briefing
// =====================================================================
let currentEviCard = null;
let currentEviTextElem = null;

// Wake Word Triggered ("Hey EVI" / "Hola EVI" detectado por el listener local)
socket.on('wake_word_detected', (data) => {
  console.log('⚡ [WAKE WORD DETECTED IN CLIENT]:', data);
  if (window.electronAPI?.triggerWakeWord) {
    window.electronAPI.triggerWakeWord();
  }
  stopAndInterruptPlayback();
  startVoiceCapture();
});

socket.on('text_token', (token) => {
  if (currentCoreState !== 'SPEAKING') {
    setCoreState('SPEAKING');
  }
  if (!currentEviCard) {
    currentEviCard = createEviMessageCard();
    currentEviTextElem = currentEviCard.querySelector('.msg-text');
  }
  if (currentEviTextElem) {
    currentEviTextElem.textContent += token;
  }
});

socket.on('stream_end', () => {
  currentEviCard = null;
  currentEviTextElem = null;
});

socket.on('audio_chunk', (base64Audio) => {
  const binaryString = window.atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  audioQueue.push(bytes);
  if (!isPlayingAudio) {
    playNextInQueue();
  }
});

// Button Refresh Briefing
btnRefreshBriefing?.addEventListener('click', () => {
  initAudioContext();
  stopAndInterruptPlayback();
  socket.emit('request_welcome_briefing');
});

// Auto Welcome Briefing on Connect
let hasRequestedWelcome = false;
socket.on('connect', () => {
  statusPulseDot?.classList.add('connected');
  if (statusLabel) statusLabel.textContent = 'QUANTUM CORE ONLINE // CHICLAYO HUB';
  
  if (!hasRequestedWelcome) {
    hasRequestedWelcome = true;
    setTimeout(() => {
      socket.emit('request_welcome_briefing');
    }, 500);
  }
});

// =====================================================================
// RAG Sync & Memory Modal
// =====================================================================
syncRagBtn?.addEventListener('click', () => {
  const span = syncRagBtn.querySelector('span');
  if (span) span.textContent = 'SYNC...';
  socket.emit('sync_knowledge');
  setTimeout(() => {
    if (span) span.textContent = '⚡ RAG';
  }, 2000);
});

openMemoryModalBtn?.addEventListener('click', () => {
  memoryModal?.classList.add('open');
  loadMemoriesList();
});

closeMemoryModalBtn?.addEventListener('click', () => {
  memoryModal?.classList.remove('open');
});

saveMemoryBtn?.addEventListener('click', () => {
  const text = newMemoryInput?.value.trim();
  if (text) {
    socket.emit('save_memory', { text, category: 'preference' });
    if (newMemoryInput) newMemoryInput.value = '';
    setTimeout(loadMemoriesList, 600);
  }
});

refreshMemoriesBtn?.addEventListener('click', loadMemoriesList);

function loadMemoriesList() {
  if (!memoryItemsContainer) return;
  memoryItemsContainer.innerHTML = '<div class="loading-placeholder">Consultando base de datos pgvector...</div>';
  fetch('http://localhost:3000/api/memories')
    .then(r => r.json())
    .then(data => {
      if (!data || data.length === 0) {
        memoryItemsContainer.innerHTML = '<div class="loading-placeholder">No hay memorias almacenadas todavía.</div>';
        return;
      }
      memoryItemsContainer.innerHTML = '';
      data.forEach(m => {
        const item = document.createElement('div');
        item.className = 'memory-item';
        item.innerHTML = `
          <span>${escapeHtml(m.content || m.text || '')}</span>
          <span style="color:var(--neon-pink);font-size:9.5px;font-family:var(--font-mono);">${new Date(m.created_at || Date.now()).toLocaleDateString()}</span>
        `;
        memoryItemsContainer.appendChild(item);
      });
    })
    .catch(() => {
      if (memoryItemsContainer) {
        memoryItemsContainer.innerHTML = '<div class="loading-placeholder">No se pudieron cargar las memorias.</div>';
      }
    });
}
