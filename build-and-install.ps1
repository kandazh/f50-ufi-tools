# Build and install UFI-TOOLS release APK
# Usage: .\build-and-install.ps1

Set-Location $PSScriptRoot

# 1. Build release APK (includes frontend build automatically)
Write-Host "`n=== Building Release APK ===" -ForegroundColor Cyan
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# 2. Find the generated APK
$apk = Get-ChildItem "app\build\outputs\apk\release\*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Write-Host "No APK found!" -ForegroundColor Red; exit 1 }
Write-Host "`n=== APK: $($apk.Name) ($([math]::Round($apk.Length/1MB,2)) MB) ===" -ForegroundColor Green

# 3. Check device connection
$devices = & ".\platform-tools\adb.exe" devices | Select-String "device$"
if (-not $devices) { Write-Host "No device connected!" -ForegroundColor Red; exit 1 }
Write-Host "`n=== Device found ===" -ForegroundColor Cyan

# 4. Install APK (uninstall first if signature mismatch)
Write-Host "`n=== Installing ===" -ForegroundColor Cyan
& ".\platform-tools\adb.exe" install -r $apk.FullName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Signature mismatch - uninstalling old version..." -ForegroundColor Yellow
    & ".\platform-tools\adb.exe" uninstall com.hotbox.f50_app
    & ".\platform-tools\adb.exe" install $apk.FullName
    if ($LASTEXITCODE -ne 0) { Write-Host "Install failed!" -ForegroundColor Red; exit 1 }
}

Write-Host "`n=== Done! $($apk.Name) installed ===" -ForegroundColor Green

$pkg = "com.hotbox.f50_app"
$adb = ".\platform-tools\adb.exe"

# 5. Grant runtime permissions
Write-Host "`n=== Granting permissions ===" -ForegroundColor Cyan
& $adb shell pm grant $pkg android.permission.POST_NOTIFICATIONS
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
