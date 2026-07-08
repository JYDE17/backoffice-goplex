# Run this ON POS 4, as Administrator, from the project root, whenever you
# want to pull the latest changes and apply them:
#   powershell -ExecutionPolicy Bypass -File deploy\update.ps1
#
# Always rebuilds and restarts the service, even if git pull reports no new
# commits. This is deliberate: the local repo can already be at the latest
# commit (e.g. after a manual "git pull") while the running service still
# serves an older build, and skipping the rebuild in that case leaves the
# app stale with no warning. Rebuilding every run costs a few seconds and a
# brief service restart, which is an acceptable tradeoff for never being
# silently out of date.

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
        Write-Host "No new commits ($after) - rebuilding anyway to make sure the running service matches."
    } else {
        Write-Host "New commits found ($before -> $after)."
    }

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
