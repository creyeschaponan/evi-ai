# =====================================================================
#             Servidor LLM Principal para EVI (llama-server)
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "         SELECTOR DE MODELO LLM - EVI AI         " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

$llamaServer = "C:\AI\llama.cpp\build\bin\Release\llama-server.exe"
if (!(Test-Path $llamaServer)) {
    Write-Host "[ERROR] No se encontró llama-server en: $llamaServer" -ForegroundColor Red
    pause
    exit 1
}

# Modelos disponibles configurados
$modelCatalog = @(
    @{
        Id = 1
        Name = "Qwen 2.5 14B Instruct (Q4_K_M)"
        File = "C:\AI\models\Qwen3-14B-Q4_K_M.gguf"
        GpuLayers = 40
        Desc = "Máxima inteligencia y razonamiento (8.37 GB - 40 capas GPU RTX 3060)"
        Tag = "Recomendado"
    },
    @{
        Id = 2
        Name = "Qwen 2.5 8B Instruct (Q6_K)"
        File = "C:\AI\models\Qwen3-8B-Q6_K.gguf"
        GpuLayers = 99
        Desc = "Alta velocidad y precisión (6.26 GB - 100% VRAM GPU)"
        Tag = "Rápido"
    },
    @{
        Id = 3
        Name = "Hermes 3 Llama 3.1 8B (Q6_K)"
        File = "C:\AI\models\hermes-3-llama-3.1-8b.Q6_K.gguf"
        GpuLayers = 99
        Desc = "Personalidad versátil y creatividad (6.14 GB - 100% VRAM GPU)"
        Tag = "Creativo"
    }
)

# Filtrar solo los que existen en disco
$availableModels = @()
$counter = 1
foreach ($m in $modelCatalog) {
    if (Test-Path $m.File) {
        $m.MenuIndex = $counter
        $availableModels += $m
        $sizeGB = [Math]::Round((Get-Item $m.File).Length / 1GB, 2)
        Write-Host "  [$counter] $($m.Name) - $sizeGB GB [$($m.Tag)]" -ForegroundColor Green
        Write-Host "      $($m.Desc)" -ForegroundColor Gray
        Write-Host ""
        $counter++
    }
}

if ($availableModels.Count -eq 0) {
    Write-Host "[ERROR] No se encontraron modelos GGUF en C:\AI\models" -ForegroundColor Red
    pause
    exit 1
}

# Solicitar selección al usuario
Write-Host "-------------------------------------------------" -ForegroundColor Cyan
$selection = Read-Host "Elige un modelo [1-$($availableModels.Count)] (Presiona ENTER para opción [1])"

if ([string]::IsNullOrWhiteSpace($selection)) {
    $selectedModel = $availableModels[0]
} else {
    $chosenIndex = 0
    if ([int]::TryParse($selection, [ref]$chosenIndex)) {
        $selectedModel = $availableModels | Where-Object { $_.MenuIndex -eq $chosenIndex } | Select-Object -First 1
    }
    if ($null -eq $selectedModel) {
        Write-Host "[!] Opción inválida. Usando opción [1] por defecto." -ForegroundColor Yellow
        $selectedModel = $availableModels[0]
    }
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Cargando: $($selectedModel.Name)" -ForegroundColor Green
Write-Host " Archivo:  $($selectedModel.File)" -ForegroundColor Yellow
Write-Host " Capas GPU: $($selectedModel.GpuLayers) (RTX 3060 CUDA)" -ForegroundColor Green
Write-Host " Thinking:  DESACTIVADO (Respuesta Directa y Rápida)" -ForegroundColor Magenta
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

& $llamaServer `
  -m $selectedModel.File `
  -c 8192 `
  -ngl $selectedModel.GpuLayers `
  --host 0.0.0.0 `
  --port 8080 `
  --threads 6 `
  --flash-attn on `
  --reasoning off `
  --reasoning-budget 0
