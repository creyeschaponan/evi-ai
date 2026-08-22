#!/usr/bin/env python3
"""
=====================================================================
E.V.I. - Custom Wake Word Listener Daemon ("Hey EVI" / "Hola EVI")
Powered by openWakeWord & ONNX Runtime (Real-Time Audio Stream)
=====================================================================
"""
import sys
import os
import time
import json
import urllib.request
import urllib.error
from collections import deque

# Forzar UTF-8 seguro en Windows Console
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import numpy as np
import sounddevice as sd
import openwakeword
from openwakeword.model import Model

# Rutas absolutas a los modelos ONNX
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "hey_evi.onnx")

ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:3000")
TRIGGER_ENDPOINT = f"{ORCHESTRATOR_URL}/api/wakeword/trigger"

# Parametros de Audio y Deteccion Optimizados
SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280       # 80 ms por frame
AUDIO_GAIN = 1.8           # Ganancia normalizada para Realtek
DETECTION_THRESHOLD = 0.15 # Umbral optimizado para activacion fluida
COOLDOWN_SECONDS = 1.4     # Tiempo entre disparos

def get_best_input_device():
    """Selecciona automaticamente el microfono Realtek del usuario o el preferido."""
    preferred = os.environ.get("WAKEWORD_INPUT_DEVICE", "realtek").lower()
    devices = sd.query_devices()
    
    # 1. Buscar coincidencia con Realtek
    for i, dev in enumerate(devices):
        if dev['max_input_channels'] > 0:
            name_lower = dev['name'].lower()
            if preferred in name_lower and ("mic" in name_lower or "audio" in name_lower):
                return i, dev['name']

    # 2. Fallback al microfono por defecto
    try:
        def_dev = sd.query_devices(kind='input')
        return def_dev['index'], def_dev['name']
    except:
        return None, "Default Input Device"

def trigger_orchestrator(score: float, model_name: str = "hey_evi"):
    """Envia notificacion HTTP al orquestador NestJS cuando se detecta el Wake Word."""
    payload = json.dumps({
        "detected": True,
        "model": model_name,
        "score": float(score),
        "timestamp": int(time.time() * 1000)
    }).encode("utf-8")

    req = urllib.request.Request(
        TRIGGER_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            if resp.status == 200:
                print(f"\n📡 [TRIGGER HTTP 200] -> Orquestador y Navegador Activados!")
    except urllib.error.URLError as err:
        print(f"\n⚠️ [ORQUESTADOR OFFLINE] No se pudo contactar a {TRIGGER_ENDPOINT}: {err.reason}")
    except Exception as ex:
        print(f"\n⚠️ [TRIGGER ERROR]: {ex}")

def main():
    print("=" * 70)
    print("  🚀 [E.V.I.] WAKE WORD LISTENER DAEMON ('Hey EVI' / 'Hola EVI')")
    print("=" * 70)

    if not os.path.exists(MODEL_PATH):
        print(f"❌ [ERROR] Modelo no encontrado en: {MODEL_PATH}")
        sys.exit(1)

    print(f"[*] Cargando modelo: {MODEL_PATH} ...")
    try:
        oww_model = Model(
            wakeword_models=[MODEL_PATH],
            inference_framework="onnx"
        )
        print(f"✅ [OK] Modelo cargado con exito. Claves activas: {list(oww_model.models.keys())}")
    except Exception as e:
        print(f"❌ [ERROR al cargar modelo]: {e}")
        sys.exit(1)

    device_idx, device_name = get_best_input_device()
    print(f"🎙️ [AUDIO] Dispositivo seleccionado: [{device_idx}] {device_name}")
    print(f"🎯 [CONFIG] Umbral: {DETECTION_THRESHOLD} | Ganancia: {AUDIO_GAIN}x | Cooldown: {COOLDOWN_SECONDS}s")
    print("👂 Escuchando en vivo... Di 'Hey EVI', 'Hola EVI' o 'Okay EVI'...")
    print("=" * 70)

    last_trigger_time = 0
    frame_counter = 0
    recent_scores = deque(maxlen=20)
    recent_volumes = deque(maxlen=20)

    def audio_callback(indata, frames, time_info, status):
        nonlocal last_trigger_time, frame_counter
        if status:
            pass

        # 1. Si el dispositivo tiene multiples canales, tomar el primer canal mono
        if indata.ndim > 1:
            raw_channel = indata[:, 0]
        else:
            raw_channel = indata

        # 2. Aplicar ganancia y convertir a int16 plano 1D
        audio_boosted = np.clip(raw_channel.astype(np.float32) * AUDIO_GAIN, -32768, 32767).astype(np.int16)

        # 3. Medir nivel RMS de volumen
        rms = np.sqrt(np.mean(audio_boosted.astype(np.float32) ** 2))
        vol_pct = min(100, int((rms / 32768.0) * 400))
        recent_volumes.append(vol_pct)

        # 4. Prediccion openWakeWord
        prediction = oww_model.predict(audio_boosted)
        score = float(prediction.get("hey_evi", 0.0))
        recent_scores.append(score)

        peak_score = max(recent_scores) if len(recent_scores) > 0 else score
        max_vol = max(recent_volumes) if len(recent_volumes) > 0 else vol_pct

        # 5. Telemetria visual continua
        frame_counter += 1
        if frame_counter % 3 == 0:
            vol_bars = "█" * (max_vol // 10) + "░" * (10 - (max_vol // 10))
            status_symbol = "🔥 ACTIVADO!" if score >= DETECTION_THRESHOLD else ("⚡ Reconociendo..." if peak_score > 0.10 else "             ")
            sys.stdout.write(
                f"\r[MIC: {vol_bars} {max_vol:2d}%] [Actual: {score:.3f}] [Pico reciente: {peak_score:.3f}] {status_symbol}"
            )
            sys.stdout.flush()

        # 6. Disparo al superar el umbral
        if score >= DETECTION_THRESHOLD:
            current_time = time.time()
            if (current_time - last_trigger_time) > COOLDOWN_SECONDS:
                last_trigger_time = current_time
                print(f"\n\n🔥 ========================================================")
                print(f"⚡ [WAKE WORD DETECTADO] Score: {score:.4f} (Pico: {peak_score:.4f}) -> 'Hey EVI'!")
                print(f"🔥 ========================================================\n")
                trigger_orchestrator(score, "hey_evi")

    try:
        with sd.InputStream(
            device=device_idx,
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='int16',
            blocksize=CHUNK_SAMPLES,
            callback=audio_callback
        ):
            while True:
                time.sleep(0.4)
    except KeyboardInterrupt:
        print("\n\n🛑 Deteniendo Wake Word Listener...")
    except Exception as err:
        print(f"\n❌ [ERROR en stream de audio]: {err}")

if __name__ == "__main__":
    main()
