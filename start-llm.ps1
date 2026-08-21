# Servidor 1: LLM Principal (Puerto 8080)
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "     Iniciando EVI LLM (llama-server)    " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$llamaServer = "C:\AI\llama.cpp\build\bin\Release\llama-server.exe"

# Prioridad: Qwen3-8B-Q6_K > Qwen3-8B-Q4_K_M > Hermes-3-Q6_K
if (Test-Path "C:\AI\models\Qwen3-8B-Q6_K.gguf") {
    $modelPath = "C:\AI\models\Qwen3-8B-Q6_K.gguf"
} elseif (Test-Path "C:\AI\models\Qwen3-8B-Q4_K_M.gguf") {
    $modelPath = "C:\AI\models\Qwen3-8B-Q4_K_M.gguf"
} else {
    $modelPath = "C:\AI\models\hermes-3-llama-3.1-8b.Q6_K.gguf"
}

Write-Host "Cargando modelo: $modelPath en GPU CUDA..." -ForegroundColor Green

& $llamaServer `
  -m $modelPath `
  -c 8192 `
  -ngl 99 `
  --host 0.0.0.0 `
  --port 8080 `
  --threads 6 `
  --flash-attn on `
  --reasoning off
