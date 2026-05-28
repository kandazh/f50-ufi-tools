/**
 * main.js — Bootstrap and orchestration.
 * Modules are loaded from script/main/*.js before this file.
 */

// --- Toolbar scroll-to-top button ---
const tb = document.querySelector('#top_btn')
if (tb) {
    let ctTimer = null
    let ctTimer1 = null
    const ct = document.querySelector('.container')
    tb.style.transition = 'all .3s'
    const fn = debounce(() => {
        if (ct.scrollTop > 100) {
            tb.style.display = ''
            ctTimer1 && clearTimeout(ctTimer1)
            ctTimer1 = setTimeout(() => {
                tb.style.opacity = '1'
            }, 300);
        } else {
            tb.style.opacity = '0'
            ctTimer && clearTimeout(ctTimer)
            ctTimer = setTimeout(() => {
                tb.style.display = 'none'
            }, 300);
        }
    }, 50)
    if (ct) {
        ct.addEventListener('scroll', fn)
    }
}

// --- Global data proxy ---
const MODEL = document.querySelector("#MODEL")
window.UFI_DATA = new Proxy({}, {
    set(target, prop, value) {
        target[prop] = value;
        chartUpdater && chartUpdater(prop, value)
        return true;
    }
});

// --- Custom head injection ---
(() => {
    getCustomHead().then((head_text) => {
        if (head_text) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(head_text, 'text/html');
                doc.querySelectorAll('style, link, meta').forEach(el => {
                    document.head.appendChild(el.cloneNode(true));
                });
                doc.querySelectorAll('script').forEach(scriptEl => {
                    try {
                        const newScript = document.createElement('script');
                        if (scriptEl.src) {
                            newScript.src = scriptEl.src;
                        } else {
                            newScript.textContent = scriptEl.textContent;
                        }
                        if (scriptEl.type) newScript.type = scriptEl.type;
                        document.head.appendChild(newScript);
                    } catch (e) {
                        createToast(t('toast_head_resove_failed'));
                    }
                })
            } catch (e) {
                createToast(t('toast_head_resove_failed'));
            }
        }
    })
})();

// --- TTYD default port ---
if (!localStorage.getItem('ttyd_port')) {
    localStorage.setItem('ttyd_port', 1146)
}

// --- Service worker ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => { console.log('Service Worker registered:', reg); })
        .catch(err => { console.error('Service Worker registration failed:', err); });
}

// --- Loading overlay ---
const splash = document.getElementById('splash')
if (splash) splash.remove()
const overlay = document.createElement('div')
overlay.className = 'loading-overlay'
overlay.innerHTML = "<p>Loading...</p>"
document.body.appendChild(overlay)

// --- Check if token needed ---
const needToken = async (shouldThrowError = false, fetchMaxRetries = 3) => {
    let retries = 0
    let res = null

    while (retries < fetchMaxRetries) {
        try {
            res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/need_token`, { headers: { ...common_headers } }, 1000)).json()
            if (res) break
        } catch {
            if (overlay) {
                overlay.innerHTML = `<p>${t('backend_not_respond')}, ${t('toast_retries')} ${retries + 1} ...</p>`
            }
        } finally {
            retries++
        }
    }

    if (!res) {
        if (shouldThrowError) {
            throw new Error(t('toast_connect_failed') + `, ${t('toast_retries')}：${retries}`)
        }
        window.isNeedToken = true
    } else {
        window.isNeedToken = !!res.need_token
    }

    let tkInput = document.querySelector('#TOKEN')
    let tkLabel = document.querySelector("#TOKEN_LABEL")
    if (window.isNeedToken) {
        tkInput && (tkInput.style.display = "")
        tkLabel && (tkLabel.style.display = "")
    } else {
        tkInput && (tkInput.style.display = "none")
        tkLabel && (tkLabel.style.display = "none")
    }
};

// --- Boot sequence ---
needToken(true, 30).then(() => {
    try {
        main_func()
    } catch (e) {
        console.error('[main_func]', e)
    }
    overlay && (overlay.style.opacity = '0')
    setTimeout(() => {
        let container = document.querySelector('.container')
        container.style.opacity = 1
        container.style.filter = 'none'
        overlay && overlay.remove()
    }, 100);
}).catch((e) => {
    if (overlay) {
        overlay.style.opacity = '1'
        overlay.innerHTML = `
        <p>${e.message}</p>
        <div><button onclick="location.reload()">${t('common_refresh_btn')}</button></div>
        `
    }
})

// --- Main initialization (called after needToken succeeds) ---
function main_func() {
    checkBroswer()

    var showList = window._showList;

    // --- Drag list setup ---
    const saveDragListData = (list, callback) => {
        const children = Array.from(list.querySelectorAll('input'))
        let id = null
        if (list.id == 'draggable_status') id = 'statusShowList'
        if (list.id == 'draggable_signal') id = 'signalShowList'
        if (list.id == 'draggable_props') id = 'propsShowList'
        if (!id) return
        showList[id] = children.map((item) => ({
            name: item.dataset.name,
            isShow: item.checked
        }))
        localStorage.setItem('showList', JSON.stringify(showList))
        callback && callback(list)
    }

    DragList("#draggable_status", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('statusShowListDOM', d_list.innerHTML)
    }))
    DragList("#draggable_signal", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('signalShowListDOM', d_list.innerHTML)
    }))
    DragList("#draggable_props", (list) => saveDragListData(list, (d_list) => {
        localStorage.setItem('propsShowListDOM', d_list.innerHTML)
    }))

    const listDOM_STATUS = document.querySelector("#draggable_status")
    const listDOM_SIGNAL = document.querySelector("#draggable_signal")
    const listDOM_PROPS = document.querySelector("#draggable_props")
    const statusDOMStor = localStorage.getItem('statusShowListDOM')
    const signalDOMStor = localStorage.getItem('signalShowListDOM')
    const propsDOMStor = localStorage.getItem('propsShowListDOM')
    statusDOMStor && (listDOM_STATUS.innerHTML = statusDOMStor)
    signalDOMStor && (listDOM_SIGNAL.innerHTML = signalDOMStor)
    propsDOMStor && (listDOM_PROPS.innerHTML = propsDOMStor)

    listDOM_STATUS.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.statusShowList.find(i => i.name == name)
        if (foundItem) item.checked = foundItem.isShow
    })
    listDOM_SIGNAL.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.signalShowList.find(i => i.name == name)
        if (foundItem) item.checked = foundItem.isShow
    })
    listDOM_PROPS.querySelectorAll('input').forEach((item) => {
        let name = item.dataset.name
        let foundItem = showList.propsShowList.find(i => i.name == name)
        if (foundItem) item.checked = foundItem.isShow
    })

    // --- SMS button ---
    let smsBtn = document.querySelector('#SMS')
    if (smsBtn) smsBtn.onclick = async function () {
        window.smsSender && window.smsSender()
        if (!(await window.initRequestData())) {
            showModal('#tokenModal')
        } else {
            window._smsFirstRender = true;
            window._smsLastIds = null;
            handleSmsRender()
            window.smsSender = requestInterval(() => handleSmsRender(), 2000)
        }
    }

    // --- Clear/logout button ---
    let clearBtn = document.querySelector('#CLEAR')
    if (clearBtn) clearBtn.onclick = async () => {
        localStorage.removeItem('hotbox_sms_pwd')
        localStorage.removeItem('hotbox_sms_token')
        HOTBOX_TOKEN = null
        common_headers.authorization = null
        window.initRenderMethod()
        try { login().finally(cookie => { logout(cookie) }) } catch { }
        await needToken()
        const label = document.querySelector("#token_div_label2")
        const tokenEl = document.querySelector("#PWD_BLK")
        const pwdEl = document.querySelector("#PWDINPUT")
        const tokenInput = document.querySelector("#TOKEN")
        label.style.display = ""
        tokenEl.style.display = "flex"
        if (CryptoJS) {
            const str = localStorage.getItem('hotbox_remembered_loginfo')
            if (str) {
                try {
                    const bytes = CryptoJS.AES.decrypt(str, 'hotbox_secret_key_1145141919810721')
                    const originalText = bytes.toString(CryptoJS.enc.Utf8)
                    const [remembered_password, remembered_token] = originalText.split('<hotbox_CryptoJS_split>')
                    if (remembered_password && remembered_token) {
                        pwdEl.value = remembered_password
                        tokenInput.value = remembered_token
                        const loginRememberMe = document.querySelector('#loginRememberMe')
                        if (loginRememberMe) loginRememberMe.checked = true
                    }
                } catch (e) { console.error('Error decrypting remembered login info:', e) }
            }
        }
        if (pwdEl && pwdEl.value.trim() == "Wa@9w+YWRtaW4=") {
            const loginMethodEl = document.querySelector("#login_method")
            if (loginMethodEl) loginMethodEl.value = "0"
        }
        createToast(t('toast_logout'), 'green')
        showModal('#tokenModal')
    }

    // --- Dictionary (field show/hide) ---
    const _dictEl = document.querySelector("#DICTIONARY");
    if (_dictEl) _dictEl.onclick = () => showModal('#dictionaryModal')

    document.querySelector('#DIC_LIST')?.addEventListener('click', (e) => {
        let target = e.target
        e.stopPropagation()
        e.stopImmediatePropagation()
        if (target.id == 'DIC_LIST') return
        let inputEl = null
        if ((target.tagName).toLowerCase() != 'input') return
        else inputEl = target
        let id = inputEl.getAttribute('data-name')
        const list_id = inputEl.closest("ul").id
        let list_name = null
        if (list_id == "draggable_status") list_name = 'statusShowList'
        if (list_id == "draggable_signal") list_name = 'signalShowList'
        if (list_id == "draggable_props") list_name = 'propsShowList'
        if (list_name == null) return
        let index = showList[list_name].findIndex(i => i.name == id)
        if (index != -1) showList[list_name][index].isShow = inputEl.checked
        localStorage.setItem('showList', JSON.stringify(showList))
    }, false)

    // --- Reset show list ---
    let resetShowListBtnCount = 1
    let resetShowListTimer = null
    let resetShowList = (e) => {
        const target = e.target
        resetShowListTimer && clearTimeout(resetShowListTimer)
        if (resetShowListBtnCount == 1) target.innerHTML = t('btn_confirm_question')
        if (resetShowListBtnCount >= 2) {
            localStorage.removeItem('showList');
            localStorage.removeItem('statusShowListDOM');
            localStorage.removeItem('signalShowListDOM');
            localStorage.removeItem('propsShowListDOM');
            location.reload()
        }
        resetShowListBtnCount++
        resetShowListTimer = setTimeout(() => {
            resetShowListBtnCount = 1
            target.innerHTML = 'Reset (Select All)'
        }, 3000);
    }

    // --- Refresh toggle buttons ---
    const playIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="6,4 20,12 6,20"/></svg>'
    const pauseIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="10" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/></svg>'
    Array.from(document.querySelectorAll('.REFRESH_BTN'))?.forEach(el => {
        el.onclick = () => {
            const headerBtn = document.querySelector('#headerRefreshBtn')
            const isRunning = headerBtn && headerBtn.classList.contains('is-running')
            if (!isRunning) {
                Array.from(document.querySelectorAll('.REFRESH_BTN')).forEach(ee => {
                    if (ee.id === 'headerRefreshBtn') {
                        ee.innerHTML = pauseIcon; ee.classList.add('is-running'); ee.classList.remove('is-paused'); ee.title = 'Stop refresh';
                    } else { ee.innerHTML = t('stop_refresh') }
                })
                createToast(t('toast_start_refresh'), 'green')
                window.startRefresh()
            } else {
                Array.from(document.querySelectorAll('.REFRESH_BTN')).forEach(ee => {
                    if (ee.id === 'headerRefreshBtn') {
                        ee.innerHTML = playIcon; ee.classList.add('is-paused'); ee.classList.remove('is-running'); ee.title = 'Start refresh';
                    } else { ee.innerHTML = t('start_refresh') }
                })
                createToast(t('toast_stop_refresh'), 'green')
                window.stopRefresh()
            }
        }
    });

    // --- Collapse menu ---
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

    collapseGen("#collapse_status_btn", "#collapse_status", "collapse_status")

    // --- Initialize all modules ---
    window.initRenderMethod()

    // --- Start status polling (startRefresh stops any existing timers first) ---
    window.startRefresh();

    // --- Initialize language pack ---
    (() => {
        const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
        const langToLoad = savedLang || detectBrowserLang();
        loadLanguage(langToLoad);
    })()

    // --- Register remaining window methods ---
    window.resetShowList = resetShowList;
}
