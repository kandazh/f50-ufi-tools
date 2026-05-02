$ErrorActionPreference = "Stop"
$frontEnd = Join-Path $PSScriptRoot "app\frontEnd"

# Kill existing dev server if already running on port 3000
$existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($existing) {
    Write-Host "Stopping existing server (PID: $existing)..." -ForegroundColor Yellow
    $existing | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

if (-not (Test-Path (Join-Path $frontEnd "node_modules"))) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    Push-Location $frontEnd
    pnpm install
    Pop-Location
}

Write-Host "Starting dev server at http://localhost:3000" -ForegroundColor Green
# Open in VS Code Simple Browser tab after server starts
Start-Job {
    Start-Sleep 2
    Start-Process "vscode://simpleBrowser.api/open?url=http%3A%2F%2Flocalhost%3A3000"
} | Out-Null
Set-Location $frontEnd
node dev-server.js