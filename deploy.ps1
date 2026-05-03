#!/usr/bin/env pwsh
# deploy.ps1 - Watch for CI build completion, download APK, install, grant permissions, and start app

param(
    [string]$Serial = "320236071629",
    [switch]$SkipWait
)

$REPO_DIR = $PSScriptRoot
$ADB = "$REPO_DIR\platform-tools\adb.exe"
$PKG = "com.hotbox.f50_app"
$ACTIVITY = "$PKG/.MainActivity"

Set-Location $REPO_DIR

function Write-Status($msg) { Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $msg" -ForegroundColor Cyan }

# Step 1: Check build status and decide what to do
if (-not $SkipWait) {
    $run = (gh run list --limit 1 --json databaseId,conclusion,status | ConvertFrom-Json)[0]

    if ($run.status -eq "completed" -and $run.conclusion -eq "success") {
        # Build already done — skip waiting
        Write-Status "Build #$($run.databaseId) already succeeded. Downloading..."

    } elseif ($run.status -eq "completed" -and $run.conclusion -ne "success") {
        # Build failed
        Write-Host "Latest build FAILED ($($run.conclusion)). Nothing to install." -ForegroundColor Red
        exit 1

    } else {
        # Build in progress — wait for it
        Write-Status "Build in progress. Waiting 8 minutes..."
        for ($i = 480; $i -gt 0; $i -= 30) {
            Write-Host "  Build in progress... (checking in $($i)s)" -ForegroundColor DarkGray
            Start-Sleep -Seconds ([Math]::Min(30, $i))
        }
        Write-Status "Initial wait done, polling for completion..."

        $maxWait = 600
        $elapsed = 0
        $interval = 30
        while ($elapsed -lt $maxWait) {
            $run = (gh run list --limit 1 --json databaseId,conclusion,status | ConvertFrom-Json)[0]
            if ($run.status -eq "completed") {
                if ($run.conclusion -eq "success") {
                    Write-Status "Build #$($run.databaseId) succeeded!"
                    break
                } else {
                    Write-Host "Build FAILED ($($run.conclusion)). Aborting." -ForegroundColor Red
                    exit 1
                }
            }
            Write-Host "  Still building... ($($elapsed)s elapsed)" -ForegroundColor DarkGray
            Start-Sleep -Seconds $interval
            $elapsed += $interval
        }

        if ($elapsed -ge $maxWait) {
            Write-Host "Timed out waiting for build." -ForegroundColor Red
            exit 1
        }
    }
}

# Step 2: Download APK artifact
Write-Status "Downloading APK..."
$runId = (gh run list --limit 1 --json databaseId | ConvertFrom-Json)[0].databaseId
Remove-Item -Recurse -Force "$REPO_DIR\apk-download" -ErrorAction SilentlyContinue
gh run download $runId --dir "$REPO_DIR\apk-download"

$apk = Get-ChildItem "$REPO_DIR\apk-download" -Recurse -Filter *.apk | Select-Object -First 1
if (-not $apk) {
    Write-Host "No APK found in download!" -ForegroundColor Red
    exit 1
}
Write-Status "Found: $($apk.Name) ($([math]::Round($apk.Length/1MB, 2)) MB)"

# Step 3: Install APK
Write-Status "Installing APK..."
$result = & $ADB -s $Serial install -r $apk.FullName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Install failed: $result" -ForegroundColor Red
    exit 1
}
Write-Status "Install successful!"

# Step 4: Grant permissions
Write-Status "Granting permissions..."
& $ADB -s $Serial shell appops set $PKG android:get_usage_stats allow
& $ADB -s $Serial shell pm grant $PKG android.permission.READ_SMS
& $ADB -s $Serial shell cmd appops set $PKG POST_NOTIFICATION allow
Write-Status "Permissions granted (usage stats, SMS, notifications)"

# Step 5: Restart app
Write-Status "Starting app..."
& $ADB -s $Serial shell am force-stop $PKG
& $ADB -s $Serial shell am start -n $ACTIVITY | Out-Null
Write-Status "Done! App is running."
