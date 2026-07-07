# Run this ON POS 4, as Administrator, from the project root:
#   powershell -ExecutionPolicy Bypass -File deploy\install-windows-service.ps1
#
# Builds the app for a plain Node server (not the Cloudflare Worker build) and
# registers a Scheduled Task that starts it at boot and restarts it if it crashes.

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "BackOfficeGoplex"

if (-not (Test-Path (Join-Path $projectRoot ".env"))) {
    Write-Warning ".env not found in $projectRoot - copy .env.example to .env and fill it in before running the service."
}

Write-Host "Installing dependencies and building (node-server target)..."
Push-Location $projectRoot
try {
    & bun install
    & bun run build:node-server
} finally {
    Pop-Location
}

$nodeExe = (Get-Command node).Source
$entry = Join-Path $projectRoot ".output\server\index.mjs"

$action = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$entry`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "BackOffice - starts at boot, restarts on crash." | Out-Null

Start-ScheduledTask -TaskName $taskName

$fwPort = if ($env:PORT) { $env:PORT } else { 3000 }
$fwRuleName = "BackOfficeGoplex-Inbound"
if (-not (Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Protocol TCP `
        -LocalPort $fwPort -Action Allow -Profile Any | Out-Null
    Write-Host "Firewall rule '$fwRuleName' created (inbound TCP $fwPort) so other POS on the network can reach this app."
}

$localIps = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress

Write-Host "Done. Task '$taskName' installed and started."
Write-Host "App reachable at http://localhost:$fwPort on this machine."
Write-Host "From other POS on the same network, use one of:"
$localIps | ForEach-Object { Write-Host "  http://$($_):$fwPort" }
Write-Host "Check status:  Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host "Stop it:       Stop-ScheduledTask -TaskName '$taskName'; Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
