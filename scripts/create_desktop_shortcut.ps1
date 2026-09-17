# Script to create a Desktop shortcut for the Wheat Breeding Platform
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Wheat Breeding Platform.lnk"
$PlatformRoot = "C:\wheat-breeding-platform"
$TargetBat = Join-Path $PlatformRoot "start_platform.bat"

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBat
$Shortcut.WorkingDirectory = $PlatformRoot
$Shortcut.Description = "Launch Wheat Breeding Platform and Open Login Page"

# Use a pleasant icon from shell32.dll (e.g., green check / globe / application icon)
# shell32.dll, 13 (globe / network) or 220
$Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$Shortcut.Save()

Write-Host "Shortcut created successfully at: $ShortcutPath" -ForegroundColor Green
