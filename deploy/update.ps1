# Run this ON POS 4, as Administrator, from the project root, whenever you
# want to pull the latest changes and apply them:
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "BackOfficeGoplex"

Push-Location $projectRoot
try {
    Write-Host "Pulling latest changes..."
    & git pull origin main

    Write-Host "Installing dependencies and rebuilding..."
    & bun install
    & bun run build:node-server
} finally {
    Pop-Location
}

Write-Host "Restarting the service..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName $taskName

Write-Host "Done. BackOffice updated and restarted."
