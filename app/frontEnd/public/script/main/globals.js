/**
 * Shared global state and utility functions used across main/* modules.
 * Must be loaded before any other main/* script.
 */
(function () {
    // --- Refresh rate (must be set before status-render.js) ---
    window.REFRESH_TIME = getRefteshRate((val) => {
        let refreshRateSelect = document.querySelector('#refreshRateSelect')
        refreshRateSelect && (refreshRateSelect.value = val.toString())
    });

    // --- Shared auth state ---
    window.isNeedToken = true;
    window.psw_fail_num = 0;
    window.QORS_MESSAGE = null;
    window.smsSender = null;

    // --- Show list (field visibility/ordering) ---
    var _stor = localStorage.getItem('showList');
    window._showList = _stor != null ? JSON.parse(_stor) : {
        statusShowList: [
            { "name": "QORS_MESSAGE", "isShow": true },
            { "name": "network_type", "isShow": true },
            { "name": "wifi_access_sta_num", "isShow": true },
            { "name": "battery", "isShow": true },
            { "name": "rssi", "isShow": true },
            { "name": "cpu_temp", "isShow": true },
            { "name": "cpu_usage", "isShow": true },
            { "name": "mem_usage", "isShow": true },
            { "name": "realtime_time", "isShow": true },
            { "name": "monthly_tx_bytes", "isShow": true },
            { "name": "daily_data", "isShow": true },
            { "name": "current_now", "isShow": true },
            { "name": "voltage_now", "isShow": true },
            { "name": "realtime_rx_thrpt", "isShow": true }
        ],
        signalShowList: [
            { "name": "Z5g_rsrp", "isShow": true },
            { "name": "Nr_snr", "isShow": true },
            { "name": "nr_rsrq", "isShow": true },
            { "name": "Nr_bands", "isShow": true },
            { "name": "Nr_fcn", "isShow": true },
            { "name": "Nr_bands_widths", "isShow": true },
            { "name": "Nr_pci", "isShow": true },
            { "name": "nr_rssi", "isShow": true },
            { "name": "Nr_cell_id", "isShow": true },
            { "name": "lte_rsrp", "isShow": true },
            { "name": "Lte_snr", "isShow": true },
            { "name": "lte_rsrq", "isShow": true },
            { "name": "Lte_bands", "isShow": true },
            { "name": "Lte_fcn", "isShow": true },
            { "name": "Lte_bands_widths", "isShow": true },
            { "name": "Lte_pci", "isShow": true },
            { "name": "lte_rssi", "isShow": true },
            { "name": "Lte_cell_id", "isShow": true }
        ],
        propsShowList: [
            { "name": "client_ip", "isShow": true },
            { "name": "model", "isShow": true },
            { "name": "cr_version", "isShow": true },
            { "name": "iccid", "isShow": true },
            { "name": "imei", "isShow": true },
            { "name": "imsi", "isShow": true },
            { "name": "ipv6_wan_ipaddr", "isShow": true },
            { "name": "lan_ipaddr", "isShow": true },
            { "name": "mac_address", "isShow": true },
            { "name": "msisdn", "isShow": true },
            { "name": "internal_available_storage", "isShow": true },
            { "name": "external_available_storage", "isShow": true }
        ]
    };

    // --- Shared auth helpers ---
    window.initRequestData = async function () {
        var PWD = localStorage.getItem('hotbox_sms_pwd');
        var TOKEN = localStorage.getItem('hotbox_sms_token');
        if (!PWD) return false;
        if (window.isNeedToken && !TOKEN) return false;
        HOTBOX_TOKEN = TOKEN;
        common_headers.authorization = HOTBOX_TOKEN;
        HOTBOX_PASSWORD = PWD;
        return true;
    };

    window.out = function () {
        window.smsSender && window.smsSender();
        localStorage.removeItem('hotbox_sms_pwd');
        localStorage.removeItem('hotbox_sms_token');
        closeModal('#smsList');
        setTimeout(function () {
            showModal('#tokenModal');
        }, 320);
    };

    // --- Show list helpers ---
    window.isNullOrUndefined = function (obj) {
        var isNumber = typeof obj === 'number';
        if (isNumber) return true;
        return obj != undefined || obj != null;
    };

    window.isIncludeInShowList = function (dicName) {
        return (
            window._showList.statusShowList.find(function (i) { return i.name == dicName; })
            || window._showList.propsShowList.find(function (i) { return i.name == dicName; })
            || window._showList.signalShowList.find(function (i) { return i.name == dicName; })
        );
    };

    window.notNullOrundefinedOrIsShow = function (obj, dicName, flag) {
        if (flag === undefined) flag = false;
        var isNumber = typeof obj[dicName] === 'number';
        if (isNumber) return window.isIncludeInShowList(dicName) || flag;
        var isReadable = obj[dicName] != null && obj[dicName] != undefined && obj[dicName] != '';
        return isReadable && window.isIncludeInShowList(dicName);
    };

    window.hasBatteryData = function (res) {
        return res?.has_battery_data === true
            || (res?.battery !== null && res?.battery !== undefined && res?.battery !== '')
            || (res?.current_now !== null && res?.current_now !== undefined && res?.current_now !== '')
            || (res?.voltage_now !== null && res?.voltage_now !== undefined && res?.voltage_now !== '');
    };

    // --- Refresh control ---
    window._StopStatusRenderTimer = null;
    window._QORSTimer = null;

    window.startRefresh = function () {
        window.stopRefresh();
        window._StopStatusRenderTimer = requestInterval(function () { window.handlerStatusRender(); }, window.REFRESH_TIME);
        window._QORSTimer = requestInterval(function () { window.QOSRDPCommand("AT+CGEQOSRDP=1"); }, 10000);
    };

    window.stopRefresh = function () {
        if (window._StopStatusRenderTimer) { window._StopStatusRenderTimer(); window._StopStatusRenderTimer = null; }
        if (window._QORSTimer) { window._QORSTimer(); window._QORSTimer = null; }
    };

    // --- Init render method (calls all module init functions) ---
    window.initRenderMethod = async function () {
        if (typeof initScheduledTask === 'function') initScheduledTask();
        if (typeof initPluginSetting === 'function') initPluginSetting();
        if (typeof initLANSettings === 'function') initLANSettings();
        if (typeof initSmsForwardModal === 'function') initSmsForwardModal();
        if (typeof initChangePassData === 'function') initChangePassData();
        if (typeof initChangeTokenData === 'function') initChangeTokenData();
        try { if (typeof adbQuery === 'function') adbQuery(); } catch (e) { }
        if (typeof loadTitle === 'function') loadTitle();
        if (typeof handlerPerformaceStatus === 'function') handlerPerformaceStatus();
        if (typeof initNetworktype === 'function') initNetworktype();
        if (typeof initSMBStatus === 'function') initSMBStatus();
        if (typeof initROAMStatus === 'function') initROAMStatus();
        if (typeof initSimCardType === 'function') initSimCardType();
        if (typeof initLightStatus === 'function') initLightStatus();
        if (typeof initUSBNetworkType === 'function') initUSBNetworkType();
        if (typeof initNFCSwitch === 'function') initNFCSwitch();
        if (typeof initWIFISwitch === 'function') initWIFISwitch();
        if (typeof socatAlive === 'function') socatAlive();
        if (typeof rebootDeviceBtnInit === 'function') rebootDeviceBtnInit();
        if (typeof handlerCecullarStatus === 'function') handlerCecullarStatus();
        if (typeof initScheduleRebootStatus === 'function') initScheduleRebootStatus();
        if (typeof initATBtn === 'function') initATBtn();
        if (typeof initAPNManagement === 'function') initAPNManagement();
        if (typeof initCellularSpeedTestBtn === 'function') initCellularSpeedTestBtn();
        if (typeof initUSBStatusManagementBtn === 'function') initUSBStatusManagementBtn();
        if (typeof initSleepTime === 'function') initSleepTime();
        if (typeof initAdvanceTools === 'function') initAdvanceTools();
        if (typeof QOSRDPCommand === 'function') QOSRDPCommand("AT+CGEQOSRDP=1");
        if (typeof initTTYD === 'function') initTTYD();
        if (typeof updateLoginIcon === 'function') updateLoginIcon();
    };
})();
