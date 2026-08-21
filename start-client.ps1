# Script para iniciar el Cliente de Terminal Nativo de EVI
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "         Iniciando Cliente Nativo EVI          " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

Set-Location -Path "$PSScriptRoot\client-node"
node index.js
