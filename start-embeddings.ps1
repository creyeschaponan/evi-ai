# Servidor 2: Modelo de Embeddings (Puerto 8081)
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   Iniciando Embeddings Server (llama-server)  " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

$llamaServer = "C:\AI\llama.cpp\build\bin\Release\llama-server.exe"
$modelPath = "C:\AI\models\nomic-embed-text-v1.5.Q8_0.gguf"

if (-not (Test-Path $modelPath)) {
    Write-Host "ERROR: No se encontro el modelo $modelPath" -ForegroundColor Red
    exit 1
}

Write-Host "Cargando modelo de embeddings: $modelPath en GPU CUDA..." -ForegroundColor Green

& $llamaServer `
  -m $modelPath `
  --embedding `
  -ngl 99 `
  --host 0.0.0.0 `
  --port 8081
