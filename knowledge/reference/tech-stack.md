# Arquitectura Técnica de EVI

## Hardware Principal
- **GPU:** NVIDIA GeForce RTX 3060 con 12 GB VRAM (CUDA activado).
- **Almacenamiento Local:** d:\Proyectos\jarvis-local.

## Microservicios y Puertos
- **LLM Engine:** llama.cpp servidor en puerto 8080 (modelo Qwen3-8B Q6_K, Flash Attention activado, modo de pensamiento desactivado para latencia ultra baja).
- **Embedding Engine:** llama.cpp servidor en puerto 8081 (modelo nomic-embed-text-v1.5 Q8_0, 768 dimensiones).
- **STT (Reconocimiento de Voz):** rhasspy/wyoming-whisper en puerto 10300 (Faster-Whisper small en español con aceleración GPU).
- **TTS (Síntesis de Voz):** rhasspy/wyoming-piper en puerto 10200 (voz es_MX-claude-high, alta fidelidad 22kHz).
- **Vector DB:** PostgreSQL 16 con extensión pgvector en puerto 5432.
- **Orquestador Central:** NestJS con WebSockets (Socket.IO) en puerto 3000.
