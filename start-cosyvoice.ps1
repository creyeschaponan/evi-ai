# =====================================================================
#             Script de Arranque Microservicio CosyVoice 3
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "       INICIANDO MICROSERVICIO COSYVOICE 3       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cosyDir = Join-Path $scriptDir "cosyvoice-service"

# Verificar puerto 50000
$portInUse = Get-NetTCPConnection -LocalPort 50000 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[OK] Microservicio CosyVoice 3 ya esta escuchando en puerto 50000." -ForegroundColor Green
    exit 0
}

Write-Host "[1/2] Verificando dependencias de Python..." -ForegroundColor Yellow
python -m pip install -q -r "$cosyDir\requirements.txt"

Write-Host "[2/2] Lanzando servidor CosyVoice 3 en http://localhost:50000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$cosyDir'; python server.py --port 50000"

Write-Host "[OK] CosyVoice 3 iniciado exitosamente." -ForegroundColor Cyan
