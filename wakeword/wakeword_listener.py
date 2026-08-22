#!/usr/bin/env python3
"""
=====================================================================
E.V.I. — Custom Wake Word Listener Daemon ("Hey EVI" / "Hola EVI")
Powered by openWakeWord & ONNX Runtime
=====================================================================
"""
import sys
import os
import time
import json
import urllib.request
import urllib.error
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

# Parámetros de Audio
SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280  # 80 ms a 16kHz
DETECTION_THRESHOLD = 0.50
COOLDOWN_SECONDS = 1.8

def trigger_orchestrator(score: float, model_name: str = "hey_evi"):
    """Envía notificación HTTP al orquestador NestJS cuando se detecta el Wake Word."""
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
                print(f"📡 [WAKE WORD TRIGGER SENT] Status: 200 -> Orchestrator activated!")
    except urllib.error.URLError as err:
        print(f"⚠️ [ORCHESTRATOR OFFLINE] Could not reach {TRIGGER_ENDPOINT}: {err.reason}")
    except Exception as ex:
        print(f"⚠️ [TRIGGER ERROR]: {ex}")

def main():
    print("=" * 65)
    print("  🚀 E.V.I. WAKE WORD LISTENER DAEMON (Hey EVI / Hola EVI)")
    print("=" * 65)

    if not os.path.exists(MODEL_PATH):
        print(f"❌ [ERROR] Model not found at: {MODEL_PATH}")
        sys.exit(1)

    print(f"📦 Cargando modelo: {MODEL_PATH} ...")
    try:
        oww_model = Model(
            wakeword_models=[MODEL_PATH],
            inference_framework="onnx"
        )
        print(f"✅ Modelo cargado con éxito. Claves activas: {list(oww_model.models.keys())}")
    except Exception as e:
        print(f"❌ [ERROR al cargar modelo]: {e}")
        sys.exit(1)

    default_device = sd.query_devices(kind='input')
    print(f"🎙️ Micrófono activo: {default_device['name']}")
    print(f"🎯 Umbral de detección: {DETECTION_THRESHOLD} (Cooldown: {COOLDOWN_SECONDS}s)")
    print("👂 Escuchando en segundo plano... Di 'Hey EVI', 'Okay EVI' o 'Hola EVI'...")
    print("-" * 65)

    last_trigger_time = 0

    def audio_callback(indata, frames, time_info, status):
        nonlocal last_trigger_time
        if status:
            pass

        # Convertir a int16 para openWakeWord
        audio_chunk = (indata[:, 0] * 32767).astype(np.int16)
        
        # Realizar predicción de Wake Word
        prediction = oww_model.predict(audio_chunk)

        # Evaluar score del modelo
        for model_key, score in prediction.items():
            if score >= DETECTION_THRESHOLD:
                current_time = time.time()
                if (current_time - last_trigger_time) > COOLDOWN_SECONDS:
                    last_trigger_time = current_time
                    print(f"\n⚡ [WAKE WORD DETECTADO] Modelo: '{model_key}' | Confianza: {score:.4f} 🔥")
                    trigger_orchestrator(score, model_key)

    try:
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='float32',
            blocksize=CHUNK_SAMPLES,
            callback=audio_callback
        ):
            while True:
                time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo Wake Word Listener...")
    except Exception as err:
        print(f"\n❌ [ERROR]: {err}")

if __name__ == "__main__":
    main()
