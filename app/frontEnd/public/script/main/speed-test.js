/**
 * Speed Test - Local download speed test + Cellular speed test
 */
(function () {
let speedFlag = false;
let speedController = null; // resettable variable

async function startTest(e) {
    if (!(await window.initRequestData())) {
        createToast(t('toast_please_login'), 'red')
        return null
    }
    if (speedFlag) {
        speedController.abort();
        createToast(t('toast_speed_test_cancel'));
        return;
    }

    speedFlag = true;
    speedController = new AbortController();
    const speedSignal = speedController.signal;

    e.target.style.backgroundColor = 'var(--dark-btn-disabled-color)';
    e.target.innerHTML = t('speedtest_stop_btn');

    const serverUrl = `${HOTBOX_baseURL}/speedtest`;

    const ckSize = document.querySelector('#speedTestModal #ckSize').value;
    const chunkSize = !isNaN(Number(ckSize)) ? Number(ckSize) : 1000;
    const resultDiv = document.getElementById('speedtestResult');

    const url = `${serverUrl}?ckSize=${chunkSize}&cors`;
    resultDiv.textContent = t('speedtest_running_btn');

    let totalBytes = 0;
    let startTime = performance.now();
    let lastUpdateTime = startTime;
    let lastBytes = 0;

    try {
        const res = await fetch(url, { signal: speedSignal, headers: { ...common_headers } });
        const reader = res.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalBytes += value.length;
            const now = performance.now();

            if (now - lastUpdateTime >= 80) {
                const elapsed = (now - lastUpdateTime) / 1000;
                const speed = ((totalBytes - lastBytes) * 8 / 1024 / 1024) / elapsed;

                resultDiv.innerHTML = `
            ${t('speedtest_testing')}<br/>
            ${t('speedtest_total_download')}: ${(totalBytes / 1024 / 1024).toFixed(2)} MB<br/>
            ${t('speedtest_current_speed')}: ${speed.toFixed(2)} Mbps
        `;

                lastUpdateTime = now;
                lastBytes = totalBytes;
            }
        }

        const totalTime = (performance.now() - startTime) / 1000;
        const avgSpeed = ((totalBytes * 8) / 1024 / 1024) / totalTime;

        resultDiv.innerHTML += `
    <br/>✅ ${t('speedtest_done')}<br/>
    ${t('speedtest_total_time')}: ${totalTime.toFixed(2)} ${t('unit_seconds')}<br/>
    ${t('speedtest_avg_speed')}: ${avgSpeed.toFixed(2)} Mbps
`;
    } catch (err) {
        if (err.name === 'AbortError') {
            resultDiv.innerHTML += `<br/>⚠️ ${t('speedtest_aborted')}`;
        } else {
            resultDiv.innerHTML = `❌ ${t('speedtest_failed')}: ${err.message}`;
        }
    } finally {
        speedFlag = false;
        e.target.innerHTML = t('speedtest_start_btn');
        e.target.style.backgroundColor = '';
    }
}

// Infinite speed test
let loopSpeedTestTimer = null;
const handleLoopMode = async (e) => {
    if (!(await window.initRequestData())) {
        createToast(t('please_login'), 'red');
        return null;
    }

    const speedTestButton = document.querySelector('#startSpeedBtn');
    const isStarting = e.target.innerHTML === t('loop_mode_start');

    if (isStarting) {
        e.target.innerHTML = t('loop_mode_stop');
        loopSpeedTestTimer && loopSpeedTestTimer();
        loopSpeedTestTimer = requestInterval(() => {
            if (speedTestButton && speedTestButton.innerHTML === t('speedtest_start')) {
                speedTestButton.click();
            }
        }, 10);
    } else {
        loopSpeedTestTimer && loopSpeedTestTimer();
        if (speedTestButton && speedTestButton.innerHTML === t('speedtest_stop')) {
            speedTestButton.click();
        }
        e.target.innerHTML = t('loop_mode_start');
    }
};

// File upload

let cellularSpeedFlag = false;
let cellularSpeedController = null;
let loopCellularTimer = null;
let isCellularTestLooping = false;
let totalBytes = 0;
let isSingleTesting = false
const getCellularStartBtn = () => document.querySelector('#CellularTestModal #startSpeedBtn')
const singleTest = debounce((e) => {
    isSingleTesting = true
    if (cellularSpeedFlag) {
        isSingleTesting = false
    }
    startCellularTestRealtime(e, true)
}, 500)

function runSingleTest(e) {
    singleTest(e)
}

async function startCellularTestRealtime(e, flag = false) {
    if (isCellularTestLooping && e) {
        return
    }
    const isSingleRun = flag === true
    let runBytes = 0
    try {
        if (!cellularSpeedFlag) {
            flag && (totalBytes = 0)
        }
        const resultEl = document.getElementById('CellularTestResult');
        const url = document.getElementById('CellularTestUrl').value.trim();
        const rawThreadNum = Number(document.querySelector('#thread_num').textContent);

        if (!url) {
            createToast(t('cellular_pls_input_url'), 'red');
            return;
        }

        if (cellularSpeedFlag) {
            // Stop speed test
            cellularSpeedController?.abort();
            createToast(t('speedtest_aborted'), 'orange');
            cellularSpeedFlag = false;
            e && (e.target.innerText = t('speedtest_start_btn'));
            return;
        }

        // Start speed test
        cellularSpeedFlag = true;
        cellularSpeedController = new AbortController();

        const maxThreadNum = 5;
        const batchSize = 8;
        const threadNum = Math.min(rawThreadNum, maxThreadNum);

        if (rawThreadNum > maxThreadNum) {
            createToast(`${t('thread_imit')} ${maxThreadNum},${t('avoid_overload')}`, 'orange');
        }

        e && (e.target.innerText = t('speedtest_stop_btn'));
        resultEl.innerHTML = `${t('speed_test_ing')} (${threadNum} ${t('thread')})...<br/><span>${t('preparing')}...</span>`;

        let startTime = performance.now();
        let lastUpdateTime = startTime;
        let lastBytes = 0;
        let firstResponseReceived = false;

        const readTasks = [];

        // Batch speed test requests and start reading immediately
        for (let i = 0; i < threadNum; i++) {
            const testUrl = `${HOTBOX_baseURL}/proxy/--${url}?t=${Math.random()}`;

            const task = (async () => {
                try {
                    const res = await fetch(testUrl, {
                        signal: cellularSpeedController.signal,
                        cache: 'no-store',
                    });

                    const reader = res.body?.getReader();
                    if (!reader) return;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        totalBytes += value.length;
                        runBytes += value.length;

                        if (!firstResponseReceived && value.length > 0) {
                            firstResponseReceived = true;
                        }
                    }
                } catch (_) {
                    // Ignore exceptions
                }
            })();

            readTasks.push(task);

            // Batch delay to avoid too many connections
            if ((i + 1) % batchSize === 0) {
                await new Promise(res => setTimeout(res, 100));
            }
        }

        // Update speed every 100ms
        const interval = setInterval(() => {
            const now = performance.now();
            const deltaTime = (now - lastUpdateTime) / 1000;
            const deltaBytes = totalBytes - lastBytes;
            const speedMbps = (deltaBytes * 8 / 1024 / 1024) / deltaTime;

            resultEl.innerHTML = `
        ${t('cellular_speed_test_thread')}${rawThreadNum}<br/>
        ${t('speedtest_current_speed')}: ${speedMbps.toFixed(2)} Mbps<br/>
        ${t('speedtest_total_download')}: ${(totalBytes / 1024 / 1024).toFixed(2)} MB
    `;
            lastUpdateTime = now;
            lastBytes = totalBytes;
        }, 100);

        // Slow response warning
        setTimeout(() => {
            if (!firstResponseReceived && cellularSpeedFlag) {
                resultEl.innerHTML += `<br/><span>${t('cellular_speed_test_slow')}</span>`;
            }
        }, 2000);

        try {
            await Promise.all(readTasks);
        } catch (_) {
            // Ignore abort exceptions
        }

        clearInterval(interval);
        cellularSpeedFlag = false;
        e && (e.target.innerText = t('speedtest_start_btn'));

        const totalTime = (performance.now() - startTime) / 1000;
        const avgSpeed = ((runBytes * 8) / 1024 / 1024) / totalTime;

        if (runBytes === 0) {
            resultEl.innerHTML += `<br/><span style="color:red;">${t('cellular_speed_test_failed')}</span>`;
        } else {
            resultEl.innerHTML += `<br/>${t('speedtest_avg_speed')}: ${avgSpeed.toFixed(2)} Mbps`;
        }

        // Loop speed test
        if (!isCellularTestLooping) return;
        loopCellularTimer = setTimeout(() => {
            if (isCellularTestLooping) startCellularTestRealtime(); // no event param
        }, 500);
    } finally {
        if (isSingleRun) {
            isSingleTesting = false
        }
    }
}

const loopTest = debounce((event) => {
    const btn = event.target;
    const startBtn = getCellularStartBtn()

    if (isSingleTesting) {
        return
    }

    isCellularTestLooping = !isCellularTestLooping;

    if (isCellularTestLooping) {
        btn.innerText = t('loop_mode_stop');
        totalBytes = 0
        startBtn && (startBtn.disabled = true)
        startCellularTestRealtime();
    } else {
        btn.innerText = t('loop_mode_start');
        clearTimeout(loopCellularTimer);
        cellularSpeedController?.abort();
        cellularSpeedFlag = false;
        startBtn && (startBtn.disabled = false)
    }
}, 500)

function handleCellularLoopMode(event) {
    loopTest(event)
}

function closeCellularTest(selector) {
    closeModal(selector);
    isCellularTestLooping = false;
    clearTimeout(loopCellularTimer);
    cellularSpeedController?.abort();
    cellularSpeedFlag = false;
    const startBtn = getCellularStartBtn()
    startBtn && (startBtn.disabled = false)
}

const onThreadNumChange = (event) => {
    document.querySelector('#thread_num').innerHTML = event.target.value;
};

const initCellularSpeedTestBtn = async () => {
    const btn = document.querySelector('#CellularSpeedTestBtn')
    if (!btn) return null
    const stor = localStorage.getItem("cellularTestUrl")
    if (stor) {
        const CellularTestUrl = document.querySelector('#CellularTestUrl')
        CellularTestUrl && (CellularTestUrl.value = stor)
    }
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        return null
    }
    btn.onclick = async () => {
        showModal('#CellularTestModal')
    }
}
initCellularSpeedTestBtn()

const saveCellularTestUrl = (e) => {
    const target = e.target
    if (target?.value?.trim()) {
        localStorage.setItem("cellularTestUrl", target.value.trim())
    }
}

    // Register on window
    window.startTest = startTest;
    window.handleLoopMode = handleLoopMode;
    window.startCellularTestRealtime = startCellularTestRealtime;
    window.runSingleTest = runSingleTest;
    window.singleTest = singleTest;
    window.loopTest = loopTest;
    window.handleCellularLoopMode = handleCellularLoopMode;
    window.closeCellularTest = closeCellularTest;
    window.onThreadNumChange = onThreadNumChange;
    window.initCellularSpeedTestBtn = initCellularSpeedTestBtn;
    window.saveCellularTestUrl = saveCellularTestUrl;
})();
