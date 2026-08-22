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

# Parametros de Audio para openWakeWord
SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280  # 80 ms a 16kHz (1280 muestras por frame)
DETECTION_THRESHOLD = 0.35  # Umbral optimizado para capturar voz natural
COOLDOWN_SECONDS = 1.6

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
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                print(f"\n📡 [TRIGGER ENVIADO] Orquestador NestJS activado! (Status 200)")
    except urllib.error.URLError as err:
        print(f"\n⚠️ [ORQUESTADOR OFFLINE] No se pudo conectar a {TRIGGER_ENDPOINT}: {err.reason}")
    except Exception as ex:
        print(f"\n⚠️ [TRIGGER ERROR]: {ex}")

def main():
    print("=" * 68)
    print("  🚀 [E.V.I.] WAKE WORD LISTENER DAEMON ('Hey EVI' / 'Hola EVI')")
    print("=" * 68)

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

    try:
        default_device = sd.query_devices(kind='input')
        print(f"🎙️ [AUDIO] Microfono activo: {default_device['name']}")
    except Exception as d_err:
        print(f"🎙️ [AUDIO] Dispositivo por defecto: {d_err}")

    print(f"🎯 [CONFIG] Umbral: {DETECTION_THRESHOLD} | Cooldown: {COOLDOWN_SECONDS}s")
    print("👂 Escuchando en vivo... Di 'Hey EVI', 'Hola EVI' o 'Okay EVI'...")
    print("=" * 68)

    last_trigger_time = 0
    frame_counter = 0

    def audio_callback(indata, frames, time_info, status):
        nonlocal last_trigger_time, frame_counter
        if status:
            pass

        # 1. Asegurar arreglo 1D plano de tipo int16 exacto
        audio_1d = indata.flatten()

        # 2. Calcular nivel RMS de volumen del microfono para feedback visual
        rms = np.sqrt(np.mean(audio_1d.astype(np.float32) ** 2))
        vol_pct = min(100, int((rms / 32768.0) * 800))

        # 3. Prediccion openWakeWord en 1D
        prediction = oww_model.predict(audio_1d)

        # 4. Obtener score del modelo hey_evi
        score = prediction.get("hey_evi", 0.0)

        # Feedback en consola cada ~4 frames (320ms)
        frame_counter += 1
        if frame_counter % 4 == 0:
            bars = "█" * (vol_pct // 10) + "░" * (10 - (vol_pct // 10))
            score_bar = "🔥" if score >= DETECTION_THRESHOLD else ("⚡" if score > 0.15 else " ")
            sys.stdout.write(f"\r[MIC: {bars} {vol_pct:2d}%] [Score Hey EVI: {score:0.3f}] {score_bar}   ")
            sys.stdout.flush()

        # 5. Evaluar deteccion
        if score >= DETECTION_THRESHOLD:
            current_time = time.time()
            if (current_time - last_trigger_time) > COOLDOWN_SECONDS:
                last_trigger_time = current_time
                print(f"\n\n🔥 ========================================================")
                print(f"⚡ [WAKE WORD DETECTADO] Score: {score:.4f} -> 'Hey EVI'!")
                print(f"🔥 ========================================================\n")
                trigger_orchestrator(score, "hey_evi")

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='int16',
            blocksize=CHUNK_SAMPLES,
            callback=audio_callback
        ):
            while True:
                time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo Wake Word Listener...")
    except Exception as err:
        print(f"\n❌ [ERROR en stream de audio]: {err}")

if __name__ == "__main__":
    main()
