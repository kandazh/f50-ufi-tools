/**
 * Network - Network type, USB, WiFi switch, SMB, ROAM, Light, Reboot, SIM, NFC, Cellular
 */
(function () {
let initNetworktype = async () => {
    const selectEl = document.querySelector('#NET_TYPE')
    if (!selectEl) {
        return null
    }
    if (!(await window.initRequestData())) {
        selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        selectEl.disabled = true
        return null
    }
    selectEl.style.backgroundColor = ''
    selectEl.disabled = false
    let res = await getData(new URLSearchParams({
        cmd: 'current_network_mode,m_netselect_save,net_select_mode,m_netselect_contents,net_select,ppp_status,modem_main_state',
        multi_data: '1'
    }))
    const selectedType = res && res.net_select != null ? res.net_select : res && res.current_network_mode != null ? res.current_network_mode : null
    if (!res || selectedType == null) {
        return
    }

    [...selectEl.children].forEach((item) => {
        if (item.value == selectedType) {
            item.selected = true
        }
    })
    QOSRDPCommand("AT+CGEQOSRDP=1")
    let interCount = 0
    let temp_inte = requestInterval(async () => {
        let res = await QOSRDPCommand("AT+CGEQOSRDP=1")
        if (interCount == 20) return temp_inte && temp_inte()
        if (res && !res.includes("ERROR")) {
            return temp_inte && temp_inte()
        }
        interCount++
    }, 1000);
}
initNetworktype()

const changeNetwork = async (e = null, silent = false) => {
    const selectEl = document.querySelector('#NET_TYPE')
    const eventValue = e && e.target && typeof e.target.value === 'string' ? e.target.value.trim() : ''
    const selectedValue = selectEl && typeof selectEl.value === 'string' ? selectEl.value.trim() : ''
    const value = eventValue || selectedValue
    if (!(await window.initRequestData()) || !value) {
        return null
    }
    !silent && createToast(t('toast_changing'), '#BF723F')
    try {
        const cookie = await login()
        if (!cookie) {
            !silent && createToast(t('login_failed_check_pwd'), 'red')
            window.out()
            return null
        }
        let res = await (await postData(cookie, {
            goformId: 'SET_BEARER_PREFERENCE',
            BearerPreference: value.trim()
        })).json()
        if (res.result == 'success') {
            !silent && createToast(t('toast_oprate_success'), 'green')
        } else {
            createToast(t('toast_oprate_failed'), 'red')
        }
        await initNetworktype()
    } catch (e) {
        // createToast(e.message)
    }
}

let initUSBNetworkType = async () => {
    const selectEl = document.querySelector('#USB_TYPE')
    if (!selectEl) {
        return null
    }
    if (!(await window.initRequestData())) {
        selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        selectEl.disabled = true
        return null
    }
    selectEl.style.backgroundColor = ''
    selectEl.disabled = false
    let res = await getData(new URLSearchParams({
        cmd: 'usb_port_switch'
    }))
    if (!res || res.usb_port_switch == null || res.usb_port_switch == undefined) {
        return
    }
    [...selectEl.children].forEach((item) => {
        if (item.value == res.usb_port_switch) {
            item.selected = true
        }
    })
}
initUSBNetworkType()

let changeUSBNetwork = async (e = null) => {
    const selectEl = document.querySelector('#USB_TYPE')
    const eventValue = e && e.target && typeof e.target.value === 'string' ? e.target.value.trim() : ''
    const selectedValue = selectEl && typeof selectEl.value === 'string' ? selectEl.value.trim() : ''
    const value = eventValue || selectedValue
    if (!(await window.initRequestData()) || !value) {
        return null
    }
    createToast(t('toast_changing'), '#BF723F')
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            window.out()
            return null
        }
        let res = await (await postData(cookie, {
            goformId: 'USB_PORT_SETTING',
            usb_port_switch: value.trim()
        })).json()
        if (res.result == 'success') {
            createToast(t('toast_oprate_success'), 'green')
        } else {
            createToast(t('toast_oprate_failed'), 'red')
        }
        await initUSBNetworkType()
    } catch (e) {
        // createToast(e.message)
    }
}

// WiFi toggle init
let initWIFISwitch = async () => {
    const selectEl = document.querySelector('#WIFI_SWITCH')
    if (!(await window.initRequestData()) || !selectEl) {
        selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        selectEl.disabled = true
        return null
    }

    selectEl.style.backgroundColor = ''
    selectEl.disabled = false
    let { WiFiModuleSwitch, ResponseList } = await getData(new URLSearchParams({
        cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
    }))

    const WIFIManagementContent = document.querySelector('#wifiInfo')

    try {
        await initWIFIManagementForm()
    } catch { }

    if (WiFiModuleSwitch == "1") {
        WIFIManagementContent && (WIFIManagementContent.style.display = '')
        if (ResponseList?.length) {
            ResponseList.forEach(item => {
                if (item.AccessPointSwitchStatus == '1') {
                    selectEl.value = item.ChipIndex == "0" ? 'chip1' : 'chip2'
                }
            })
        }
    } else {
        WIFIManagementContent && (WIFIManagementContent.style.display = 'none')
        selectEl.value = 0
    }
}
initWIFISwitch()

// WiFi toggle
let changeWIFISwitch = async (e) => {
    const selectEl = document.querySelector('#WIFI_SWITCH')
    const value = e.target.value.trim()
    if (!(await window.initRequestData()) || !value) {
        createToast(t('toast_need_login'), 'red')
        return null
    }
    createToast(t('toast_changing'), '#BF723F')
    try {
        selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        selectEl.disabled = true
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            window.out()
            return null
        }
        let res = null
        if (value == "0" || value == 0) {
            res = await (await postData(cookie, {
                goformId: 'switchWiFiModule',
                SwitchOption: 0
            })).json()
        } else if (value == 'chip1' || value == 'chip2') {
            res = await (await postData(cookie, {
                goformId: 'switchWiFiChip',
                ChipEnum: value,
                GuestEnable: 0
            })).json()
        } else {
            return
        }
        setTimeout(() => {
            if (res.result == 'success') {
                createToast(t('toast_op_success_reconnect_wifi'), 'green')
                initWIFISwitch()

            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
            selectEl.style.backgroundColor = ''
            selectEl.disabled = false
        }, 1000);
    } catch (e) {
        // createToast(e.message)
    }
}

let initSMBStatus = async () => {
    const el = document.querySelector('#SMB')
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    let res = await getData(new URLSearchParams({
        cmd: 'samba_switch'
    }))
    if (!el || !res || res.samba_switch == null || res.samba_switch == undefined) return
    el.onclick = async () => {
        if (!(await window.initRequestData())) {
            return null
        }
        try {
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
                window.out()
                return null
            }
            let res1 = await (await postData(cookie, {
                goformId: 'SAMBA_SETTING',
                samba_switch: res.samba_switch == '1' ? '0' : '1'
            })).json()
            if (res1.result == 'success') {
                createToast(t('toast_oprate_success'), 'green')
            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
            await initSMBStatus()
        } catch (e) {
            // createToast(e.message)
        }
    }
    el.style.backgroundColor = res.samba_switch == '1' ? 'var(--dark-btn-color-active)' : ''
}
initSMBStatus()

// Check network roaming status
let initROAMStatus = async () => {
    const el = document.querySelector('#ROAM')
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    let res = await getData(new URLSearchParams({
        cmd: 'roam_setting_option,dial_roam_setting_option'
    }))
    if (res && res.dial_roam_setting_option) {
        res.roam_setting_option = res.dial_roam_setting_option
    }
    if (!el || !res || res.roam_setting_option == null || res.roam_setting_option == undefined) return
    el.onclick = async () => {
        if (!(await window.initRequestData())) {
            return null
        }
        try {
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
                window.out()
                return null
            }
            let res1 = await (await postData(cookie, {
                goformId: 'SET_CONNECTION_MODE',
                ConnectionMode: "auto_dial",
                roam_setting_option: res.roam_setting_option == 'on' ? 'off' : 'on',
                dial_roam_setting_option: res.roam_setting_option == 'on' ? 'off' : 'on'
            })).json()
            if (res1.result == 'success') {
                createToast(t('toast_oprate_success'), 'green')
            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
            await initROAMStatus()
        } catch (e) {
            // createToast(e.message)
        }
    }
    el.style.backgroundColor = res.roam_setting_option == 'on' ? 'var(--dark-btn-color-active)' : ''
}
initROAMStatus()

let initLightStatus = async () => {
    const el = document.querySelector('#LIGHT')
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    let res = await getData(new URLSearchParams({
        cmd: 'indicator_light_switch'
    }))
    if (!el || !res || res.indicator_light_switch == null || res.indicator_light_switch == undefined) return
    el.onclick = async () => {
        if (!(await window.initRequestData())) {
            return null
        }
        try {
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
                window.out()
                return null
            }
            let res1 = await (await postData(cookie, {
                goformId: 'INDICATOR_LIGHT_SETTING',
                indicator_light_switch: res.indicator_light_switch == '1' ? '0' : '1'
            })).json()
            if (res1.result == 'success') {
                createToast(t('toast_oprate_success'), 'green')
            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
            await initLightStatus()
        } catch (e) {
            createToast(e.message, 'red')
        }
    }
    el.style.backgroundColor = res.indicator_light_switch == '1' ? 'var(--dark-btn-color-active)' : ''
}
initLightStatus()

let rebootBtnCount = 1
let rebootTimer = null
let rebootDevice = async (e) => {
    let target = e.target
    if (!(await window.initRequestData())) {
        window.out()
        target.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    target.style.backgroundColor = ''
    rebootTimer && clearTimeout(rebootTimer)
    if (rebootBtnCount == 1) target.innerHTML = t('reboot_confirm')
    if (rebootBtnCount == 2) target.innerHTML = t('reboot_confirm_confirm')
    if (rebootBtnCount >= 3) {
        target.innerHTML = t('rebooting')
        try {
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
                window.out()
                return null
            }
            const res = await (await postData(cookie, {
                goformId: 'REBOOT_DEVICE',
            })).json()
            if (res.result == 'success') {
                createToast(t('toast_rebot_success'), 'green')
            } else {
                throw t('toast_reboot_failed')
            }
        } catch {
            createToast(t('toast_reboot_failed'), 'red')
        }
    }
    rebootBtnCount++
    rebootTimer = setTimeout(() => {
        rebootBtnCount = 1
        target.innerHTML = t("reboot")
    }, 3000);
}

var rebootDeviceBtnInit = async () => {
    let target = document.querySelector('#REBOOT')
    if (!target) return
    if (!(await window.initRequestData())) {
        target.onclick = () => createToast(t('toast_please_login'), 'red')
        target.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    target.style.backgroundColor = ''
    target.onclick = rebootDevice
}
rebootDeviceBtnInit()


let handlerCecullarStatus = async () => {
    const btn = document.querySelector('#CECULLAR')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    let res = await getData(new URLSearchParams({
        cmd: 'ppp_status'
    }))
    btn.onclick = async () => {
        try {
            if (!(await window.initRequestData())) {
                return null
            }
            const cookie = await login()
            if (!cookie) {
                createToast(t('toast_login_failed_check_network'), 'red')
                window.out()
                return null
            }
            btn.innerHTML = t("changing")
            let res1 = await (await postData(cookie, {
                goformId: res.ppp_status == 'ppp_disconnected' ? 'CONNECT_NETWORK' : 'DISCONNECT_NETWORK',
            })).json()
            if (res1.result == 'success') {
                setTimeout(async () => {
                    await handlerCecullarStatus()
                    createToast(t('toast_oprate_success'), 'green')
                    QOSRDPCommand("AT+CGEQOSRDP=1")
                }, 2000);
            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
        } catch (e) {
            // createToast(e.message)
        }
    }
    btn.innerHTML = t('cellular')
    btn.style.backgroundColor = res.ppp_status == 'ppp_disconnected' ? '' : 'var(--dark-btn-color-active)'
}
handlerCecullarStatus()

// title
const loadTitle = async () => {
    try {
        const { app_ver, build_timestamp, model, nickname } = await (await fetch(`${HOTBOX_baseURL}/version_info`, { headers: common_headers })).json()
        const displayName = (model == nickname || !nickname) ? model : `${model} (${nickname})`;
        MODEL.style.display = 'none';
        document.querySelector('#MAIN_TITLE').innerHTML =
            `<span class="device-badge">` +
                `<svg class="device-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
                    `<rect x="2" y="6" width="20" height="12" rx="3"/>` +
                    `<path d="M9 2.5c1.5 1.2 1.5 2.5 0 3.5"/>` +
                    `<path d="M12 1c2.2 1.8 2.2 3.7 0 5"/>` +
                    `<path d="M15 2.5c-1.5 1.2-1.5 2.5 0 3.5"/>` +
                    `<circle cx="6" cy="12" r="1" fill="currentColor" stroke="none"/>` +
                    `<line x1="9.5" y1="10.5" x2="9.5" y2="13.5"/>` +
                    `<line x1="11.5" y1="9.5" x2="11.5" y2="14.5"/>` +
                    `<line x1="13.5" y1="10.5" x2="13.5" y2="13.5"/>` +
                    `<line x1="15.5" y1="11" x2="15.5" y2="13"/>` +
                    `<rect x="18" y="10" width="2" height="4" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/>` +
                `</svg>` +
                `<span class="device-badge-name">${displayName}</span>` +
                `<span class="device-badge-ver">v${app_ver}` + (build_timestamp ? ` (${build_timestamp})` : '') + `</span>` +
            `</span>`;
        document.querySelector('#TITLE').innerHTML = `[${displayName}] v${app_ver}` + (build_timestamp ? ` (${build_timestamp})` : '')
    } catch {/* not found, ignore */ }
}
loadTitle()


let initSimCardType = async () => {
    let selectEl = document.querySelector('#SIM_CARD_TYPE')
    const { model } = await (await fetch(`${HOTBOX_baseURL}/version_info`, { headers: common_headers })).json()
    if (model.toLowerCase() == 'v50') {
        selectEl = document.querySelector('#SIM_CARD_TYPE_V50')
        var simField = document.querySelector('#SIM_CARD_TYPE_V50_FIELD');
        if (simField) simField.style.display = '';
    }

    // Query dual SIM support
    // const { dual_sim_support } = await getData(new URLSearchParams({
    //     cmd: 'dual_sim_support'
    // }))
    // if (dual_sim_support && dual_sim_support == '0') {
    //     return
    // } else {
    if (!selectEl) return;
    selectEl.style.display = ''
    // }
    if (!(await window.initRequestData()) || !selectEl) {
        selectEl.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        selectEl.disabled = true
        return null
    }
    selectEl.style.backgroundColor = ''
    selectEl.disabled = false
    let res = await getData(new URLSearchParams({
        cmd: 'sim_slot'
    }))
    if (!selectEl || !res || res.sim_slot == null || res.sim_slot == undefined) {
        return
    }
    [...selectEl.children].forEach((item) => {
        if (item.value == res.sim_slot) {
            item.selected = true
        }
    })
    QOSRDPCommand("AT+CGEQOSRDP=1")
}
initSimCardType()

// NFC toggle
let initNFCSwitch = async () => {
    const btn = document.querySelector('#NFC')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    // Check NFC support
    try {
        const { is_support_nfc_functions } = await getData(new URLSearchParams({
            cmd: 'is_support_nfc_functions'
        }))
        if (!is_support_nfc_functions || Number(is_support_nfc_functions) == 0) {
            return
        } else {
            btn.style.display = ''
        }

        btn.style.backgroundColor = ''
        const { web_wifi_nfc_switch } = await getData(new URLSearchParams({
            cmd: 'web_wifi_nfc_switch'
        }))

        btn.onclick = async () => {
            try {
                if (!(await window.initRequestData())) {
                    btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                    return null
                }
                const cookie = await login()
                if (!cookie) {
                    createToast(t('toast_login_failed_check_network'), 'red')
                    window.out()
                    return null
                }
                let res = await (await postData(cookie, {
                    goformId: 'WIFI_NFC_SET',
                    web_wifi_nfc_switch: web_wifi_nfc_switch.toString() == '1' ? '0' : '1'
                })).json()
                if (res.result == 'success') {
                    createToast(t('toast_oprate_success'), 'green')
                    initNFCSwitch()
                } else {
                    createToast(t('toast_oprate_failed'), 'red')
                }
            } catch (e) {
                // createToast(e.message)
            }
        }

        btn.style.backgroundColor = web_wifi_nfc_switch.toString() == '1' ? 'var(--dark-btn-color-active)' : ''
    } catch { }
}
initNFCSwitch()

let changeSimCard = async (e) => {
    const value = e.target.value.trim()
    if (!(await window.initRequestData()) || !value) {
        return null
    }
    createToast(t('toast_changing'), '#BF723F')
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            window.out()
            return null
        }
        let res = await (await postData(cookie, {
            goformId: 'SET_SIM_SLOT',
            sim_slot: value.trim()
        })).json()
        if (res.result == 'success') {
            createToast(t('toast_oprate_success'), 'green')
        } else {
            createToast(t('toast_oprate_failed'), 'red')
        }
        await initSimCardType()
        QOSRDPCommand("AT+CGEQOSRDP=1")
    } catch (e) {
        // createToast(e.message)
    }
}

    // Register on window
    window.initNetworktype = initNetworktype;
    window.changeNetwork = changeNetwork;
    window.initUSBNetworkType = initUSBNetworkType;
    window.changeUSBNetwork = changeUSBNetwork;
    window.initWIFISwitch = initWIFISwitch;
    window.changeWIFISwitch = changeWIFISwitch;
    window.initSMBStatus = initSMBStatus;
    window.initROAMStatus = initROAMStatus;
    window.initLightStatus = initLightStatus;
    window.rebootDevice = rebootDevice;
    window.rebootDeviceBtnInit = rebootDeviceBtnInit;
    window.handlerCecullarStatus = handlerCecullarStatus;
    window.loadTitle = loadTitle;
    window.initSimCardType = initSimCardType;
    window.changeSimCard = changeSimCard;
    window.initNFCSwitch = initNFCSwitch;
})();
