# Wheat Breeding Platform Launcher
$ErrorActionPreference = "Stop"
$PlatformRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=================================================" -ForegroundColor Green
Write-Host "   Wheat Breeding Platform - Starting Services   " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Green

# 1. Start Backend
Write-Host "`n[1/3] Preparing backend database & migrations..." -ForegroundColor Yellow
$BackendDir = Join-Path $PlatformRoot "backend"
$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

# Run migrations
Push-Location $BackendDir
& $PythonExe manage.py migrate --noinput
Pop-Location

Write-Host "[2/3] Starting Django backend (Port 8000)..." -ForegroundColor Yellow
$BackendProcess = Start-Process -FilePath $PythonExe -ArgumentList "manage.py runserver 127.0.0.1:8000" -WorkingDirectory $BackendDir -PassThru -NoNewWindow

# 2. Start Frontend
Write-Host "[3/3] Starting React frontend (Port 5173)..." -ForegroundColor Yellow
$FrontendDir = Join-Path $PlatformRoot "frontend"
$NpmCmd = "npm.cmd"
$FrontendProcess = Start-Process -FilePath $NpmCmd -ArgumentList "run dev -- --host 127.0.0.1" -WorkingDirectory $FrontendDir -PassThru -NoNewWindow

# 3. Wait for services to become responsive
Write-Host "`nWaiting for services to initialize..." -ForegroundColor Gray
$Ready = $false
$Retries = 30

while ($Retries -gt 0 -and -not $Ready) {
    Start-Sleep -Seconds 1
    try {
        $backendTest = Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -WarningAction SilentlyContinue
        $frontendTest = Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -WarningAction SilentlyContinue
        if ($backendTest.TcpTestSucceeded -and $frontendTest.TcpTestSucceeded) {
            $Ready = $true
        }
    } catch {
        # continue waiting
    }
    $Retries--
}

Write-Host "`n=================================================" -ForegroundColor Green
Write-Host "   Platform is ONLINE! Launching Login Screen...  " -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173/login         " -ForegroundColor Cyan
Write-Host "   Backend:  http://localhost:8000/admin/        " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Green

# 4. Open default browser
Start-Process "http://localhost:5173/login"

Write-Host "`nPress Ctrl+C or close this window to stop the platform." -ForegroundColor DarkGray

try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($BackendProcess.HasExited -or $FrontendProcess.HasExited) {
            break
        }
    }
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    if ($BackendProcess -and -not $BackendProcess.HasExited) { Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($FrontendProcess -and -not $FrontendProcess.HasExited) { Stop-Process -Id $FrontendProcess.Id -Force -ErrorAction SilentlyContinue }
    # Also clean up node/python spawned processes on ports
    Get-Process -Name "node", "python" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*wheat-breeding-platform*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Platform services stopped." -ForegroundColor Gray
}
