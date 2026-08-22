import sounddevice as sd
import numpy as np
import sys

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

print("=" * 65)
print("  ESCANEANDO TODOS LOS MICRÓFONOS EN TU SISTEMA...")
print("  (Di 'HOLA' o haz ruido continuo durante 3 segundos)")
print("=" * 65)

devices = sd.query_devices()
input_devices = []

for idx, dev in enumerate(devices):
    if dev['max_input_channels'] > 0:
        input_devices.append((idx, dev['name'], dev['hostapi']))

print(f"Detectados {len(input_devices)} dispositivos de entrada.\n")

results = []
for idx, name, hostapi in input_devices:
    api_name = sd.query_hostapis(hostapi)['name']
    try:
        # Grabar 1 segundo de prueba
        audio = sd.rec(16000, samplerate=16000, channels=1, dtype='int16', device=idx)
        sd.wait()
        audio_1d = audio.flatten()
        max_amp = int(np.max(np.abs(audio_1d)))
        rms = float(np.sqrt(np.mean(audio_1d.astype(np.float32) ** 2)))
        results.append((idx, name, api_name, max_amp, rms))
        status = "🔊 ACTIVO" if max_amp > 1000 else "🔇 SILENCIO"
        print(f"[{idx:2d}] {name} ({api_name}): Max Amp = {max_amp:5d} / 32767 -> {status}")
    except Exception as e:
        # Algunos dispositivos no soportan 16kHz directo
        pass

print("\n" + "=" * 65)
print("RECOMENDACIÓN:")
best = max(results, key=lambda x: x[3]) if results else None
if best and best[3] > 1000:
    print(f"⭐ Tu micrófono con señal real más fuerte es: [{best[0]}] {best[1]} (Amplitud: {best[3]})")
else:
    print("⚠️ Ningún micrófono superó los 1000 de amplitud. Revisa el volumen del micrófono en Windows.")
print("=" * 65)
