# SolarCRM - One Click Start
# Run this from the project root: .\start.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting Doctor Electric CRM" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill any existing node processes on ports 3000 and 4000
$port4000 = netstat -ano | Select-String ":4000 " | Select-String "LISTENING"
$port3000 = netstat -ano | Select-String ":3000 " | Select-String "LISTENING"

if ($port4000) {
    $pid4000 = ($port4000 -split "\s+")[-1]
    Stop-Process -Id $pid4000 -Force -ErrorAction SilentlyContinue
    Write-Host "  [*] Cleared port 4000" -ForegroundColor Yellow
}
if ($port3000) {
    $pid3000 = ($port3000 -split "\s+")[-1]
    Stop-Process -Id $pid3000 -Force -ErrorAction SilentlyContinue
    Write-Host "  [*] Cleared port 3000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  [1/2] Starting Backend API on http://localhost:4000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run backend:dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host "  [2/2] Starting Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  App is starting up!" -ForegroundColor Cyan
Write-Host "  Open: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Email:    admin@solarcrm.local" -ForegroundColor White
Write-Host "  Password: admin12345" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Open browser after a short delay
Start-Sleep -Seconds 4
Start-Process "http://localhost:3000"
