import sounddevice as sd
import numpy as np
import openwakeword.model as oww
import soundfile as sf
import os
import sys

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

print("=" * 60)
print("  DIAGNÓSTICO DE AUDIO REALTEK - OPENWAKEWORD")
print("=" * 60)

# Buscar microfono Realtek
target_dev = None
dev_name = "Default"
for i, d in enumerate(sd.query_devices()):
    if d['max_input_channels'] > 0 and 'realtek' in d['name'].lower() and ('mic' in d['name'].lower() or 'audio' in d['name'].lower()):
        target_dev = i
        dev_name = d['name']
        break

if target_dev is None:
    def_d = sd.query_devices(kind='input')
    target_dev = def_d['index']
    dev_name = def_d['name']

print(f"🎙️ Dispositivo de entrada: [{target_dev}] {dev_name}")

MODEL_PATH = "d:/Proyectos/jarvis-local/models/hey_evi.onnx"
m = oww.Model(wakeword_models=[MODEL_PATH], inference_framework="onnx")

print("\n🎙️ Grabando 3 segundos de tu Micrófono Realtek... ¡Di 'HEY EVI' o 'HOLA EVI' ahora!")
print("🔴 Grabando...")

audio = sd.rec(int(3 * 16000), samplerate=16000, channels=1, dtype="int16", device=target_dev)
sd.wait()
print("⏹️ Grabación terminada.")

audio_1d = audio.flatten()
rms = np.sqrt(np.mean(audio_1d.astype(np.float32) ** 2))
max_amp = np.max(np.abs(audio_1d))

print(f"\n📊 Análisis de la señal de audio Realtek:")
print(f"   - Muestras totales: {len(audio_1d)}")
print(f"   - Amplitud máxima: {max_amp} / 32767")
print(f"   - Volumen RMS promedio: {rms:.2f}")

# Guardar para inspección
sf.write("d:/Proyectos/jarvis-local/diagnostic_realtek.wav", audio_1d, 16000)
print(f"   - Archivo guardado: diagnostic_realtek.wav")

print(f"\n🧠 Evaluando modelo 'hey_evi' frame a frame (80ms):")
scores = []
for i in range(0, len(audio_1d) - 1280, 1280):
    chunk = audio_1d[i:i+1280]
    pred = m.predict(chunk)
    sc = pred.get("hey_evi", 0.0)
    scores.append(sc)

print(f"   - Puntaje Máximo obtenido: {max(scores):.5f}")
print(f"   - Historial de puntajes: {[round(float(s), 4) for s in scores]}")

if max(scores) >= 0.12:
    print("\n🔥 ¡EL MODELO DETECTÓ TU VOZ CON ÉXITO! (Puntaje superior al umbral)")
else:
    print(f"\n⚠️ Puntaje máximo: {max(scores):.4f}. Prueba subiendo la barrita de volumen del micrófono.")
