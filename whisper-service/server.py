import io
import os
import argparse
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from faster_whisper import WhisperModel

app = FastAPI(title="EVI Faster-Whisper Local CUDA STT Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar modelo Whisper en GPU CUDA
print("[Whisper CUDA] Cargando modelo 'base' en GPU NVIDIA RTX 3060...")
try:
    model = WhisperModel("base", device="cuda", compute_type="float16")
    print("[Whisper CUDA] ✅ Modelo 'base' cargado exitosamente en GPU CUDA (float16).")
except Exception as e:
    print(f"[Whisper CUDA Warning] Falló float16, intentando int8 o CPU: {e}")
    try:
        model = WhisperModel("base", device="cuda", compute_type="int8_float16")
    except Exception as e2:
        model = WhisperModel("base", device="cpu", compute_type="int8")
        print("[Whisper CUDA] Modelo cargado en CPU como fallback.")

class AudioPayload(BaseModel):
    buffer: str  # Base64 encoded 16-bit 16kHz PCM
    rate: int = 16000

@app.post("/api/stt")
async def transcribe_audio(payload: AudioPayload):
    import base64
    try:
        raw_bytes = base64.b64decode(payload.buffer)
        if len(raw_bytes) < 3200:  # Menos de 100ms
            return {"text": ""}

        # Convertir bytes PCM 16-bit a float32 array
        audio_array = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        # Transcribir con VAD activo y forzando idioma Español
        segments, info = model.transcribe(
            audio_array,
            language="es",
            task="transcribe",
            initial_prompt="EVI, asistente virtual.",
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
            beam_size=1,
            temperature=0.0,
        )

        transcript_parts = []
        for segment in segments:
            transcript_parts.append(segment.text.strip())

        full_transcript = " ".join(transcript_parts).strip()
        print(f"[STT Transcription] -> \"{full_transcript}\" (duración: {info.duration:.2f}s, prob idioma: {info.language_probability:.2f})")
        return {"text": full_transcript}
    except Exception as err:
        print(f"[STT Error] {err}")
        raise HTTPException(status_code=500, detail=str(err))

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "faster-whisper-cuda", "device": "cuda"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=10305, help="Puerto del servicio STT")
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
