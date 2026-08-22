# =====================================================================
#             Script de Arranque E.V.I. (Modo Cloud & MCP)
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "       INICIANDO E.V.I. (CLOUD HYPER-DRIVE)      " -ForegroundColor Magenta
Write-Host "   ⚡ LLM: Groq (GPT-OSS 20B) // 800 Tokens/sec  " -ForegroundColor Cyan
Write-Host "   🎙️ TTS: Microsoft Neural // Camila (Perú) +20%" -ForegroundColor Yellow
Write-Host "   ✉️ MCP: Google Workspace // Gmail & Calendar   " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan

# Funcion para verificar si un puerto TCP esta abierto
function Test-PortOpen ($port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect("127.0.0.1", $port, $null, $null)
        $success = $async.AsyncWaitHandle.WaitOne(400, $false)
        if ($success -and $client.Connected) {
            $client.EndConnect($async)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    } catch {
        return $false
    }
}

# -------------------------------------------------------------
# 1. Base de Datos Vectorial (Opcional si Docker está disponible)
# -------------------------------------------------------------
$dockerRunning = docker info 2>$null
if ($dockerRunning) {
    $pgRunning = docker ps --filter "name=jarvis-postgres-db" --format "{{.Names}}" 2>$null
    if ($pgRunning) {
        Write-Host "`n[1/2] Base de Datos PostgreSQL pgvector activa." -ForegroundColor Green
    } else {
        Write-Host "`n[1/2] Iniciando contenedor de memoria PostgreSQL pgvector..." -ForegroundColor Cyan
        docker compose up -d postgres-vector 2>$null
    }
} else {
    Write-Host "`n[1/2] Docker no detectado; continuando con memoria local en sesión..." -ForegroundColor Yellow
}

# -------------------------------------------------------------
# 2. Verificar y levantar Orquestador NestJS (Puerto 3000)
# -------------------------------------------------------------
Write-Host "`n[2/2] Iniciando Orquestador NestJS & Cockpit..." -ForegroundColor Yellow

if (Test-PortOpen 3000) {
    Write-Host "  [OK] El Orquestador NestJS ya esta activo en puerto 3000." -ForegroundColor Green
    Write-Host "`n=================================================" -ForegroundColor Cyan
    Write-Host "  >>> Iniciando Aplicacion Nativa EVI Desktop... " -ForegroundColor Magenta
    Write-Host "=================================================" -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-client.ps1"
} else {
    Write-Host "  [+] Iniciando Backend Orquestador en esta consola..." -ForegroundColor Cyan
    Write-Host "  --> Iniciando EVI Desktop en paralelo..." -ForegroundColor Magenta
    Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-client.ps1"
    Set-Location -Path "$PSScriptRoot\orchestrator-nest"
    npm run start:dev
}

