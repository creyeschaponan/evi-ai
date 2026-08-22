// =====================================================================
// E.V.I. — DESKTOP CLIENT CONTROLLER (ELECTRON + WAKE WORD + NEON HUD)
// =====================================================================

// Settings defaults
let currentSettings = {
  startWithWindows: false,
  wakeWordEnabled: true,
  wakeWordSensitivity: 0.5,
  orchestratorUrl: 'http://localhost:3000',
  listeningMode: 'alexa', // 'alexa' (always-on wake word) | 'push' (push-to-talk)
};

// Connect to NestJS Orchestrator
let socket = io(currentSettings.orchestratorUrl, { transports: ['websocket'] });

// DOM Elements — Titlebar
const btnMinimize = document.getElementById('btnMinimize');
const btnMaximize = document.getElementById('btnMaximize');
const btnClose = document.getElementById('btnClose');

// DOM Elements — Mode Switch
const toggleListeningModeBtn = document.getElementById('toggleListeningModeBtn');
const modeIcon = document.getElementById('modeIcon');
const modeLabel = document.getElementById('modeLabel');
const telWakeWordStatus = document.getElementById('telWakeWordStatus');

// DOM Elements — Core Reactor & Voice
const voiceCoreBtn = document.getElementById('voiceCoreBtn');
const voicePromptText = document.getElementById('voicePromptText');
const voiceSubtext = document.getElementById('voiceSubtext');
const coreStateBadge = document.getElementById('coreStateBadge');
const statusPulseDot = document.getElementById('statusPulseDot');
const statusLabel = document.getElementById('statusLabel');
const dialogueFeed = document.getElementById('dialogueFeed');
const queryInput = document.getElementById('queryInput');
const sendTextBtn = document.getElementById('sendTextBtn');
const clearStreamBtn = document.getElementById('clearStreamBtn');
const syncRagBtn = document.getElementById('syncRagBtn');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const canvasCtx = visualizerCanvas.getContext('2d');

// DOM Elements — Modals
const openMemoryModalBtn = document.getElementById('openMemoryModalBtn');
const memoryModal = document.getElementById('memoryModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalOverlay = document.getElementById('modalOverlay');
const saveMemoryBtn = document.getElementById('saveMemoryBtn');
const newMemoryInput = document.getElementById('newMemoryInput');
const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');
const memoryItemsContainer = document.getElementById('memoryItemsContainer');

// DOM Elements — Settings Modal
const openSettingsModalBtn = document.getElementById('openSettingsModalBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const settingStartWithWindows = document.getElementById('settingStartWithWindows');
const settingListeningMode = document.getElementById('settingListeningMode');
const settingSensitivity = document.getElementById('settingSensitivity');
const sensitivityDisplay = document.getElementById('sensitivityDisplay');
const settingOrchestratorUrl = document.getElementById('settingOrchestratorUrl');

// TTS Toolbar Elements
const ttsEngineSelect = document.getElementById('ttsEngineSelect');
const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
const ttsRateSlider = document.getElementById('ttsRateSlider');
const ttsRateDisplay = document.getElementById('ttsRateDisplay');
const ttsEngineBadgeText = document.getElementById('ttsEngineBadgeText');

// Set Initial Time in Header
const initTimeElem = document.getElementById('initTime');
if (initTimeElem) {
  initTimeElem.textContent = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// Audio Chime on Wake Word
const wakeChime = new Audio('../../assets/sounds/wake-ding.wav');

// =====================================================================
// Titlebar Window Controls (IPC Bridge)
// =====================================================================
if (window.electronAPI) {
  btnMinimize?.addEventListener('click', () => window.electronAPI.minimizeWindow());
  btnMaximize?.addEventListener('click', () => window.electronAPI.maximizeWindow());
  btnClose?.addEventListener('click', () => window.electronAPI.closeWindow());
}

// =====================================================================
// Settings Initialization & Sync
// =====================================================================
async function loadDesktopSettings() {
  if (window.electronAPI) {
    try {
      const saved = await window.electronAPI.getSettings();
      if (saved) {
        currentSettings = { ...currentSettings, ...saved };
      }
    } catch (e) {
      console.warn('Could not load settings from Electron:', e);
    }
  }

  // Update UI with current settings
  applyListeningModeUI(currentSettings.listeningMode);

  if (settingStartWithWindows) settingStartWithWindows.checked = !!currentSettings.startWithWindows;
  if (settingListeningMode) settingListeningMode.value = currentSettings.listeningMode || 'alexa';
  if (settingSensitivity) {
    settingSensitivity.value = currentSettings.wakeWordSensitivity || 0.5;
    if (sensitivityDisplay) sensitivityDisplay.textContent = parseFloat(settingSensitivity.value).toFixed(2);
  }
  if (settingOrchestratorUrl) settingOrchestratorUrl.value = currentSettings.orchestratorUrl || 'http://localhost:3000';
}

function applyListeningModeUI(mode) {
  currentSettings.listeningMode = mode;

  if (mode === 'alexa') {
    toggleListeningModeBtn.className = 'hud-btn-mode active-alexa';
    modeIcon.textContent = '🎙️';
    modeLabel.textContent = 'MODO ALEXA ("EVI")';
    telWakeWordStatus.textContent = 'ON // "EVI"';
    telWakeWordStatus.className = 'tel-val pink';
    if (currentCoreState === 'STANDBY') {
      voicePromptText.textContent = 'DI "EVI" O PRESIONA [ESPACIO] PARA HABLAR';
      voiceSubtext.textContent = 'Escucha continua activa // Modo Alexa operativo';
    }
  } else {
    toggleListeningModeBtn.className = 'hud-btn-mode active-push';
    modeIcon.textContent = '🔘';
    modeLabel.textContent = 'MODO PUSH-TO-TALK';
    telWakeWordStatus.textContent = 'MANUAL // ESPACIO';
    telWakeWordStatus.className = 'tel-val cyan';
    if (currentCoreState === 'STANDBY') {
      voicePromptText.textContent = 'TOCA EL NÚCLEO O PRESIONA [ESPACIO] PARA HABLAR';
      voiceSubtext.textContent = 'Modo manual activo // Presiona para hablar';
    }
  }
}

toggleListeningModeBtn?.addEventListener('click', () => {
  const newMode = currentSettings.listeningMode === 'alexa' ? 'push' : 'alexa';
  applyListeningModeUI(newMode);
  if (window.electronAPI) {
    window.electronAPI.updateSettings('listeningMode', newMode);
  }
});

// Listen to main process changes (e.g. from System Tray)
if (window.electronAPI) {
  window.electronAPI.onSettingsChanged((newCfg) => {
    if (newCfg.listeningMode) {
      applyListeningModeUI(newCfg.listeningMode);
    }
  });

  window.electronAPI.onWakeWordDetected(() => {
    triggerWakeWordActivation();
  });
}

// =====================================================================
// Audio Context & Holographic Arc Reactor Visualizer
// =====================================================================
let audioCtx = null;
let analyser = null;
let visualizerDataArray = null;
let visualizerBufferLength = 0;
let isVisualizerRunning = false;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.85;
    visualizerBufferLength = analyser.frequencyBinCount;
    visualizerDataArray = new Uint8Array(visualizerBufferLength);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startVisualizerLoop() {
  if (isVisualizerRunning) return;
  isVisualizerRunning = true;

  let idleAngle = 0;

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = 86;

    canvasCtx.clearRect(0, 0, width, height);
    idleAngle += 0.02;

    if (!analyser || (currentCoreState === 'STANDBY' && !isRecording && !isPlayingAudio)) {
      // Idle Holographic Radar Sweep & Particles
      const pulse = Math.sin(idleAngle * 2) * 4;
      
      // Halo Rosa Neón
      canvasCtx.beginPath();
      canvasCtx.arc(centerX, centerY, baseRadius + pulse, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = 'rgba(255, 0, 127, 0.4)';
      canvasCtx.lineWidth = 2.5;
      canvasCtx.shadowBlur = 14;
      canvasCtx.shadowColor = '#ff007f';
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;

      // Nodos giratorios cian
      for (let i = 0; i < 8; i++) {
        const a = idleAngle + (i * Math.PI) / 4;
        const x = centerX + Math.cos(a) * (baseRadius + 18);
        const y = centerY + Math.sin(a) * (baseRadius + 18);
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 3, 0, 2 * Math.PI);
        canvasCtx.fillStyle = '#00f0ff';
        canvasCtx.shadowBlur = 8;
        canvasCtx.shadowColor = '#00f0ff';
        canvasCtx.fill();
        canvasCtx.shadowBlur = 0;
      }
      return;
    }

    analyser.getByteFrequencyData(visualizerDataArray);

    // Render Radial Sound Wave Reactor
    const bars = visualizerBufferLength;
    const step = (Math.PI * 2) / bars;

    for (let i = 0; i < bars; i++) {
      const val = visualizerDataArray[i] / 255.0;
      const barLength = Math.max(4, val * 52);
      const angle = i * step + idleAngle * 0.5;

      const x1 = centerX + Math.cos(angle) * baseRadius;
      const y1 = centerY + Math.sin(angle) * baseRadius;
      const x2 = centerX + Math.cos(angle) * (baseRadius + barLength);
      const y2 = centerY + Math.sin(angle) * (baseRadius + barLength);

      canvasCtx.beginPath();
      canvasCtx.moveTo(x1, y1);
      canvasCtx.lineTo(x2, y2);

      if (isRecording) {
        // Modo Grabación: Resplandor Rosa Intenso
        canvasCtx.strokeStyle = `rgba(255, 0, 127, ${0.4 + val * 0.6})`;
        canvasCtx.shadowBlur = 12;
        canvasCtx.shadowColor = '#ff007f';
      } else {
        // Modo Habla: Gradiente Neón Rosa/Cian
        canvasCtx.strokeStyle = i % 2 === 0 
          ? `rgba(255, 0, 127, ${0.5 + val * 0.5})` 
          : `rgba(0, 240, 255, ${0.5 + val * 0.5})`;
        canvasCtx.shadowBlur = 14;
        canvasCtx.shadowColor = i % 2 === 0 ? '#ff007f' : '#00f0ff';
      }

      canvasCtx.lineWidth = 3.5;
      canvasCtx.lineCap = 'round';
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;
    }
  }

  renderVisualizer();
}

startVisualizerLoop();

// =====================================================================
// UI State Management (Cyberpunk HUD states)
// =====================================================================
let currentCoreState = 'STANDBY'; // 'STANDBY' | 'LISTENING' | 'THINKING' | 'SPEAKING'

function setCoreState(state) {
  currentCoreState = state;
  coreStateBadge.textContent = state;

  voiceCoreBtn.classList.remove('listening', 'speaking');

  if (state === 'STANDBY') {
    coreStateBadge.style.color = 'var(--neon-cyan)';
    coreStateBadge.style.borderColor = 'var(--neon-cyan)';
    if (currentSettings.listeningMode === 'alexa') {
      voicePromptText.textContent = 'DI "EVI" O PRESIONA [ESPACIO] PARA HABLAR';
      voiceSubtext.textContent = 'Escucha continua activa // Modo Alexa operativo';
    } else {
      voicePromptText.textContent = 'TOCA EL NÚCLEO O PRESIONA [ESPACIO] PARA HABLAR';
      voiceSubtext.textContent = 'Modo manual activo // Presiona para hablar';
    }
  } else if (state === 'LISTENING') {
    coreStateBadge.style.color = 'var(--neon-pink-bright)';
    coreStateBadge.style.borderColor = 'var(--neon-pink-bright)';
    voiceCoreBtn.classList.add('listening');
    voicePromptText.textContent = '🔴 ESCUCHANDO... HABLA AHORA';
    voiceSubtext.textContent = 'Toca el núcleo o suelta Espacio para enviar';
  } else if (state === 'THINKING') {
    coreStateBadge.style.color = 'var(--accent-purple)';
    coreStateBadge.style.borderColor = 'var(--accent-purple)';
    voicePromptText.textContent = '⚡ PROCESANDO RESPUESTA...';
    voiceSubtext.textContent = 'Consultando LLM y base vectorial pgvector';
  } else if (state === 'SPEAKING') {
    coreStateBadge.style.color = 'var(--neon-pink)';
    coreStateBadge.style.borderColor = 'var(--neon-pink)';
    voiceCoreBtn.classList.add('speaking');
    voicePromptText.textContent = '🔊 EVI RESPONDIENDO';
    voiceSubtext.textContent = 'Síntesis de voz neuronal de alta fidelidad';
  }
}

// =====================================================================
// Audio Playback Queue (FIFO Chronological Stream with Barge-in)
// =====================================================================
const audioPlaybackQueue = [];
let isPlayingAudio = false;
let currentPlayingAudio = null;

function stopAndInterruptPlayback() {
  const wasSpeaking = isPlayingAudio || currentCoreState === 'SPEAKING' || currentCoreState === 'THINKING';

  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    } catch (e) {}
    currentPlayingAudio = null;
  }
  audioPlaybackQueue.length = 0;
  isPlayingAudio = false;

  if (wasSpeaking) {
    socket.emit('interrupt');
  }
}

function playNextAudioChunk() {
  if (audioPlaybackQueue.length === 0) {
    isPlayingAudio = false;
    currentPlayingAudio = null;
    if (currentCoreState === 'SPEAKING') {
      setCoreState('STANDBY');
    }
    return;
  }

  isPlayingAudio = true;
  setCoreState('SPEAKING');

  const base64Audio = audioPlaybackQueue.shift();
  if (!base64Audio) {
    playNextAudioChunk();
    return;
  }

  try {
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const mimeType = isWav ? 'audio/wav' : 'audio/mpeg';

    const audioBlob = new Blob([bytes.buffer], { type: mimeType });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentPlayingAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (currentPlayingAudio === audio) currentPlayingAudio = null;
      playNextAudioChunk();
    };

    audio.onerror = (e) => {
      console.warn('Audio element playback error:', e);
      URL.revokeObjectURL(audioUrl);
      if (currentPlayingAudio === audio) currentPlayingAudio = null;
      playNextAudioChunk();
    };

    audio.play().catch((err) => {
      console.warn('Audio play error:', err);
      URL.revokeObjectURL(audioUrl);
      if (currentPlayingAudio === audio) currentPlayingAudio = null;
      playNextAudioChunk();
    });
  } catch (err) {
    console.error('Error processing audio packet:', err);
    playNextAudioChunk();
  }
}

// =====================================================================
// WebSocket Events (STT, LLM Streaming Tokens, TTS Chunks)
// =====================================================================
socket.on('connect', () => {
  statusPulseDot.style.background = 'var(--accent-green)';
  statusLabel.textContent = 'SISTEMA EN LÍNEA // GPU CUDA ACTIVA';
});

socket.on('disconnect', () => {
  statusPulseDot.style.background = 'var(--neon-pink)';
  statusLabel.textContent = 'DESCONECTADO DEL ORQUESTADOR';
});

let currentActiveMessageCard = null;

socket.on('stt_transcription', (transcript) => {
  if (transcript && transcript.trim()) {
    appendUserMessage(transcript.trim());
    setCoreState('THINKING');
  } else {
    setCoreState('STANDBY');
  }
});

socket.on('text_token', (token) => {
  if (!currentActiveMessageCard) {
    currentActiveMessageCard = createEviMessageCard();
  }
  const textContainer = currentActiveMessageCard.querySelector('.msg-text');
  textContainer.textContent += token;
  dialogueFeed.scrollTop = dialogueFeed.scrollHeight;
});

socket.on('audio_chunk', (base64Audio) => {
  audioPlaybackQueue.push(base64Audio);
  if (!isPlayingAudio) {
    playNextAudioChunk();
  }
});

socket.on('response_finished', () => {
  currentActiveMessageCard = null;
  if (!isPlayingAudio && audioPlaybackQueue.length === 0) {
    setCoreState('STANDBY');
  }
});

// =====================================================================
// TTS Catalog & Real-time Voice Switcher
// =====================================================================
let ttsCatalogData = null;

function renderTtsCatalog(catalog) {
  ttsCatalogData = catalog;
  if (!catalog || !catalog.engines) return;

  const active = catalog.active || { engine: 'cosyvoice', voice: 'cosy-es-expressive', rate: '+30%' };

  ttsEngineSelect.innerHTML = '';
  catalog.engines.forEach((eng) => {
    const opt = document.createElement('option');
    opt.value = eng.id;
    opt.textContent = eng.displayName;
    if (eng.id === active.engine) {
      opt.selected = true;
    }
    ttsEngineSelect.appendChild(opt);
  });

  updateVoiceDropdownForEngine(active.engine, active.voice);
  updateRateSliderFromRateString(active.rate);
  updateEngineBadge(active.engine, active.voice);
}

function updateVoiceDropdownForEngine(engineId, selectedVoiceId) {
  if (!ttsCatalogData) return;
  const engine = ttsCatalogData.engines.find((e) => e.id === engineId);
  if (!engine) return;

  ttsVoiceSelect.innerHTML = '';
  engine.voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.gender === 'female' ? 'F' : 'M'})`;
    if (v.id === selectedVoiceId) {
      opt.selected = true;
    }
    ttsVoiceSelect.appendChild(opt);
  });

  if (!selectedVoiceId && engine.voices.length > 0) {
    ttsVoiceSelect.value = engine.voices[0].id;
  }
}

function updateRateSliderFromRateString(rateStr) {
  if (!rateStr) return;
  const num = parseInt(rateStr.replace('%', '').replace('+', ''));
  if (!isNaN(num)) {
    ttsRateSlider.value = num;
    ttsRateDisplay.textContent = num >= 0 ? `+${num}%` : `${num}%`;
  }
}

function updateEngineBadge(engineId, voiceId) {
  const engineName =
    engineId === 'cosyvoice'
      ? 'COSYVOICE 3'
      : engineId === 'edge'
      ? 'EDGE NEURAL'
      : engineId === 'piper'
      ? 'PIPER LOCAL'
      : 'CHATTERBOX';
  const cleanVoice = voiceId ? voiceId.replace('es-MX-', '').replace('es-US-', '').replace('es_MX-', '').replace('Neural', '').replace('cosy-es-', '') : '';
  ttsEngineBadgeText.textContent = `${engineName} // ${cleanVoice.toUpperCase()}`;
}

// Event Listeners for Voice Toolbar
ttsEngineSelect.addEventListener('change', () => {
  const selectedEngine = ttsEngineSelect.value;
  updateVoiceDropdownForEngine(selectedEngine);
  const selectedVoice = ttsVoiceSelect.value;
  const rateVal = parseInt(ttsRateSlider.value);
  const rateStr = rateVal >= 0 ? `+${rateVal}%` : `${rateVal}%`;

  socket.emit('update_tts_settings', {
    engine: selectedEngine,
    voice: selectedVoice,
    rate: rateStr,
  });
  updateEngineBadge(selectedEngine, selectedVoice);
});

ttsVoiceSelect.addEventListener('change', () => {
  const selectedVoice = ttsVoiceSelect.value;
  socket.emit('update_tts_settings', { voice: selectedVoice });
  updateEngineBadge(ttsEngineSelect.value, selectedVoice);
});

ttsRateSlider.addEventListener('input', () => {
  const rateVal = parseInt(ttsRateSlider.value);
  const rateStr = rateVal >= 0 ? `+${rateVal}%` : `${rateVal}%`;
  ttsRateDisplay.textContent = rateStr;
});

ttsRateSlider.addEventListener('change', () => {
  const rateVal = parseInt(ttsRateSlider.value);
  const rateStr = rateVal >= 0 ? `+${rateVal}%` : `${rateVal}%`;
  socket.emit('update_tts_settings', { rate: rateStr });
});

socket.on('tts_catalog', (catalog) => {
  renderTtsCatalog(catalog);
});

socket.on('tts_config_updated', (cfg) => {
  updateEngineBadge(cfg.engine, cfg.voice);
});

// LLM Engine Selector
const llmProviderSelect = document.getElementById('llmProviderSelect');

llmProviderSelect?.addEventListener('change', () => {
  const val = llmProviderSelect.value;
  if (val === 'groq') {
    socket.emit('update_llm_settings', { provider: 'groq', model: 'openai/gpt-oss-120b' });
  } else if (val === 'groq-20b') {
    socket.emit('update_llm_settings', { provider: 'groq', model: 'openai/gpt-oss-20b' });
  } else if (val === 'groq-qwen') {
    socket.emit('update_llm_settings', { provider: 'groq', model: 'qwen/qwen3.6-27b' });
  } else if (val === 'gemini') {
    socket.emit('update_llm_settings', { provider: 'gemini', model: 'gemini-2.0-flash' });
  } else if (val === 'local') {
    socket.emit('update_llm_settings', { provider: 'local' });
  }
});

socket.on('llm_config', (cfg) => {
  if (llmProviderSelect && cfg && cfg.provider) {
    if (cfg.provider === 'groq') {
      if (cfg.model?.includes('20b')) llmProviderSelect.value = 'groq-20b';
      else if (cfg.model?.includes('qwen')) llmProviderSelect.value = 'groq-qwen';
      else llmProviderSelect.value = 'groq';
    } else {
      llmProviderSelect.value = cfg.provider;
    }
  }
});

socket.on('llm_config_updated', (cfg) => {
  if (llmProviderSelect && cfg && cfg.provider) {
    if (cfg.provider === 'groq') {
      if (cfg.model?.includes('20b')) llmProviderSelect.value = 'groq-20b';
      else if (cfg.model?.includes('qwen')) llmProviderSelect.value = 'groq-qwen';
      else llmProviderSelect.value = 'groq';
    } else {
      llmProviderSelect.value = cfg.provider;
    }
  }
});

// =====================================================================
// Dialogue UI Helpers (Max 2 Visible Subtitle Turns with Fade-Out)
// =====================================================================
function maintainMaxTwoMessages() {
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
// Native Microphone Capture & Faster-Whisper Streaming
// =====================================================================
let isRecording = false;
let micStream = null;
let pcmProcessor = null;
let recordedPcmChunks = [];

async function startVoiceCapture() {
  stopAndInterruptPlayback();
  if (isRecording) return;
  initAudioContext();

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const source = audioCtx.createMediaStreamSource(micStream);
    pcmProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
    recordedPcmChunks = [];

    source.connect(analyser);
    source.connect(pcmProcessor);
    pcmProcessor.connect(audioCtx.destination);

    pcmProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      recordedPcmChunks.push(new Float32Array(input));
    };

    isRecording = true;
    setCoreState('LISTENING');
  } catch (err) {
    console.error('Error accessing microphone:', err);
    setCoreState('STANDBY');
  }
}

function stopVoiceCapture() {
  if (!isRecording) return;
  isRecording = false;

  if (pcmProcessor) {
    pcmProcessor.disconnect();
    pcmProcessor = null;
  }

  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  // Convert collected float chunks to 16-bit 16kHz PCM
  const totalLength = recordedPcmChunks.reduce((acc, c) => acc + c.length, 0);
  if (totalLength === 0 || totalLength < 16000 * 0.4) {
    // Muy corto (< 400ms), descartar
    setCoreState('STANDBY');
    return;
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;
  let sumSquares = 0;
  for (const chunk of recordedPcmChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Calcular energía RMS para filtrar silencio y ruido de fondo
  for (let i = 0; i < merged.length; i++) {
    sumSquares += merged[i] * merged[i];
  }
  const rms = Math.sqrt(sumSquares / merged.length);

  // Si el audio es silencio (RMS < 0.01) descartar para evitar alucinaciones de Whisper
  if (rms < 0.01) {
    console.log(`[Audio Filter] Audio ignorado por bajo nivel de energía/silencio (RMS: ${rms.toFixed(4)})`);
    setCoreState('STANDBY');
    return;
  }

  setCoreState('THINKING');

  const pcm16Buffer = export16BitPCM(merged, audioCtx.sampleRate, 16000);
  const base64Audio = btoa(
    new Uint8Array(pcm16Buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  socket.emit('voice_command_audio', { buffer: base64Audio, rate: 16000 });
}

function export16BitPCM(samples, sampleRate, targetRate = 16000) {
  const ratio = sampleRate / targetRate;
  const targetLength = Math.round(samples.length / ratio);
  const buffer = new ArrayBuffer(targetLength * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < targetLength; i++) {
    const srcIdx = Math.floor(i * ratio);
    let s = Math.max(-1, Math.min(1, samples[srcIdx]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

function triggerWakeWordActivation() {
  stopAndInterruptPlayback();

  // Play futuristic chime
  wakeChime.currentTime = 0;
  wakeChime.play().catch(() => {});

  // Visual Arc Reactor flash
  voiceCoreBtn.classList.add('wake-flash');
  setTimeout(() => voiceCoreBtn.classList.remove('wake-flash'), 600);

  startVoiceCapture();
}

voiceCoreBtn.addEventListener('click', () => {
  if (currentCoreState === 'SPEAKING' || isPlayingAudio) {
    stopAndInterruptPlayback();
    startVoiceCapture();
  } else if (!isRecording) {
    startVoiceCapture();
  } else {
    stopVoiceCapture();
  }
});

// =========================================================
// Text Messaging & Keyboard Shortcuts
// =========================================================
function sendTextMessage(text) {
  stopAndInterruptPlayback();
  const query = (text || queryInput.value).trim();
  if (!query) return;

  initAudioContext();
  appendUserMessage(query);
  setCoreState('THINKING');
  socket.emit('voice_command_text', query);

  if (!text) queryInput.value = '';
}

sendTextBtn.addEventListener('click', () => sendTextMessage());
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendTextMessage();
  }
});

// Push-to-talk con Barra Espaciadora
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== queryInput && !isRecording) {
    e.preventDefault();
    startVoiceCapture();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && document.activeElement !== queryInput && isRecording) {
    e.preventDefault();
    stopVoiceCapture();
  }
});

// Quick Action Chips
document.querySelectorAll('.chip-btn-cyber').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    if (query) sendTextMessage(query);
  });
});

clearStreamBtn.addEventListener('click', () => {
  dialogueFeed.innerHTML = '';
  socket.emit('clear_history');
});

// =========================================================
// RAG Sync & Memory Modal
// =========================================================
syncRagBtn.addEventListener('click', () => {
  const span = syncRagBtn.querySelector('span');
  span.textContent = 'SINCRONIZANDO...';
  socket.emit('sync_knowledge');
  setTimeout(() => {
    span.textContent = 'SYNC RAG';
  }, 2000);
});

openMemoryModalBtn.addEventListener('click', () => {
  memoryModal.classList.add('active');
  loadMemoriesList();
});

function closeMemoryModal() {
  memoryModal.classList.remove('active');
}

closeModalBtn.addEventListener('click', closeMemoryModal);
modalOverlay.addEventListener('click', closeMemoryModal);

saveMemoryBtn.addEventListener('click', () => {
  const text = newMemoryInput.value.trim();
  if (text) {
    socket.emit('save_memory', { text, category: 'preference' });
    newMemoryInput.value = '';
    setTimeout(loadMemoriesList, 600);
  }
});

refreshMemoriesBtn.addEventListener('click', loadMemoriesList);

function loadMemoriesList() {
  memoryItemsContainer.innerHTML = '<div class="loading-placeholder">Consultando base de datos pgvector...</div>';
  fetch(`${currentSettings.orchestratorUrl}/api/memories`)
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
          <span style="color:var(--neon-pink);font-size:10px;font-family:var(--font-mono);">${new Date(m.created_at || Date.now()).toLocaleDateString()}</span>
        `;
        memoryItemsContainer.appendChild(item);
      });
    })
    .catch(() => {
      memoryItemsContainer.innerHTML = '<div class="loading-placeholder">Memorias activas sincronizadas con el orquestador.</div>';
    });
}

// =========================================================
// Settings Modal Handling
// =========================================================
openSettingsModalBtn?.addEventListener('click', () => {
  settingsModal.classList.add('active');
});

function closeSettingsModal() {
  settingsModal.classList.remove('active');
}

closeSettingsModalBtn?.addEventListener('click', closeSettingsModal);
settingsModalOverlay?.addEventListener('click', closeSettingsModal);

settingStartWithWindows?.addEventListener('change', (e) => {
  const val = e.target.checked;
  currentSettings.startWithWindows = val;
  if (window.electronAPI) window.electronAPI.updateSettings('startWithWindows', val);
});

settingListeningMode?.addEventListener('change', (e) => {
  const mode = e.target.value;
  applyListeningModeUI(mode);
  if (window.electronAPI) window.electronAPI.updateSettings('listeningMode', mode);
});

settingSensitivity?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (sensitivityDisplay) sensitivityDisplay.textContent = val.toFixed(2);
  currentSettings.wakeWordSensitivity = val;
  if (window.electronAPI) window.electronAPI.updateSettings('wakeWordSensitivity', val);
});

settingOrchestratorUrl?.addEventListener('change', (e) => {
  const url = e.target.value.trim();
  if (url) {
    currentSettings.orchestratorUrl = url;
    if (window.electronAPI) window.electronAPI.updateSettings('orchestratorUrl', url);
  }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadDesktopSettings();
});
