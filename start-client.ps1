# Script para iniciar la Aplicación de Escritorio EVI (Electron)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "      INICIANDO EVI DESKTOP (CYBERPUNK HUD)      " -ForegroundColor Magenta
Write-Host "=================================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\evi-desktop"
npm start
