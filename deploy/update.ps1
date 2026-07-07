# Run this ON POS 4, as Administrator, from the project root, whenever you
# want to pull the latest changes and apply them:
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1
#
# Safe to run on a schedule (e.g. hourly via Task Scheduler) - it only
# rebuilds and restarts the service if git pull actually brought in new
# commits, so a no-op check costs nothing and doesn't interrupt the app.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "BackOfficeGoplex"

Push-Location $projectRoot
try {
    $before = & git rev-parse HEAD
    Write-Host "Pulling latest changes..."
    & git pull origin main
    $after = & git rev-parse HEAD

    if ($before -eq $after) {
        Write-Host "Already up to date (no new commits). Nothing to rebuild."
        return
    }

    Write-Host "New commits found ($before -> $after). Installing dependencies and rebuilding..."
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
