/**
 * Misc - File upload, ADB, Shell, FOTA, Ports, Sleep, APN, USB status, Data usage, SELinux
 */
(function () {
const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    const MAX_SIZE = 10
    if (file) {
        // Check file size
        if (file.size > MAX_SIZE * 1024 * 1024) {
            // MAX_SIZE MB
            createToast(`${t('toast_file_size_over_limit')}${MAX_SIZE}MB！`, 'red')
        } else {

            // Upload image
            try {
                const formData = new FormData();
                formData.append("file", file);
                const res = await (await fetch(`${HOTBOX_baseURL}/upload_img`, {
                    method: "POST",
                    headers: common_headers,
                    body: formData,
                })).json()

                if (res.url) {
                    const BG_INPUT = document.querySelector('#BG_INPUT')
                    const BG = document.querySelector("#BG")
                    const url = `${HOTBOX_baseURL}${res.url}`
                    BG_INPUT.value = url
                    localStorage.setItem('backgroundUrl', url)
                    document.querySelector('#isCheckedBG').checked = true
                    BG.style.backgroundImage = `url(${url})`
                    createToast(t('toast_upload_success'), 'green')
                }
                else throw res.error || ''
            }
            catch (e) {
                console.log(e);
                createToast(t('toast_upload_failed'), 'red')
            } finally {
                document.querySelector('#fileUploader').value = ''
            }
        }
    }
}

// Expand/collapse
// Config observer: menu
(() => {
    const collapseMenuEl = document.querySelector(".collapse_menu")
    if (!collapseMenuEl) return
    const { el } = createCollapseObserver(collapseMenuEl)
    el.dataset.name = localStorage.getItem('collapse_menu') || 'open'
    const collapseBtn = document.querySelector('#collapseBtn_menu')
    if (!collapseBtn) return
    const switchComponent = createSwitch({
        value: el.dataset.name == 'open',
        className: 'collapse_menu',
        onChange: (newVal) => {
            if (el && el.dataset) {
                el.dataset.name = newVal ? 'open' : 'close'
                localStorage.setItem('collapse_menu', el.dataset.name)
            }
        }
    });
    collapseBtn.appendChild(switchComponent);
})();

// Expand/collapse
// Config observer: basic status
collapseGen("#collapse_status_btn", "#collapse_status", "collapse_status")

// ADB polling
const adbQuery = async () => {
    try {
        const adb_status = await adbKeepAlive()
        const adb_text = adb_status ? `${t('network_adb_status')}：🟢 ${t('adb_status_active')}` : `${t('network_adb_status')}：🟡 ${t('adb_status_waiting')}`
        const version = window.UFI_DATA && window.UFI_DATA.cr_version ? window.UFI_DATA.cr_version : ''
        const adbSwitch = window.UFI_DATA && window.UFI_DATA.usb_port_switch == '1' ? true : false
        const adbStatusEl = document.querySelectorAll('.adb_status')
        if (adbStatusEl && adbStatusEl.length > 0) {
            adbStatusEl.forEach((item) => {
                try {
                    item.innerHTML = adb_text + `<br/>${t('usb_debugging_status')}：${adbSwitch ? `🟢 ${t('usb_debugging_active')}` : `🔴 ${t('usb_debugging_inactive')}`}` + `<br/>${t('firmware_version')}：${version}`
                } catch { }
            })
        }
    } catch { }
}
adbQuery()

// Execute shell script
const handleShell = async () => {
    const AT_RESULT = document.querySelector('#AD_RESULT')
    let adb_status = await adbKeepAlive()
    if (!adb_status) {
        AT_RESULT.innerHTML = ""
        return createToast(t('toast_ADB_not_init'), 'red')
    }

    AT_RESULT.innerHTML = t('toast_running_please_wait')

    try {
        const res = await (await fetch(`${HOTBOX_baseURL}/quick_shell`, {
            headers: common_headers
        })).json()
        if (res) {
            if (res.error) {
                AT_RESULT.innerHTML = res.error;
                createToast(t('toast_exe_failed'), 'red');
                return;
            }
            AT_RESULT.innerHTML = res.result;
            createToast(t('toast_exe_done'), 'green');
        } else {
            AT_RESULT.innerHTML = '';
            createToast(t('toast_exe_failed'), 'red');
        }
    } catch (e) {
        AT_RESULT.innerHTML = '';
        createToast(t('toast_exe_failed'), 'red');
    }

}

// Init SMS forward form

const handleDisableFOTA = async () => {
    const AD_RESULT = document.querySelector('#AD_RESULT')
    try {
        // Check if advanced features are on
        AD_RESULT.innerHTML = `<strong class="green" style="font-size: 12px;">${t('disable_update_ing')}...</strong>`
        if (await checkAdvancedFunc()) {
            createToast(t('toast_advanced_checked'), '')
            let res0 = await runShellWithRoot("pm disable com.zte.zdm")
            let res1 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdm ")
            let res2 = await runShellWithRoot("pm uninstall -k --user 0 cn.zte.aftersale")
            let res3 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdmdaemon")
            let res4 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.zdmdaemon.install")
            let res5 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.analytics")
            let res6 = await runShellWithRoot("pm uninstall -k --user 0 com.zte.neopush")
            let res7 = await runShellWithRoot("am force-stop com.zte.zdm")
            AD_RESULT.innerHTML = `
            <div style="min-width:200px;font-size:12px">
            <p>${t('advanced_checked_disabled_update')}</p>
            <p>${res0.content}</p>
            <p>${res1.content}</p>
            <p>${res2.content}</p>
            <p>${res3.content}</p>
            <p>${res4.content}</p>
            <p>${res5.content}</p>
            <p>${res6.content}</p>
            <p>${res7.content}</p>
            </div>`
        } else {
            createToast(t('toast_not_enabled_advanced_tools'), '')
            let adb_status = await adbKeepAlive()
            if (!adb_status) {
                AT_RESULT.innerHTML = ""
                return createToast(t('toast_ADB_not_init'), 'red')
            }
            const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/disable_fota`, {
                method: 'get',
                headers: common_headers
            })).json()
            if (!res.error) {
                createToast(t('update_has_disabled'), 'green')
                AD_RESULT.innerHTML = `<strong class="green" style="font-size: 12px;">${t('use_adb_to_disabled_update')}</strong>`
            } else {
                createToast(t('update_disabled_failed'), 'red')
                AD_RESULT.innerHTML = `<strong class="red" style="font-size: 12px;">${t('update_disabled_failed')}</strong>`
            }
        }
    } catch (e) {
        console.error(e)
        AD_RESULT.innerHTML = `<strong class="red" style="font-size: 12px;">${t('update_disabled_failed')}</strong>`
        createToast(t('error'), 'red')
    }
}

const getBoot = async () => {
    try {
        const AD_RESULT = document.querySelector('#AD_RESULT')
        AD_RESULT.innerHTML = ''
        const res = await runShellWithRoot("getprop ro.boot.slot_suffix")
        let ab = res.content.includes('a') ? "A" : "B"
        createToast(`${t('your_boot_slot')}：${ab}`, '')
        await runShellWithRoot('mkdir /data/data/com.hotbox.f50_app/files/uploads')
        const outFile = `boot_${ab.toLowerCase()}.img`
        await runShellWithRoot(`rm -f /data/data/com.hotbox.f50_app/files/uploads/${outFile}`)
        const command = `dd if=/dev/block/by-name/boot_${ab.toLowerCase()} of=/data/data/com.hotbox.f50_app/files/uploads/${outFile}`
        let result = await runShellWithRoot(command)
        if (result.success) {
            AD_RESULT.innerHTML = `<strong style="font-size: 12px;">${t('your_boot_slot')}：${ab}，${t('downloading')}：boot_${ab}.img...</strong>`
        }
        // Start download
        const outLink = `/api/uploads/${outFile}`
        const a = document.createElement('a')
        a.href = outLink
        a.download = outFile
        a.click()
    } catch {
        createToast(t("error"), 'red')
    }
}


const handleForceIMEI = async () => {
    if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
    const AT_RESULT = document.querySelector('#AT_RESULT')
    if (AT_RESULT) {
        AT_RESULT.innerHTML = t('toast_running_please_wait')
        try {
            const res = await runShellWithRoot(`/data/data/com.hotbox.f50_app/files/imei_reader`)
            // Clear IMEI display cache
            resetDiagImeiCache()
            AT_RESULT.innerHTML = `<p style="font-weight:bolder;overflow:hidden" onclick="copyText(event)">${res.content.replaceAll('\n', "<br>")}</p>`
        } catch {
            AT_RESULT.innerHTML = ""
        }
    }
}

const getSELinuxStatus = async () => {
    try {
        const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/SELinux`)).json()
        let result = res.selinux.toLowerCase()
        if (result !== "permissive" && result !== "disabled" && result != "0") {
            createToast(t('not_support_firmware'), "pink", 10000);
        }
    } catch {
    }
}
getSELinuxStatus()

// Remote message fetching disabled — no external server contact
const initMessage = async () => {
    return null
}
initMessage()

const togglePort = async (port, flag, isBootup = false, v6 = false) => {
    try {
        if (!await checkAdvancedFunc()) {
            createToast(t("need_advance_func"), 'red');
            return false;
        }

        const addCmd = (useV6) => {
            const bin = useV6 ? 'ip6tables' : 'iptables';
            return `${bin} -A INPUT -p tcp --dport ${port} -j DROP`;
        };

        const delCmd = (useV6) => addCmd(useV6).replace('-A', '-D');

        // Delete current system DROP rules
        const cleanupCmd = (useV6) => {
            const bin = useV6 ? 'ip6tables' : 'iptables';
            return `for table in filter nat mangle raw security; do ${bin}-save -t $table | grep -- '--dport ${port} .*DROP' | sed 's/-A/-D/' | while read line; do ${bin} $line; done; done`;
        };

        let r0 = await runShellWithRoot(cleanupCmd(false));
        if (!r0.success) return false;
        if (v6) {
            let r0v6 = await runShellWithRoot(cleanupCmd(true));
            if (!r0v6.success) return false;
        }

        const saveBootup = async (cmd, proto) => {
            const line = `${cmd} # UFI-TOOLS ${proto} ${port}`;
            const shell = `grep -qxF '${line}' /sdcard/ufi_tools_boot.sh || echo '${line}' >> /sdcard/ufi_tools_boot.sh`;
            await runShellWithRoot(shell);
        };

        const removeBootup = async (proto) => {
            const pattern = `# UFI-TOOLS ${proto} ${port}`;
            await runShellWithRoot(`sed -i '/${pattern}/d' /sdcard/ufi_tools_boot.sh`);
        };

        const removeAllBootup = async () => {
            await runShellWithRoot(`sed -i '/# UFI-TOOLS .* ${port}/d' /sdcard/ufi_tools_boot.sh`);
        };

        if (!isBootup) {
            await removeAllBootup();
        }

        if (flag) {
            await runShellWithRoot(delCmd(false));
            if (v6) await runShellWithRoot(delCmd(true));
            await removeBootup('v4');
            if (v6) await removeBootup('v6');
        } else {
            await runShellWithRoot(addCmd(false));
            if (v6) await runShellWithRoot(addCmd(true));
            if (isBootup) {
                await saveBootup(addCmd(false), 'v4');
                if (v6) await saveBootup(addCmd(true), 'v6');
            }
        }

        return true;
    } catch (e) {
        createToast(e);
        return false;
    }
};

const port_iptables = document.querySelector('#port_iptables')
const dev_bootup = document.querySelector("#dev_bootup")
const dev_ipv6 = document.querySelector("#dev_ipv6")

const toggleTTYD = async (flag) => {
    if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
    const bootUp = dev_bootup.checked
    const v6 = dev_ipv6.checked
    const res = togglePort("1146", flag, bootUp, v6)
    if (!res) createToast(t("toast_oprate_failed"), "red")
    createToast(t("toast_oprate_success"), 'green')
}

const toggleADBIP = async (flag) => {
    if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
    const bootUp = dev_bootup.checked
    const v6 = dev_ipv6.checked
    const res = togglePort("5555", flag, bootUp, v6)
    if (!res) createToast(t("toast_oprate_failed"), "red")
    createToast(t("toast_oprate_success"), 'green')
}

const toggleLogCat = async (flag) => {
    try {
        const { result } = await (await fetchWithTimeout(`${HOTBOX_baseURL}/set_log_status`, {
            method: "POST",
            headers: common_headers,
            body: JSON.stringify({ debug_log_enabled: flag ? true : false })
        })).json()
        if (result.success) {
            throw new Error('Failed to toggle LogCat')
        }
        createToast(t("toast_oprate_success"), 'green')
    }
    catch {
        if (!res) createToast(t("toast_oprate_failed"), "red")
    }
}

const toggleWakeLock = async (flag) => {
    try {
        const { result } = await (await fetchWithTimeout(`${HOTBOX_baseURL}/set_wakelock_status`, {
            method: "POST",
            headers: common_headers,
            body: JSON.stringify({ wakelock_enabled: flag ? true : false })
        })).json()
        if (result.success) {
            throw new Error('Failed to set_wakelock_status')
        }
        createToast(t("toast_oprate_success"), 'green')
    }
    catch {
        if (!res) createToast(t("toast_oprate_failed"), "red")
    }
}

const resetTTYDPort = () => {
    const port = localStorage.getItem('ttyd_port')
    if (port != '1146') {
        localStorage.setItem('ttyd_port', '1146')
        initTTYD && initTTYD()
        createToast(t('toast_oprate_success'), '')
    }
}
let clearUppBtnCounter = 0
let clearUppBtnTimer = null
const clearAPPUploadData = async () => {
    clearUppBtnCounter++
    if (clearUppBtnCounter <= 3) {
        clearUppBtnTimer && clearTimeout(clearUppBtnTimer)
        clearUppBtnTimer = setTimeout(() => {
            clearUppBtnCounter = 0
        }, 5000);
        return createToast('Click {num} times to confirm'.replace('{num}', (4 - clearUppBtnCounter)), 'pink', 3000)
    }
    clearUppBtnCounter = 0

    const res = await fetchWithTimeout(`${HOTBOX_baseURL}/delete_all_uploads_data`, {
        method: 'post',
        headers: common_headers
    })
    const { result, deleted_list } = await res.json()
    if (result != "success") {
        createToast(t("toast_oprate_failed"), "red")
        return
    }
    if (deleted_list) {
        let listString = ''
        for (let key in deleted_list) {
            listString += `${key}: <b>${deleted_list[key] ? 'OK' : "FAILED"}</b><br>`
        }
        if (listString.trim() == '') {
            createToast(t('toast_oprate_success'), '')
            return
        }
        const { el, close } = createFixedToast('hotbox_del_appdata_success', `
            <div style="pointer-events:all;width:80vw;max-width:400px;">
            <div class="title" style="margin:0" data-i18n="system_notice">${t('system_notice')}</div>
            <p>${listString}</p>
            <div style="display:flex;gap:10px">
                <button id="confirm_hotbox_del_appdata_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="close_btn">${t("close_btn")}</button>
            </div>
            </div>
            `, 'red')
        const close_btn = el.querySelector("#confirm_hotbox_del_appdata_toast_btn")

        if (close_btn) {
            close_btn.onclick = () => {
                close()
            }
        }
    } else {
        createToast(t('toast_oprate_success'), '')
    }
}

const setPort = async (flag) => {
    if (!await checkAdvancedFunc()) return createToast(t("need_advance_func"), 'red')
    const port = port_iptables.value
    const bootUp = dev_bootup.checked
    const v6 = dev_ipv6.checked
    if (!port) return createToast("Please input a valid port (1 - 65535)")
    const res = await togglePort(port, flag, bootUp, v6)
    if (!res) createToast(t("toast_oprate_failed"), "red")
    createToast(t("toast_oprate_success"), 'green')
}

// High-speed rail mode
handleHighRailMode = async (e) => {
    if (!(await window.initRequestData())) {
        return null
    }
    const HighRailModeAT = "AT+SP5GCMDS=\"set nr param\",35,"
    const target = e.target
    const isEnabled = target.dataset.enabled === '1'
    try {
        if (isEnabled) {
            // Disable high-speed rail mode
            const res = await handleAT(HighRailModeAT + "0", true)
            if (!res) throw new Error('Failed to enable High Rail Mode')
            target.dataset.enabled = '0'
            target.style.backgroundColor = ''
        } else {
            // Enable high-speed rail mode
            const res = await handleAT(HighRailModeAT + "1", true)
            if (!res) throw new Error('Failed to enable High Rail Mode')
            target.dataset.enabled = '1'
            target.style.backgroundColor = 'var(--dark-btn-color-active)'
        }
        createToast(t("toast_oprate_success_reboot"), 'green')
    } catch {
        createToast(t('toast_exe_failed'), 'red')
    }
}

// Initialize sleep tab     
let sleepToggle = null;
let lastSleepValue = '30'; // remember last non-disabled value
const initSleepTime = async () => {
    const target = document.querySelector("#SLEEP_TIME")
    const section = document.querySelector("#wifiCtrlSleep")
    const selectRow = document.querySelector("#sleepSelectRow")
    if (!target) return
    // Always show the sleep section
    if (section) section.style.display = ''
    if (!(await window.initRequestData())) {
        target.disabed = true
        target.style.background = "var(--dark-btn-disabled-color)"
        return null
    }
    target.disabed = false
    target.style.background = ""
    // Create toggle if not already created
    if (!sleepToggle) {
        sleepToggle = createCtrlToggle('sleepToggleContainer', function(on) {
            if (on) {
                // Enable sleep - set to last remembered value
                if (selectRow) selectRow.style.display = ''
                target.value = lastSleepValue
                if (target._ctrlDropdown) target._ctrlDropdown.updateValue()
                target.dispatchEvent(new Event('change', { bubbles: true }))
            } else {
                // Disable sleep - set to Never
                if (selectRow) selectRow.style.display = 'none'
                target.value = '-1'
                if (target._ctrlDropdown) target._ctrlDropdown.updateValue()
                target.dispatchEvent(new Event('change', { bubbles: true }))
            }
        })
    }
    // Get data from device
    const { sleep_sysIdleTimeToSleep } = await getData(new URLSearchParams({
        cmd: "sleep_sysIdleTimeToSleep"
    }))
    // Always show the sleep section
    if (section) section.style.display = ''
    const sleepValue = sleep_sysIdleTimeToSleep || '-1'
    target.value = sleepValue
    // Set toggle state based on value
    const isOn = sleepValue !== '-1'
    sleepToggle.set(isOn)
    if (isOn) {
        lastSleepValue = sleep_sysIdleTimeToSleep
        if (selectRow) selectRow.style.display = ''
    } else {
        if (selectRow) selectRow.style.display = 'none'
    }
}
initSleepTime()

const changeSleepTime = async (e) => {
    if (!(await window.initRequestData())) {
        createToast(t("toast_need_login"), 'red');
        e.preventDefault()
        return false;
    }
    const target = e.target
    if (!target) return
    // Remember last non-disabled value
    if (target.value !== '-1') lastSleepValue = target.value

    try {

        const res = await postData(await login(), {
            goformId: "SET_WIFI_SLEEP_INFO",
            sleep_sysIdleTimeToSleep: target.value
        })

        const { result } = await res.json()

        if (result != "success") {
            throw new Error("fail!")
        }

        createToast(t('toast_oprate_success'), 'green')
        initSleepTime()
    } catch {
        createToast(t('toast_oprate_failed'), 'red')
    }
}

// Initialize APN info box content
const renderAPNViewModalContet = (res = {}) => {
    // Info box initialization
    const APNViewModal = document.querySelector('#APNViewModal')
    if (APNViewModal) {
        const profileNameEl = APNViewModal.querySelector('input[name="profile_name"]')
        const apnEl = APNViewModal.querySelector('input[name="apn"]')
        const unameEl = APNViewModal.querySelector('input[name="username"]')
        const pwdEl = APNViewModal.querySelector('input[name="password"]')
        const authMethodEl = APNViewModal.querySelector('input[name="auth_method"]')
        const pdpMethodEl = APNViewModal.querySelector('input[name="pdp_method"]')

        if (profileNameEl) {
            profileNameEl.value = res.apn_m_profile_name || res.m_profile_name || res.profile_name
        }
        if (apnEl) {
            apnEl.value = res.apn_wan_apn || res.apn_ipv6_wan_apn
        }
        if (unameEl) {
            unameEl.value = res.ppp_username_ui || res.apn_ppp_username
        }
        if (pwdEl) {
            pwdEl.value = res.ppp_passwd_ui || res.apn_ppp_passwd
        }
        if (authMethodEl) {
            authMethodEl.value = res.ppp_auth_mode_ui.toLowerCase() || res.apn_ppp_auth_mode.toLowerCase()
        }
        if (pdpMethodEl) {
            pdpMethodEl.value = res.apn_pdp_type
        }
    }
}

// Initialize APN edit box content
const renderAPNEditModalContet = (res = {}) => {
    // Info box initialization
    const APNEditModal = document.querySelector('#APNEditModal')
    if (APNEditModal) {
        const profileNameEl = APNEditModal.querySelector('input[name="profile_name"]')
        const apnEl = APNEditModal.querySelector('input[name="apn"]')
        const unameEl = APNEditModal.querySelector('input[name="username"]')
        const pwdEl = APNEditModal.querySelector('input[name="password"]')
        const authMethodEl = APNEditModal.querySelector('select[name="auth_method"]')
        const pdpMethodEl = APNEditModal.querySelector('select[name="pdp_method"]')

        if (profileNameEl) {
            profileNameEl.value = res.apn_m_profile_name || res.m_profile_name || res.profile_name
        }
        if (apnEl) {
            apnEl.value = res.apn_wan_apn || ""
        }
        if (unameEl) {
            unameEl.value = res.apn_ppp_username || ""
        }
        if (pwdEl) {
            pwdEl.value = res.apn_ppp_passwd || ""
        }
        if (authMethodEl) {
            authMethodEl.value = res.apn_ppp_auth_mode.toLowerCase()
        }
        if (pdpMethodEl) {
            pdpMethodEl.value = res.apn_pdp_type
        }
    }
}

// APN manual/auto switch click event
const onChangeIsAutoFrofile = async (flag) => {
    const autoProfileEl = document.querySelector('#APNManagementForm #autoProfileEl')
    const profileEl = document.querySelector('#APNManagementForm #profileEl')
    if (autoProfileEl && profileEl) {
        if (flag) {
            autoProfileEl.style.display = ""
            profileEl.style.display = "none"
        } else {
            autoProfileEl.style.display = "none"
            profileEl.style.display = ""
        }
    }
}

// APN edit box data extraction
const getAPNEditFormData = ({ index = 0 }) => {
    const APNEditModal = document.querySelector('#APNEditModal')

    if (!APNEditModal) return null
    if (index == null || index == undefined) return null
    const profileNameEl = APNEditModal.querySelector('input[name="profile_name"]') || {}
    const apnEl = APNEditModal.querySelector('input[name="apn"]') || {}
    const unameEl = APNEditModal.querySelector('input[name="username"]') || {}
    const pwdEl = APNEditModal.querySelector('input[name="password"]') || {}
    const authMethodEl = APNEditModal.querySelector('select[name="auth_method"]') || {}
    const pdpMethodEl = APNEditModal.querySelector('select[name="pdp_method"]') || {}

    if (!profileNameEl.value.trim() || !apnEl.value.trim()) {
        return null
    }

    const baseProfile = {
        "profile_name": profileNameEl.value ? profileNameEl.value.trim() : "",
        "wan_dial": "*99#",
        "apn_wan_dial": "*99#",
        "apn_select": "manual",
        "apn_pdp_type": pdpMethodEl.value ? pdpMethodEl.value : "IPv4v6",
        "pdp_type": pdpMethodEl.value ? pdpMethodEl.value : "IPv4v6",
        "apn_pdp_select": "auto",
        "apn_pdp_addr": "",
        "pdp_select": "auto",
        "pdp_addr": "",
        "index": index,
    }

    const v4Profile = {
        "apn_wan_apn": apnEl.value ? apnEl.value.trim() : "",
        "apn_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
        "apn_ppp_username": unameEl.value ? unameEl.value.trim() : "",
        "apn_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
        "wan_apn": apnEl.value ? apnEl.value.trim() : "",
        "ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
        "ppp_username": unameEl.value ? unameEl.value.trim() : "",
        "ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
        "dns_mode": "auto",
        "prefer_dns_manual": "",
        "standby_dns_manual": "",
    }
    const v6Profile = {
        "apn_ipv6_wan_apn": apnEl.value ? apnEl.value.trim() : "",
        "apn_ipv6_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
        "apn_ipv6_ppp_username": unameEl.value ? unameEl.value.trim() : "",
        "apn_ipv6_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
        "ipv6_wan_apn": apnEl.value ? apnEl.value.trim() : "",
        "ipv6_ppp_auth_mode": authMethodEl.value ? authMethodEl.value : "none",
        "ipv6_ppp_username": unameEl.value ? unameEl.value.trim() : "",
        "ipv6_ppp_passwd": pwdEl.value ? pwdEl.value.trim() : "",
        "ipv6_dns_mode": "auto",
        "ipv6_prefer_dns_manual": "",
        "ipv6_standby_dns_manual": "",
    }
    if (pdpMethodEl.value == "IPv6") {
        return {
            ...baseProfile,
            ...v6Profile
        }
    }

    if (pdpMethodEl.value == "IP") {
        return {
            ...baseProfile,
            ...v4Profile
        }
    }

    if (pdpMethodEl.value == "IPv4v6") {
        return {
            ...baseProfile,
            ...v4Profile,
            ...v6Profile
        }
    }

    return null
}

// APNSettings
const initAPNManagement = async () => {
    const btn = document.querySelector('#APNManagement')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.background = "var(--dark-btn-disabled-color)"
        return null
    }
    btn.style.background = ""
    const renderData = async () => {
        showModal('#APNManagementModal')
        // Load data
        const res = await getAPNData()

        const APNManagementFormEl = document.querySelector('#APNManagementForm')
        const APNManagementForm = document.querySelector('#APNManagementForm .content')
        if (!APNManagementForm) return

        const autoProfileEl = APNManagementForm.querySelector('#autoProfileEl')
        const profileEl = APNManagementForm.querySelector('#profileEl')
        if (autoProfileEl && profileEl) {
            if (res.apn_mode == "auto") {
                autoProfileEl.style.display = ""
                profileEl.style.display = "none"
            } else {
                autoProfileEl.style.display = "none"
                profileEl.style.display = ""
            }
        }

        const currentAPNEl = APNManagementForm.querySelector('span[name="apn_wan_apn"]')
        if (currentAPNEl) currentAPNEl.textContent = res.apn_wan_apn + ` (${res.profile_name || res.m_profile_name || res.profile_name_ui})`

        const autoApnModeEl = APNManagementForm.querySelector('#autoAPNMode')
        const apnModeEl = APNManagementForm.querySelector('#apnMode')
        if (apnModeEl) {
            if (res.apn_mode == "auto") {
                autoApnModeEl.checked = true
            } else {
                apnModeEl.checked = true
            }
        }

        const autoProfile = APNManagementForm.querySelector('#autoProfile')
        if (autoProfile) {
            const option = document.createElement('option')
            option.value = res.apn_auto_profile
            option.textContent = res.apn_m_profile_name || res.m_profile_name || res.profile_name
            autoProfile.innerHTML = res.apn_m_profile_name || res.m_profile_name || res.profile_name
            autoProfile.appendChild(option)
        }

        // Render manual profile dropdown
        const profile = APNManagementForm.querySelector('select[name="profile"]')

        if (profile) {
            let selectedIndex = -1
            profile.selectedIndex =
                profile.innerHTML = ''
            for (let i = 0; i < 20; i++) {
                if (!res["APN_config" + i]) continue
                const configs = res["APN_config" + i].split('($)')
                const configs_v6 = res["ipv6_APN_config" + i]
                if (configs && configs.length) {
                    const option = document.createElement('option')
                    option.value = configs[0] // first value is APN name
                    option.textContent = configs[0]
                    profile.appendChild(option)
                    // Select current active profile
                    if (configs[0] == (res.m_profile_name || res.profile_name)) {
                        selectedIndex = i
                    }
                }
            }
            if (selectedIndex == -1) {
                selectedIndex = profile.querySelectorAll('option').length - 1
            }
            profile.selectedIndex = selectedIndex
        }

        // Render APN list (preview)
        renderAPNViewModalContet(res)

        //Saveprofile
        const onSaveProfile = (method = "add") => {
            return async (e) => {
                e.preventDefault()
                if (!(await window.initRequestData())) {
                    createToast(t("toast_need_login"), 'red');
                    return false;
                }

                const manualProfileEl = APNManagementForm.querySelector('#manualProfile')

                let index = manualProfileEl.selectedIndex

                // If adding profile, index should be list count+1
                if (method == "add") {
                    const options = APNManagementForm.querySelectorAll('#manualProfile option')
                    if (options.length) {
                        index = options.length
                    }
                }

                const formData = getAPNEditFormData({ index })

                if (!formData) {
                    createToast(t("please_input_full_profile"), 'red')
                    return
                }

                try {
                    const res = await saveAPNProfile(formData)
                    if (res.result == "success") {
                        createToast(t('toast_save_success'), 'green')
                        closeModal('#APNEditModal', 300, () => {
                            showModal('#APNManagementModal')
                            // Reload
                            renderData()
                        })
                    } else {
                        createToast(t('toast_save_failed'), 'red')
                    }
                } catch (e) {
                    createToast(t('toast_save_failed'), 'red')
                }
            }
        }

        // Manual mode
        // Bind add event
        const addAPNBtn = APNManagementForm.querySelector('#addAPNProfile')
        if (addAPNBtn) addAPNBtn.onclick = async (e) => {
            e.preventDefault()
            const title = document.querySelector('#APNEditModal #APN_MOD_TITLE')
            if (title) title.textContent = t("add_apn")
            if (!(await window.initRequestData())) {
                createToast(t("toast_need_login"), 'red');
                return false;
            }
            closeModal('#APNManagementModal', 300, () => {
                showModal('#APNEditModal')
                // Async load data
                renderAPNEditModalContet({
                    profile_name: "",
                    apn_wan_apn: "",
                    apn_ppp_username: "",
                    apn_ppp_passwd: "",
                    apn_ppp_auth_mode: "none",
                    apn_pdp_type: "IP",
                })
                // Save
                const submitBtn = document.querySelector('#APNEditModal button[name="submit"]')
                if (submitBtn && APNManagementFormEl) {
                    submitBtn.onclick = onSaveProfile("add")
                }
            })
        }

        // Bind edit event
        const editAPNBtn = APNManagementForm.querySelector('#editAPNProfile')
        if (editAPNBtn) editAPNBtn.onclick = async (e) => {
            e.preventDefault()
            const title = document.querySelector('#APNEditModal #APN_MOD_TITLE')
            if (title) title.textContent = t("edit_apn")
            if (!(await window.initRequestData())) {
                createToast(t("toast_need_login"), 'red');
                return false;
            }
            closeModal('#APNManagementModal', 300, () => {
                showModal('#APNEditModal')
                // Get currently selected profile index
                const profileEl = APNManagementForm.querySelector('#profileEl select[name="profile"]')
                if (profileEl) {
                    const index = profileEl.selectedIndex
                    const config = res["APN_config" + index].split('($)')
                    const config_v6 = res["ipv6_APN_config" + index].split('($)')
                    console.log(config, config_v6);
                    renderAPNEditModalContet({
                        profile_name: config[0] || "",
                        apn_wan_apn: config[1] || "",
                        apn_ppp_username: config[5] || "",
                        apn_ppp_passwd: config[6] || "",
                        apn_ppp_auth_mode: config[4] || "",
                        apn_pdp_type: config[7] || "",
                    })
                }
                // Save
                const submitBtn = document.querySelector('#APNEditModal button[name="submit"]')
                if (submitBtn && APNManagementFormEl) {
                    submitBtn.onclick = onSaveProfile("mod")
                }

            })
        }

        // Bind delete event
        const delAPNBtn = APNManagementForm.querySelector('#delAPNProfile')
        if (delAPNBtn) delAPNBtn.onclick = async (e) => {
            e.preventDefault()
            if (!(await window.initRequestData())) {
                createToast(t("toast_need_login"), 'red');
                return false;
            }
            // Get currently selected profile index
            const profileEl = APNManagementForm.querySelector('#profileEl select[name="profile"]')
            if (profileEl) {
                const index = profileEl.selectedIndex
                try {
                    const res = await deleteAPNProfile(index)
                    if (res && res.result == "success") {
                        createToast(t('toast_delete_success'), 'green')
                        // Reload
                        renderData()
                    } else {
                        createToast(t('toast_delete_failed'), 'red')
                    }
                } catch (e) {
                    createToast(t('toast_delete_failed'), 'red')
                }
            }
        }

        // Bind auto/manual toggle event
        const submitBtn = APNManagementFormEl.querySelector('button[name="submit"]')
        if (submitBtn && APNManagementFormEl) {
            submitBtn.onclick = async (e) => {
                e.preventDefault()
                if (!(await window.initRequestData())) {
                    createToast(t("toast_need_login"), 'red');
                    return false;
                }
                const autoAPNModeEl = APNManagementForm.querySelector('#autoAPNMode')
                const apnModeEl = APNManagementForm.querySelector('#apnMode')
                let apn_mode = "manual"
                let profile_name = ""
                let index = 0
                if (autoAPNModeEl.checked) {
                    apn_mode = "auto"
                } else if (apnModeEl.checked) {
                    apn_mode = "manual"
                    const manualProfile = APNManagementForm.querySelector('#manualProfile')
                    if (manualProfile) {
                        profile_name = manualProfile.value
                        index = manualProfile.selectedIndex
                    }
                }

                if (apn_mode == "manual" && !profile_name) {
                    return createToast(t('please_select_apn_profile'), 'red')
                }

                try {
                    const res = await switchAPNAuto({ isAuto: apn_mode == "auto", index })
                    if (res.result == "success") {
                        createToast(t('toast_oprate_success'), 'green')
                        renderData()
                    } else {
                        createToast(t('toast_oprate_failed'), 'red')
                    }
                } catch (e) {
                    createToast(t('toast_oprate_failed'), 'red')
                }
            }
        }
    }
    btn.onclick = renderData
}
initAPNManagement()

// View APN
const onViewAPNProfile = async (e) => {
    e.preventDefault()
    if (!(await window.initRequestData())) {
        createToast(t("toast_need_login"), 'red');
        return false;
    }
    closeModal('#APNManagementModal', 300, () => {
        showModal('#APNViewModal')
        // Async load data

    })
}

const fetchUSBStatusList = async (el) => {
    try {
        const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/usb_status`, {
            method: "GET",
            headers: common_headers
        })).json()
        if (!res) { throw new Error('No data') }
        let isGadgetMode = res.details.typec_mode == "gadget"
        el.innerHTML = `<div style="display: flex;margin-bottom:10px;flex-direction:column"><div>${t('max_speed')}：${isGadgetMode ? res.details.gadget_speed : formatSpeed(res.maxSpeed)}</div><div>${t('usb_status')}：${res.details.typec_mode}/${!isGadgetMode ? t('host_usb_exp') : t('device_usb_exp')}</div></div>
        <ul class="deviceList" style="display: flex;flex-direction: column;gap: 10px;">
            ${res.details.devices.map(device => `<li style="padding: 10px;">
                        <div>${t('path')}：${device.path}</div>
                        <div>${t('device_name')}： ${device.product}</div>
                        <div>${t('speed')}：${formatSpeed(device.speed)}</div>
                    </li>`).join('')}
        </ul>`.trim()
    } catch {
        el.innerHTML = `<div style="text-align:center;padding:20px 0">${t('no_usb_list')}</div>`
    }
}

// USB management
let stopRefreshUSBStatusInterval = null
const initUSBStatusManagementBtn = async () => {
    const btn = document.querySelector('#USBStatusManagement')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        return null
    }
    btn.onclick = async () => {
        showModal('#USBStatusModal')
        // Load data
        const el = document.querySelector('#USBStatusModal .content')
        if (!el) return
        el.innerHTML = `<div style="text-align:center;padding:20px 0">Loading...</div>`
        stopRefreshUSBStatusInterval && stopRefreshUSBStatusInterval()
        fetchUSBStatusList(el)
        stopRefreshUSBStatusInterval = requestInterval(() => fetchUSBStatusList(el), REFRESH_TIME + 1000)
    }
}
initUSBStatusManagementBtn()

const closeUSBStatusModal = () => {
    closeModal('#USBStatusModal', 300, () => {
        stopRefreshUSBStatusInterval && stopRefreshUSBStatusInterval()
    })
}

const handleOpenUploadFilesList = async () => {
    let res = await runShellWithUser(`ls /data/data/com.hotbox.f50_app/files/uploads/`)
    if (!res.success) return createToast(t('read_file_fail'), 'red')
    if (res.content && res.content.content && res.content.content.split("\n") && res.content.content.split("\n").length) {
        let { el, close } = createFixedToast('hotbox_edit_ufi_media_file_list_message', `
            <div style="pointer-events:all;width:90vw;max-width:800px;">
                <div class="title" style="margin:0" data-i18n="file_manager">${t("file_manager")}</div>
                <div style="margin:10px 0;display: flex;flex-direction: column;gap: 6px;max-height: 50vh;overflow: auto;font-size: .7rem;" class="inner">
                  ${res.content.content.split('\n').map(item => (item.trim() ? `<div class="hotbox_uploads_file_item" data-item="${item}" style="padding: 10px 10px;background: var(--dark-tag-color);border-radius: 6px;display:flex;align-items: center;">
                  <span onclick="copyText({target:{innerText:'/api/uploads/${item}'}})" style="flex:1;overflow: hidden;text-overflow: ellipsis;white-space: nowrap;">${item}</span>
                  <button style="margin-right:6px;padding: 0;display: flex;" onclick="downloadUrl('/api/uploads/${item}','${item}')"><svg fill="var(--dark-text-color)" stroke="currentColor"  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1770319174878" viewBox="0 0 1024 1024" version="1.1" p-id="1583" width="20" height="20"><path d="M896 672c-17.066667 0-32 14.933333-32 32v128c0 6.4-4.266667 10.666667-10.666667 10.666667H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667v-128c0-17.066667-14.933333-32-32-32s-32 14.933333-32 32v128c0 40.533333 34.133333 74.666667 74.666667 74.666667h682.666666c40.533333 0 74.666667-34.133333 74.666667-74.666667v-128c0-17.066667-14.933333-32-32-32z" fill="var(--dark-text-color)" p-id="1584"/><path d="M488.533333 727.466667c6.4 6.4 14.933333 8.533333 23.466667 8.533333s17.066667-2.133333 23.466667-8.533333l213.333333-213.333334c12.8-12.8 12.8-32 0-44.8-12.8-12.8-32-12.8-44.8 0l-157.866667 157.866667V170.666667c0-17.066667-14.933333-32-32-32s-34.133333 14.933333-34.133333 32v456.533333L322.133333 469.333333c-12.8-12.8-32-12.8-44.8 0-12.8 12.8-12.8 32 0 44.8l211.2 213.333334z" fill="var(--dark-text-color)" p-id="1585"/></svg></button>
                  <button style="margin-right:6px;padding: 0;display: flex;" onclick="openLink('/api/uploads/${item}')"><svg fill="var(--dark-text-color)" stroke="currentColor"  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1770319810359" viewBox="0 0 1024 1024" version="1.1" p-id="3490" width="20" height="20"><path d="M942.2 486.2C847.4 286.5 704.1 186 512 186c-192.2 0-335.4 100.5-430.2 300.3-7.7 16.2-7.7 35.2 0 51.5C176.6 737.5 319.9 838 512 838c192.2 0 335.4-100.5 430.2-300.3 7.7-16.2 7.7-35 0-51.5zM512 766c-161.3 0-279.4-81.8-362.7-254C232.6 339.8 350.7 258 512 258c161.3 0 279.4 81.8 362.7 254C791.5 684.2 673.4 766 512 766z" p-id="3491" fill="var(--dark-text-color)"/><path d="M508 336c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176-78.8-176-176-176z m0 288c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z" p-id="3492" fill="var(--dark-text-color)"/></svg></button>
                  <button class="delete_file" style="padding: 0;display: flex;"><svg fill="var(--dark-text-color)" stroke="currentColor"  width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path fill="var(--dark-text-color)" d="M736 352.032L736.096 800h-0.128L288 799.968 288.032 352 736 352.032zM384 224h256v64h-256V224z m448 64h-128V202.624C704 182.048 687.232 160 640.16 160h-256.32C336.768 160 320 182.048 320 202.624V288H192a32 32 0 1 0 0 64h32V799.968C224 835.296 252.704 864 288.032 864h447.936A64.064 64.064 0 0 0 800 799.968V352h32a32 32 0 1 0 0-64z"></path><path fill="var(--dark-text-color)" d="M608 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32M416 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32"></path></svg></button></div>` : "")).join('')}
                </div>
                <div style="text-align:right">
                    <button style="font-size:.64rem" id="upload_media_file_btn" data-i18n="upload_file_limit_100mb">${t('upload_file_limit_100mb')}</button>
                    <button style="font-size:.64rem" id="close_edit_media_file_list_message_btn" data-i18n="close_btn">${t('close_btn')}</button>
                </div>
            </div>
            `)

        // File list
        let filesEl = document.querySelectorAll('#hotbox_edit_ufi_media_file_list_message .hotbox_uploads_file_item')
        filesEl.forEach(el => {
            let data = el.dataset.item
            if (data && data.trim()) {
                let elBtn = el.querySelector('.delete_file')
                if (!elBtn) return
                let delCountDown = 3
                let delTimer = null
                elBtn.onclick = async () => {
                    let delFile = data.trim()
                    delCountDown--
                    delTimer && clearTimeout(delTimer)
                    delTimer = setTimeout(() => {
                        delCountDown = 3
                    }, 3000);
                    if (delCountDown > 0) {
                        createToast(t('click_times_to_delete').replaceAll("$count$", ` ${delCountDown} `))
                        return
                    }
                    delCountDown = 3
                    try {
                        const { result, error } = await (await fetchWithTimeout(`${HOTBOX_baseURL}/delete_img`, {
                            method: "POST",
                            headers: common_headers,
                            body: JSON.stringify({
                                file_name: delFile
                            })
                        })).json()
                        if (result == "success") {
                            createToast(t('toast_delete_success'), "pink")
                            el.remove()
                        } else {
                            createToast(t('toast_delete_failed') + error, "red")
                        }
                    } catch (e) {
                        createToast(t('toast_delete_failed') + e, "red")
                    }
                }
            }
        })
        let btn = el.querySelector('#close_edit_media_file_list_message_btn')
        let uploadBtn = el.querySelector('#upload_media_file_btn')

        if (!btn) {
            close()
            return
        }
        btn.onclick = async () => {
            close()
        }

        if (uploadBtn) {
            uploadBtn.onclick = () => {
                let fileInput = document.createElement('input')
                fileInput.type = "file"
                const handleFileChange = async (event) => {
                    let file = event.target.files[0];
                    if (!file) return
                    let url = await uploadFileHotbox(file, true)
                    if (!url) return
                    createToast(`${url} ${t('toast_upload_success')}!`, "pink", 8000)
                    close()
                    setTimeout(() => {
                        handleOpenUploadFilesList()
                    }, 400);
                    fileInput.removeEventListener('change', handleFileChange);
                    fileInput = null;
                }
                fileInput.addEventListener('change', handleFileChange)
                fileInput.click()
            }
        }


    } else {
        createToast(t('no_file'), 'pink')
    }
}

const showNetConnInfoModal = async () => {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        return null
    }
    const id = "#hotbox_net_info_modal"
    const res = await getNetConnInfo()
    let intervalFn = requestInterval(() => {
        getNetConnInfo().then(res => {
            const contentEl = document.querySelector('#hotbox_net_info_modal .content')
            if (contentEl) {
                contentEl.innerHTML = renderConnectStatusContent(res)
            }
        })
    }, REFRESH_TIME + 114, id)
    const md = createModal({
        showConfirm: false,
        name: id.replace('#', ''),
        isMask: false,
        titleI18nKey: 'network_conn_info',
        title: t('network_conn_info'),
        maxWidth: "400px",
        contentStyle: "font-size:.7rem;line-height:1.5",
        onClose: () => {
            intervalFn && intervalFn()
            return true
        },
        content: renderConnectStatusContent(res)
    })
    md.id && showModal(md.id)
}

// Passwordless login
const noPassLogin = () => {
    const method = "0"
    const password = "Wa@9w+YWRtaW4="

    // No changes below
    const loginMethodEl = document.querySelector("#login_method")
    const label = document.querySelector("#token_div_label2")
    const tokenEl = document.querySelector("#PWD_BLK")
    const pwdEl = document.querySelector("#PWDINPUT")
    loginMethodEl.value = method
    pwdEl.value = password
    label.style.display = "none"
    tokenEl.style.display = "none"
    createToast(t('toast_no_pass_login_fill_success'), 'green')
}

// Toggle password visibility
const switchPassInputShow = (e, id) => {
    e.preventDefault()
    const target = e.currentTarget
    if (target != e.target) return
    if (!id) return
    const pwdEl = document.querySelector(id)
    if (!pwdEl) return
    if (pwdEl.type == "password") {
        pwdEl.type = "text"
        target.innerHTML = `<svg style="pointer-events: none;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.77 21.77 0 0 1-4.35 5.35"/><path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"/><path d="M1 1l22 22"/></svg>`
    } else {
        pwdEl.type = "password"
        target.innerHTML = `<svg style="pointer-events: none;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>`
    }
}

const resetUsageModalData = () => {
    const tbody = document.querySelector('#DataUsageHistoryBody')
    if (!tbody) return
    const sumEl = document.querySelector("#data_usage_history_sum")
    const avgEl = document.querySelector("#data_usage_history_avg")
    if (!sumEl) return
    if (!avgEl) return
    sumEl.textContent = "N/A"
    avgEl.textContent = "N/A"
    tbody.innerHTML = '<tr style="cursor: pointer;"><td colspan="2" data-i18n="no_data">' + t('no_data') + '</td></tr>'
    // Default date interval 10 days
    const startTimeEl = document.querySelector('#start_time_data_usage_history')
    const endTimeEl = document.querySelector('#end_time_data_usage_history')
    const today = new Date()
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    if (startTimeEl) {
        startTimeEl.value = formatLocalDate(start)
    }
    if (endTimeEl) {
        endTimeEl.value = formatLocalDate(today)
    }
    updateDataHistoryChart({
        items: []
    })
}
const openDataUsageHistory = async () => {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        return null
    }
    resetUsageModalData()
    doDataUsageHistorySearch()
    showModal('#DataUsageHistoryModal')
}

const doDataUsageHistorySearch = async () => {
    const startTimeEl = document.querySelector('#start_time_data_usage_history')
    const endTimeEl = document.querySelector('#end_time_data_usage_history')
    if (!startTimeEl || !endTimeEl) return
    const startTime = startTimeEl.value
    const endTime = endTimeEl.value

    const tbody = document.querySelector('#DataUsageHistoryBody')
    if (!tbody) return
    const sumEl = document.querySelector("#data_usage_history_sum")
    const avgEl = document.querySelector("#data_usage_history_avg")
    if (!sumEl) return
    if (!avgEl) return
    sumEl.textContent = "N/A"
    avgEl.textContent = "N/A"
    tbody.innerHTML = '<tr style="cursor: pointer;"><td colspan="2" data-i18n="no_data">' + t('no_data') + '</td></tr>'

    if (!startTime || !endTime) {
        if (!startTime) createToast(t('please_input_start_date'), 'pink')
        if (!endTime) createToast(t('please_input_end_date'), 'pink')
        return
    }

    const end = new Date(endTime);
    const start = new Date(startTime);
    const today = new Date();

    end.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    if (end > today) {
        return createToast(t('please_input_correct_date'), 'pink')
    }
    if (start > end) {
        return createToast(t('start_date_not_bigger_than_end_date'), 'pink')
    }
    const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000));
    if (diffDays > 400) {
        return createToast(t('date_range_over_400'), 'pink');
    }
    tbody.innerHTML = '<tr style="cursor: pointer;"><td colspan="2"><strong class="green" style="display: flex;flex-direction: column;"><span style="font-size: 2rem;" class="spin">🌀</span><span style="font-size: .8rem;padding-top: 10px;">loading...</span></strong></td></tr>'
    const res = await getDailyUsageRange(new Date(startTime), new Date(endTime))
    tbody.innerHTML = ''
    if (res.length == 0) {
        tbody.innerHTML = '<tr style="cursor: pointer;"><td colspan="2" data-i18n="no_data">' + t('no_data') + '</td></tr>'
        return
    }
    let sumBytes = 0
    res.forEach(item => {
        let tr = document.createElement('tr')
        let dateTd = document.createElement('td')
        let timeTd = document.createElement('td')
        dateTd.textContent = item.date
        timeTd.textContent = item.usage == 0 ? "0 B" : formatBytes(item.usage)
        tr.appendChild(dateTd)
        tr.appendChild(timeTd)
        tbody.appendChild(tr)
        sumBytes += parseInt(item.usage)
    })

    let avgBytes = sumBytes / res.length

    sumEl.textContent = sumBytes == 0 ? '0 B' : formatBytes(sumBytes)
    avgEl.textContent = avgBytes == 0 ? '0 B' : formatBytes(avgBytes)

    // Update chart
    updateDataHistoryChart({
        items: res, sum: sumBytes, avg: avgBytes
    })
}

// Official backend PIN lockout detection has issues, so this feature won't be implemented
// let simCardPinDisabled = false
// const initSimCardPin = async () => {
//     if (!window.initRequestData()) {
//         return null
//     }
//     // Check if SIM card is locked
//     const res = await getSimPinStatus()

//     if (res.pinnumber <= 0 || res.modem_main_state == "modem_waitpuk") {
//         createToast("PIN attempts exhausted, enter PUK in official backend", 'red', 10000)
//         return null
//     }

//     if (!(res.modem_main_state == "modem_waitpin")) {
//         return null
//     }

//     // Pause data refresh
//     window.stopRefresh()

//     const md = createModal({
//         name: "hotbox_pin_modal",
//         isMask: true,
//         title: "Enter SIM PIN",
//         maxWidth: "400px",
//         contentStyle: "font-size:12px",
//         onClose: () => {
//             return true
//         },
//         onConfirm: async () => {
//             // Get data again
//             const res1 = await getSimPinStatus()
//             if (res1.pinnumber <= 0) {
//                 createToast("PIN attempts exhausted, enter PUK in official backend", 'red')
//                 return false
//             }
//             const el = document.querySelector('#simPinInput')
//             if (!el) {
//                 console.error("simPinInput element not found")
//                 return false
//             }
//             const pinNumber = el.value.trim()
//             if (pinNumber.length < 4) {
//                 createToast("PIN must be at least 4 digits", 'pink')
//                 return false
//             }
//             // Unlock
//             if (simCardPinDisabled) {
//                 createToast("Unlocking, please wait", 'pink')
//                 return false
//             }

//             simCardPinDisabled = true

//             const { close: closeLoadingEl } = createFixedToast("unlocking_toast", 'Unlocking...')
//             try {
//                 if (!(await window.initRequestData())) {
//                     return false
//                 }
//                 const cookie = await login()
//                 if (!cookie) {
//                     createToast(t('toast_request_error'), 'red')
//                     return false
//                 }
//                 let res1 = await (await postData(cookie, {
//                     goformId: 'ENTER_PIN',
//                     PinNumber: pinNumber,
//                 })).json()

//                 if (res1.result == 'success') {
//                     createToast("PIN unlock successful", 'green')
//                     window.startRefresh()
//                     return true
//                 } else {
//                     createToast("PIN unlock failed, retry", 'red')
//                 }
//                 // Update PIN attempts
//                 const pinNumEl = document.querySelector('#pinNumber')
//                 const res_refresh = await getSimPinStatus()
//                 if (pinNumEl) {
//                     pinNumEl.textContent = res_refresh.pinnumber
//                 }
//                 return false
//             } catch (e) {
//                 console.error(e.message)
//                 return false
//             } finally {
//                 simCardPinDisabled = false
//                 closeLoadingEl()
//             }
//         },
//         content: `<div class="content" style="font-size:12px;margin:10px 0;padding:0 4px;">
//    <p style="color:red;margin-top:0" >PIN attempts left: <strong id="pinNumber">${res.pinnumber}</strong></p>
//    <input type="password" id="simPinInput" placeholder="SIM PIN" style="width:100%;padding:8px">
// </div>`
//     })
//     showModal(md.id)
// }
// initSimCardPin()
// Mount methods to window

    // Register on window
    window.handleFileUpload = handleFileUpload;
    window.adbQuery = adbQuery;
    window.handleShell = handleShell;
    window.handleDisableFOTA = handleDisableFOTA;
    window.getBoot = getBoot;
    window.handleForceIMEI = handleForceIMEI;
    window.getSELinuxStatus = getSELinuxStatus;
    window.initMessage = initMessage;
    window.togglePort = togglePort;
    window.toggleTTYD = toggleTTYD;
    window.toggleADBIP = toggleADBIP;
    window.toggleLogCat = toggleLogCat;
    window.toggleWakeLock = toggleWakeLock;
    window.resetTTYDPort = resetTTYDPort;
    window.clearAPPUploadData = clearAPPUploadData;
    window.setPort = setPort;
    window.handleHighRailMode = handleHighRailMode;
    window.initSleepTime = initSleepTime;
    window.changeSleepTime = changeSleepTime;
    window.renderAPNViewModalContet = renderAPNViewModalContet;
    window.renderAPNEditModalContet = renderAPNEditModalContet;
    window.onChangeIsAutoFrofile = onChangeIsAutoFrofile;
    window.getAPNEditFormData = getAPNEditFormData;
    window.initAPNManagement = initAPNManagement;
    window.onViewAPNProfile = onViewAPNProfile;
    window.fetchUSBStatusList = fetchUSBStatusList;
    window.initUSBStatusManagementBtn = initUSBStatusManagementBtn;
    window.closeUSBStatusModal = closeUSBStatusModal;
    window.handleOpenUploadFilesList = handleOpenUploadFilesList;
    window.showNetConnInfoModal = showNetConnInfoModal;
    window.noPassLogin = noPassLogin;
    window.switchPassInputShow = switchPassInputShow;
    window.resetUsageModalData = resetUsageModalData;
    window.openDataUsageHistory = openDataUsageHistory;
    window.doDataUsageHistorySearch = doDataUsageHistorySearch;
})();
