/**
 * Status Dashboard - Polling loop, signal/cell rendering, global status bar
 */
(function () {
let cachedDiagImeiQueryResult = ''
let diagImeiTimer = null
const queryImeiFromDIAG = async () => {
    if (diagImeiTimer == null) {
        diagImeiTimer = setTimeout(() => {
            cachedDiagImeiQueryResult = ''
            diagImeiTimer = null
        }, 5 * 60 * 1000);
    }
    if (cachedDiagImeiQueryResult && cachedDiagImeiQueryResult != '') {
        return cachedDiagImeiQueryResult
    }
    let isEnabled = await checkAdvancedFunc()
    if (isEnabled) {
        try {
            const res = await runShellWithRoot(`/data/data/com.hotbox.f50_app/files/imei_reader`)
            const imei = res.content.replace(/IMEI[0-9]:/g, "").split('\n')[0]
            cachedDiagImeiQueryResult = imei
            return imei
        } catch {
            return ''
        }
    }
}

const resetDiagImeiCache = () => {
    cachedDiagImeiQueryResult = ''
    diagImeiTimer && clearTimeout(diagImeiTimer)
    diagImeiTimer = null
}

let StopStatusRenderTimer = null
let isNotLoginOnce = true
let status_login_try_times = 0
let handlerStatusRender = async (flag = false) => {
    const status = document.querySelector('#STATUS')
    if (flag) {
        const TOKEN = localStorage.getItem('hotbox_sms_token')
        if (!TOKEN && window.isNeedToken) {
            return false
        }
        HOTBOX_TOKEN = TOKEN
        common_headers.authorization = HOTBOX_TOKEN
        status.innerHTML = `
    <li style="padding-top: 15px;">
        <strong class="green" style="margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
            <span style="font-size: 50px;" class="spin">🌀</span>
            <span style="font-size: 16px;padding-top: 10px;">loading...</span>
        </strong>
    </li>`
    }
    let res = await getUFIData()
    if (!res) {
        // window.out()
        if (flag) {
            status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">${t('status_load_failed')}</strong></li>`
            createToast(t('toast_get_data_failed_check_network_pwd'), 'red')
        }
        if ((!HOTBOX_TOKEN || !common_headers.authorization) && isNotLoginOnce) {
            status.innerHTML = `<li style="padding-top: 15px;"><strong onclick="copyText(event)" class="green">${t('status_load_failed')}</strong></li>`
            createToast(t('toast_login_to_get_data'), 'pink')
            isNotLoginOnce = false
        }
        return
    }
    if (res) {
        // Must keep logged in
        if (res.loginfo && res.loginfo != 'ok') {
            try {
                if (await window.initRequestData()) {
                    console.log('Login timeout keep login...');
                    // Clear diag IMEI cache
                    resetDiagImeiCache()
                    const res = await login()
                    if (res === null) {
                        console.log('Login faild, try again...');
                        status_login_try_times += 1
                    }
                    if (res) {
                        status_login_try_times = 0
                        window.initRenderMethod()
                    }
                    if (status_login_try_times >= 10) {
                        createToast(t('toast_login_expired'), 'red')
                        window.out()
                        isFirstRender = true
                        lastRequestSmsIds = null
                        localStorage.removeItem('hotbox_sms_pwd')
                        localStorage.removeItem('hotbox_sms_token')
                        HOTBOX_TOKEN = null
                        common_headers.authorization = null
                        window.initRenderMethod()
                        status_login_try_times = 0
                        return
                    }
                    return // Skip this render
                }
            } catch (e) { }
        }

        // Data loaded successfully, reset login failure counter
        status_login_try_times = 0

        // If advanced enabled and IMEI hidden after change, use force query to show IMEI
        if (!res.imei || res.imei.length === 0) {
            res.imei = await queryImeiFromDIAG()
        }
        // If device shows IMEI and differs from cache, clear cache
        if (res.imei && (res.imei != cachedDiagImeiQueryResult)) {
            resetDiagImeiCache()
        }
        // If ICCID changed, clear IMEI cache
        if (window.UFI_DATA["iccid"] !== res.iccid) {
            resetDiagImeiCache()
        }

        Object.keys(res).forEach(key => {
            window.UFI_DATA[key] = res[key];
        });

        // Update quick toggle states
        if (typeof qtUpdateAll === 'function') qtUpdateAll();

        // Update global status bar
        (() => {
            const gsLogo = document.getElementById('gs-carrier-logo');
            const gsNet = document.getElementById('gs-network');
            const gsType = document.getElementById('gs-nettype');
            const gsSig = document.getElementById('gs-signal');
            const gsWifi = document.getElementById('gs-wifi');
            const gsWifiIcon = document.getElementById('gs-wifi-icon');
            const gsLan = document.getElementById('gs-lan');
            const gsLanIcon = document.getElementById('gs-lan-icon');

            // Indian carrier logo SVGs (brand colors, simple iconic designs)
            const carrierLogos = {
                'vi': `<svg viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#fff"/><text x="18" y="25" text-anchor="middle" font-size="20" font-weight="900" font-family="Arial,sans-serif"><tspan fill="#E60000">V</tspan><tspan fill="#7B2D8E">i</tspan></text></svg>`,
                'jio': `<svg viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#fff"/><text x="18" y="26" text-anchor="middle" font-size="16" font-weight="900" font-family="Arial,sans-serif" fill="#0A3A7D">Jio</text></svg>`,
                'airtel': `<svg viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#fff"/><path d="M18 6c-6.6 0-12 5.4-12 12 0 4 2 7.6 5.2 9.8.4.2.8 0 .8-.4v-4.8c-2-1.4-3.2-3.6-3.2-6.2 0-4.2 3.6-7.6 8-7.6h2.4c4.4 0 8 3.4 8 7.6 0 2.6-1.2 4.8-3.2 6.2v4.8c0 .4.4.6.8.4C28 25.6 30 22 30 18c0-6.6-5.4-12-12-12z" fill="#ED1C24"/></svg>`,
                'bsnl': `<svg viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#1E3A8A"/><text x="18" y="14" text-anchor="middle" font-size="7" font-weight="900" font-family="Arial,sans-serif" fill="#FFD700">BSNL</text><circle cx="18" cy="24" r="6" fill="none" stroke="#FFD700" stroke-width="2"/><circle cx="18" cy="24" r="2" fill="#FFD700"/></svg>`,
                'mtnl': `<svg viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#003DA5"/><text x="18" y="15" text-anchor="middle" font-size="6.5" font-weight="900" font-family="Arial,sans-serif" fill="#fff">MTNL</text><path d="M10 20h16v2H10zM10 24h16v2H10zM10 28h16v2H10z" fill="#FFD700" opacity="0.8"/></svg>`,
            };

            // Match carrier name from network_provider
            function getCarrierKey(provider) {
                if (!provider) return null;
                const p = provider.toLowerCase();
                if (p.includes('vi ') || p.includes('vi-') || p === 'vi' || p.includes('vodafone') || p.includes('idea')) return 'vi';
                if (p.includes('jio')) return 'jio';
                if (p.includes('airtel') || p.includes('bharti')) return 'airtel';
                if (p.includes('bsnl')) return 'bsnl';
                if (p.includes('mtnl')) return 'mtnl';
                return null;
            }

            if (gsNet && res.network_provider != null) {
                gsNet.textContent = res.network_provider || '--';
            }
            // Update carrier logo
            if (gsLogo && res.network_provider != null) {
                const key = getCarrierKey(res.network_provider);
                if (key && carrierLogos[key]) {
                    gsLogo.innerHTML = carrierLogos[key];
                } else {
                    gsLogo.innerHTML = '';
                }
            }
            // Network type: 5G, LTE CA, LTE (4G), 3G, 2G
            if (gsType) {
                let type = '';
                const nt = String(res.network_type).toUpperCase();
                if (nt === '20' || nt === '5G' || nt.includes('5G')) {
                    type = '5G';
                } else if (nt === '13' || nt === 'LTE' || nt === 'LTE_CA' || nt.includes('LTE')) {
                    type = (nt === 'LTE_CA' || (res.Lte_ca_status && res.Lte_ca_status !== 'off')) ? 'LTE CA' : '4G';
                } else if (nt === '10' || nt === '3G' || nt.includes('WCDMA') || nt.includes('HSPA')) {
                    type = '3G';
                } else if (nt === '6' || nt === '2G' || nt.includes('GSM') || nt.includes('EDGE')) {
                    type = '2G';
                }
                gsType.textContent = type;
                gsType.style.display = type ? '' : 'none';
                // Color the badge by network type
                if (type === '5G') { gsType.style.background = 'rgba(99,102,241,0.25)'; gsType.style.color = '#818cf8'; }
                else if (type === 'LTE CA') { gsType.style.background = 'rgba(6,182,212,0.2)'; gsType.style.color = '#22d3ee'; }
                else if (type === '4G') { gsType.style.background = 'rgba(52,211,153,0.2)'; gsType.style.color = '#34d399'; }
                else if (type === '3G') { gsType.style.background = 'rgba(251,191,36,0.2)'; gsType.style.color = '#fbbf24'; }
                else if (type === '2G') { gsType.style.background = 'rgba(251,146,60,0.2)'; gsType.style.color = '#fb923c'; }
                else { gsType.style.background = 'rgba(255,255,255,0.1)'; gsType.style.color = 'inherit'; }
            }
            if (gsSig) {
                const sig = res.rssi != null ? Number(res.rssi) : (res.network_signalbar != null ? Number(res.network_signalbar) : -1);
                const bars = gsSig.querySelectorAll('.gs-bar');
                const activeBars = sig <= 0 ? 0 : sig === 1 ? 1 : sig === 2 ? 2 : sig <= 4 ? 3 : 4;
                const dataOn = res.ppp_status && res.ppp_status.includes('connected');
                gsSig.classList.toggle('data-off', !dataOn);
                bars.forEach((bar, i) => {
                    bar.classList.toggle('active', i < activeBars);
                });
            }
            if (gsWifi && res.wifi_access_sta_num != null) {
                gsWifi.textContent = res.wifi_access_sta_num;
            }
            if (gsWifiIcon) {
                gsWifiIcon.classList.toggle('has-clients', res.wifi_access_sta_num != null && Number(res.wifi_access_sta_num) > 0);
            }

            // Poll LAN station count (piggyback on main poll cycle)
            if (gsLan) {
                (async () => {
                    try {
                        const lanData = await getData(new URLSearchParams({ cmd: 'lan_station_list' }));
                        const count = lanData.lan_station_list ? lanData.lan_station_list.length : 0;
                        gsLan.textContent = count;
                        if (gsLanIcon) gsLanIcon.classList.toggle('has-clients', count > 0);
                    } catch(e) { /* silent */ }
                })();
            }
        })();

        const hasMetricValue = (value) => {
            if (value == null) return false;
            const text = String(value).trim();
            return text !== '' && text !== '--' && text.toLowerCase() !== 'nan';
        };
        const pickMetricNumber = (...values) => {
            for (const value of values) {
                if (!hasMetricValue(value)) continue;
                const parsed = Number.parseFloat(value);
                if (Number.isFinite(parsed)) return parsed;
            }
            return null;
        };
        const pickMetricText = (...values) => {
            for (const value of values) {
                if (hasMetricValue(value)) return value;
            }
            return '--';
        };

        // Update signal history chart
        if (typeof updateSignalChart === 'function') {
            const rsrp = pickMetricNumber(res.Z5g_rsrp, res.lte_rsrp);
            const sinr = pickMetricNumber(res.Nr_snr, res.Lte_snr);
            const rsrq = pickMetricNumber(res.nr_rsrq, res.lte_rsrq);
            const rssi = pickMetricNumber(res.nr_rssi, res.lte_rssi, res.network_rssi);
            updateSignalChart(rsrp, sinr, rsrq, rssi);
        }

        // Update cell info strip (Band / EARFCN / BW / PCI / Cell ID)
        {
            const hasNrData = [res.Nr_bands, res.Nr_fcn, res.Nr_pci, res.Z5g_rsrp, res.Nr_snr, res.nr_rsrq]
                .some(hasMetricValue);
            const is5g = hasNrData || res.network_type === '20' || String(res.network_type || '').toUpperCase().includes('5G');
            const band  = is5g
                ? (hasMetricValue(res.Nr_bands) ? 'N' + res.Nr_bands : (hasMetricValue(res.Lte_bands) ? 'B' + res.Lte_bands : '--'))
                : (hasMetricValue(res.Lte_bands) ? 'B' + res.Lte_bands : '--');
            const freq  = is5g ? pickMetricText(res.Nr_fcn, res.Lte_fcn) : pickMetricText(res.Lte_fcn, res.Nr_fcn);
            const bw    = is5g ? pickMetricText(res.Nr_bands_widths, res.Lte_bands_widths) : pickMetricText(res.Lte_bands_widths, res.Nr_bands_widths);
            const pci   = is5g ? pickMetricText(res.Nr_pci, res.Lte_pci) : pickMetricText(res.Lte_pci, res.Nr_pci);
            const cellId = is5g ? pickMetricText(res.Nr_cell_id, res.Lte_cell_id) : pickMetricText(res.Lte_cell_id, res.Nr_cell_id);

            const elBand = document.getElementById('ci-band');
            const elFreq = document.getElementById('ci-freq');
            const elBw   = document.getElementById('ci-bw');
            const elPci  = document.getElementById('ci-pci');
            const elCell = document.getElementById('ci-cellid');
            const elFreqLabel = elFreq?.previousElementSibling;

            if (elBand)  elBand.textContent  = band;
            if (elFreq)  elFreq.textContent  = freq;
            if (elBw)    elBw.textContent    = bw;
            if (elPci)   elPci.textContent   = pci;
            if (elCell)  elCell.textContent  = cellId;
            if (elFreqLabel) elFreqLabel.textContent = is5g ? 'ARFCN' : 'EARFCN';

            // QCI / DL / UL from window.QORS_MESSAGE (skip if dash-charts poller is handling it)
            if (!window._qosFromDashCharts) {
                const elQci = document.getElementById('ci-qci');
                const elDl  = document.getElementById('ci-dl');
                const elUl  = document.getElementById('ci-ul');
                if (window.QORS_MESSAGE) {
                    const qm = window.QORS_MESSAGE.match(/QCI[：:]\s*(\d+)/);
                    const dlm = window.QORS_MESSAGE.match(/⬇️\s*([\d.]+\s*Mbps)/);
                    const ulm = window.QORS_MESSAGE.match(/⬆️\s*([\d.]+\s*Mbps)/);
                    if (elQci) elQci.textContent = qm ? qm[1] : '--';
                    if (elDl)  elDl.textContent  = dlm ? dlm[1] : '--';
                    if (elUl)  elUl.textContent  = ulm ? ulm[1] : '--';
                } else {
                    if (elQci) elQci.textContent = '--';
                    if (elDl)  elDl.textContent  = '--';
                    if (elUl)  elUl.textContent  = '--';
                }
            }

            // Update Current Cell box (progress bar style)
            const ccBand = document.getElementById('cc-band');
            const ccFreq = document.getElementById('cc-freq');
            if (ccBand) ccBand.textContent = band;
            if (ccFreq) ccFreq.textContent = freq;

            const ccRsrp = document.getElementById('cc-rsrp');
            const ccSinr = document.getElementById('cc-sinr');
            const ccRsrq = document.getElementById('cc-rsrq');
            const ccRsrpFill = document.getElementById('cc-rsrp-fill');
            const ccSinrFill = document.getElementById('cc-sinr-fill');
            const ccRsrqFill = document.getElementById('cc-rsrq-fill');

            const rsrpVal = pickMetricNumber(res.Z5g_rsrp, res.lte_rsrp);
            const sinrVal = pickMetricNumber(res.Nr_snr, res.Lte_snr);
            const rsrqVal = pickMetricNumber(res.nr_rsrq, res.lte_rsrq);

            // RSRP: -125 to -81 dBm range
            if (ccRsrp) ccRsrp.textContent = rsrpVal != null ? rsrpVal + ' dBm' : '--';
            if (ccRsrpFill) {
                const rsrpPct = rsrpVal != null ? Math.min(100, Math.max(0, ((rsrpVal + 125) / 44) * 100)) : 0;
                ccRsrpFill.style.width = rsrpPct + '%';
                ccRsrpFill.classList.remove('level-strong','level-medium','level-weak');
                if (rsrpVal != null) ccRsrpFill.classList.add(rsrpVal >= -90 ? 'level-strong' : rsrpVal >= -100 ? 'level-medium' : 'level-weak');
            }

            // SINR: -10 to 13 dB range
            if (ccSinr) ccSinr.textContent = sinrVal != null ? sinrVal + ' dB' : '--';
            if (ccSinrFill) {
                const sinrPct = sinrVal != null ? Math.min(100, Math.max(0, ((sinrVal + 10) / 23) * 100)) : 0;
                ccSinrFill.style.width = sinrPct + '%';
                ccSinrFill.classList.remove('level-strong','level-medium','level-weak');
                if (sinrVal != null) ccSinrFill.classList.add(sinrVal >= 13 ? 'level-strong' : sinrVal > 0 ? 'level-medium' : 'level-weak');
            }

            // RSRQ: -20 to -3 dB range
            if (ccRsrq) ccRsrq.textContent = rsrqVal != null ? rsrqVal + ' dB' : '--';
            if (ccRsrqFill) {
                const rsrqPct = rsrqVal != null ? Math.min(100, Math.max(0, ((rsrqVal + 20) / 17) * 100)) : 0;
                ccRsrqFill.style.width = rsrqPct + '%';
                ccRsrqFill.classList.remove('level-strong','level-medium','level-weak');
                if (rsrqVal != null) ccRsrqFill.classList.add(rsrqVal >= -7 ? 'level-strong' : rsrqVal >= -12 ? 'level-medium' : 'level-weak');
            }

            // RSSI: -110 to -25 dBm range
            const ccRssi = document.getElementById('cc-rssi');
            const ccRssiFill = document.getElementById('cc-rssi-fill');
            const rssiVal = pickMetricNumber(res.nr_rssi, res.lte_rssi, res.network_rssi);
            if (ccRssi) ccRssi.textContent = rssiVal != null ? rssiVal + ' dBm' : '--';
            if (ccRssiFill) {
                const rssiPct = rssiVal != null ? Math.min(100, Math.max(0, ((rssiVal + 110) / 85) * 100)) : 0;
                ccRssiFill.style.width = rssiPct + '%';
                ccRssiFill.classList.remove('level-strong','level-medium','level-weak');
                if (rssiVal != null) ccRssiFill.classList.add(rssiVal >= -65 ? 'level-strong' : rssiVal >= -85 ? 'level-medium' : 'level-weak');
            }
        }

        // Update row 5 cards (Battery, Data Usage, Storage)
        if (typeof updateBatteryCard === 'function') updateBatteryCard(res);
        if (typeof updateDataCard === 'function') updateDataCard(res);
        if (typeof updateStorageCard === 'function') updateStorageCard(res);

        // Update row 7 device info
        if (typeof updateDeviceInfo === 'function') updateDeviceInfo(res);

        try { adbQuery() } catch(e) {}
        isNotLoginOnce = false
        let html = ''

        try {
            if (window.QORS_MESSAGE) {
                res['QORS_MESSAGE'] = window.QORS_MESSAGE
            }
            const unreadEl = document.querySelector('#UNREAD_SMS')
            if (res.sms_unread_num && res.sms_unread_num > 0) {
                unreadEl.style.display = ''
                unreadEl.innerHTML = res.sms_unread_num > 99 ? '99+' : res.sms_unread_num
            } else {
                unreadEl.innerHTML = ''
                unreadEl.style.display = 'none'
            }
        } catch { }

        let statusHtml_base = {
            QORS_MESSAGE: `${window.notNullOrundefinedOrIsShow(res, "QORS_MESSAGE") ? `<strong onclick="copyText(event)"  class="green">${window.QORS_MESSAGE}</strong>` : ''}`,
            network_type: `${window.notNullOrundefinedOrIsShow(res, 'network_type') ? `<strong onclick="copyText(event)"  class="green">${t('network_status')}：${res.network_provider} ${res.network_type == '20' ? '5G' : res.network_type == '13' ? '4G' : res.network_type}</strong>` : ''}`,
            wifi_access_sta_num: `${window.notNullOrundefinedOrIsShow(res, 'wifi_access_sta_num') ? `<strong onclick="copyText(event)"  class="blue">${t('wifi_client_num')}：${res.wifi_access_sta_num}</strong>` : ''}`,
            battery: `${window.notNullOrundefinedOrIsShow(res, 'battery') && window.hasBatteryData(res) ? `<strong onclick="copyText(event)"  class="green">${res.battery_charging == "1" ? `${t('charging')}` : `${t('battery_level')}`}：${hotbox_parseSignalBar(res.battery, 1, 100, 50, 10, undefined, " %")}</strong>` : ''}`,
            rssi: `${window.notNullOrundefinedOrIsShow(res, 'rssi') || window.notNullOrundefinedOrIsShow(res, 'network_signalbar', true) ? `<strong onclick="copyText(event)"  class="green">${t('rssi')}：${hotbox_getSignalEmoji(window.notNullOrundefinedOrIsShow(res, 'rssi') ? res.rssi : res.network_signalbar)}</strong>` : ''}`,
            cpu_temp: `${window.notNullOrundefinedOrIsShow(res, 'cpu_temp') ? `<strong onclick="copyText(event)"  class="blue">${t('cpu_temp')}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_temp / 1000).toFixed(2)).padStart(5, ' ')} ℃</span></strong>` : ''}`,
            cpu_usage: `${window.notNullOrundefinedOrIsShow(res, 'cpu_usage') ? `<strong onclick="copyText(event)"  class="blue">${t('cpu_usage')}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.cpu_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
            mem_usage: `${window.notNullOrundefinedOrIsShow(res, 'mem_usage') ? `<strong onclick="copyText(event)"  class="blue">${t("ram_usage")}：<span style="text-align:center;display:inline-block;width: 8ch;">${String(Number(res.mem_usage).toFixed(2)).padStart(5, ' ')} %</span></strong>` : ''}`,
            realtime_time: `${window.notNullOrundefinedOrIsShow(res, 'realtime_time') ? `<strong onclick="copyText(event)"  class="blue">${t('link_realtime')}：${hotbox_formatTime(Number(res.realtime_time))}${res.monthly_time ? `&nbsp;<span style="color:white">/</span>&nbsp;${t('total_link_time')}: ` + hotbox_formatTime(Number(res.monthly_time)) : ''}</strong>` : ''}`,
            monthly_tx_bytes: `${window.notNullOrundefinedOrIsShow(res, 'monthly_tx_bytes') || window.notNullOrundefinedOrIsShow(res, 'monthly_rx_bytes') ? `<strong onclick="copyText(event)"  class="blue">${t("monthly_rx_bytes")}：<span class="red">${formatBytes(Number(res.monthly_tx_bytes || 0) + Number(res.monthly_rx_bytes || 0))}</span>${(res.data_volume_limit_size || res.flux_data_volume_limit_size) && (res.flux_data_volume_limit_switch == '1' || res.data_volume_limit_switch == '1') ? `&nbsp;<span style="color:white">/</span>&nbsp;${t('total_limit_bytes')}：` + formatBytes((() => {
                const limit_size = res.data_volume_limit_size ? res.data_volume_limit_size : res.flux_data_volume_limit_size
                if (!limit_size) return ''
                return limit_size.split('_')[0] * limit_size.split('_')[1] * Math.pow(1024, 2)
            })()) : ''}</strong>` : ''}`,
            daily_data: `${window.notNullOrundefinedOrIsShow(res, 'daily_data') ? `<strong onclick="copyText(event)"  class="blue">${t('daily_data')}：${formatBytes(res.daily_data)}${res.monthly_data ? ` / ${t('monthly_data')}：${formatBytes(res.monthly_data)}` : ''}</strong>` : ''}`,
            current_now: `${window.notNullOrundefinedOrIsShow(res, 'current_now') && window.hasBatteryData(res) ? `<strong onclick="copyText(event)"  class="blue">${t('battery_current')}：<span style="width: 9ch;text-align:center">${res.current_now / 1000} mA</span></strong>` : ''}`,
            voltage_now: `${window.notNullOrundefinedOrIsShow(res, 'voltage_now') && window.hasBatteryData(res) ? `<strong onclick="copyText(event)"  class="blue">${t('battery_voltage')}：${(res.voltage_now / 1000000).toFixed(3)} V</strong>` : ''}`,
            realtime_rx_thrpt: `${window.notNullOrundefinedOrIsShow(res, 'realtime_tx_thrpt') || window.notNullOrundefinedOrIsShow(res, 'realtime_rx_thrpt') ? `<strong onclick="copyText(event)" class="blue">${t("current_network_speed")}: <span style="text-align:center;white-space:nowrap;overflow:hidden;display:inline-block;width: 14ch;">⬇️&nbsp;${formatBytes(Number((res.realtime_rx_thrpt)))}/S</span><span style="white-space:nowrap;overflow:hidden;text-align:center;display:inline-block;width: 14ch;font-weight:bolder">⬆️&nbsp;${formatBytes(Number((res.realtime_tx_thrpt)))}/S</span></strong>` : ''}`,
        }
        let statusHtml_net = {
            lte_rsrp: window.notNullOrundefinedOrIsShow(res, 'lte_rsrp') ? `<strong onclick="copyText(event)" class="green">${t('4g_rsrp')}：${hotbox_parseSignalBar(res.lte_rsrp)}</strong>` : '',
            Lte_snr: window.notNullOrundefinedOrIsShow(res, 'Lte_snr') ? `<strong onclick="copyText(event)" class="blue">${t('4g_sinr')}：${hotbox_parseSignalBar(res.Lte_snr, -10, 30, 13, 0)}</strong>` : '',
            Lte_bands: window.notNullOrundefinedOrIsShow(res, 'Lte_bands') ? `<strong onclick="copyText(event)" class="blue">${t('4g_band')}：B${res.Lte_bands}</strong>` : '',
            Lte_fcn: window.notNullOrundefinedOrIsShow(res, 'Lte_fcn') ? `<strong onclick="copyText(event)" class="green">${t('4g_freq')}：${res.Lte_fcn}</strong>` : '',
            Lte_bands_widths: window.notNullOrundefinedOrIsShow(res, 'Lte_bands_widths') ? `<strong onclick="copyText(event)" class="green">${t('4g_bandwidth')}：${res.Lte_bands_widths}</strong>` : '',
            Lte_pci: window.notNullOrundefinedOrIsShow(res, 'Lte_pci') ? `<strong onclick="copyText(event)" class="blue">${t('4g_pci')}：${res.Lte_pci}</strong>` : '',
            lte_rsrq: window.notNullOrundefinedOrIsShow(res, 'lte_rsrq') ? `<strong onclick="copyText(event)" class="blue">${t('4g_rsrq')}：${hotbox_parseSignalBar(res.lte_rsrq, -20, -3, -9, -12)}</strong>` : '',
            lte_rssi: window.notNullOrundefinedOrIsShow(res, 'lte_rssi') ? `<strong onclick="copyText(event)" class="green">${t('4g_rssi')}：${res.lte_rssi}</strong>` : '',
            Lte_cell_id: window.notNullOrundefinedOrIsShow(res, 'Lte_cell_id') ? `<strong onclick="copyText(event)" class="green">${t('4g_cell_id')}：${res.Lte_cell_id}</strong>` : '',

            Z5g_rsrp: window.notNullOrundefinedOrIsShow(res, 'Z5g_rsrp') ? `<strong onclick="copyText(event)" class="green">${t('5g_rsrp')}：${hotbox_parseSignalBar(res.Z5g_rsrp)}</strong>` : '',
            Nr_snr: window.notNullOrundefinedOrIsShow(res, 'Nr_snr') ? `<strong onclick="copyText(event)" class="green">${t('5g_sinr')}：${hotbox_parseSignalBar(res.Nr_snr, -10, 30, 13, 0)}</strong>` : '',
            Nr_bands: window.notNullOrundefinedOrIsShow(res, 'Nr_bands') ? `<strong onclick="copyText(event)" class="green">${t('5g_band')}：N${res.Nr_bands}</strong>` : '',
            Nr_fcn: window.notNullOrundefinedOrIsShow(res, 'Nr_fcn') ? `<strong onclick="copyText(event)" class="blue">${t('5g_freq')}：${res.Nr_fcn}</strong>` : '',
            Nr_bands_widths: window.notNullOrundefinedOrIsShow(res, 'Nr_bands_widths') ? `<strong onclick="copyText(event)" class="blue">${t('5g_bandwidth')}：${res.Nr_bands_widths}</strong>` : '',
            Nr_pci: window.notNullOrundefinedOrIsShow(res, 'Nr_pci') ? `<strong onclick="copyText(event)" class="green">${t('5g_pci')}：${res.Nr_pci}</strong>` : '',
            nr_rsrq: window.notNullOrundefinedOrIsShow(res, 'nr_rsrq') ? `<strong onclick="copyText(event)" class="green">${t('5g_rsrq')}：${hotbox_parseSignalBar(res.nr_rsrq, -20, -3, -9, -12)}</strong>` : '',
            nr_rssi: window.notNullOrundefinedOrIsShow(res, 'nr_rssi') ? `<strong onclick="copyText(event)" class="blue">${t('5g_rssi')}：${res.nr_rssi}</strong>` : '',
            Nr_cell_id: window.notNullOrundefinedOrIsShow(res, 'Nr_cell_id') ? `<strong onclick="copyText(event)" class="blue">${t('5g_cell_id')}：${res.Nr_cell_id}</strong>` : '',
        };

        let statusHtml_other = {
            client_ip: window.notNullOrundefinedOrIsShow(res, 'client_ip') ? `<strong onclick="copyText(event)" class="blue">${t('client_ip')}：${res.client_ip}</strong>` : '',
            model: window.notNullOrundefinedOrIsShow(res, 'model') ? `<strong onclick="copyText(event)" class="blue">${t('device_model')}：${res.model}</strong>` : '',
            cr_version: window.notNullOrundefinedOrIsShow(res, 'cr_version') ? `<strong onclick="copyText(event)" class="blue">${t('version')}：${res.cr_version}</strong>` : '',
            iccid: window.notNullOrundefinedOrIsShow(res, 'iccid') ? `<strong onclick="copyText(event)" class="blue">ICCID：${res.iccid}</strong>` : '',
            imei: window.notNullOrundefinedOrIsShow(res, 'imei') ? `<strong onclick="copyText(event)" class="blue">IMEI：${res.imei}</strong>` : '',
            imsi: window.notNullOrundefinedOrIsShow(res, 'imsi') ? `<strong onclick="copyText(event)" class="blue">IMSI：${res.imsi}</strong>` : '',
            ipv6_wan_ipaddr: window.notNullOrundefinedOrIsShow(res, 'ipv6_wan_ipaddr') ? `<strong onclick="copyText(event)" class="blue">${t('ipv6_addr')}：${res.ipv6_wan_ipaddr}</strong>` : '',
            lan_ipaddr: window.notNullOrundefinedOrIsShow(res, 'lan_ipaddr') ? `<strong onclick="copyText(event)" class="blue">${t('lan_gateway')}：${res.lan_ipaddr}</strong>` : '',
            mac_address: window.notNullOrundefinedOrIsShow(res, 'mac_address') ? `<strong onclick="copyText(event)" class="blue">MAC：${res.mac_address}</strong>` : '',
            msisdn: window.notNullOrundefinedOrIsShow(res, 'msisdn') ? `<strong onclick="copyText(event)" class="blue">${t('msisdn')}：${res.msisdn}</strong>` : '',
            internal_available_storage: (window.notNullOrundefinedOrIsShow(res, 'internal_available_storage') || window.notNullOrundefinedOrIsShow(res, 'internal_total_storage')) ? `<strong onclick="copyText(event)" class="blue">${t('internal_storage')}：${formatBytes(res.internal_used_storage)} ${t('used_storage')} / ${formatBytes(res.internal_total_storage)} ${t('total_storage')}</strong>` : '',
            external_available_storage: (window.notNullOrundefinedOrIsShow(res, 'external_available_storage') || window.notNullOrundefinedOrIsShow(res, 'external_total_storage')) ? `<strong onclick="copyText(event)" class="blue">${t('sd_storage')}：${formatBytes(res.external_used_storage)} ${t('used_storage')} / ${formatBytes(res.external_total_storage)} ${t('total_storage')}</strong>` : '',
        };

        const _gsHidden = ['network_type', 'wifi_access_sta_num', 'rssi', 'cpu_temp', 'cpu_usage', 'mem_usage', 'realtime_rx_thrpt', 'QORS_MESSAGE', 'battery', 'current_now', 'voltage_now', 'monthly_tx_bytes', 'daily_data', 'realtime_time'];
        html += `<li style="padding-top: 15px;"><p>`
        window._showList.statusShowList.forEach(item => {
            if (statusHtml_base[item.name] && item.isShow && !_gsHidden.includes(item.name)) {
                html += statusHtml_base[item.name]
            }
        })
        html += `</p></li>`
        html += `<div class="title" style="margin: 6px 0;"><b>${t('signal_params')}</b></div>`

        html += `<li style="padding-top: 15px;"><p>`
        window._showList.signalShowList.forEach(item => {
            if (statusHtml_net[item.name] && item.isShow) {
                html += statusHtml_net[item.name]
            }
        })
        html += `</p></li>`
        html += `<div class="title" style="margin: 6px 0;"><b>${t('device_props')}</b></div>`

        html += `<li style="padding-top: 15px;"><p>`
        window._showList.propsShowList.forEach(item => {
            if (statusHtml_other[item.name] && item.isShow) {
                html += statusHtml_other[item.name]
            }
        })
        html += `</p></li>`
        status && (status.innerHTML = html)
    }
}
handlerStatusRender(true)
window.startRefresh()

// Check performance mode status
let handlerPerformaceStatus = async () => {
    const btn = document.querySelector('#PERF')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    let res = await getData(new URLSearchParams({
        cmd: 'performance_mode'
    }))
    btn.style.backgroundColor = res.performance_mode == '1' ? 'var(--dark-btn-color-active)' : ''
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
            let res1 = await (await postData(cookie, {
                goformId: 'PERFORMANCE_MODE_SETTING',
                performance_mode: res.performance_mode == '1' ? '0' : '1'
            })).json()
            if (res1.result == 'success') {
                createToast(t('toast_oprate_success_reboot'), 'green')
                await handlerPerformaceStatus()
            } else {
                createToast(t('toast_oprate_failed'), 'red')
            }
        } catch (e) {
            // createToast(e.message)
        }
    }
}
handlerPerformaceStatus()

    // Register on window
    window.handlerStatusRender = handlerStatusRender;
    window.handlerPerformaceStatus = handlerPerformaceStatus;
    window.queryImeiFromDIAG = queryImeiFromDIAG;
    window.resetDiagImeiCache = resetDiagImeiCache;
})();
