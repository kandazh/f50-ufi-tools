/* ==========================================================
   Dashboard Live Tracking Charts
   Gradient-filled line charts for Temperature, CPU, Memory,
   and individual per-core usage. Hooks into UFI_DATA proxy.
   ========================================================== */
(() => {
    const HISTORY = 40;
    const _baseURL = (typeof HOTBOX_baseURL !== 'undefined') ? HOTBOX_baseURL : '/api';

    // Color palette
    const colors = {
        amber: { line: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)' },
        blue:  { line: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
        green: { line: '#34d399', fill: 'rgba(52, 211, 153, 0.12)' },
        core: [
            { line: '#38bdf8', fill: 'rgba(56, 189, 248, 0.12)' },
            { line: '#a78bfa', fill: 'rgba(167, 139, 250, 0.12)' },
            { line: '#34d399', fill: 'rgba(52, 211, 153, 0.12)' },
            { line: '#f472b6', fill: 'rgba(244, 114, 182, 0.12)' },
            { line: '#fb923c', fill: 'rgba(251, 146, 60, 0.12)' },
            { line: '#fbbf24', fill: 'rgba(251, 191, 36, 0.12)' },
            { line: '#2dd4bf', fill: 'rgba(45, 212, 191, 0.12)' },
            { line: '#f87171', fill: 'rgba(248, 113, 113, 0.12)' }
        ]
    };

    function makeGradient(ctx, canvas, color) {
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, color.fill.replace('0.12', '0.22'));
        g.addColorStop(0.5, color.fill);
        g.addColorStop(1, 'transparent');
        return g;
    }

    function buildLineChart(canvasId, color, yMax, yMin, unit) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const labels = Array(HISTORY).fill('');
        const data = Array(HISTORY).fill(null);
        const gradient = makeGradient(ctx, canvas, color);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: color.line,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: color.line,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.9)',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 8,
                        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
                        displayColors: false,
                        callbacks: {
                            title: () => '',
                            label: (c) => c.raw != null ? c.raw.toFixed(1) + unit : '--'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                        ticks: { display: false },
                        border: { display: false }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                        ticks: {
                            color: 'rgba(255,255,255,0.3)',
                            font: { size: 9, family: "'JetBrains Mono', monospace" },
                            maxTicksLimit: 3,
                            padding: 2,
                            mirror: true,
                            callback: (v) => v + unit + ' '
                        },
                        border: { display: false },
                        suggestedMax: yMax,
                        suggestedMin: yMin
                    }
                }
            }
        });

        return { chart, labels, data };
    }

    function pushValue(obj, value) {
        if (!obj) return;
        obj.labels.push('');
        obj.data.push(value);
        if (obj.labels.length > HISTORY) obj.labels.shift();
        if (obj.data.length > HISTORY) obj.data.shift();
        obj.chart.update('none');
    }

    // Color palette addition
    colors.pink = { line: '#34d399', fill: 'rgba(52, 211, 153, 0.12)' };
    const ulLineColor = { line: '#fb923c', fill: 'rgba(251, 146, 60, 0.12)' };

    function formatSpeed(bytes) {
        if (bytes == null) return '--';
        bytes = Number(bytes);
        if (isNaN(bytes)) return '--';
        if (bytes < 1024) return bytes.toFixed(0) + ' B/s';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB/s';
        return (bytes / 1048576).toFixed(2) + ' MB/s';
    }

    // Main charts
    const tempChart = buildLineChart('dashTempChart', colors.amber, 80, 30, '°C');
    const cpuChart  = buildLineChart('dashCpuChart', colors.blue, 100, 0, '%');
    const memChart  = buildLineChart('dashMemChart', colors.green, 100, 0, '%');

    // Dual-line network chart (download + upload)
    const netChart = (() => {
        const canvas = document.getElementById('dashNetChart');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const labels = Array(HISTORY).fill('');
        const dlData = Array(HISTORY).fill(null);
        const ulData = Array(HISTORY).fill(null);
        const dlGrad = makeGradient(ctx, canvas, colors.pink);
        const ulGrad = makeGradient(ctx, canvas, ulLineColor);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '\u2193 DL',
                    data: dlData,
                    borderColor: colors.pink.line,
                    backgroundColor: dlGrad,
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: colors.pink.line,
                    fill: true
                }, {
                    label: '\u2191 UL',
                    data: ulData,
                    borderColor: ulLineColor.line,
                    backgroundColor: ulGrad,
                    borderWidth: 1.5,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointHoverBackgroundColor: ulLineColor.line,
                    fill: true,
                    borderDash: [4, 3]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.9)',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 8,
                        bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
                        displayColors: true,
                        callbacks: {
                            title: () => '',
                            label: (c) => c.dataset.label + ' ' + (c.raw != null ? c.raw.toFixed(1) + ' KB/s' : '--')
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                        ticks: { display: false },
                        border: { display: false }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                        ticks: {
                            color: 'rgba(255,255,255,0.3)',
                            font: { size: 9, family: "'JetBrains Mono', monospace" },
                            maxTicksLimit: 3,
                            padding: 2,
                            mirror: true,
                            callback: (v) => v + ' KB/s '
                        },
                        border: { display: false },
                        suggestedMax: 100,
                        suggestedMin: 0
                    }
                }
            }
        });

        return { chart, labels, dlData, ulData };
    })();

    // Mini chart builder for per-core (no axis labels, compact)
    function buildMiniChart(canvasId, color, showY) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const labels = Array(HISTORY).fill('');
        const data = Array(HISTORY).fill(null);
        const gradient = makeGradient(ctx, canvas, color);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor: color.line,
                    backgroundColor: gradient,
                    borderWidth: 1.5,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHitRadius: 8,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false }, tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(ctx) { return ctx.raw != null ? ctx.raw + '%' : ''; },
                        title: function() { return ''; }
                    },
                    displayColors: false,
                    bodyFont: { size: 11 }
                } },
                scales: {
                    x: { display: false },
                    y: {
                        display: true,
                        min: 0,
                        max: 100,
                        ticks: {
                            stepSize: 30,
                            callback: function(v) {
                                if (!showY) return '';
                                if (v === 30 || v === 60) return v + '%';
                                return '';
                            },
                            font: { size: 8 },
                            color: 'rgba(255,255,255,0.35)',
                            padding: 2
                        },
                        grid: {
                            color: function(ctx) {
                                if (ctx.tick.value === 30 || ctx.tick.value === 60)
                                    return 'rgba(255,255,255,0.08)';
                                return 'transparent';
                            },
                            drawBorder: false
                        },
                        border: { display: false }
                    }
                }
            }
        });
        return { chart, labels, data };
    }

    // Per-core charts (8 max)
    const coreCharts = [];
    const coreLives  = [];
    for (let i = 0; i < 8; i++) {
        coreCharts[i] = buildMiniChart('dashCore' + i + 'Chart', colors.core[i], i === 0);
        coreLives[i]  = document.getElementById('chart-core' + i + '-live');
    }

    const tempLive = document.getElementById('chart-temp-live');
    const cpuLive  = document.getElementById('chart-cpu-live');
    const memLive  = document.getElementById('chart-mem-live');
    const netLive  = document.getElementById('chart-net-live');

    let coresDetected = false;

    function updateCoreCharts(value) {
        for (let i = 0; i < 8; i++) {
            const v = value['cpu' + i];
            const card = document.getElementById('core-chart-' + i);
            if (v !== undefined && v !== null) {
                const num = Number(v);
                if (!isNaN(num)) {
                    pushValue(coreCharts[i], Math.round(num));
                    if (coreLives[i]) coreLives[i].textContent = Math.round(num) + '%';
                    if (card) card.style.display = '';
                }
            } else if (!coresDetected && card) {
                card.style.display = 'none';
            }
        }
        coresDetected = true;
    }

    // Frequency label elements
    const coreFreqs = [];
    for (let i = 0; i < 8; i++) {
        coreFreqs[i] = document.getElementById('core-freq-' + i);
    }

    function updateCoreFreqs(value) {
        for (let i = 0; i < 8; i++) {
            if (value['cpu' + i] && coreFreqs[i]) {
                const cur = value['cpu' + i].cur;
                if (cur != null) coreFreqs[i].textContent = cur + ' MHz';
                // Update core label with cluster prefix (L/M/B)
                // Use textNode update to avoid destroying the live % span reference
                const cluster = value['cpu' + i].cluster;
                if (cluster) {
                    const labelEl = document.querySelector('#core-chart-' + i + ' .core-label');
                    if (labelEl) {
                        const first = labelEl.firstChild;
                        if (first && first.nodeType === Node.TEXT_NODE) {
                            first.textContent = cluster + i + ' ';
                        }
                    }
                }
            }
        }
    }

    // Wrap UFI_DATA proxy
    const innerTarget = window.UFI_DATA;
    window.UFI_DATA = new Proxy(innerTarget, {
        set(target, prop, value) {
            target[prop] = value;
            switch (prop) {
                case 'cpu_temp':
                    if (value != null) {
                        const t = Number(value / 1000).toFixed(1);
                        pushValue(tempChart, parseFloat(t));
                        if (tempLive) tempLive.textContent = t + '°C';
                    }
                    break;
                case 'cpu_usage':
                    if (value != null) {
                        pushValue(cpuChart, parseFloat(value));
                        if (cpuLive) cpuLive.textContent = parseFloat(value).toFixed(1) + '%';
                    }
                    break;
                case 'mem_usage':
                    if (value != null) {
                        pushValue(memChart, parseFloat(value));
                        if (memLive) memLive.textContent = parseFloat(value).toFixed(1) + '%';
                    }
                    break;
                case 'cpuUsageInfo':
                    if (value != null) updateCoreCharts(value);
                    break;
                case 'cpuFreqInfo':
                    if (value != null) updateCoreFreqs(value);
                    break;
                case 'realtime_rx_thrpt':
                    if (value != null && netChart) {
                        const dlKb = value / 1024;
                        const ulKb = (target.realtime_tx_thrpt || 0) / 1024;
                        netChart.labels.push('');
                        netChart.dlData.push(parseFloat(dlKb.toFixed(1)));
                        netChart.ulData.push(parseFloat(ulKb.toFixed(1)));
                        if (netChart.labels.length > HISTORY) netChart.labels.shift();
                        if (netChart.dlData.length > HISTORY) netChart.dlData.shift();
                        if (netChart.ulData.length > HISTORY) netChart.ulData.shift();
                        netChart.chart.update('none');
                        if (netLive) netLive.innerHTML =
                            '<span class="net-badge net-dl"><span class="net-icon">\u2193</span><span class="net-val">' + formatSpeed(value) + '</span></span>' +
                            '<span class="net-badge net-ul"><span class="net-icon">\u2191</span><span class="net-val">' + formatSpeed(target.realtime_tx_thrpt) + '</span></span>';
                    }
                    break;
                case 'memInfo':
                    if (value != null) updateRamCard(value);
                    break;
                case 'cpu_temp_list':
                    if (value != null) updateTempCard(value);
                    break;
            }
            return true;
        },
        get(target, prop) {
            return target[prop];
        }
    });

    /* ========== Info Detail Cards ========== */

    function fmtBytes(kb) {
        const b = kb * 1024;
        if (b < 1048576) return (b / 1024).toFixed(2) + ' KB';
        if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
        return (b / 1073741824).toFixed(2) + ' GB';
    }

    // --- RAM Donut ---
    // Center text plugin for doughnut
    const centerTexts = new Map();
    const centerTextPlugin = {
        id: 'doughnutCenterText',
        afterDraw(chart) {
            const txt = centerTexts.get(chart);
            if (!txt || !txt.text) return;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            ctx.save();
            ctx.font = 'bold ' + (txt.size || 11) + 'px JetBrains Mono, monospace';
            ctx.fillStyle = txt.color || '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(txt.text, cx, cy);
            ctx.restore();
        }
    };

    const ramDonut = (() => {
        const canvas = document.getElementById('dashRamDonut');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Used', 'Available'],
                datasets: [
                    {
                        label: 'RAM',
                        data: [0, 100],
                        backgroundColor: ['#34d399', 'rgba(52,211,153,0.15)'],
                        borderWidth: 0,
                        hoverOffset: 0
                    },
                    {
                        label: 'SWAP',
                        data: [0, 100],
                        backgroundColor: ['#fb923c', 'rgba(251,146,60,0.15)'],
                        borderWidth: 0,
                        hoverOffset: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: () => '',
                            label: (c) => c.dataset.label + ' ' + c.label + ': ' + c.raw + '%'
                        }
                    }
                }
            },
            plugins: [centerTextPlugin]
        });
        centerTexts.set(chart, { text: '0%', color: '#34d399', size: 11 });
        return chart;
    })();

    function updateRamCard(v) {
        const used = Math.round(v.mem_usage_percent);
        const free = 100 - used;
        const swapUsed = Math.round(v.swap_usage_percent);
        const swapFree = 100 - swapUsed;
        const combinedTotal = Number(v.swap_total_kb || 0);
        const combinedUsed = Number(v.swap_used_kb || 0);
        const zramTotal = Number(v.zram_total_kb ?? v.swap_total_kb ?? 0);
        const zramUsed = Number(v.zram_used_kb ?? v.swap_used_kb ?? 0);
        const diskSwapTotal = Number(v.disk_swap_total_kb ?? 0);
        const diskSwapUsed = Number(v.disk_swap_used_kb ?? 0);
        const compactSummary = (usedValue, total) => `${fmtBytes(usedValue)} / ${fmtBytes(total)}`;
        if (ramDonut) {
            ramDonut.data.datasets[0].data = [used, free];
            ramDonut.data.datasets[1].data = [swapUsed, swapFree];
            centerTexts.get(ramDonut).text = used + '%';
            ramDonut.update('none');
        }
        const $ = (id) => document.getElementById(id);
        $('dash-ram-total') && ($('dash-ram-total').textContent = fmtBytes(v.mem_total_kb));
        $('dash-ram-avail') && ($('dash-ram-avail').textContent = fmtBytes(v.mem_available_kb));
        $('dash-ram-used') && ($('dash-ram-used').textContent = fmtBytes(v.mem_used_kb) + ' (' + used + '%)');
        $('dash-swap-combined') && ($('dash-swap-combined').textContent = compactSummary(combinedUsed, combinedTotal));
        $('dash-zram-summary') && ($('dash-zram-summary').textContent = compactSummary(zramUsed, zramTotal));
        $('dash-disk-swap-summary') && ($('dash-disk-swap-summary').textContent = diskSwapTotal > 0 ? compactSummary(diskSwapUsed, diskSwapTotal) : 'none');
    }

    // --- Thermal Zones Grid ---
    function updateTempCard(list) {
        const sorted = [...list].sort((a, b) => (a.type || '').localeCompare(b.type || ''));
        const listEl = document.getElementById('dash-temp-list');
        if (!listEl) return;
        listEl.innerHTML = sorted.map(i => {
            const name = (i.type || '').replace(/-thmzone/g, '').toUpperCase();
            const t = (Number(i.temp) / 1000).toFixed(1);
            const color = t < 45 ? '#34d399' : t <= 55 ? '#fbbf24' : '#f87171';
            return '<div class="temp-cell"><span class="info-label">' + name + '</span><span class="info-value" style="color:' + color + '">' + t + ' °C</span></div>';
        }).join('');
    }

    // --- Network Connections Donut ---
    let connDonut = null;
    function updateConnCard(data) {
        const tcp = parseInt(data.tcp) || 0;
        const tcp6 = parseInt(data.tcp6) || 0;
        const udp = parseInt(data.udp) || 0;
        const udp6 = parseInt(data.udp6) || 0;
        const unix = parseInt(data.unix) || 0;
        const tcpActive = parseInt(data.tcp_active) || 0;
        const tcpOther = parseInt(data.tcp_other) || 0;

        if (!connDonut) {
            const canvas = document.getElementById('dashConnDonut');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            connDonut = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['TCP v4', 'TCP v6', 'UDP v4', 'UDP v6', 'UNIX'],
                    datasets: [{
                        data: [tcp, tcp6, udp, udp6, unix],
                        backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'],
                        borderWidth: 0,
                        hoverOffset: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '70%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: () => '',
                                label: (c) => c.label + ': ' + c.raw
                            }
                        }
                    }
                },
                plugins: [centerTextPlugin]
            });
            centerTexts.set(connDonut, { text: String(tcp + tcp6 + udp + udp6 + unix), color: '#94a3b8', size: 11 });
        } else {
            connDonut.data.datasets[0].data = [tcp, tcp6, udp, udp6, unix];
            centerTexts.get(connDonut).text = String(tcp + tcp6 + udp + udp6 + unix);
            connDonut.update('none');
        }

        const $ = (id) => document.getElementById(id);
        $('dash-conn-tcp') && ($('dash-conn-tcp').textContent = tcp);
        $('dash-conn-tcp6') && ($('dash-conn-tcp6').textContent = tcp6);
        $('dash-conn-udp') && ($('dash-conn-udp').textContent = udp);
        $('dash-conn-udp6') && ($('dash-conn-udp6').textContent = udp6);
        $('dash-conn-unix') && ($('dash-conn-unix').textContent = unix);
    }

    // Poll /api/connInfo for network connections
    async function pollConnInfo() {
        try {
            const res = await fetch(_baseURL + '/connInfo');
            const json = await res.json();
            if (json.result === 'success' && json.data) {
                updateConnCard(json.data);
            }
        } catch (e) {}
    }
    pollConnInfo();
    setInterval(pollConnInfo, 15000);

    // --- Battery Gauge ---
    const batteryGauge = (() => {
        const canvas = document.getElementById('dashBatteryGauge');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Level', 'Empty'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#34d399', 'rgba(52,211,153,0.12)'],
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '70%',
                rotation: -90,
                circumference: 180,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin]
        });
        centerTexts.set(chart, { text: '--%', color: '#34d399', size: 12 });
        return chart;
    })();

    window.updateBatteryCard = function(res) {
        const hasBatteryData = res?.has_battery_data === true
            || (res?.battery !== null && res?.battery !== undefined && res?.battery !== '')
            || (res?.current_now !== null && res?.current_now !== undefined)
            || (res?.voltage_now !== null && res?.voltage_now !== undefined);
        const parsedBattery = Number.parseInt(res.battery, 10);
        const bat = Number.isFinite(parsedBattery)
            ? Math.max(0, Math.min(100, parsedBattery))
            : null;
        const chargeState = res.battery_charging === '1'
            ? 'charging'
            : res.battery_charging === '0'
                ? 'discharging'
                : 'unknown';
        const current = res.current_now != null ? (res.current_now / 1000).toFixed(0) + ' mA' : '--';
        const voltage = res.voltage_now != null ? (res.voltage_now / 1000000).toFixed(3) + ' V' : '--';
        const color = bat == null
            ? '#94a3b8'
            : bat > 50
                ? '#34d399'
                : bat > 20
                    ? '#fbbf24'
                    : '#f87171';

        if (batteryGauge) {
            batteryGauge.data.datasets[0].data = bat == null ? [0, 100] : [bat, 100 - bat];
            batteryGauge.data.datasets[0].backgroundColor[0] = color;
            centerTexts.get(batteryGauge).text = bat == null ? '--' : bat + '%';
            centerTexts.get(batteryGauge).color = color;
            batteryGauge.update('none');
        }
        const $ = (id) => document.getElementById(id);
        if ($('dash-bat-level')) $('dash-bat-level').textContent = bat == null ? '--' : bat + '%';
        if ($('dash-bat-status')) {
            $('dash-bat-status').textContent = chargeState === 'charging'
                ? '⚡ Charging'
                : chargeState === 'discharging' && hasBatteryData
                    ? 'Discharging'
                    : '--';
        }
        if ($('dash-bat-current')) $('dash-bat-current').textContent = current;
        if ($('dash-bat-voltage')) $('dash-bat-voltage').textContent = voltage;
    };

    // --- USB Status (shown in Battery card) ---
    async function pollUSBStatus() {
        try {
            const res = await (await fetch(_baseURL + '/usb_status')).json();
            if (!res || !res.details) return;
            const isGadget = res.details.typec_mode === 'gadget';
            const speed = isGadget ? res.details.gadget_speed : formatSpeed(res.maxSpeed);
            const mode = res.details.typec_mode + ' / ' + (isGadget ? 'Device' : 'Host');
            const el = (id) => document.getElementById(id);
            if (el('dash-usb-speed')) el('dash-usb-speed').textContent = speed || '--';
            if (el('dash-usb-mode')) el('dash-usb-mode').textContent = mode || '--';
        } catch (e) { /* silent */ }
    }
    setTimeout(pollUSBStatus, 1500);
    setInterval(pollUSBStatus, 300000);

    // --- Data Usage Donut ---
    const dataDonut = (() => {
        const canvas = document.getElementById('dashDataDonut');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Used', 'Remaining'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#60a5fa', 'rgba(96,165,250,0.12)'],
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin]
        });
        centerTexts.set(chart, { text: '--', color: '#60a5fa', size: 10 });
        return chart;
    })();

    window.updateDataCard = function(res) {
        const used = Number(res.monthly_tx_bytes || 0) + Number(res.monthly_rx_bytes || 0);
        let limitBytes = 0;
        const limitSize = res.data_volume_limit_size || res.flux_data_volume_limit_size;
        const limitOn = res.flux_data_volume_limit_switch == '1' || res.data_volume_limit_switch == '1';
        if (limitSize && limitOn) {
            const parts = limitSize.split('_');
            limitBytes = parts[0] * parts[1] * Math.pow(1024, 2);
        }
        const daily = Number(res.daily_data || 0);
        const connSec = Number(res.realtime_time || 0);

        const pct = limitBytes > 0 ? Math.min(100, Math.round(used / limitBytes * 100)) : 0;
        if (dataDonut) {
            if (limitBytes > 0) {
                dataDonut.data.datasets[0].data = [pct, 100 - pct];
                centerTexts.get(dataDonut).text = pct + '%';
            } else {
                dataDonut.data.datasets[0].data = [1, 0];
                centerTexts.get(dataDonut).text = fmtB(used);
            }
            dataDonut.update('none');
        }

        const $ = (id) => document.getElementById(id);
        if ($('dash-data-used')) $('dash-data-used').textContent = fmtB(used);
        if ($('dash-data-limit')) $('dash-data-limit').textContent = limitBytes > 0 ? fmtB(limitBytes) : 'No Limit';
        if ($('dash-data-daily')) $('dash-data-daily').textContent = fmtB(daily);
        if ($('dash-data-time')) {
            const h = (connSec / 3600).toFixed(1);
            const totalH = res.monthly_time ? (Number(res.monthly_time) / 3600).toFixed(1) : null;
            $('dash-data-time').textContent = h + 'h' + (totalH ? ' / ' + totalH + 'h' : '');
        }
    };

    function fmtB(bytes) {
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
        return (bytes / 1073741824).toFixed(2) + ' GB';
    }

    // --- Storage Donut ---
    const storageDonut = (() => {
        const canvas = document.getElementById('dashStorageDonut');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Internal Used', 'Internal Free', 'SD Used', 'SD Free'],
                datasets: [
                    {
                        label: 'Internal',
                        data: [0, 100],
                        backgroundColor: ['#fb923c', 'rgba(251,146,60,0.12)'],
                        borderWidth: 0,
                        hoverOffset: 0
                    },
                    {
                        label: 'SD',
                        data: [0, 100],
                        backgroundColor: ['#a78bfa', 'rgba(167,139,250,0.12)'],
                        borderWidth: 0,
                        hoverOffset: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '55%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [centerTextPlugin]
        });
        centerTexts.set(chart, { text: '--', color: '#fb923c', size: 10 });
        return chart;
    })();

    window.updateStorageCard = function(res) {
        const intUsed = Number(res.internal_used_storage || 0);
        const intTotal = Number(res.internal_total_storage || 0);
        const extUsed = Number(res.external_used_storage || 0);
        const extTotal = Number(res.external_total_storage || 0);
        const intFree = Math.max(0, intTotal - intUsed);
        const extFree = Math.max(0, extTotal - extUsed);
        const intPct = intTotal > 0 ? Math.round(intUsed / intTotal * 100) : 0;

        if (storageDonut) {
            storageDonut.data.datasets[0].data = [intUsed || 0, intFree || 1];
            storageDonut.data.datasets[1].data = [extUsed || 0, extFree || 1];
            centerTexts.get(storageDonut).text = intPct + '%';
            storageDonut.update('none');
        }
        const $ = (id) => document.getElementById(id);
        if ($('dash-stor-int-used')) $('dash-stor-int-used').textContent = fmtB(intUsed);
        if ($('dash-stor-int-total')) $('dash-stor-int-total').textContent = fmtB(intTotal);
        if ($('dash-stor-sd-used')) $('dash-stor-sd-used').textContent = fmtB(extUsed);
        if ($('dash-stor-sd-total')) $('dash-stor-sd-total').textContent = fmtB(extTotal);
    };

    // --- Daily Usage History Area Chart ---
    let dailyUsageChart = null;

    let usageDays = 30;

    function resizeUsageChartWrap(count) {
        const wrap = document.querySelector('.dash-usage-chart-wrap');
        if (!wrap) return;
        const h = Math.min(300, Math.max(140, 130 + count * 0.8));
        wrap.style.height = Math.round(h) + 'px';
    }

    async function loadDailyUsageHistory(days) {
        if (days != null) usageDays = days;
        const canvas = document.getElementById('dashDailyUsageChart');
        if (!canvas) return;

        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - (usageDays - 1));
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        try {
            const res = await fetch(
                _baseURL + '/cellularUsage?startTime=' + start.getTime() + '&endTime=' + end.getTime() + '&method=date-range'
            );
            const json = await res.json();
            const items = json.usage || [];

            resizeUsageChartWrap(items.length);

            const labels = items.map(i => {
                const d = i.date || '';
                return d.length >= 5 ? d.slice(5) : d;
            });
            const values = items.map(i => Number(i.usage || 0));
            const gbValues = values.map(v => +(v / 1073741824).toFixed(2));

            const totalBytes = values.reduce((a, b) => a + b, 0);
            const avgBytes = items.length > 0 ? totalBytes / items.length : 0;
            const avgEl = document.getElementById('dash-usage-hist-avg');
            if (avgEl) avgEl.textContent = 'avg ' + fmtB(avgBytes) + '/d';

            const xFontSize = items.length > 20 ? 7 : 9;

            if (dailyUsageChart) {
                dailyUsageChart.data.labels = labels;
                dailyUsageChart.data.datasets[0].data = gbValues;
                dailyUsageChart.options.scales.x.ticks.font.size = xFontSize;
                dailyUsageChart.options.scales.x.ticks.maxTicksLimit = Math.min(items.length, 15);
                dailyUsageChart.update('none');
            } else {
                const ctx = canvas.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
                gradient.addColorStop(0, 'rgba(167, 139, 250, 0.35)');
                gradient.addColorStop(0.6, 'rgba(167, 139, 250, 0.08)');
                gradient.addColorStop(1, 'transparent');

                dailyUsageChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            data: gbValues,
                            borderColor: '#a78bfa',
                            backgroundColor: gradient,
                            borderWidth: 2,
                            tension: 0.4,
                            pointRadius: items.length > 30 ? 0 : 2,
                            pointHoverRadius: 4,
                            pointBackgroundColor: '#a78bfa',
                            pointHoverBackgroundColor: '#fff',
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(15,23,42,0.9)',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255,255,255,0.08)',
                                borderWidth: 1,
                                cornerRadius: 8,
                                padding: 8,
                                bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
                                displayColors: false,
                                callbacks: {
                                    label: (c) => c.raw.toFixed(2) + ' GB'
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                                ticks: {
                                    color: 'rgba(255,255,255,0.4)',
                                    font: { size: xFontSize, family: "'JetBrains Mono', monospace" },
                                    maxTicksLimit: Math.min(items.length, 15),
                                    maxRotation: 45,
                                    minRotation: 0
                                },
                                border: { display: false }
                            },
                            y: {
                                grid: { color: 'rgba(255,255,255,0.04)', drawTicks: false },
                                ticks: {
                                    color: 'rgba(255,255,255,0.35)',
                                    font: { size: 9, family: "'JetBrains Mono', monospace" },
                                    maxTicksLimit: 4,
                                    padding: 4,
                                    callback: (v) => v + ' GB'
                                },
                                border: { display: false },
                                beginAtZero: true
                            }
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('Daily usage history fetch failed:', e);
        }
    }

    window.loadDailyUsageHistory = loadDailyUsageHistory;

    // Load once on init, then refresh every 60s
    setTimeout(loadDailyUsageHistory, 2000);
    setInterval(loadDailyUsageHistory, 60000);

    // --- Row 7: Device Info ---
    let deviceInfoVersion = null;

    // Fetch firmware version once from version_info API
    (async function() {
        try {
            const r = await fetch(_baseURL + '/version_info');
            const j = await r.json();
            deviceInfoVersion = j.wa_inner_version || j.version || (j.model + ' ' + j.app_ver) || null;
            const el = document.getElementById('ddi-version');
            if (el && deviceInfoVersion) el.textContent = deviceInfoVersion;

            // Set device badge in header (in case main.js loadTitle doesn't reach)
            const mainTitle = document.getElementById('MAIN_TITLE');
            if (mainTitle && j.model && !mainTitle.querySelector('.device-badge')) {
                const displayName = (j.model === j.nickname || !j.nickname) ? j.model : j.model + ' (' + j.nickname + ')';
                const modelEl = document.getElementById('MODEL');
                if (modelEl) modelEl.style.display = 'none';
                mainTitle.innerHTML =
                    '<span class="device-badge">' +
                        '<svg class="device-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
                            '<rect x="2" y="6" width="20" height="12" rx="3"/>' +
                            '<path d="M9 2.5c1.5 1.2 1.5 2.5 0 3.5"/>' +
                            '<path d="M12 1c2.2 1.8 2.2 3.7 0 5"/>' +
                            '<path d="M15 2.5c-1.5 1.2-1.5 2.5 0 3.5"/>' +
                            '<circle cx="6" cy="12" r="1" fill="currentColor" stroke="none"/>' +
                            '<line x1="9.5" y1="10.5" x2="9.5" y2="13.5"/>' +
                            '<line x1="11.5" y1="9.5" x2="11.5" y2="14.5"/>' +
                            '<line x1="13.5" y1="10.5" x2="13.5" y2="13.5"/>' +
                            '<line x1="15.5" y1="11" x2="15.5" y2="13"/>' +
                            '<rect x="18" y="10" width="2" height="4" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/>' +
                        '</svg>' +
                        '<span class="device-badge-name">' + displayName + '</span>' +
                        '<span class="device-badge-ver">v' + (j.app_ver || '') + (j.build_timestamp ? ' (' + j.build_timestamp + ')' : '') + '</span>' +
                    '</span>';
                var titleEl = document.getElementById('TITLE');
                if (titleEl) titleEl.innerHTML = '[' + displayName + '] v' + (j.app_ver || '') + (j.build_timestamp ? ' (' + j.build_timestamp + ')' : '');
            }
        } catch (e) { /* silent */ }
    })();

    window.updateDeviceInfo = function(res) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el && val) el.textContent = val;
        };
        set('ddi-phone', res.msisdn);
        set('ddi-client-ip', res.client_ip);
        set('ddi-ipv4', res.wan_ipaddr);
        set('ddi-ipv6', res.ipv6_wan_ipaddr);
        set('ddi-gateway', res.lan_ipaddr);
        set('ddi-mac', res.mac_address);
        set('ddi-imei', res.imei);
        set('ddi-imsi', res.imsi);
        set('ddi-iccid', res.iccid);
        if (deviceInfoVersion) set('ddi-version', deviceInfoVersion);
    };

    // --- QCI / DL Max / UL Max poller (independent of main.js QOSRDPCommand) ---
    async function pollQoS() {
        try {
            const r = await fetch(_baseURL + '/AT?command=' + encodeURIComponent('AT+CGEQOSRDP=1') + '&slot=0');
            const j = await r.json();
            if (j.result) {
                const m = j.result.match(/\+CGEQOSRDP:\s*(.+?)\s*OK/);
                if (m) {
                    const p = m[1].split(',').map(Number);
                    if (p.length >= 8) {
                        const elQci = document.getElementById('ci-qci');
                        const elDl  = document.getElementById('ci-dl');
                        const elUl  = document.getElementById('ci-ul');
                        if (elQci) elQci.textContent = p[1];
                        if (elDl)  elDl.textContent  = (p[6] / 1000) + ' Mbps';
                        if (elUl)  elUl.textContent  = (p[7] / 1000) + ' Mbps';
                        window._qosFromDashCharts = true;
                    }
                }
            }
        } catch (e) { /* silent */ }
    }
    pollQoS();
    setInterval(pollQoS, 300000);

})();
