# =====================================================================
# Script de Arranque del Microservicio Nativo Faster-Whisper (CUDA)
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   INICIANDO NATIVE FASTER-WHISPER CUDA STT      " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\whisper-service"
python server.py --port 10305
