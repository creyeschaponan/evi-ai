// =========================================================
// E.V.I. — Enhanced Virtual Intelligence Web Client
// =========================================================

const socket = io({ transports: ['websocket'] });

// DOM Elements
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
const openMemoryModalBtn = document.getElementById('openMemoryModalBtn');
const memoryModal = document.getElementById('memoryModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const closeModalBackdrop = document.getElementById('closeModalBackdrop');
const saveMemoryActionBtn = document.getElementById('saveMemoryActionBtn');
const saveKnowledgeActionBtn = document.getElementById('saveKnowledgeActionBtn');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const canvasCtx = visualizerCanvas.getContext('2d');

// TTS Toolbar Elements
const ttsEngineSelect = document.getElementById('ttsEngineSelect');
const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
const ttsRateSlider = document.getElementById('ttsRateSlider');
const ttsRateDisplay = document.getElementById('ttsRateDisplay');
const ttsEngineBadgeText = document.getElementById('ttsEngineBadgeText');

// Initial timestamp
document.getElementById('initTime').textContent = new Date().toLocaleTimeString();

// =========================================================
// Audio Context & Reactive Visualizer
// =========================================================
let audioCtx = null;
let analyser = null;
let visualizerDataArray = null;
let visualizerBufferLength = 0;
let isVisualizerRunning = false;

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
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

  function renderVisualizer() {
    requestAnimationFrame(renderVisualizer);

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 62;

    canvasCtx.clearRect(0, 0, width, height);

    if (!analyser || (currentCoreState === 'STANDBY' && !isRecording && !isPlayingAudio)) {
      // Idle circular pulse
      const time = Date.now() * 0.002;
      canvasCtx.beginPath();
      canvasCtx.arc(centerX, centerY, radius + Math.sin(time) * 3, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();
      return;
    }

    analyser.getByteFrequencyData(visualizerDataArray);

    // Render radial frequency bars
    const bars = visualizerBufferLength;
    const step = (Math.PI * 2) / bars;

    for (let i = 0; i < bars; i++) {
      const val = visualizerDataArray[i] / 255.0;
      const barLength = Math.max(4, val * 38);
      const angle = i * step;

      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barLength);
      const y2 = centerY + Math.sin(angle) * (radius + barLength);

      canvasCtx.beginPath();
      canvasCtx.moveTo(x1, y1);
      canvasCtx.lineTo(x2, y2);
      
      if (isRecording) {
        canvasCtx.strokeStyle = `rgba(255, 42, 95, ${0.4 + val * 0.6})`;
      } else {
        canvasCtx.strokeStyle = `rgba(0, 240, 255, ${0.4 + val * 0.6})`;
      }
      canvasCtx.lineWidth = 3;
      canvasCtx.lineCap = 'round';
      canvasCtx.stroke();
    }
  }

  renderVisualizer();
}

startVisualizerLoop();

// =========================================================
// UI States Management
// =========================================================
let currentCoreState = 'STANDBY'; // 'STANDBY' | 'LISTENING' | 'THINKING' | 'SPEAKING'

function setCoreState(state) {
  currentCoreState = state;
  coreStateBadge.textContent = state;

  voiceCoreBtn.classList.remove('active-recording', 'active-speaking');

  if (state === 'STANDBY') {
    coreStateBadge.style.color = 'var(--primary-cyan)';
    coreStateBadge.style.borderColor = 'var(--primary-cyan)';
    voicePromptText.textContent = 'TOCA EL NÚCLEO O PRESIONA [ESPACIO] PARA HABLAR';
    voiceSubtext.textContent = 'Micrófono permanente activado // Audio 16kHz PCM';
  } else if (state === 'LISTENING') {
    coreStateBadge.style.color = 'var(--accent-magenta)';
    coreStateBadge.style.borderColor = 'var(--accent-magenta)';
    voiceCoreBtn.classList.add('active-recording');
    voicePromptText.textContent = '🔴 ESCUCHANDO... HABLA AHORA';
    voiceSubtext.textContent = 'Toca el núcleo o presiona Enter para enviar';
  } else if (state === 'THINKING') {
    coreStateBadge.style.color = 'var(--accent-purple)';
    coreStateBadge.style.borderColor = 'var(--accent-purple)';
    voicePromptText.textContent = '⚡ PROCESANDO CON QWEN3-8B + RAG...';
    voiceSubtext.textContent = 'Buscando contexto y generando respuesta';
  } else if (state === 'SPEAKING') {
    coreStateBadge.style.color = 'var(--accent-purple)';
    coreStateBadge.style.borderColor = 'var(--accent-purple)';
    voiceCoreBtn.classList.add('active-speaking');
    voicePromptText.textContent = '🔊 EVI RESPONDIENDO (PIPER TTS)';
    voiceSubtext.textContent = 'Transmisión de voz en alta fidelidad 22kHz';
  }
}

// =========================================================
// Audio Playback Queue (Piper TTS Chunks)
// =========================================================
const audioPlaybackQueue = [];
let isPlayingAudio = false;

function playNextAudioChunk() {
  if (audioPlaybackQueue.length === 0) {
    isPlayingAudio = false;
    if (currentCoreState === 'SPEAKING') {
      setCoreState('STANDBY');
    }
    return;
  }

  isPlayingAudio = true;
  setCoreState('SPEAKING');

  const base64Wav = audioPlaybackQueue.shift();
  if (!base64Wav) {
    playNextAudioChunk();
    return;
  }

  try {
    const binaryString = atob(base64Wav);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Detectar si es WAV (empieza por 'RIFF') o MP3
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const mimeType = isWav ? 'audio/wav' : 'audio/mpeg';

    const audioBlob = new Blob([bytes.buffer], { type: mimeType });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      playNextAudioChunk();
    };

    audio.onerror = (e) => {
      console.warn('Audio element error:', e);
      URL.revokeObjectURL(audioUrl);
      playNextAudioChunk();
    };

    audio.play().catch((err) => {
      console.warn('Audio play failed:', err);
      URL.revokeObjectURL(audioUrl);
      playNextAudioChunk();
    });
  } catch (err) {
    console.error('Error processing audio chunk:', err);
    playNextAudioChunk();
  }
}

// =========================================================
// WebSocket Events
// =========================================================
socket.on('connect', () => {
  statusPulseDot.style.background = 'var(--accent-green)';
  statusLabel.textContent = 'SISTEMA EN LÍNEA (LOCALHOST:3000)';
});

socket.on('disconnect', () => {
  statusPulseDot.style.background = 'var(--accent-magenta)';
  statusLabel.textContent = 'DESCONECTADO DEL ORQUESTADOR';
});

let currentActiveMessageCard = null;

socket.on('stt_transcription', (transcript) => {
  if (transcript && transcript.trim()) {
    appendUserMessage(transcript.trim());
    setCoreState('THINKING');
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
  if (!isPlayingAudio) {
    setCoreState('STANDBY');
  }
});

// =========================================================
// TTS Voice & Engine Dynamic Toolbar
// =========================================================
let currentTtsCatalog = null;

function renderTtsCatalog(catalog) {
  if (!catalog || !catalog.engines) return;
  currentTtsCatalog = catalog;

  // 1. Poblar Motores
  ttsEngineSelect.innerHTML = '';
  catalog.engines.forEach((eng) => {
    const opt = document.createElement('option');
    opt.value = eng.id;
    opt.textContent = eng.displayName;
    if (eng.id === catalog.active.engine) {
      opt.selected = true;
    }
    ttsEngineSelect.appendChild(opt);
  });

  // 2. Poblar Voces para el motor activo
  updateVoiceDropdownForEngine(catalog.active.engine, catalog.active.voice);

  // 3. Slider de Velocidad
  updateRateSliderFromRateString(catalog.active.rate);

  // 4. Actualizar Badge
  updateEngineBadge(catalog.active.engine, catalog.active.voice);
}

function updateVoiceDropdownForEngine(engineId, selectedVoiceId) {
  if (!currentTtsCatalog) return;
  const engine = currentTtsCatalog.engines.find((e) => e.id === engineId);
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
    engineId === 'edge'
      ? 'EDGE NEURAL'
      : engineId === 'piper'
      ? 'PIPER LOCAL'
      : engineId === 'cosyvoice'
      ? 'COSYVOICE 3'
      : 'CHATTERBOX';
  const cleanVoice = voiceId ? voiceId.replace('es-MX-', '').replace('es-US-', '').replace('es_MX-', '').replace('Neural', '') : '';
  ttsEngineBadgeText.textContent = `${engineName} // ${cleanVoice.toUpperCase()}`;
}

// Event Listeners para la Toolbar
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

// =========================================================
// Dialogue UI Helpers
// =========================================================
function appendUserMessage(text) {
  const card = document.createElement('div');
  card.className = 'message-card user-message';
  card.innerHTML = `
    <div class="msg-avatar">CR</div>
    <div class="msg-content">
      <div class="msg-sender">CRISTIAN <span class="msg-time">${new Date().toLocaleTimeString()}</span></div>
      <div class="msg-text">${escapeHtml(text)}</div>
    </div>
  `;
  dialogueFeed.appendChild(card);
  dialogueFeed.scrollTop = dialogueFeed.scrollHeight;
}

function createEviMessageCard() {
  const card = document.createElement('div');
  card.className = 'message-card evi-message';
  card.innerHTML = `
    <div class="msg-avatar">EVI</div>
    <div class="msg-content">
      <div class="msg-sender">E.V.I. <span class="msg-time">${new Date().toLocaleTimeString()}</span></div>
      <div class="msg-text"></div>
    </div>
  `;
  dialogueFeed.appendChild(card);
  dialogueFeed.scrollTop = dialogueFeed.scrollHeight;
  return card;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// =========================================================
// Speech Recognition & Microphone (Dual Engine)
// =========================================================
let isRecording = false;
let webSpeechRecognition = null;
let micStream = null;
let pcmProcessor = null;
let recordedPcmChunks = [];

// Initialize Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  webSpeechRecognition = new SpeechRecognition();
  webSpeechRecognition.lang = 'es-PE';
  webSpeechRecognition.continuous = false;
  webSpeechRecognition.interimResults = true;

  webSpeechRecognition.onresult = (event) => {
    const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
    voicePromptText.textContent = `ESCUCHANDO: "${transcript}"`;
    if (event.results[0].isFinal) {
      stopVoiceCapture();
      sendTextMessage(transcript);
    }
  };

  webSpeechRecognition.onerror = (e) => {
    console.warn('Web Speech Error:', e);
    stopVoiceCapture();
  };

  webSpeechRecognition.onend = () => {
    if (isRecording) stopVoiceCapture();
  };
}

async function startVoiceCapture() {
  initAudioContext();
  isRecording = true;
  setCoreState('LISTENING');

  const engine = document.querySelector('input[name="sttMode"]:checked').value;

  if (engine === 'web' && webSpeechRecognition) {
    try {
      webSpeechRecognition.start();
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  } else {
    // Faster-Whisper GPU Real 16kHz PCM Stream
    try {
      recordedPcmChunks = [];
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(analyser);

      pcmProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      pcmProcessor.onaudioprocess = (e) => {
        if (!isRecording) return;
        const channelData = e.inputBuffer.getChannelData(0);
        recordedPcmChunks.push(new Float32Array(channelData));
      };

      micSource.connect(pcmProcessor);
      pcmProcessor.connect(audioCtx.destination);
    } catch (err) {
      console.error('Microphone access error:', err);
      stopVoiceCapture();
    }
  }
}

async function stopVoiceCapture() {
  isRecording = false;
  const engine = document.querySelector('input[name="sttMode"]:checked').value;

  if (engine === 'web' && webSpeechRecognition) {
    try { webSpeechRecognition.stop(); } catch (e) {}
  } else if (micStream) {
    if (pcmProcessor) pcmProcessor.disconnect();
    micStream.getTracks().forEach(t => t.stop());

    setCoreState('THINKING');

    const totalLength = recordedPcmChunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recordedPcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const pcm16Buffer = export16BitPCM(merged, audioCtx.sampleRate, 16000);
    const base64Audio = btoa(
      new Uint8Array(pcm16Buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    socket.emit('voice_command_audio', { buffer: base64Audio, rate: 16000 });
  }
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

voiceCoreBtn.addEventListener('click', () => {
  if (!isRecording) {
    startVoiceCapture();
  } else {
    stopVoiceCapture();
  }
});

// =========================================================
// Text Messaging & Keyboard Shortcuts
// =========================================================
function sendTextMessage(text) {
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

// Space bar push-to-talk (when not typing)
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
document.querySelectorAll('.chip-btn').forEach(btn => {
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
  syncRagBtn.textContent = 'SINCRONIZANDO...';
  socket.emit('sync_knowledge');
  setTimeout(() => {
    syncRagBtn.textContent = 'SYNC RAG';
  }, 2000);
});

openMemoryModalBtn.addEventListener('click', () => {
  memoryModal.classList.add('open');
});

function closeModal() {
  memoryModal.classList.remove('open');
}

closeModalBtn.addEventListener('click', closeModal);
closeModalBackdrop.addEventListener('click', closeModal);

saveMemoryActionBtn.addEventListener('click', () => {
  const text = document.getElementById('memoryTextInput').value.trim();
  if (text) {
    socket.emit('save_memory', { text, category: 'preference' });
    document.getElementById('memoryTextInput').value = '';
    closeModal();
  }
});

saveKnowledgeActionBtn.addEventListener('click', () => {
  const content = document.getElementById('knowledgeTextInput').value.trim();
  if (content) {
    socket.emit('save_knowledge', { content });
    document.getElementById('knowledgeTextInput').value = '';
    closeModal();
  }
});
