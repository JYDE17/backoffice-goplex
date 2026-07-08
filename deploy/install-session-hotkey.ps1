# Run this ON EACH POS (normal PowerShell, no admin needed) to make F9 a
# GLOBAL Windows shortcut that opens the CSR counting page in the default
# browser, no matter which application currently has focus:
#   powershell -ExecutionPolicy Bypass -File deploy\install-session-hotkey.ps1 -Url "http://<ip-du-serveur>:3000/session"
#
# Without -Url it defaults to localhost (fine on POS4 itself; other POS
# must pass the server address they normally use to reach BackOffice).
#
# How it works: a Desktop .lnk shortcut with a hotkey assigned. Windows
# fires Desktop/Start Menu shortcut hotkeys globally via Explorer.

param(
    [string]$Url = "http://localhost:3000/session"
)

$ErrorActionPreference = "Stop"

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "Session de caisse.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
# explorer.exe with a URL argument opens the system default browser.
$shortcut.TargetPath = "explorer.exe"
$shortcut.Arguments = $Url
$shortcut.Hotkey = "F9"
$shortcut.Description = "BackOffice - comptage de caisse CSR (ouverture/fermeture de shift)"
$shortcut.Save()

Write-Host "Raccourci cree: $lnkPath"
Write-Host "Touche globale: F9 -> $Url"
Write-Host ""
Write-Host "Note: le raccourci doit rester sur le Bureau pour que F9 fonctionne."
Write-Host "Premier declenchement parfois lent de quelques secondes (comportement Windows)."
