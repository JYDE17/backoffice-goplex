# Run this ON EACH POS (normal PowerShell, no admin needed) to make F9 a
# GLOBAL Windows shortcut that opens the CSR counting page in the default
# browser, no matter which application currently has focus:
#   powershell -ExecutionPolicy Bypass -File deploy\install-session-hotkey.ps1 -Url "http://<ip-du-serveur>:3000/session"
#
# Without -Url it defaults to localhost (fine on POS4 itself; other POS
# must pass the server address they normally use to reach BackOffice).
#
# How it works: a .lnk shortcut with a hotkey assigned. Windows fires
# Desktop/Start Menu shortcut hotkeys globally via Explorer.
#
# Deliberately placed in the user's Start Menu folder, NOT the Desktop -
# when all 4 POS have their Desktop synced through the same OneDrive
# account, a shortcut deleted on any one of them (a stray double-click, a
# runaway app, whatever) gets deleted on all 4 within seconds, since
# OneDrive treats it as one shared folder. The Start Menu folder isn't
# part of OneDrive's Known Folder Move sync, so each POS's copy is
# independent - one going missing no longer takes down the other three.

param(
    [string]$Url = "http://10.56.10.226:3000/session"
)

$ErrorActionPreference = "Stop"

$startMenu = [Environment]::GetFolderPath("StartMenu")
$lnkPath = Join-Path $startMenu "Session de caisse.lnk"

$edgePaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgePaths |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

if (-not $edge) {
    throw "Microsoft Edge est introuvable sur ce poste."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)

$shortcut.TargetPath = $edge
$shortcut.Arguments = "--app=`"$Url`" --start-maximized --no-first-run"
$shortcut.Hotkey = "F9"
$shortcut.Description = "BackOffice - comptage de caisse CSR"
$shortcut.Save()

Write-Host "Raccourci cree : $lnkPath"
Write-Host "Touche globale : F9 -> $Url"
Write-Host ""
Write-Host "IMPORTANT : ferme et rouvre la session Windows ou redemarre le PC."
Write-Host "Le raccourci doit rester dans ce dossier Menu Demarrer pour que F9 fonctionne."