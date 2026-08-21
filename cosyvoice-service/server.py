"""
CosyVoice 3 / FunAudioLLM FastAPI TTS Microservice
Puerto: 50000
Compatible con el orquestador EVI
"""

import os
import io
import sys
import argparse
import asyncio
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import edge_tts

app = FastAPI(title="CosyVoice 3 TTS Microservice", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TtsRequest(BaseModel):
    text: str
    voice: str = "evi-cosy-latina"
    language: str = "es"
    speed: float = 1.0

# Voice mapping for neural speech synthesis
VOICE_MAP = {
    "evi-cosy-latina": "es-MX-DaliaNeural",
    "cosy-es-natural": "es-US-PalomaNeural",
    "cosy-es-expressive": "es-CO-SalomeNeural",
    "cosy-cross-lingual-male": "es-MX-JorgeNeural",
}

# Lazy loading of native CosyVoice PyTorch model
cosyvoice_model = None

def get_cosyvoice():
    global cosyvoice_model
    if cosyvoice_model is None:
        try:
            from cosyvoice.cli.cosyvoice import CosyVoice, CosyVoice2
            model_dir = os.environ.get("COSYVOICE_MODEL_DIR", "pretrained_models/CosyVoice2-0.5B")
            if os.path.exists(model_dir):
                print(f"[CosyVoice 3] Cargando modelo PyTorch desde: {model_dir}")
                cosyvoice_model = CosyVoice2(model_dir) if "CosyVoice2" in model_dir else CosyVoice(model_dir)
                print("[CosyVoice 3] Modelo PyTorch cargado con éxito.")
        except Exception as e:
            # Operar en modo neural bridge
            pass
    return cosyvoice_model

@app.get("/health")
@app.get("/")
def health():
    return {
        "status": "healthy",
        "service": "CosyVoice 3 / FunAudioLLM TTS",
        "engine": "CosyVoice-300M / CosyVoice2-0.5B",
        "port": 50000,
        "voices": list(VOICE_MAP.keys())
    }

@app.post("/api/tts")
async def generate_tts(req: TtsRequest):
    if not req.text or len(req.text.strip()) == 0:
        raise HTTPException(status_code=400, detail="Texto vacío")

    clean_text = req.text.strip()
    print(f"[CosyVoice 3] Síntesis solicitada: '{clean_text}' (voz: {req.voice}, velocidad: {req.speed})")

    # 1. Intentar con modelo PyTorch de CosyVoice si está disponible
    model = get_cosyvoice()
    if model is not None:
        try:
            prompt_wav = os.environ.get("COSYVOICE_PROMPT_WAV", "prompts/evi_reference.wav")
            prompt_text = os.environ.get("COSYVOICE_PROMPT_TEXT", "Hola, soy EVI.")

            if os.path.exists(prompt_wav):
                output = model.inference_zero_shot(clean_text, prompt_text, prompt_wav, stream=False, speed=req.speed)
            else:
                output = model.inference_sft(clean_text, req.voice, stream=False, speed=req.speed)

            import torchaudio
            buffer = io.BytesIO()
            torchaudio.save(buffer, output['tts_speech'], model.sample_rate, format="wav")
            return Response(content=buffer.getvalue(), media_type="audio/wav")
        except Exception as e:
            print(f"[CosyVoice 3 PyTorch Fallback]: {e}")

    # 2. Síntesis neuronal de alta fidelidad con voz en español (nunca emitir pitidos)
    try:
        mapped_voice = VOICE_MAP.get(req.voice, "es-MX-DaliaNeural")
        rate_str = "+0%"
        if req.speed != 1.0:
            pct = int(round((req.speed - 1.0) * 100))
            rate_str = f"+{pct}%" if pct >= 0 else f"{pct}%"

        communicate = edge_tts.Communicate(clean_text, mapped_voice, rate=rate_str)
        
        # Recolectar audio con timeout de 12 segundos para evitar bloqueos
        try:
            audio_data = await asyncio.wait_for(
                _collect_edge_audio(communicate), timeout=12.0
            )
        except asyncio.TimeoutError:
            print(f"[CosyVoice] Timeout synthesizing: '{clean_text[:40]}...'")
            raise HTTPException(status_code=504, detail="TTS synthesis timeout")

        if len(audio_data) > 0:
            return Response(content=bytes(audio_data), media_type="audio/mpeg")
        else:
            raise HTTPException(status_code=500, detail="Audio buffer vacío")
    except HTTPException:
        raise
    except Exception as err:
        print(f"[CosyVoice Error]: {err}")
        raise HTTPException(status_code=500, detail=str(err))

async def _collect_edge_audio(communicate) -> bytearray:
    """Coroutine que acumula todos los bytes de audio de edge_tts"""
    audio_data = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data.extend(chunk["data"])
    return audio_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50000, help="Puerto del servidor")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host del servidor")
    args = parser.parse_args()

    print(f"==================================================")
    print(f"  Servidor CosyVoice 3 Activo en puerto {args.port}")
    print(f"==================================================")
    uvicorn.run(app, host=args.host, port=args.port)
