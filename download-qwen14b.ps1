# =====================================================================
#        Descarga del Modelo Qwen 14B Q4_K_M para EVI
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "    DESCARGANDO MODELO QWEN 14B (Q4_K_M GGUF)    " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Modelo: Qwen2.5-14B-Instruct Q4_K_M (bartowski)" -ForegroundColor Yellow
Write-Host "Tamaño: ~8.98 GB" -ForegroundColor Yellow
Write-Host "Destino: C:\AI\models\Qwen3-14B-Q4_K_M.gguf" -ForegroundColor Yellow
Write-Host "Compatibilidad: GPU NVIDIA RTX 3060 12GB (Aceleración CUDA)" -ForegroundColor Green
Write-Host ""

$destDir = "C:\AI\models"
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$destFile = Join-Path $destDir "Qwen3-14B-Q4_K_M.gguf"
$url = "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf"

if (Test-Path $destFile) {
    $existingBytes = (Get-Item $destFile).Length
    $existingGB = [Math]::Round($existingBytes / 1GB, 2)
    if ($existingBytes -gt 8000000000) {
        Write-Host "[OK] El modelo ya está completamente descargado ($existingGB GB)." -ForegroundColor Green
        exit 0
    } else {
        Write-Host "[!] Archivo parcial detectado ($existingGB GB). Reanudando descarga..." -ForegroundColor Cyan
    }
}

Write-Host "[>>>] Conectando a Hugging Face y descargando 8.98 GB..." -ForegroundColor Cyan
Write-Host "Por favor mantén esta ventana abierta hasta que finalice." -ForegroundColor Yellow
Write-Host ""

# Descarga con curl nativo: -f (fail on error), -L (follow redirect), -C - (resume partial), --progress-bar
curl.exe -fL --progress-bar -C - -o $destFile $url

if ($LASTEXITCODE -eq 0 -and (Test-Path $destFile) -and ((Get-Item $destFile).Length -gt 8000000000)) {
    $finalSize = [Math]::Round((Get-Item $destFile).Length / 1GB, 2)
    Write-Host ""
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host "   DESCARGA COMPLETADA EXITOSAMENTE! ($finalSize GB)   " -ForegroundColor Green
    Write-Host "=================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "El modelo quedó listo en: $destFile" -ForegroundColor Cyan
    Write-Host "Para usarlo con EVI, ejecuta: .\start-llm.ps1 o .\start-all.ps1" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[AVISO] La descarga no finalizó completamente. Vuelve a ejecutar este comando para continuarla." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Presiona cualquier tecla para cerrar esta ventana..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
