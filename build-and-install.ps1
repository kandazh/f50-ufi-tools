# Build and install UFI-TOOLS release APK
# Usage: .\build-and-install.ps1

Set-Location $PSScriptRoot

# 0. Kill any lingering Gradle/Java processes and force-clean build dir
Write-Host "`n=== Preparing build environment ===" -ForegroundColor Cyan
Get-Process -Name "java", "gradle", "gradlew" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Force delete build directory if it exists (fixes Windows file lock issues)
if (Test-Path "app\build") {
    Write-Host "Forcing build directory cleanup..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "app\build" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 1. Clean and build release APK (includes frontend build automatically)
Write-Host "`n=== Cleaning & Building Release APK ===" -ForegroundColor Cyan
$buildAttempt = 1
$maxAttempts = 3
while ($buildAttempt -le $maxAttempts) {
    Write-Host "Build attempt $buildAttempt of $maxAttempts..." -ForegroundColor Cyan
    .\gradlew.bat clean assembleRelease
    if ($LASTEXITCODE -eq 0) { break }
    if ($buildAttempt -lt $maxAttempts) {
        Write-Host "Build failed, retrying in 5 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Get-Process -Name "java", "gradle", "gradlew" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    $buildAttempt++
}
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed after $maxAttempts attempts!" -ForegroundColor Red; exit 1 }

# 2. Find the generated APK
$apk = Get-ChildItem "app\build\outputs\apk\release\*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Write-Host "No APK found!" -ForegroundColor Red; exit 1 }
Write-Host "`n=== APK: $($apk.Name) ($([math]::Round($apk.Length/1MB,2)) MB) ===" -ForegroundColor Green

# 3. Ensure ADB connection (connect wirelessly if not already connected)
$adb = ".\platform-tools\adb.exe"
$devices = & $adb devices | Select-String "device$"
if (-not $devices) {
    Write-Host "`n=== No device found, trying wireless ADB... ===" -ForegroundColor Yellow
    & $adb connect 192.168.0.1:5555 | Out-Null
    Start-Sleep -Seconds 2
    $devices = & $adb devices | Select-String "device$"
}
if (-not $devices) { Write-Host "No device connected!" -ForegroundColor Red; exit 1 }
Write-Host "`n=== Device found ===" -ForegroundColor Cyan

# 4. Install APK (uninstall first if signature mismatch)
Write-Host "`n=== Installing ===" -ForegroundColor Cyan
$installOutput = & $adb install -r "$($apk.FullName)" 2>&1 | Out-String
Write-Host $installOutput
if ($installOutput -match "INSTALL_FAILED" -or $installOutput -match "Failure") {
    Write-Host "Signature mismatch or install failed - uninstalling old version..." -ForegroundColor Yellow
    & $adb uninstall com.hotbox.f50_app
    $installOutput = & $adb install "$($apk.FullName)" 2>&1 | Out-String
    Write-Host $installOutput
    if ($installOutput -notmatch "Success") { Write-Host "Install failed!" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== Done! $($apk.Name) installed ===" -ForegroundColor Green

$pkg = "com.hotbox.f50_app"

# 5. Grant runtime permissions
Write-Host "`n=== Granting permissions ===" -ForegroundColor Cyan
& $adb shell pm grant $pkg android.permission.POST_NOTIFICATIONS
& $adb shell pm grant $pkg android.permission.READ_PHONE_STATE
& $adb shell pm grant $pkg android.permission.READ_SMS
& $adb shell pm grant $pkg android.permission.READ_EXTERNAL_STORAGE
& $adb shell pm grant $pkg android.permission.WRITE_EXTERNAL_STORAGE

# 6. Grant usage stats (appops)
& $adb shell appops set $pkg android:get_usage_stats allow

# 7. Disable battery optimization
& $adb shell dumpsys deviceidle whitelist +$pkg

Write-Host "Permissions granted." -ForegroundColor Green

# 8. Restart the app
Write-Host "`n=== Restarting app ===" -ForegroundColor Cyan
& $adb shell am force-stop $pkg
& $adb shell am start -n "$pkg/com.hotbox.f50_app.MainActivity"

Write-Host "`n=== All done! ===" -ForegroundColor Green
