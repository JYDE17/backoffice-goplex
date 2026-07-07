# Optional: run this ON POS 4, as Administrator, from the project root, to
# make update.ps1 run automatically every hour (checks for new commits,
# only rebuilds/restarts if there are any):
#   powershell -ExecutionPolicy Bypass -File deploy\install-auto-update.ps1
#
# To stop the hourly auto-update (manual updates via update.ps1 still work):
#   Unregister-ScheduledTask -TaskName "BackOfficeGoplex-AutoUpdate" -Confirm:$false

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "BackOfficeGoplex-AutoUpdate"
$updateScript = Join-Path $projectRoot "deploy\update.ps1"

$powershellExe = (Get-Command powershell).Source
$action = New-ScheduledTaskAction -Execute $powershellExe `
    -Argument "-ExecutionPolicy Bypass -File `"$updateScript`"" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "BackOffice - checks GitHub for updates every hour and applies them if found." | Out-Null

Write-Host "Done. Task '$taskName' installed - checks for updates every hour."
Write-Host "Check status: Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host "Disable:      Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
