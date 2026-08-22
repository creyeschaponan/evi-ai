# =====================================================================
#             Script Inteligente de Arranque del Ecosistema EVI
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "        INICIANDO ECOSISTEMA LOCAL E.V.I.        " -ForegroundColor Cyan
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
# 1. Verificar y levantar Contenedores Docker
# -------------------------------------------------------------
Write-Host "`n[1/4] Verificando Contenedores Docker..." -ForegroundColor Yellow
$requiredContainers = @("jarvis-whisper", "jarvis-piper", "jarvis-postgres-db", "jarvis-wakeword")
$runningContainers = docker ps --format "{{.Names}}" 2>$null

$missingContainers = @()
foreach ($c in $requiredContainers) {
    if ($runningContainers -notcontains $c) {
        $missingContainers += $c
    }
}

if ($missingContainers.Count -eq 0) {
    Write-Host "  [OK] Todos los contenedores Docker ya estan en ejecucion." -ForegroundColor Green
} else {
    $missingList = $missingContainers -join ", "
    Write-Host "  [+] Levantando servicios Docker necesarios: $missingList" -ForegroundColor Cyan
    docker compose up -d
    Start-Sleep -Milliseconds 800
}

# -------------------------------------------------------------
# 2. Verificar y levantar Servidor LLM Principal (Puerto 8080)
# -------------------------------------------------------------
Write-Host "`n[2/4] Verificando Servidor LLM - Qwen3-8B - puerto 8080..." -ForegroundColor Yellow
if (Test-PortOpen 8080) {
    Write-Host "  [OK] Servidor LLM puerto 8080 ya esta activo. Omitiendo arranque." -ForegroundColor Green
} else {
    Write-Host "  [+] Iniciando Servidor LLM en ventana independiente..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-llm.ps1"
    Start-Sleep -Milliseconds 600
}

# -------------------------------------------------------------
# 3. Verificar y levantar Servidor de Embeddings (Puerto 8081)
# -------------------------------------------------------------
Write-Host "`n[3/4] Verificando Servidor de Embeddings - puerto 8081..." -ForegroundColor Yellow
if (Test-PortOpen 8081) {
    Write-Host "  [OK] Servidor de Embeddings puerto 8081 ya esta activo. Omitiendo arranque." -ForegroundColor Green
} else {
    Write-Host "  [+] Iniciando Servidor de Embeddings en ventana independiente..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-embeddings.ps1"
    Start-Sleep -Milliseconds 600
}

# -------------------------------------------------------------
# 4. Verificar y levantar Orquestador NestJS (Puerto 3000)
# -------------------------------------------------------------
Write-Host "`n[4/4] Verificando Backend Orquestador NestJS - puerto 3000..." -ForegroundColor Yellow
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

