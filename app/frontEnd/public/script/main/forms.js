/**
 * Forms and Settings - Data management, WiFi, Client mgmt, Schedule reboot, TTYD, AT commands, Advanced, Password/Token, LAN, Refresh rate
 */
(function () {
const _dataManagementEl = document.querySelector("#DataManagement");
if (_dataManagementEl) _dataManagementEl.onclick = async () => {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        window.out()
        return null
    }
    // Check data usage
    let res = await getDataUsage()
    if (!res) {
        createToast(t('toast_get_data_usage_failed'), 'red')
        return null
    }

    res = {
        ...res,
        "wan_auto_clear_flow_data_switch": window.isNullOrUndefined(res.wan_auto_clear_flow_data_switch) ? res.wan_auto_clear_flow_data_switch : res.flux_auto_clear_flow_data_switch,
        "data_volume_limit_unit": window.isNullOrUndefined(res.data_volume_limit_unit) ? res.data_volume_limit_unit : res.flux_data_volume_limit_unit,
        "data_volume_limit_size": window.isNullOrUndefined(res.data_volume_limit_size) ? res.data_volume_limit_size : res.flux_data_volume_limit_size,
        "traffic_clear_date": window.isNullOrUndefined(res.traffic_clear_date) ? res.traffic_clear_date : res.flux_clear_date,
        "data_volume_alert_percent": window.isNullOrUndefined(res.data_volume_alert_percent) ? res.data_volume_alert_percent : res.flux_data_volume_alert_percent,
        "data_volume_limit_switch": window.isNullOrUndefined(res.data_volume_limit_switch) ? res.data_volume_limit_switch : res.flux_data_volume_limit_switch,
    }

    // Pre-fill form
    const form = document.querySelector('#DataManagementForm')
    if (!form) return null
    let data_volume_limit_switch = form.querySelector('input[name="data_volume_limit_switch"]')
    let wan_auto_clear_flow_data_switch = form.querySelector('input[name="wan_auto_clear_flow_data_switch"]')
    let data_volume_limit_unit = form.querySelector('input[name="data_volume_limit_unit"]')
    let traffic_clear_date = form.querySelector('input[name="traffic_clear_date"]')
    let data_volume_alert_percent = form.querySelector('input[name="data_volume_alert_percent"]')
    let data_volume_limit_size = form.querySelector('input[name="data_volume_limit_size"]')
    let data_volume_limit_type = form.querySelector('select[name="data_volume_limit_type"]')
    let data_volume_used_size = form.querySelector('input[name="data_volume_used_size"]')
    let data_volume_used_type = form.querySelector('select[name="data_volume_used_type"]')

    // (12094630728720/1024/1024)/1048576
    let used_size_type = 1
    const used_size = (() => {
        const total_bytes = ((Number(res.monthly_rx_bytes) + Number(res.monthly_tx_bytes))) / Math.pow(1024, 2)

        if (total_bytes < 1024) {
            return total_bytes.toFixed(2)
        } else if (total_bytes >= 1024 && total_bytes < Math.pow(1024, 2)) {
            used_size_type = 1024
            return (total_bytes / 1024).toFixed(2)
        } else {
            used_size_type = Math.pow(1024, 2)
            return (total_bytes / Math.pow(1024, 2)).toFixed(2)
        }
    })()

    data_volume_limit_switch && (data_volume_limit_switch.checked = res.data_volume_limit_switch.toString() == '1')
    wan_auto_clear_flow_data_switch && (wan_auto_clear_flow_data_switch.checked = res.wan_auto_clear_flow_data_switch.toString() == 'on')
    data_volume_limit_unit && (data_volume_limit_unit.checked = res.data_volume_limit_unit.toString() == 'data')
    traffic_clear_date && (traffic_clear_date.value = res.traffic_clear_date.toString())
    data_volume_alert_percent && (data_volume_alert_percent.value = res.data_volume_alert_percent.toString())
    data_volume_limit_size && (data_volume_limit_size.value = res.data_volume_limit_size?.split('_')[0].toString())
    data_volume_limit_type && (() => {
        const val = Number(res.data_volume_limit_size?.split('_')[1])
        const option = data_volume_limit_type.querySelector(`option[data-value="${val}"]`)
        option && (option.selected = true)
    })()
    data_volume_used_size && (data_volume_used_size.value = used_size.toString())
    data_volume_used_type && (() => {
        const option = data_volume_used_type.querySelector(`option[data-value="${used_size_type.toFixed(0)}"]`)
        option && (option.selected = true)
    })()
    showModal('#DataManagementModal')
}

// Data management form submit
let handleDataManagementFormSubmit = async (e) => {
    e.preventDefault();
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            closeModal('#DataManagementModal')
            setTimeout(() => {
                window.out()
            }, 310);
            return null
        }

        let form_data = {
            "data_volume_limit_switch": "0",
            "wan_auto_clear_flow_data_switch": "off",
            "data_volume_limit_unit": "data",
            "traffic_clear_date": "0",
            "data_volume_alert_percent": "0",
            "data_volume_limit_size": "0",
            "data_volume_limit_type": "1", //MB GB TB
            "data_volume_used_size": "0",
            "data_volume_used_type": "1", //MB GB TB
            // Time
            "notify_deviceui_enable": "0",
        }

        const form = e.target; // Get form
        const formData = new FormData(form);

        for (const [key, value] of formData.entries()) {
            switch (key) {
                case 'data_volume_limit_switch':
                    form_data[key] = value.trim() == 'on' ? '1' : '0'
                    form_data['flux_data_volume_limit_switch'] = value.trim() == 'on' ? '1' : '0'
                    break;
                case 'wan_auto_clear_flow_data_switch':
                    form_data[key] = value.trim() == 'on' ? 'on' : '0'
                    form_data['flux_auto_clear_flow_data_switch'] = value.trim() == 'on' ? 'on' : '0'
                    break;
                case 'data_volume_limit_unit':
                    form_data[key] = value.trim() == 'on' ? 'data' : 'time'
                    form_data['flux_data_volume_limit_unit'] = value.trim() == 'on' ? 'data' : 'time'
                    break;
                case 'traffic_clear_date':
                    if (isNaN(Number(value.trim()))) {
                        createToast(t('toast_clear_date_must_be_number'), 'red')
                        return
                    }
                    if (Number(value.trim()) < 0 || Number(value.trim()) > 31) {
                        createToast(t('toast_clear_date_must_between_1_31'), 'red')
                        return
                    }
                    form_data[key] = value.trim()
                    form_data['flux_clear_date'] = value.trim()
                    break;
                case 'data_volume_alert_percent':
                    if (isNaN(Number(value.trim())) || value.trim() == '') {
                        createToast(t('toast_alert_threshold_error'), 'red')
                        return
                    }
                    if (Number(value.trim()) < 0 || Number(value.trim()) > 100) {
                        createToast(t('toast_alert_threshold_must_between_0_100'), 'red')
                        return
                    }
                    form_data[key] = value.trim()
                    form_data['flux_data_volume_alert_percent'] = value.trim()
                    break;
                case 'data_volume_limit_size':
                    if (isNaN(Number(value.trim()))) {
                        createToast(t('toast_plan_must_be_number'), 'red')
                        return
                    }
                    if (Number(value.trim()) <= 0) {
                        createToast(t('toast_plan_must_greater_than_0'), 'red')
                        return
                    }
                    form_data[key] = value.trim()
                    form_data['flux_data_volume_limit_size'] = value.trim()
                    break;
                case 'data_volume_limit_type':
                    form_data[key] = '_' + value.trim()
                    form_data['flux_data_volume_limit_type'] = '_' + value.trim()
                    break;
                case 'data_volume_used_size':
                    if (isNaN(Number(value.trim()))) {
                        createToast(t('toast_used_must_be_number'), 'red')
                        return
                    }
                    if (Number(value.trim()) <= 0) {
                        createToast(t('toast_used_must_greater_than_0'), 'red')
                        return
                    }
                    form_data[key] = value.trim()
                    break;
                case 'data_volume_used_type':
                    form_data[key] = value.trim()
                    break;
            }
        }
        form_data['data_volume_limit_size'] = form_data['data_volume_limit_size'] + form_data['data_volume_limit_type']
        form_data['flux_data_volume_limit_size'] = form_data['data_volume_limit_size']
        const used_data = Number(form_data.data_volume_used_size) * Number(form_data['data_volume_used_type']) * Math.pow(1024, 2)
        const clear_form_data = {
            data_volume_limit_switch: form_data['data_volume_limit_switch'],
            wan_auto_clear_flow_data_switch: 'on',
            traffic_clear_date: '1',
            notify_deviceui_enable: '0',
            flux_data_volume_limit_switch: form_data['data_volume_limit_switch'],
            flux_auto_clear_flow_data_switch: 'on',
            flux_clear_date: '1',
            flux_notify_deviceui_enable: '0'
        }
        delete form_data['data_volume_limit_type']
        // Send request
        try {
            const tempData = form_data['data_volume_limit_switch'] == '0' ? clear_form_data : form_data
            const res = await (await postData(cookie, {
                goformId: 'DATA_LIMIT_SETTING',
                ...tempData
            })).json()

            const res1 = await (await postData(cookie, {
                goformId: 'FLOW_CALIBRATION_MANUAL',
                calibration_way: form_data.data_volume_limit_unit,
                time: 0,
                data: used_data.toFixed(0)
            })).json()

            if (res.result == 'success' && res1.result == 'success') {
                createToast(t('toast_set_success'), 'green')
                closeModal('#DataManagementModal')
            } else {
                throw t('toast_set_failed')
            }
        } catch (e) {
            createToast(e.message, 'red')
        }
    } catch (e) {
        createToast(e.message, 'red')
    }
};


// WiFi management logic
let initWIFIManagementForm = async () => {
    try {
        let { WiFiModuleSwitch, ResponseList } = await getData(new URLSearchParams({
            cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
        }))

        const WIFIManagementForm = document.querySelector('#WIFIManagementForm')
        const WIFIManagementContent = document.querySelector('#wifiInfo')
        if (!WIFIManagementForm) return

        if (WiFiModuleSwitch == "1" && ResponseList?.length) {
            WIFIManagementContent && (WIFIManagementContent.style.display = '')
            for (let index in ResponseList) {
                if (ResponseList[index].AccessPointSwitchStatus == '1') {
                    let item = ResponseList[index]
                    let apEl = WIFIManagementForm.querySelector('input[name="AccessPointIndex"]')
                    let chipEl = WIFIManagementForm.querySelector('input[name="ChipIndex"]')
                    let ApMaxStationNumberEl = WIFIManagementForm.querySelector('input[name="ApMaxStationNumber"]')
                    let PasswordEl = WIFIManagementForm.querySelector('input[name="Password"]')
                    let ApBroadcastDisabledEl = WIFIManagementForm.querySelector('input[name="ApBroadcastDisabled"]')
                    let SSIDEl = WIFIManagementForm.querySelector('input[name="SSID"]')
                    let QRCodeImg = document.querySelector("#QRCodeImg")
                    let AuthModeEl = WIFIManagementForm.querySelector('select[name="AuthMode"]')
                    apEl && (apEl.value = item.AccessPointIndex)
                    chipEl && (chipEl.value = item.ChipIndex)
                    ApMaxStationNumberEl && (ApMaxStationNumberEl.value = item.ApMaxStationNumber)
                    PasswordEl && (PasswordEl.value = decodeBase64(item.Password))
                    ApBroadcastDisabledEl && (ApBroadcastDisabledEl.checked = item.ApBroadcastDisabled.toString() == '0')
                    SSIDEl && (SSIDEl.value = item.SSID)
                    // QR code
                    fetch(HOTBOX_baseURL + item.QrImageUrl, {
                        headers: common_headers
                    }).then(async (res) => {
                        const blob = await res.blob();
                        const objectURL = URL.createObjectURL(blob);
                        QRCodeImg.onload = () => {
                            URL.revokeObjectURL(objectURL);
                        };
                        QRCodeImg.src = objectURL;
                    });
                    const WIFI_FORM_SHOWABLE = document.querySelector('#WIFI_FORM_SHOWABLE')
                    AuthModeEl.value = item.AuthMode
                    AuthModeEl.selected = item.AuthMode
                    if (AuthModeEl && WIFI_FORM_SHOWABLE) {
                        const option = AuthModeEl.querySelector(`option[data-value="${item.AuthMode}"]`)
                        option && (option.selected = "selected")
                        if (item.AuthMode == "OPEN") {
                            WIFI_FORM_SHOWABLE.style.display = 'none'
                        } else {
                            WIFI_FORM_SHOWABLE.style.display = ''
                        }
                    }

                }
            }
        } else {
            WIFIManagementContent && (WIFIManagementContent.style.display = 'none')
        }
    }
    catch (e) {
        console.error(e.message)
        // createToast(e.message)
    }
}

const _wifiManagementEl = document.querySelector("#WIFIManagement");
if (_wifiManagementEl) _wifiManagementEl.onclick = async () => {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        window.out()
        return null
    }
    showModal("#WIFIManagementModal")
    await initWIFIManagementForm()
}

let handleWIFIManagementFormSubmit = async (e) => {
    e.preventDefault();
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            closeModal('#WIFIManagementModal')
            setTimeout(() => {
                window.out()
            }, 310);
            return null
        }

        const form = e.target; // Get form
        const formData = new FormData(form);

        let data = {
            SSID: '',
            AuthMode: '',
            EncrypType: '',
            Password: '',
            ApMaxStationNumber: '',
            ApBroadcastDisabled: 1,
            ApIsolate: 0,
            ChipIndex: 0,
            AccessPointIndex: 0
        }

        for (const [key, value] of formData.entries()) {
            switch (key) {
                case 'SSID':
                    value.trim() && (data[key] = value.trim())
                    break;
                case 'AuthMode':
                    value == 'OPEN' ? data['EncrypType'] = "NONE" : data['EncrypType'] = "CCMP"
                    value.trim() && (data[key] = value.trim())
                    break;
                case 'ApBroadcastDisabled':
                    data[key] = value == 'on' ? 0 : 1
                    break;
                case 'Password':
                    // if(!value.trim()) createToast('Please enter password!')
                    value.trim() && (data[key] = encodeBase64(value.trim()))
                    break;
                case 'ApIsolate':
                case 'ApMaxStationNumber':
                case 'AccessPointIndex':
                case 'ChipIndex':
                    !isNaN(Number(value.trim())) && (data[key] = Number(value.trim()))
                    break;
            }
        }

        if (data.AuthMode == 'OPEN' || data.EncrypType == "NONE") {
            delete data.Password
        } else {
            if (data.Password.length == 0) {
                return createToast(t('toast_please_input_pwd'), 'red')
            }
            if (data.Password.length < 8) {
                return createToast(t('toast_password_too_short'), 'red')
            }
            if (data.ApMaxStationNumber.length <= 0) {
                return createToast(t('toast_max_client_must_greater_than_0'), 'red')
            }
        }

        const res = await (await postData(cookie, {
            goformId: 'setAccessPointInfo',
            ...data
        })).json()

        if (res.result == 'success') {
            createToast(t('toast_op_success_reconnect_wifi'), 'green')
            closeModal('#WIFIManagementModal')
        } else {
            throw t('toast_oprate_failed_check_network')
        }
    }
    catch (e) {
        console.error(e.message)
        // createToast(e.message)
    }
}

let handleWifiEncodeChange = (event) => {
    const WIFI_FORM_SHOWABLE = document.querySelector('#WIFI_FORM_SHOWABLE')
    const target = event.target
    if (target) {
        console.log(target.value);
        if (WIFI_FORM_SHOWABLE) {
            if (target.value == "OPEN") {
                WIFI_FORM_SHOWABLE.style.display = 'none'
            } else {
                WIFI_FORM_SHOWABLE.style.display = ''
            }
        }
    }
}

let handleShowPassword = (e) => {
    const target = e.target
    const WIFI_PASSWORD = document.querySelector('#WIFI_PASSWORD')
    if (target && WIFI_PASSWORD) {
        WIFI_PASSWORD.setAttribute('type', target.checked ? "text" : "password")
    }
}

document.querySelector('#PWDINPUT').addEventListener('keydown', (event) => {
    console.log(1, event);
    if (event.key === 'Enter') {
        onTokenConfirm()
    }
});
document.querySelector('#TOKEN').addEventListener('keydown', (event) => {
    console.log(2, event);
    if (event.key === 'Enter') {
        onTokenConfirm()
    }
});

// Wireless device management
const _clientMgmtEl = document.querySelector('#ClientManagement');
if (_clientMgmtEl) _clientMgmtEl.onclick = async () => {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        window.out()
        return null
    }
    showModal('#ClientManagementModal')
    await initClientManagementModal()
}

let initClientManagementModal = async () => {
    try {
        const { station_list, lan_station_list, BlackMacList, BlackNameList, AclMode, devices } = await getData(new URLSearchParams({
            cmd: 'station_list,lan_station_list,queryDeviceAccessControlList,hostNameList'
        }))
        const blackMacList = BlackMacList ? BlackMacList.split(';') : []
        const blackNameList = BlackNameList ? BlackNameList.split(';') : []

        const CONN_CLIENT_LIST = document.querySelector('#CONN_CLIENT_LIST')
        const BLACK_CLIENT_LIST = document.querySelector('#BLACK_CLIENT_LIST')

        let conn_client_html = ''
        let black_list_html = ''

        if (station_list && station_list.length) {
            conn_client_html += station_list.map(({ hostname, ip_addr, mac_addr }) => {
                let hostname_show = hostname
                if (devices) {
                    hostname_show = devices.find(i => i.mac == mac_addr)?.hostname || hostname
                }
                return `
        <div class="card-item" style="display: flex;width: 100%;margin: 10px 0;overflow: auto;">
            <div style="margin-right: 10px;">
                <p>
                    <span>${t('client_mgmt_hostname')}：</span><span onclick="copyText(event)">${hostname_show}</span>
                    <svg onclick="editHostName('${hostname_show}','${mac_addr}')" class="svg-icon" style="margin-left:10px" fill="var(--dark-text-color)" stroke="currentColor" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width=".8rem" height=".8rem"><path d="M568.888889 28.444444v113.777778H142.222222v739.555556h739.555556V455.111111h113.777778v455.111111a85.333333 85.333333 0 0 1-85.333334 85.333334H113.777778A85.333333 85.333333 0 0 1 28.444444 910.222222V113.777778A85.333333 85.333333 0 0 1 113.777778 28.444444h455.111111z" p-id="5380"></path><path d="M881.777778 398.222222m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5381"></path><path d="M475.192889 656.327111l-102.286222-4.209778-5.973334-103.537777 346.851556-347.591112a11.377778 11.377778 0 0 1 16.099555-0.056888l92.16 91.591111a11.377778 11.377778 0 0 1 0 16.156444l-346.851555 347.591111zM876.202667 238.762667l-92.16-91.648a11.377778 11.377778 0 0 1 0-16.156445L879.104 36.408889a11.377778 11.377778 0 0 1 16.042667 0l92.16 91.704889a11.377778 11.377778 0 0 1 0 16.099555l-95.004445 94.549334a11.377778 11.377778 0 0 1-16.099555 0z" p-id="5382"></path><path d="M512 28.444444m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5383"></path></svg>
                </p>
                <p><span>${t('client_mgmt_mac')}：</span><span onclick="copyText(event)">${mac_addr}</span></p>
                <p><span>${t('client_mgmt_ip')}：</span><span onclick="copyText(event)">${ip_addr}</span></p>
                <p><span>${t('client_mgmt_conn_type')}：</span><span>${t('client_mgmt_conn_wireless')}</span></p>
            </div>
            <div style="flex:1;text-align: right;">
                <button class="btn" style="padding: 20px 4px;" 
                    onclick="setOrRemoveDeviceFromBlackList('${[mac_addr, ...blackMacList].join(';')}','${[hostname, ...blackNameList].join(';')}','${AclMode}')">
                    🚫 ${t('client_mgmt_block')}
                </button>
            </div>
        </div>`}).join('')
        }

        if (lan_station_list && lan_station_list.length) {
            conn_client_html += lan_station_list.map(({ hostname, ip_addr, mac_addr }) => {
                let hostname_show = hostname
                if (devices) {
                    hostname_show = devices.find(i => i.mac == mac_addr)?.hostname || hostname
                }
                return `
        <div class="card-item" style="display: flex;width: 100%;margin: 10px 0;overflow: auto;">
            <div style="margin-right: 10px;">
                <p>
                    <span>${t('client_mgmt_hostname')}：</span><span onclick="copyText(event)">${hostname_show}</span>
                    <svg onclick="editHostName('${hostname_show}','${mac_addr}')" class="svg-icon" style="margin-left:10px" fill="var(--dark-text-color)" stroke="currentColor" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width=".8rem" height=".8rem"><path d="M568.888889 28.444444v113.777778H142.222222v739.555556h739.555556V455.111111h113.777778v455.111111a85.333333 85.333333 0 0 1-85.333334 85.333334H113.777778A85.333333 85.333333 0 0 1 28.444444 910.222222V113.777778A85.333333 85.333333 0 0 1 113.777778 28.444444h455.111111z" p-id="5380"></path><path d="M881.777778 398.222222m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5381"></path><path d="M475.192889 656.327111l-102.286222-4.209778-5.973334-103.537777 346.851556-347.591112a11.377778 11.377778 0 0 1 16.099555-0.056888l92.16 91.591111a11.377778 11.377778 0 0 1 0 16.156444l-346.851555 347.591111zM876.202667 238.762667l-92.16-91.648a11.377778 11.377778 0 0 1 0-16.156445L879.104 36.408889a11.377778 11.377778 0 0 1 16.042667 0l92.16 91.704889a11.377778 11.377778 0 0 1 0 16.099555l-95.004445 94.549334a11.377778 11.377778 0 0 1-16.099555 0z" p-id="5382"></path><path d="M512 28.444444m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5383"></path></svg>
                </p>
                <p><span>${t('client_mgmt_mac')}：</span><span onclick="copyText(event)">${mac_addr}</span></p>
                <p><span>${t('client_mgmt_ip')}：</span><span onclick="copyText(event)">${ip_addr}</span></p>
                <p><span>${t('client_mgmt_conn_type')}：</span><span>${t('client_mgmt_conn_wired')}</span></p>
            </div>
            <div style="flex:1;text-align: right;">
                <button class="btn" style="padding: 20px 4px;" 
                    onclick="setOrRemoveDeviceFromBlackList('${[mac_addr, ...blackMacList].join(';')}','${[hostname, ...blackNameList].join(';')}','${AclMode}')">
                    🚫 ${t('client_mgmt_block')}
                </button>
            </div>
        </div>`}).join('')
        }

        if (blackMacList.length && blackNameList.length) {
            black_list_html += blackMacList.map((item, index) => {
                if (item) {
                    let params = `'${blackMacList.filter(i => item != i).join(';')}',` +
                        `'${blackMacList.filter(i => blackNameList[index] != i).join(';')}',` +
                        `'${AclMode}'`
                    return `
                <div class="card-item" style="display: flex;width: 100%;margin: 10px 0;overflow: auto;">
                    <div style="margin-right: 10px;">
                        <p>
                            <span>${t('client_mgmt_hostname')}：</span><span onclick="copyText(event)">${blackNameList[index] ? blackNameList[index] : t('client_mgmt_unknown')}</span>
                            <svg onclick="editHostName('${blackNameList[index] || ''}','${item}')" class="svg-icon" style="margin-left:10px" fill="var(--dark-text-color)" stroke="currentColor" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width=".8rem" height=".8rem"><path d="M568.888889 28.444444v113.777778H142.222222v739.555556h739.555556V455.111111h113.777778v455.111111a85.333333 85.333333 0 0 1-85.333334 85.333334H113.777778A85.333333 85.333333 0 0 1 28.444444 910.222222V113.777778A85.333333 85.333333 0 0 1 113.777778 28.444444h455.111111z" p-id="5380"></path><path d="M881.777778 398.222222m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5381"></path><path d="M475.192889 656.327111l-102.286222-4.209778-5.973334-103.537777 346.851556-347.591112a11.377778 11.377778 0 0 1 16.099555-0.056888l92.16 91.591111a11.377778 11.377778 0 0 1 0 16.156444l-346.851555 347.591111zM876.202667 238.762667l-92.16-91.648a11.377778 11.377778 0 0 1 0-16.156445L879.104 36.408889a11.377778 11.377778 0 0 1 16.042667 0l92.16 91.704889a11.377778 11.377778 0 0 1 0 16.099555l-95.004445 94.549334a11.377778 11.377778 0 0 1-16.099555 0z" p-id="5382"></path><path d="M512 28.444444m11.377778 0l91.022222 0q11.377778 0 11.377778 11.377778l0 91.022222q0 11.377778-11.377778 11.377778l-91.022222 0q-11.377778 0-11.377778-11.377778l0-91.022222q0-11.377778 11.377778-11.377778Z" p-id="5383"></path></svg>
                        </p>
                        <p><span>${t('client_mgmt_mac')}：</span><span onclick="copyText(event)">${item}</span></p>
                    </div>
                    <div style="flex:1;text-align: right;">
                        <button class="btn" style="padding: 20px 4px;" onclick="setOrRemoveDeviceFromBlackList(${params})">
                            ✅ ${t('client_mgmt_unblock')}
                        </button>
                    </div>
                </div>`
                }
            }).join('')
        }

        if (conn_client_html == '') conn_client_html = `<p>${t('client_mgmt_no_device')}</p>`
        if (black_list_html == '') black_list_html = `<p>${t('client_mgmt_no_device')}</p>`

        CONN_CLIENT_LIST && (CONN_CLIENT_LIST.innerHTML = conn_client_html)
        BLACK_CLIENT_LIST && (BLACK_CLIENT_LIST.innerHTML = black_list_html)
    } catch (e) {
        console.error(e)
        createToast(t('client_mgmt_fetch_error'), 'red')
    }
}

const editHostName = async (name, mac) => {
    const { el, close } = createFixedToast('hotbox_edit_hostname', `
            <div style="pointer-events:all;width:80vw;max-width:300px;">
            <div class="title" style="margin:0" data-i18n="please_input_hostname">${t('please_input_hostname')}</div>
            <input class="user_select_none" type="text" style="border: none;padding:6px;width:100%;margin-top:10px" disabled value="MAC: ${mac}"></input>
            <input type="text" id="HOTBOX_CONN_HOSTNAME" style="padding:6px;width:100%;margin:10px 0" data-i18n-placeholder="hostname" placeholder="${t("hostname")}" value="${name}"></input>
            <div style="display:flex;gap:10px">
                <button id="close_hotbox_edit_hostname_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="confirm_btn">${t("confirm_btn")}</button>
                <button id="close_hotbox_edit_hostname_toast_btn1" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
            </div>
            </div>
            `, 'red')
    const btn = el.querySelector('#close_hotbox_edit_hostname_toast_btn')
    const btn2 = el.querySelector('#close_hotbox_edit_hostname_toast_btn1')
    const hostname = el.querySelector("#HOTBOX_CONN_HOSTNAME")

    if (!btn && !btn2 && !hostname) {
        close()
        return
    }
    btn2.onclick = () => {
        close()
    }
    btn.onclick = async () => {
        if (hostname.value.trim() == '') {
            createToast(t('toast_hostname_cannot_be_empty'), 'red')
            return
        }
        try {
            const res = await seConntHostName(mac, hostname.value.trim())
            if (res.result == 'success') {
                try { var o = JSON.parse(localStorage.getItem('hotbox_hostname_overrides')) || {}; o[mac] = hostname.value.trim(); localStorage.setItem('hotbox_hostname_overrides', JSON.stringify(o)); } catch(e){}
                createToast(t("toast_save_success"), 'pink')
                initClientManagementModal()
            } else {
                throw new Error(t("toast_save_failed"))
            }
        } catch (e) {
            createToast(t("toast_save_failed"), 'red')
        }
        close()
    }
}

let setOrRemoveDeviceFromBlackList = async (BlackMacList, BlackNameList, AclMode) => {
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network'), 'red')
            closeModal('#ClientManagementModal')
            setTimeout(() => {
                window.out()
            }, 310);
            return null
        }
        const res = await postData(cookie, {
            goformId: "setDeviceAccessControlList",
            AclMode: AclMode.trim(),
            WhiteMacList: "",
            BlackMacList: BlackMacList.trim(),
            WhiteNameList: "",
            BlackNameList: BlackNameList.trim()
        })
        const { result } = await res.json()
        if (result && result == 'success') {
            createToast(t('toast_oprate_success'), 'green')
        } else {
            createToast(t('toast_oprate_failed'), 'red')
        }
        await initClientManagementModal()
    }
    catch (e) {
        console.error(e);
        createToast(t('toast_request_data_failed'), 'red')
    }
}

let closeClientManager = () => {
    closeModal('#ClientManagementModal')
}

// Toggle cellular data

let initScheduleRebootStatus = async () => {
    const btn = document.querySelector('#SCHEDULE_REBOOT')
    const SCHEDULE_TIME = document.querySelector('#SCHEDULE_TIME')
    const SCHEDULE_ENABLED = document.querySelector('#SCHEDULE_ENABLED')
    if (!btn) return
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }

    const { restart_schedule_switch, restart_time } = await getData(new URLSearchParams({
        cmd: 'restart_schedule_switch,restart_time'
    }))

    SCHEDULE_ENABLED.checked = restart_schedule_switch == '1'
    SCHEDULE_TIME.value = restart_time
    btn.style.backgroundColor = restart_schedule_switch == '1' ? 'var(--dark-btn-color-active)' : ''

    btn.onclick = async () => {
        if (!(await window.initRequestData())) {
            btn.onclick = () => createToast(t('toast_please_login'), 'red')
            btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
            return null
        }
        showModal('#scheduleRebootModal')
    }
}
initScheduleRebootStatus()

let handleScheduleRebootFormSubmit = async (e) => {
    e.preventDefault()
    const data = {
        restart_schedule_switch: "0",
        restart_time: '00:00'
    }
    const form = e.target; // Get form
    const formData = new FormData(form);
    let regx = /^(0?[0-9]|1[0-9]|2[0-3]):(0?[0-9]|[1-5][0-9])$/
    for ([key, value] of formData.entries()) {
        switch (key) {
            case 'restart_time':
                if (!regx.exec(value.trim()) || !value.trim()) return createToast(t('toast_please_input_correct_reboot_time'), 'red')
                data.restart_time = value.trim()
                break;
            case 'restart_schedule_switch':
                data.restart_schedule_switch = value == 'on' ? '1' : '0'
        }
    }
    try {
        const cookie = await login()
        try {
            const res = await (await postData(cookie, {
                goformId: 'RESTART_SCHEDULE_SETTING',
                restart_time: data.restart_time,
                restart_schedule_switch: data.restart_schedule_switch
            })).json()
            if (res?.result == 'success') {
                createToast(t('toast_set_success'), 'green')
                initScheduleRebootStatus()
                closeModal('#scheduleRebootModal')
            } else {
                throw t('toast_set_failed')
            }
        } catch {
            createToast(t('toast_set_failed'), 'red')
        }
    } catch {
        createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
    }
}

// Enable TTYD (if available)
let initTTYD = async () => {
    const TTYD = document.querySelector('#TTYD')
    if (!TTYD) return
    const list = TTYD.querySelector('.deviceList')
    if (!list) return
    // Fetch TTYD address, display if available
    try {
        const port = localStorage.getItem('ttyd_port')
        if (!port) return
        const TTYD_INPUT = document.querySelector('#TTYD_INPUT')
        TTYD_INPUT && (TTYD_INPUT.value = port)
        const res = await (await fetch(`${HOTBOX_baseURL}/hasTTYD?port=${port}`, {
            method: "get",
            headers: common_headers
        })).json()
        if (res.code !== '200') {
            TTYD.style.display = 'none'
            list.innerHTML = ``
            return
        }
        console.log('TTYD found')
        TTYD.style.display = ''
        setTimeout(() => {
            const title = TTYD.querySelector('.title strong')
            title && (title.innerHTML = "TTYD")

            const ttydUrl = `http://${res.ip}`

            // Add "Open in new tab" button
            let openBtn = TTYD.querySelector('#ttyd_newtab_btn')
            if (!openBtn) {
                openBtn = document.createElement('button')
                openBtn.id = 'ttyd_newtab_btn'
                openBtn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:.65rem;border:none;border-radius:4px;cursor:pointer;background:var(--dark-btn-color);color:var(--dark-text-color);'
                openBtn.textContent = '↗ New Tab'
                openBtn.title = 'Open terminal in new tab'
                openBtn.onclick = () => window.open(ttydUrl, '_blank')
                const titleDiv = TTYD.querySelector('.title')
                if (titleDiv) titleDiv.appendChild(openBtn)
            } else {
                openBtn.onclick = () => window.open(ttydUrl, '_blank')
            }

            list.innerHTML = `
    <li style = "padding:10px">
                <iframe src="${ttydUrl}" style="border:none;padding:0;margin:0;width:100%;height:400px;border-radius: 10px;overflow: hidden;opacity: .6;"></iframe>
    </li > `
        }, 600);
    } catch {
        // console.log();
    }
}
initTTYD()

let click_count_ttyd = 1
let ttyd_timer = null
let enableTTYD = () => {
    click_count_ttyd++
    if (click_count_ttyd >= 4) {
        // Enable TTYD popup
        initResServer()
        showModal('#TTYDModal')
        ttyd_timer && clearTimeout(ttyd_timer)
        click_count_ttyd = 1
    }
    ttyd_timer && clearTimeout(ttyd_timer)
    ttyd_timer = setTimeout(() => {
        click_count_ttyd = 1
    }, 1999)
}

let handleTTYDFormSubmit = (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const ttyd_port = formData.get('ttyd_port')
    if (!ttyd_port || ttyd_port.trim() == '') return createToast(t('toast_please_input_port'), 'red')
    let ttydNumber = Number(ttyd_port.trim())
    if (isNaN(ttydNumber) || ttydNumber <= 0 || ttydNumber > 65535) return createToast(t('toast_please_input_port_correct'), 'red')
    // Savettyd port
    localStorage.setItem('ttyd_port', ttyd_port)
    createToast(t('toast_save_success'), 'green')
    initTTYD()
}

let changeResServer = async (e) => {
    e.preventDefault()
    const RES_SERVER_INPUT = document.querySelector('#RES_SERVER_INPUT')
    if (!RES_SERVER_INPUT) return
    const url = RES_SERVER_INPUT.value.trim()
    if (!url || url.length == 0) return createToast("Please input res server!", 'red')
    const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/set_res_server`, {
        method: 'POST',
        headers: common_headers,
        body: JSON.stringify({ res_server: url })
    }, 5000)).json()
    if (res.result != "success") {
        return createToast(t('toast_save_failed'), 'red')
    }
    createToast(t('toast_save_success'), 'green')
    closeModal('#resServerModal')
}

let initResServer = async () => {
    const RES_SERVER_INPUT = document.querySelector('#RES_SERVER_INPUT')
    if (!RES_SERVER_INPUT) return
    try {
        const { res_server } = await (await fetchWithTimeout(`${HOTBOX_baseURL}/get_res_server`, {
            method: 'GET',
            headers: common_headers
        })).json()
        RES_SERVER_INPUT.value = res_server || ''
    } catch {
        // no handle
    }
}

function parseCGEQOSRDP(input) {
    const match = input.match(/\+CGEQOSRDP:\s*(.+?)\s*OK/);
    if (!match) {
        return input
    }

    const parts = match[1].split(',').map(Number);
    if (parts.length < 8) {
        return input
    }

    const formatQosRate = (rawValue) => {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed) || parsed <= 0) return '0';
        const kbpsScaledMbps = parsed / 1000;
        const mbps = kbpsScaledMbps >= 10000 ? (parsed / 1000000) : kbpsScaledMbps;
        return Number.isInteger(mbps) ? String(mbps) : mbps.toFixed(1).replace(/\.0$/, '');
    };

    return `QCI：${parts[1]} ⬇️ ${formatQosRate(parts[6])}Mbps ⬆️ ${formatQosRate(parts[7])}Mbps`
}


const executeATCommand = async (command, slot = null) => {
    let at_slot_value = document.querySelector("#AT_SLOT")?.value
    if (slot == null || slot == undefined) {
        if (isNaN(Number(at_slot_value?.trim())) || at_slot_value == undefined || at_slot_value == null) {
            slot = 0
        } else {
            slot = at_slot_value.trim()
        }
    }
    try {
        const command_enc = encodeURIComponent(command)
        const res = await (await fetch(`${HOTBOX_baseURL}/AT?command=${command_enc}&slot=${slot}`, { headers: common_headers })).json()
        return res
    } catch (e) {
        return null
    }
}

async function QOSRDPCommand(cmd) {
    if (!cmd) return window.QORS_MESSAGE = null
    // Get current SIM slot
    let { sim_slot } = await getData(new URLSearchParams({
        cmd: 'sim_slot'
    }))
    // Check dual SIM support
    const { dual_sim_support } = await getData(new URLSearchParams({
        cmd: 'dual_sim_support'
    }))
    if (!sim_slot || dual_sim_support != '1') {
        // Single SIM users default to slot 0
        sim_slot = 0
    }

    // For F50Pro
    if (UFI_DATA && UFI_DATA.model == "MU3356" && (sim_slot == '0' || sim_slot == '1')) {
        sim_slot = sim_slot == 1 ? 0 : 1
    }

    // V50 built-in SIM1(CMCC)slot=0 SIM2(CTCC)slot=1 SIM3(CUCC)slot=2 external slot=11; external needs Settings=0, CUCC needs slotSettings=1
    // For V50
    if (sim_slot == "11") {
        // F50Pro has reversed SIM slot order
        if (UFI_DATA && UFI_DATA.model == "MU3356") {
            sim_slot = 1
        } else {
            sim_slot = 0
        }
    }
    if (sim_slot == "2") {
        sim_slot = 1
    }
    // For F50Pro
    if (sim_slot == "12") {
        sim_slot = 0
    }

    let res = await executeATCommand(cmd, sim_slot)
    // If single-SIM user can't get data from slot 0, try slot 1
    if (res.result && res.result.includes('ERROR')) {
        if (dual_sim_support != '1') {
            sim_slot = 1
            res = await executeATCommand(cmd, sim_slot)
        }
    }
    if (res.result) return window.QORS_MESSAGE = parseCGEQOSRDP(res.result)
    return window.QORS_MESSAGE = null
}
QOSRDPCommand("AT+CGEQOSRDP=1")
let QORSTimer = requestInterval(() => { QOSRDPCommand("AT+CGEQOSRDP=1") }, 10000)

const initHighRailBtn = async () => {
    const highRailModeBtn = document.querySelector('#highRailModeBtn')
    if (highRailModeBtn) {
        try {
            const params = "AT+SP5GCMDS=\"get nr synch_param\",44"
            const res = await executeATCommand(params);
            highRailModeBtn.dataset.enabled = '0'
            if (res) {
                if (res.error) {
                    AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                    !silent && createToast(t('toast_exe_failed'), 'red');
                    return false
                }
                if (res.result.includes('synch_param,44,1')) {
                    highRailModeBtn.dataset.enabled = '1'
                    highRailModeBtn.style.backgroundColor = 'var(--dark-btn-color-active)'
                }
            }
        } catch {
            highRailModeBtn.dataset.enabled = '0'
        }
    }
}

let initATBtn = async () => {
    const el = document.querySelector('#AT')
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    el.style.backgroundColor = ''
    el.onclick = () => {
        initHighRailBtn()
        showModal('#ATModal')
    }
}
initATBtn()


const handleATFormSubmit = async () => {
    const AT_value = document.querySelector('#AT_INPUT')?.value;
    if (!AT_value || AT_value.trim() === '') {
        return createToast(t('toast_please_input_AT'), 'red');
    }

    const AT_RESULT = document.querySelector('#AT_RESULT');
    AT_RESULT.innerHTML = t('toast_running_please_wait')

    try {
        const res = await executeATCommand(AT_value.trim());

        if (res) {
            if (res.error) {
                AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                createToast(t('toast_exe_failed'), 'red');
                return;
            }
            // Clear IMEI cache
            resetDiagImeiCache()
            AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
            createToast(t('toast_exe_success'), 'green');
        } else {
            createToast(t('toast_exe_failed'), 'red');
        }

    } catch (err) {
        const error = err?.error || t('toast_unknow_err');
        AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
        createToast(t('toast_exe_failed'), 'red');
    }
};

const handleQosAT = async () => {
    const AT_RESULT = document.querySelector('#AT_RESULT');
    AT_RESULT.innerHTML = t('toast_running_please_wait');

    try {
        const res = await executeATCommand('AT+CGEQOSRDP=1');

        if (res) {
            if (res.error) {
                AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                createToast(t('toast_exe_failed'), 'red');
                return;
            }

            AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${parseCGEQOSRDP(res.result)}</p>`;
            createToast(t('toast_exe_success'), 'green');
        } else {
            createToast(t('toast_exe_failed'), 'red');
        }

    } catch (err) {
        const error = err?.error || t('toast_unknow_err');
        AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
        createToast(t('toast_exe_failed'), 'red');
    }
};

const handleAT = async (params, silent = false) => {
    if (!params) return
    // Execute AT
    const AT_RESULT = document.querySelector('#AT_RESULT')
    AT_RESULT.innerHTML = t('toast_running_please_wait')
    try {
        const res = await executeATCommand(params);
        if (res) {
            if (res.error) {
                AT_RESULT.innerHTML = `<p style="overflow: hidden;">${res.error}</p>`;
                !silent && createToast(t('toast_exe_failed'), 'red');
                return false
            }

            AT_RESULT.innerHTML = `<p onclick="copyText(event)"  style="overflow: hidden;">${res.result}</p>`;
            !silent && createToast(t('toast_exe_success'), 'green');
            // After AT execution, clear IMEI display cache
            resetDiagImeiCache()
            return true
        } else {
            !silent && createToast(t('toast_exe_failed'), 'red');
            return false
        }
    } catch (err) {
        const error = err?.error || t('toast_unknow_err');
        AT_RESULT.innerHTML = `<p style="overflow: hidden;">${error}</p>`;
        !silent && createToast(t('toast_exe_failed'), 'red');
        return false
    }
}

// Disable button during execution
const disableButtonWhenExecuteFunc = async (e, func) => {
    const target = e.currentTarget
    target.setAttribute("disabled", "true");
    target.style.opacity = '.5'
    try {
        if (func) {
            await func()
        }
    } finally {
        target.removeAttribute("disabled");
        target.style.opacity = ''
    }
}

const socatAlive = async () => {
    let res = await checkAdvancedFunc()
    if (res) {
        let smb = document.querySelector('#SMB')
        smb && (smb.style.display = 'none')
    }
    const socat_status = document.querySelectorAll('.socat_status')
    if (socat_status) {
        socat_status.forEach(item => {
            item.innerHTML = res ? `${t('advanced')}：🟢 ${t('advanced_tools_on')}` : `${t('advanced')}：🔴 ${t('advanced_tools_off')}`
        })
    }
}
socatAlive()

let socatTimerFn = null

// Initialize advanced feature buttons
let initAdvanceTools = async () => {
    const el = document.querySelector('#ADVANCE')
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    el.style.backgroundColor = ''
    el.onclick = () => {
        showModal('#advanceModal')
        // Loop check if socat is on
        socatAlive()
        socatTimerFn && socatTimerFn()
        socatTimerFn = requestInterval(() => socatAlive(), 1000)
    }
}
initAdvanceTools()

const closeAdvanceToolsModal = () => {
    socatTimerFn && socatTimerFn()
    closeModal('#advanceModal')
}

// Execute advanced feature change: 1=Enable, 0=Disable
const handleSambaPath = async (flag = '1') => {
    const AT_RESULT = document.querySelector('#AD_RESULT')
    // let adb_status = await adbKeepAlive()
    // if (!adb_status) {
    //     AT_RESULT.innerHTML = ""
    //     return createToast(t('toast_ADB_not_init'), 'red')
    // }

    AT_RESULT.innerHTML = t('toast_running_please_wait')

    if (flag == '1') {
        try {
            const cookie = await login()
            if (cookie) {
                await (await postData(cookie, {
                    goformId: 'SAMBA_SETTING',
                    samba_switch: '1'
                })).json()
            }
            await initSMBStatus()
        } catch { }
    }
    try {
        const res = await (await fetch(`${HOTBOX_baseURL}/smbPath?enable=${flag}`, { headers: common_headers })).json()
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

// Change password
initChangePassData = async () => {
    const el = document.querySelector("#CHANGEPWD")
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    el.style.backgroundColor = ''
    el.onclick = async () => {
        showModal('#changePassModal')
    }
}
initChangePassData()

const handleChangePassword = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const oldPassword = formData.get('oldPassword')
    const newPassword = formData.get('newPassword')
    const confirmPassword = formData.get('confirmPassword')
    if (!oldPassword || oldPassword.trim() == '') return createToast(t('toast_please_input_old_pwd'), 'red')
    if (!newPassword || newPassword.trim() == '') return createToast(t('toast_please_input_new_pwd'), 'red')
    if (!confirmPassword || confirmPassword.trim() == '') return createToast(t('toast_please_input_new_conform_pwd'), 'red')
    if (newPassword != confirmPassword) return createToast(t('toast_pwd_not_eqal'), 'red')

    try {
        const cookie = await login()
        try {
            const res = await (await postData(cookie, {
                goformId: 'CHANGE_PASSWORD',
                oldPassword: SHA256(oldPassword),
                newPassword: SHA256(newPassword)
            })).json()
            if (res?.result == 'success') {
                createToast(t('toast_change_success'), 'green')
                form.reset()
                // Update backend ADMIN_PWD field
                const update_res = await updateAdminPsw(newPassword.trim())
                if (!update_res || update_res.result != 'success') {
                    console.error('Update admin password failed:', update_res ? update_res.message : 'No response');
                }
                HOTBOX_PASSWORD = newPassword.trim()
                localStorage.setItem('hotbox_sms_pwd', newPassword.trim())
                closeModal('#changePassModal')
            } else {
                throw t('toast_change_failed')
            }
        } catch {
            createToast(t('toast_change_failed'), 'red')
        }
    } catch {
        createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
        closeModal('#changePassModal')
    }
}

const onCloseChangePassForm = () => {
    const form = document.querySelector("#changePassForm")
    form && form.reset()
    closeModal("#changePassModal")
}


// Change token
initChangeTokenData = async () => {
    const el = document.querySelector("#CHANGETOKEN")
    if (!el) return null
    if (!(await window.initRequestData())) {
        el.onclick = () => createToast(t('toast_please_login'), 'red')
        el.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    el.style.backgroundColor = ''
    el.onclick = async () => {
        showModal('#changeTokenModal')
    }
}
initChangeTokenData()

// Change token
const handleChangeToken = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const newToken = formData.get('newToken')
    const confirmToken = formData.get('confirmToken')
    const exp = /^(?=.*[a-zA-Z])(?=.*\d).{8,128}$/
    if (!newToken || newToken.trim() == '') return createToast(t('toast_please_input_new_token'), 'red')
    if (!confirmToken || confirmToken.trim() == '') return createToast(t('toast_please_input_new_conform_token'), 'red')
    if (newToken != confirmToken) return createToast(t('toast_token_not_eqal'), 'red')
    if (newToken.trim().length < 8) return createToast(t('toast_token_too_short'), 'red')
    if (!exp.test(newToken)) return createToast(t('toast_token_invalid'), 'red')
    try {
        try {
            const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/set_token`, {
                method: 'POST',
                headers: common_headers,
                body: JSON.stringify({
                    token: newToken.trim()
                })
            })).json()
            if (res && res.result == 'success') {
                createToast(t('toast_change_success'), 'green')
                const new_token = SHA256(newToken.trim()).toLowerCase()
                HOTBOX_TOKEN = new_token
                common_headers.authorization = HOTBOX_TOKEN
                localStorage.setItem('hotbox_sms_token', new_token)
                form.reset()
                const md = createModal({
                    name: "hotbox_token_confirm",
                    noBlur: true,
                    isMask: true,
                    title: t('remind_your_token'),
                    contentStyle: "font-size:12px",
                    onClose: () => {
                        return true
                    },
                    onConfirm: () => {
                        return true
                    },
                    content: `<div><p class="title" style="margin:6px 0">${t('remind_your_token_text')}</p><h1 onclick="copyText(event)" style="text-align:center">${newToken}</h1></div>`
                })
                closeModal('#changeTokenModal', 300, () => {
                    showModal(md.id)
                })
            } else {
                throw t('toast_change_failed')
            }
        } catch {
            createToast(t('toast_change_failed'), 'red')
        }
    } catch {
        createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
        closeModal('#changeTokenModal')
    }
}

const onCloseChangeTokenForm = () => {
    const form = document.querySelector("#changeTokenForm")
    form && form.reset()
    closeModal("#changeTokenModal")
}


const OP = (e) => {
    e.preventDefault()
    createToast(t('egg'), 'pink')
    closeModal('#TTYDModal')
    const TTYD = document.querySelector('#TTYD')
    if (!TTYD) return
    const title = TTYD.querySelector('.title strong')
    title && (title.innerHTML = "?")
    const list = TTYD.querySelector('.deviceList')
    list.innerHTML = `
    <li style = "padding:10px">
                <iframe src="https://cg.163.com/#/mobile" style="border:none;padding:0;margin:0;width:100%;height:600px;border-radius: 10px;overflow: hidden;opacity: 1;"></iframe>
    </li > `
}

// LAN settings
const initLANSettings = async () => {
    // LAN settings now handled inline by ctrl-tabs.js
}
initLANSettings()

const onLANModalSubmit = async (e) => {
    e.preventDefault();
    try {
        const cookie = await login()
        if (!cookie) {
            createToast(t('toast_login_failed_check_network_and_pwd'), 'red')
            return null
        }

        const form = e.target; // Get form
        const formData = new FormData(form);

        let data = {
            lanIp: '192.168.0.1',
            lanNetmask: '255.255.255.0',
            lanDhcpType: 'DISABLE',
            dhcpStart: '',
            dhcpEnd: '',
            dhcpLease: '',
            dhcp_reboot_flag: '1',
            mac_ip_reset: '0',
        }

        // DHCP toggle
        const lanDhcpType = formData.get('lanDhcpType') === 'SERVER';
        if (lanDhcpType) {
            data.lanDhcpType = 'SERVER';
            data.mac_ip_reset = '1';
        } else {
            data.lanDhcpType = 'DISABLE';
            data.mac_ip_reset = '0';
        }

        for (const [key, value] of formData.entries()) {
            const val = value.trim();
            switch (key) {
                case 'lanIp':
                    if (!val || !isValidIP(val)) return createToast(t('toast_please_input_correct_lanIP'), 'red');
                    data[key] = val;
                    break;
                case 'lanNetmask':
                    if (!val || !isValidSubnetMask(val)) return createToast(t('toast_please_input_correct_subnet_mask'), 'red');
                    data[key] = val;
                    break;
                case 'dhcpStart': {
                    if (data.lanDhcpType == 'DISABLE') break
                    if (!val || !isValidIP(val)) return createToast(t('toast_please_input_correct_start_ip'), 'red');
                    const lanIp = formData.get('lanIp')?.trim();
                    const netmask = formData.get('lanNetmask')?.trim();
                    if (!isSameSubnet(val, lanIp, netmask)) {
                        return createToast('DHCP ' + t('toast_start_ip_not_include'), 'red');
                    }

                    if (ipToInt(val) <= ipToInt(lanIp)) {
                        return createToast('DHCP ' + t('toast_start_ip_should_bigger_than_lanIP'), 'red');
                    }
                    data[key] = val;
                    break;
                }
                case 'dhcpEnd': {
                    if (data.lanDhcpType == 'DISABLE') break
                    if (!val || !isValidIP(val)) return createToast(t('toast_invalid_end_ip'), 'red');
                    const start = formData.get('dhcpStart')?.trim();
                    const lanIp = formData.get('lanIp')?.trim();
                    const netmask = formData.get('lanNetmask')?.trim();

                    if (!isSameSubnet(val, lanIp, netmask)) {
                        return createToast('DHCP ' + t('toast_end_ip_not_in_subnet'), 'red');
                    }

                    if (start === val) return createToast(t('toast_start_equals_end_ip'), 'red');
                    if (ipToInt(start) > ipToInt(val)) return createToast(t('toast_start_greater_than_end_ip'), 'red');
                    data[key] = val;
                    break;
                }
                case 'dhcpLease':
                    if (data.lanDhcpType == 'DISABLE') break
                    if (Number(val) <= 0) return createToast(t('toast_invalid_lease_time'), 'red');
                    data[key] = val;
                    break;
                default:
                    break;
            }
        }

        const lanIp = formData.get('lanIp')?.trim();
        const netmask = formData.get('lanNetmask')?.trim();
        if (isValidIP(lanIp) && isValidSubnetMask(netmask)) {
            const dhcpStart = formData.get('dhcpStart')?.trim();
            const dhcpEnd = formData.get('dhcpEnd')?.trim();
            const networkAddr = getNetworkAddress(lanIp, netmask);
            const broadcastAddr = getBroadcastAddress(lanIp, netmask);

            // Gateway IP cannot be network or broadcast address
            if (lanIp === networkAddr || lanIp === broadcastAddr) {
                return createToast(t('toast_gateway_is_network_or_broadcast'), 'red');
            }

            // DHCP start/end cannot be network or broadcast address
            if (dhcpStart === networkAddr || dhcpStart === broadcastAddr) {
                return createToast('DHCP ' + t('toast_start_ip_is_network_or_broadcast'), 'red');
            }

            if (dhcpEnd === networkAddr || dhcpEnd === broadcastAddr) {
                return createToast('DHCP ' + t('toast_end_ip_is_network_or_broadcast'), 'red');
            }

            // Gateway must not be within DHCP range
            const lanInt = ipToInt(lanIp);
            const startInt = ipToInt(dhcpStart);
            const endInt = ipToInt(dhcpEnd);
            if (lanInt >= startInt && lanInt <= endInt) {
                return createToast(t('toast_gateway_in_dhcp_range'), 'red');
            }
        }

        const res = await (await postData(cookie, {
            goformId: 'DHCP_SETTING',
            ...data
        })).json()

        if (res.result == 'success') {
            createToast(t('toast_set_success_reboot'), 'green')
            setTimeout(() => {
                let newURL = window.location.protocol + '//' + data.lanIp + ':2333'
                window.location.href = newURL
            }, 30000);
        } else {
            throw t('toast_set_failed')
        }
    }
    catch (e) {
        console.error(e.message)
        // createToast(e.message)
    }
}

collapseGen("#collapse_dhcp_switch", "#collapse_dhcp", null, async (status) => {
    const enableDHCP = document.querySelector('#enableDHCP')
    if (!enableDHCP) return
    enableDHCP.value = status == 'open' ? "SERVER" : "DISABLE"
})

// Device monitoring
if (document.querySelector('#collapse_device_mon_btn')) {
    collapseGen("#collapse_device_mon_btn", "#collapse_device_mon", 'collapse_device_mon', async (status) => {
    })
}

// Change refresh rate
const changeRefreshRate = (e) => {
    const value = e.target.value
    if (value) {
        window.stopRefresh()
        window.REFRESH_TIME = Number(value)
        window.startRefresh()
        // Sync button state to running
        const headerBtn = document.querySelector('#headerRefreshBtn')
        if (headerBtn) {
            headerBtn.innerHTML = pauseIcon
            headerBtn.classList.add('is-running')
            headerBtn.classList.remove('is-paused')
            headerBtn.title = 'Stop refresh'
        }
        createToast(t('toast_current_refresh_rate') + "：" + (value / 1000).toFixed(2) + "S", 'green')
        //Save
        localStorage.setItem("refreshRate", value)
    }
}
// Wire refresh rate select and expose globally
const rrSel = document.getElementById('refreshRateSelect');
if (rrSel) rrSel.addEventListener('change', changeRefreshRate);
window.changeRefreshRate = changeRefreshRate;

// Toggle small cores
const switchCpuCore = async (flag = true) => {
    const AD_RESULT = document.querySelector('#AD_RESULT')
    const shell = `
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu0/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu1/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu2/online
echo ${flag ? '1' : '0'} > /sys/devices/system/cpu/cpu3/online
    `
    const result = await runShellWithRoot(shell)
    result.success ? createToast(t('toast_exe_success'), 'green') : createToast(t('toast_exe_failed'), 'red')

    AD_RESULT.innerHTML = result.content
}

    // Register on window
    window.handleDataManagementFormSubmit = handleDataManagementFormSubmit;
    window.initWIFIManagementForm = initWIFIManagementForm;
    window.handleWIFIManagementFormSubmit = handleWIFIManagementFormSubmit;
    window.handleWifiEncodeChange = handleWifiEncodeChange;
    window.handleShowPassword = handleShowPassword;
    window.initClientManagementModal = initClientManagementModal;
    window.editHostName = editHostName;
    window.setOrRemoveDeviceFromBlackList = setOrRemoveDeviceFromBlackList;
    window.closeClientManager = closeClientManager;
    window.initScheduleRebootStatus = initScheduleRebootStatus;
    window.handleScheduleRebootFormSubmit = handleScheduleRebootFormSubmit;
    window.initTTYD = initTTYD;
    window.enableTTYD = enableTTYD;
    window.handleTTYDFormSubmit = handleTTYDFormSubmit;
    window.changeResServer = changeResServer;
    window.initResServer = initResServer;
    window.parseCGEQOSRDP = parseCGEQOSRDP;
    window.executeATCommand = executeATCommand;
    window.QOSRDPCommand = QOSRDPCommand;
    window.initHighRailBtn = initHighRailBtn;
    window.initATBtn = initATBtn;
    window.handleATFormSubmit = handleATFormSubmit;
    window.handleQosAT = handleQosAT;
    window.handleAT = handleAT;
    window.disableButtonWhenExecuteFunc = disableButtonWhenExecuteFunc;
    window.socatAlive = socatAlive;
    window.initAdvanceTools = initAdvanceTools;
    window.closeAdvanceToolsModal = closeAdvanceToolsModal;
    window.handleSambaPath = handleSambaPath;
    window.initChangePassData = initChangePassData;
    window.handleChangePassword = handleChangePassword;
    window.onCloseChangePassForm = onCloseChangePassForm;
    window.initChangeTokenData = initChangeTokenData;
    window.handleChangeToken = handleChangeToken;
    window.onCloseChangeTokenForm = onCloseChangeTokenForm;
    window.initLANSettings = initLANSettings;
    window.onLANModalSubmit = onLANModalSubmit;
    window.changeRefreshRate = changeRefreshRate;
    window.switchCpuCore = switchCpuCore;
})();
