Set-Location $PSScriptRoot

$adb = Join-Path $PSScriptRoot "platform-tools\adb.exe"

if (-not (Test-Path $adb)) {
    Write-Host "adb.exe not found at $adb" -ForegroundColor Red
    exit 1
}

& $adb connect 192.168.0.1:5555

& $adb devices

$filepath = "C:\Users\kak\Downloads\F-Droid.apk"
$install = 1

if ($install -eq 1 -and -not [string]::IsNullOrWhiteSpace($filepath)) {
    if (Test-Path $filepath) {
        & $adb install -r $filepath
    }
}
