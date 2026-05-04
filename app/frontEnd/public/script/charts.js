// Chart updater
const chartUpdater = (prop, value) => {
    switch (prop) {
        case 'cpu_usage':
            updateCpuChart && updateCpuChart(value);
            break
        case 'realtime_rx_thrpt':
            updateNetworkChart && updateNetworkChart(value)
            break
        case 'cpu_temp':
            updateTempChart && updateTempChart(value)
            break
        case 'mem_usage':
            updateMemChart && updateMemChart(value)
            break
        case 'cpuFreqInfo':
            if (value) {
                const cpuFreqList = document.querySelector('#cpuFreqList')
                if (!cpuFreqList) break;
                let html = ''
                for (let i = 0; value[`cpu${i}`] != undefined && value[`cpu${i}`] != null; i++) {
                    let cur = String(value[`cpu${i}`].cur)
                    let cur_origin = String(value[`cpu${i}`].cur)
                    let max = String(value[`cpu${i}`].max)
                    let cluster = value[`cpu${i}`].cluster || 'C'
                    // Determine core enable state via usage
                    let usgList = window.UFI_DATA.cpuUsageInfo
                    if (usgList) {
                        if (!usgList[`cpu${i}`]) {
                            cur_origin = 0
                        }
                    }
                    if (cur.length == 1) cur = `&nbsp;&nbsp;&nbsp;${cur}`
                    else if (cur.length == 2) cur = `&nbsp;&nbsp;${cur}`
                    else if (cur.length == 3) cur = `&nbsp;${cur}`
                    const btnColor = getCssVariableColor('--dark-btn-color-active')
                    html += `${hotbox_parseSignalBar(cur_origin, 0, max, max * 0.9, max * 0.9, {
                        g: '#ffa5008f',
                        o: '#ffa5008f',
                        r: btnColor
                    })}`

                }
                cpuFreqList.innerHTML = html
            }
            break
        case 'cpuUsageInfo':
            updateCpuCoreChart && updateCpuCoreChart(value)
            break
        case 'memInfo':
            if (value) {
                const memInfo = document.querySelector('#memInfo')
                if (memInfo) {
                const zramTotal = Number(value['zram_total_kb'] ?? value['swap_total_kb'] ?? 0)
                const zramUsed = Number(value['zram_used_kb'] ?? value['swap_used_kb'] ?? 0)
                const zramFree = Number(value['zram_free_kb'] ?? value['swap_free_kb'] ?? 0)
                const zramUsage = Number(value['zram_usage_percent'] ?? value['swap_usage_percent'] ?? 0)
                const diskSwapTotal = Number(value['disk_swap_total_kb'] ?? 0)
                const diskSwapUsed = Number(value['disk_swap_used_kb'] ?? 0)
                const diskSwapFree = Number(value['disk_swap_free_kb'] ?? 0)
                const diskSwapUsage = Number(value['disk_swap_usage_percent'] ?? 0)
                memInfo.innerHTML = `<div>${t('ram_all')}：${formatBytes(value['mem_total_kb'] * 1024)}</div>
                <div>${t('ram_available')}：${formatBytes(value['mem_available_kb'] * 1024)}</div>
                <div>${t('ram_used')}：${formatBytes(value['mem_used_kb'] * 1024)}(${Math.round(value['mem_usage_percent'])}%)</div>
                <div style="margin-top:6px"><strong>Combined Swap</strong></div>
                <div>Total：${formatBytes(value['swap_total_kb'] * 1024)}</div>
                <div>Used：${formatBytes(value['swap_used_kb'] * 1024)}(${Math.round(value['swap_usage_percent'])}%)</div>
                <div>Available：${formatBytes(value['swap_free_kb'] * 1024)}</div>
                <div style="margin-top:6px"><strong>ZRAM</strong></div>
                <div>Total：${formatBytes(zramTotal * 1024)}</div>
                <div>Used：${formatBytes(zramUsed * 1024)}(${Math.round(zramUsage)}%)</div>
                <div>Available：${formatBytes(zramFree * 1024)}</div>
                <div style="margin-top:6px"><strong>Disk Swap</strong></div>
                <div>Total：${formatBytes(diskSwapTotal * 1024)}</div>
                <div>Used：${formatBytes(diskSwapUsed * 1024)}(${Math.round(diskSwapUsage)}%)</div>
                <div>Available：${formatBytes(diskSwapFree * 1024)}</div>`
                }
            }
            break
        case 'cpu_temp_list':
            if (value) {
                value?.sort((a, b) => {
                    const charA = a?.type?.charAt(0) || '';
                    const charB = b?.type?.charAt(0) || '';
                    return charA.localeCompare(charB);
                });
                const html = value?.map(item => {
                    return `<div>${item?.type?.replace('-thmzone', '')}: ${(Number(item?.temp) / 1000).toFixed(2)} ℃</div>`
                })
                const cpuTempInfo = document.querySelector('#cpuTempInfo')
                if (cpuTempInfo) cpuTempInfo.innerHTML = html.join("")
            }
            break
    }
}

const MAX_length = 20
const ANI_DURATION = 300

// CPU usage
const updateCpuChart = (() => {
    const canvas = document.getElementById('hotboxCpuChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const labels = Array(MAX_length).fill('0')
    const data = Array(MAX_length).fill(0)

    Chart.register(centerTextPlugin);
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                tension: 0.5,
                pointRadius: 0,
                fill: true,
                backgroundColor: getCssVariableColor('--dark-btn-color-active'),
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                borderRadius: 3,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,    // 0.5s animation
                easing: 'easeOutQuad'  // natural easing
            },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    max: 100,
                    min: 0
                }
            }
        }
    });

    return (value) => {
        if (value != undefined || value != null) {
            chart.options.plugins.centerText.text = [
                { text: `CPU: ${Math.floor(value)} % ` }
            ]
            labels.length > MAX_length && labels.shift()
            data.length > MAX_length && data.shift()

            labels.push(Number(labels[labels.length - 1]) + 1)
            data.push(Number(value))

            chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
            chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
            chart.update()
        }
    }
})()

// CPU core usage
const updateCpuCoreChart = (() => {
    const canvas = document.getElementById('hotboxCpuCoreChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const labels = ['Core 1', 'Core 2', 'Core 3', 'Core 4', 'Core 5', 'Core 6', 'Core 7', 'Core 8']
    const data = Array(8).fill(0)

    Chart.register(centerTextPlugin);
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                tension: 0.5,
                pointRadius: 0,
                fill: true,
                backgroundColor: getCssVariableColor('--dark-btn-color-active'),
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                borderRadius: 3,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,    // 0.5s animation
                easing: 'easeOutQuad'  // natural easing
            },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    max: 100,
                    min: 0
                }
            }
        }
    });

    return (value) => {
        if (value != undefined || value != null) {
            for (let index = 0; index < 8; index++) {
                if (value[`cpu${index}`] != undefined) {
                    data[index] = Math.round(value[`cpu${index}`])
                } else {
                    data[index] = 0
                }
            }
            chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
            chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
            chart.update()
        }
    }
})()

// Memory usage
const updateMemChart = (() => {
    const canvas = document.getElementById('hotboxMemChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const labels = Array(MAX_length).fill('0')
    const data = Array(MAX_length).fill(0)

    Chart.register(centerTextPlugin);
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                tension: 0.5,
                pointRadius: 0,
                fill: false,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,    // 0.5s animation
                easing: 'easeOutQuad'  // natural easing
            },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    max: 100,
                    min: 0
                }
            }
        }
    });

    return (value) => {
        if (value != undefined || value != null) {
            chart.options.plugins.centerText.text = [
                { text: `${t('ram')}: ${Math.floor(value)} % ` }
            ]

            let newLabels = [...labels]
            let newData = [...data]

            newLabels.push(Number(newLabels[newLabels.length - 1]) + 1)
            newData.push(Number(value))

            newLabels.length > MAX_length && newLabels.shift()
            newData.length > MAX_length && newData.shift()

            labels.forEach((_, index) => {
                labels[index] = newLabels[index]
            })
            data.forEach((_, index) => {
                data[index] = newData[index]
            })
            chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
            chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
            chart.update()
        }
    }
})()

// CPU temperature chart
const updateTempChart = (() => {
    const canvas = document.getElementById('hotboxTempChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const labels = Array(MAX_length).fill('0')
    const data = Array(MAX_length).fill(0)

    Chart.register(centerTextPlugin);
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                tension: 0.5,
                pointRadius: 0,
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,
                easing: 'easeOutQuad',
            },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    max: 110,
                    min: 0
                }
            }
        }
    });

    return (value) => {
        if (value != undefined || value != null) {
            chart.options.plugins.centerText.text = [
                { text: `${t('temperature')}: ${String(Number(value / 1000).toFixed(2))}℃` }
            ]
            let newLabels = [...labels]
            let newData = [...data]

            newLabels.push(Number(newLabels[newLabels.length - 1]) + 1)
            newData.push(Number(value / 1000).toFixed(2))

            newLabels.length > MAX_length && newLabels.shift()
            newData.length > MAX_length && newData.shift()

            labels.forEach((_, index) => {
                labels[index] = newLabels[index]
            })
            data.forEach((_, index) => {
                data[index] = newData[index]
            })
            chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
            chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
            chart.update()
        }
    }
})()

// Network speed chart
const updateNetworkChart = (() => {
    const canvas = document.getElementById('hotboxNetChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const labels = Array(MAX_length).fill('0')
    const dataDL = Array(MAX_length).fill(0)
    const dataUL = Array(MAX_length).fill(0)

    Chart.register(centerTextPlugin);
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'DL',
                data: dataDL,
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                tension: 0.5,
                pointRadius: 0,
                yAxisID: 'y',
                fill: false,
                borderWidth: 2
            }, {
                label: 'UL',
                data: dataUL,
                borderColor: 'pink',
                tension: 0.5,
                pointRadius: 0,
                yAxisID: 'y1',
                fill: false,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,    // 0.5s animation
                easing: 'easeOutQuad'  // natural easing
            },
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    suggestedMax: 38400,
                    min: 0
                },
                y1: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    suggestedMax: 38400,
                    min: 0
                }
            }
        }
    });

    return (value) => {
        if (value != undefined || value != null) {
            setTimeout(() => {
                let UL = window?.UFI_DATA?.realtime_tx_thrpt
                if (UL != undefined) {
                    chart.options.plugins.centerText.text = [
                        { text: `↑ ${formatBytes(UL)}/S`, color: 'pink' },
                        {
                            text: `↓ ${formatBytes(value)}/S`
                        }
                    ];

                    let newLabels = [...labels]
                    let newDataDL = [...dataDL]
                    let newDataUL = [...dataUL]

                    newLabels.push(Number(labels[labels.length - 1]) + 1)
                    newDataDL.push(value / 1024)
                    newDataUL.push(UL / 1024)

                    newLabels.length > MAX_length && newLabels.shift()
                    newDataDL.length > MAX_length && newDataDL.shift()
                    newDataUL.length > MAX_length && newDataUL.shift()

                    labels.forEach((_, index) => {
                        labels[index] = newLabels[index]
                    })
                    dataDL.forEach((_, index) => {
                        dataDL[index] = newDataDL[index]
                    })
                    dataUL.forEach((_, index) => {
                        dataUL[index] = newDataUL[index]
                    })
                    chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
                    chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
                    chart.update()
                }
            }, 1);
        }
    }
})()

// Data usage chart
const updateDataHistoryChart = (() => {
    const canvas = document.getElementById('hotboxDataHistoryChart');
    const ctx = canvas.getContext('2d');
    const labels = Array(MAX_length).fill('')
    const data = Array(MAX_length).fill(0)

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                tension: 0.5,
                pointRadius: 4,
                pointBorderWidth: 3,
                fill: true,
                pointBackgroundColor: getTextColor(),
                pointBorderColor: getCssVariableColor('--dark-btn-color-active'),
                backgroundColor: getCssVariableColor('--dark-btn-color-active'),
                borderColor: getCssVariableColor('--dark-btn-color-active'),
                borderRadius: 3,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: ANI_DURATION,    // 0.5s animation
                easing: 'easeOutQuad'  // natural easing
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            return formatBytes(ctx.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        display: true,
                        color: getTextColor(),
                        font: {
                            size: 10
                        }
                    },
                    border: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    max: 1024 * 1024 * 1024,
                    min: 0
                }
            }
        }
    });

    return ({ items }) => {
        if (!items || items.length === 0) {
            // Clear data
            chart.data.labels = Array(MAX_length).fill('');
            chart.data.datasets[0].data = Array(MAX_length).fill(0);
            chart.update();
            return;
        }

        const newLabels = items.map(({ date }) => `${date.split('-')[1]}-${date.split('-')[2]}`);
        const newData = items.map(u => Number(u.usage) || 0);
        const max = Math.max(...newData);

        chart.data.labels = newLabels;
        chart.data.datasets[0].data = newData;
        chart.data.datasets[0].backgroundColor = getCssVariableColor('--dark-btn-color-active');
        chart.data.datasets[0].borderColor = getCssVariableColor('--dark-btn-color-active');
        chart.data.datasets[0].pointBackgroundColor = getTextColor()
        chart.data.datasets[0].pointBorderColor = getCssVariableColor('--dark-btn-color-active')
        // Shrink if too dense
        if (items.length >= 15) {
            chart.data.datasets[0].pointRadius = 0
            chart.data.datasets[0].pointBorderWidth = 0
        } else {
            chart.data.datasets[0].pointRadius = 4
            chart.data.datasets[0].pointBorderWidth = 3
        }

        chart.options.scales.y.max = Math.ceil(max * 1.1);
        chart.update();
    };
})()

// Signal History Chart — tracks RSRP, SINR, RSRQ over time
const updateSignalChart = (() => {
    const canvas = document.getElementById('signalHistoryChart');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const SIG_MAX = 30;
    const labels = Array(SIG_MAX).fill('');
    const rsrpData = Array(SIG_MAX).fill(null);
    const sinrData = Array(SIG_MAX).fill(null);
    const rsrqData = Array(SIG_MAX).fill(null);
    const rssiData = Array(SIG_MAX).fill(null);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'RSRP',
                    data: rsrpData,
                    borderColor: '#f87171',
                    backgroundColor: 'rgba(248,113,113,0.1)',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'yRsrp',
                },
                {
                    label: 'SINR',
                    data: sinrData,
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52,211,153,0.1)',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'ySinr',
                },
                {
                    label: 'RSRQ',
                    data: rsrqData,
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96,165,250,0.1)',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'yRsrp',
                },
                {
                    label: 'RSSI',
                    data: rssiData,
                    borderColor: '#fb923c',
                    backgroundColor: 'rgba(251,146,60,0.08)',
                    tension: 0.4,
                    pointRadius: 0,
                    fill: true,
                    borderWidth: 2,
                    yAxisID: 'yRsrp',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: ANI_DURATION, easing: 'easeOutQuad' },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 11 },
                    bodyFont: { size: 11 },
                    padding: 8,
                    callbacks: {
                        label: function(ctx) {
                            const name = ctx.dataset.label;
                            const val = ctx.parsed.y;
                            if (val == null) return '';
                            const unit = name === 'SINR' ? ' dB' : ' dBm';
                            return `${name}: ${val}${unit}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                yRsrp: {
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: 'rgba(248,113,113,0.6)',
                        font: { size: 9 },
                        maxTicksLimit: 4,
                        callback: v => v + ''
                    },
                    border: { display: false },
                    suggestedMin: -140,
                    suggestedMax: -40,
                },
                ySinr: {
                    position: 'right',
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(52,211,153,0.6)',
                        font: { size: 9 },
                        maxTicksLimit: 4,
                        callback: v => v + ''
                    },
                    border: { display: false },
                    suggestedMin: -10,
                    suggestedMax: 30,
                }
            }
        }
    });

    return (rsrp, sinr, rsrq, rssi) => {
        rsrpData.push(rsrp != null ? Number(rsrp) : null);
        sinrData.push(sinr != null ? Number(sinr) : null);
        rsrqData.push(rsrq != null ? Number(rsrq) : null);
        rssiData.push(rssi != null ? Number(rssi) : null);
        if (rsrpData.length > SIG_MAX) rsrpData.shift();
        if (sinrData.length > SIG_MAX) sinrData.shift();
        if (rsrqData.length > SIG_MAX) rsrqData.shift();
        if (rssiData.length > SIG_MAX) rssiData.shift();
        labels.push('');
        if (labels.length > SIG_MAX) labels.shift();

        // Update legend values
        const rsrpEl = document.getElementById('sig-rsrp-val');
        const sinrEl = document.getElementById('sig-sinr-val');
        const rsrqEl = document.getElementById('sig-rsrq-val');
        const rssiEl = document.getElementById('sig-rssi-val');
        if (rsrpEl) rsrpEl.textContent = rsrp != null ? rsrp + ' dBm' : '--';
        if (sinrEl) sinrEl.textContent = sinr != null ? sinr + ' dB' : '--';
        if (rsrqEl) rsrqEl.textContent = rsrq != null ? rsrq + ' dB' : '--';
        if (rssiEl) rssiEl.textContent = rssi != null ? rssi + ' dBm' : '--';

        chart.update();
    };
})()