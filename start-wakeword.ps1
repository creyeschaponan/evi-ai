# =====================================================================
# EVI — Wake Word Listener Launcher
# =====================================================================
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "     E.V.I. — WAKE WORD LISTENER ('Hey EVI')     " -ForegroundColor Magenta
Write-Host "=================================================" -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot"
python "$PSScriptRoot\wakeword\wakeword_listener.py"
