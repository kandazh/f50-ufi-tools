## Split main.js into modules
$ErrorActionPreference = "Stop"
$base = "c:\Users\kak\Desktop\ME\repos\UFI-TOOLS-http-server-version\UFI-TOOLS-http-server-version\app\frontEnd\public\script"
$lines = [System.IO.File]::ReadAllLines("$base\main.js")
$outDir = "$base\main"

function Extract($start, $end, $outFile, $header, [string[]]$regs) {
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("/**")
    [void]$sb.AppendLine(" * $header")
    [void]$sb.AppendLine(" */")
    [void]$sb.AppendLine("(function () {")
    for ($i = $start - 1; $i -lt $end; $i++) {
        $line = $lines[$i]
        # Remove exactly 4 leading spaces (un-indent from main_func)
        if ($line.Length -ge 4 -and $line.Substring(0,4) -eq "    ") {
            [void]$sb.AppendLine($line.Substring(4))
        } else {
            [void]$sb.AppendLine($line)
        }
    }
    if ($regs -and $regs.Count -gt 0) {
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("    // Register on window")
        foreach ($r in $regs) {
            [void]$sb.AppendLine("    window.$r = $r;")
        }
    }
    [void]$sb.AppendLine("})();")
    [System.IO.File]::WriteAllText("$outDir\$outFile", $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  $outFile : lines $start-$end ($($end - $start + 1) lines)"
}

function ExtractMulti($ranges, $outFile, $header, [string[]]$regs) {
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("/**")
    [void]$sb.AppendLine(" * $header")
    [void]$sb.AppendLine(" */")
    [void]$sb.AppendLine("(function () {")
    $total = 0
    foreach ($range in $ranges) {
        $start = $range[0]; $end = $range[1]
        for ($i = $start - 1; $i -lt $end; $i++) {
            $line = $lines[$i]
            if ($line.Length -ge 4 -and $line.Substring(0,4) -eq "    ") {
                [void]$sb.AppendLine($line.Substring(4))
            } else {
                [void]$sb.AppendLine($line)
            }
        }
        [void]$sb.AppendLine("")
        $total += ($end - $start + 1)
    }
    if ($regs -and $regs.Count -gt 0) {
        [void]$sb.AppendLine("    // Register on window")
        foreach ($r in $regs) {
            [void]$sb.AppendLine("    window.$r = $r;")
        }
    }
    [void]$sb.AppendLine("})();")
    [System.IO.File]::WriteAllText("$outDir\$outFile", $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  $outFile : $total lines from $($ranges.Count) ranges"
}

Write-Host "Extracting modules..."

# 1. SMS (lines 728-898)
Extract 728 898 "sms.js" "SMS - Send, receive, delete, render SMS messages" @("getSms","sendSMS","deleteSMS","deleteAndReSendSms","handleSmsRender")

# 2. Status render (lines 900-1402)
Extract 900 1402 "status-render.js" "Status Dashboard - Polling loop, signal/cell rendering, global status bar" @("handlerStatusRender","handlerPerformaceStatus","queryImeiFromDIAG","resetDiagImeiCache")

# 3. Network toggles (multiple ranges)
ExtractMulti @(@(1474,1815), @(2589,2660), @(3315,3440)) "network.js" "Network - Network type, USB, WiFi switch, SMB, ROAM, Light, Reboot, SIM, NFC, Cellular" @("initNetworktype","changeNetwork","initUSBNetworkType","changeUSBNetwork","initWIFISwitch","changeWIFISwitch","initSMBStatus","initROAMStatus","initLightStatus","rebootDevice","rebootDeviceBtnInit","handlerCecullarStatus","loadTitle","initSimCardType","changeSimCard","initNFCSwitch")

# 4. Speed test (both old + cellular)
ExtractMulti @(@(3444,3554), @(5207,5433)) "speed-test.js" "Speed Test - Local download speed test + Cellular speed test" @("startTest","handleLoopMode","startCellularTestRealtime","runSingleTest","singleTest","loopTest","handleCellularLoopMode","closeCellularTest","onThreadNumChange","initCellularSpeedTestBtn","saveCellularTestUrl")

# 5. SMS Forward (lines 3677-4174)
Extract 3677 4174 "sms-forward.js" "SMS Forward - Email, cURL, DingTalk forwarding configuration" @("initSmsForward","initSmsForwardSwitch","switchSmsForwardMethod","initSmsForwardModal","handleSmsForwardForm","handleSmsForwardCurlForm","handleSmsForwardDingTalkForm","switchSmsForwardMethodTab","nicknameSettingClick","openNicknameSetting","OP")

# 6. Plugins + Scheduled Tasks (lines 4387-4834 tasks, 4835-5127 plugins, 5436-5769 plugin store)
ExtractMulti @(@(4387,5127), @(5436,5769)) "plugins.js" "Plugins and Scheduled Tasks - Plugin management, store, scheduled task CRUD" @("clearAddTaskForm","setAddTaskForm","initScheduledTask","appendTaskToList","handleInitialScheduledTasks","handleSubmitTask","addTask","refreshTask","editTask","closeAddTask","fillAction","handlePluginFileUpload","pluginExport","onPluginBtn","renderPluginList","initPluginSetting","clearPluginText","savePluginSetting","installPluginFromStore","renderPluginItems","scrollToElement","handlePluginStoreSearchInput")

# 7. Forms + Settings (data mgmt, WiFi form, client mgmt, schedule reboot, TTYD, AT, advanced, change pwd/token, LAN)
ExtractMulti @(@(1978,2588), @(2662,3313), @(4175,4370)) "forms.js" "Forms and Settings - Data management, WiFi, Client mgmt, Schedule reboot, TTYD, AT commands, Advanced, Password/Token, LAN, Refresh rate" @("handleDataManagementFormSubmit","initWIFIManagementForm","handleWIFIManagementFormSubmit","handleWifiEncodeChange","handleShowPassword","initClientManagementModal","editHostName","setOrRemoveDeviceFromBlackList","closeClientManager","initScheduleRebootStatus","handleScheduleRebootFormSubmit","initTTYD","enableTTYD","handleTTYDFormSubmit","changeResServer","initResServer","parseCGEQOSRDP","executeATCommand","QOSRDPCommand","initHighRailBtn","initATBtn","handleATFormSubmit","handleQosAT","handleAT","disableButtonWhenExecuteFunc","socatAlive","initAdvanceTools","closeAdvanceToolsModal","handleSambaPath","initChangePassData","handleChangePassword","onCloseChangePassForm","initChangeTokenData","handleChangeToken","onCloseChangeTokenForm","initLANSettings","onLANModalSubmit","changeRefreshRate","switchCpuCore")

# 8. APN + Ports + Misc (APN, ports, USB status, file upload, sleep, FOTA, data usage, misc)
ExtractMulti @(@(3555,3676), @(5128,5206), @(5771,6984)) "misc.js" "Misc - File upload, ADB, Shell, FOTA, Ports, Sleep, APN, USB status, Data usage, SELinux" @("handleFileUpload","adbQuery","handleShell","handleDisableFOTA","getBoot","handleForceIMEI","getSELinuxStatus","initMessage","togglePort","toggleTTYD","toggleADBIP","toggleLogCat","toggleWakeLock","resetTTYDPort","clearAPPUploadData","setPort","handleHighRailMode","initSleepTime","changeSleepTime","renderAPNViewModalContet","renderAPNEditModalContet","onChangeIsAutoFrofile","getAPNEditFormData","initAPNManagement","onViewAPNProfile","fetchUSBStatusList","initUSBStatusManagementBtn","closeUSBStatusModal","handleOpenUploadFilesList","showNetConnInfoModal","noPassLogin","switchPassInputShow","resetUsageModalData","openDataUsageHistory","doDataUsageHistorySearch")

Write-Host "`nAll modules extracted!"
