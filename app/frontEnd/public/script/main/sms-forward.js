/**
 * SMS Forward - Email, cURL, DingTalk forwarding configuration
 */
(function () {
const initSmsForward = async (needSwitch = true, method = undefined) => {
    if (!method) {
        const { sms_forward_method } = await (await fetchWithTimeout(`${HOTBOX_baseURL}/sms_forward_method`, {
            method: 'GET',
            headers: common_headers
        })).json()
        method = sms_forward_method
    }
    if (method.toLowerCase() == 'smtp') {
        const data = await (await fetch(`${HOTBOX_baseURL}/sms_forward_mail`, {
            method: 'GET',
            headers: common_headers
        })).json()
        const { smtp_host, smtp_port, smtp_username, smtp_password, smtp_to, forward_dev_info } = data
        const smtpHostEl = document.querySelector('#smtp_host')
        const smtpPortEl = document.querySelector('#smtp_port')
        const smtpToEl = document.querySelector('#smtp_to')
        const smtpUsernameEl = document.querySelector('#smtp_username')
        const smtpPasswordEl = document.querySelector('#smtp_password')
        const forwardDevInfoEl = document.querySelector('#smsForwardForm input[name="forward_dev_info"]')
        forwardDevInfoEl.checked = forward_dev_info == "1"
        smtpHostEl.value = smtp_host || ''
        smtpPortEl.value = smtp_port || ''
        smtpUsernameEl.value = smtp_username || ''
        smtpPasswordEl.value = smtp_password || ''
        smtpToEl.value = smtp_to || ''
        needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#smtp_btn') })
    } else if (method.toLowerCase() == 'curl') {
        const data = await (await fetch(`${HOTBOX_baseURL}/sms_forward_curl`, {
            method: 'GET',
            headers: common_headers
        })).json()
        const { curl_text } = data
        const curlTextEl = document.querySelector('#curl_text')
        curlTextEl.value = curl_text || ''
        needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#curl_btn') })
    } else if (method.toLowerCase() == 'dingtalk') {
        const data = await (await fetch(`${HOTBOX_baseURL}/sms_forward_dingtalk`, {
            method: 'GET',
            headers: common_headers
        })).json()
        const { webhook_url, secret, forward_dev_info } = data
        const webhookEl = document.querySelector('#dingtalk_webhook')
        const secretEl = document.querySelector('#dingtalk_secret')
        const forwardDevInfoEl = document.querySelector('#smsForwardDingTalkForm input[name="forward_dev_info"]')
        forwardDevInfoEl.checked = forward_dev_info == "1"
        webhookEl.value = webhook_url || ''
        secretEl.value = secret || ''
        needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#dingtalk_btn') })
    } else {
        needSwitch && switchSmsForwardMethodTab({ target: document.querySelector('#smtp_btn') })
    }
}

const initSmsForwardSwitch = async () => {
    const { enabled } = await (await fetch(`${HOTBOX_baseURL}/sms_forward_enabled`, {
        method: 'GET',
        headers: common_headers
    })).json()
    const collapse_smsforward = document.querySelector('#collapse_smsforward')
    if (!collapse_smsforward) {
        localStorage.setItem('collapse_smsforward', enabled == "1" ? 'open' : 'close')
        return
    }
    if (collapse_smsforward.dataset.name == 'open' && enabled != "1") {
        collapse_smsforward.dataset.name = 'close'
    } else if (collapse_smsforward.dataset.name == 'close' && enabled == "1") {
        collapse_smsforward.dataset.name = 'open'
    }
}

const switchSmsForwardMethod = (method) => {
    const smsForwardForm = document.querySelector('#smsForwardForm')
    const smsForwardCurlForm = document.querySelector('#smsForwardCurlForm')
    const smsForwardDingTalkForm = document.querySelector('#smsForwardDingTalkForm')
    switch (method.toLowerCase()) {
        case 'smtp':
            smsForwardForm.style.display = 'block'
            smsForwardCurlForm.style.display = 'none'
            smsForwardDingTalkForm.style.display = 'none'
            break
        case 'curl':
            smsForwardForm.style.display = 'none'
            smsForwardCurlForm.style.display = 'block'
            smsForwardDingTalkForm.style.display = 'none'
            break
        case 'dingtalk':
            smsForwardForm.style.display = 'none'
            smsForwardCurlForm.style.display = 'none'
            smsForwardDingTalkForm.style.display = 'block'
            break
        default:
            smsForwardForm.style.display = 'block'
            smsForwardCurlForm.style.display = 'none'
            smsForwardDingTalkForm.style.display = 'none'
            break
    }
    initSmsForward(false, method)
    return method.toLowerCase()
}

const collapse_smsforward_power_status_btn = document.querySelector('#collapse_smsforward_power_status_btn')
const collapse_smsforward_power_status_btn_component = createSwitch({
    value: false,
    onChange: async (checked) => {
        if (checked != undefined) {
            try {
                await (await fetch(`${HOTBOX_baseURL}/power_status_forward_enabled?enable=${checked ? "1" : "0"}`, {
                    method: 'post',
                    headers: {
                        ...common_headers,
                        'Content-Type': 'application/json'
                    }
                })).json()
                createToast(`${t('power_status_forward')} ${checked ? t('enabled') : t('disabled')}`, 'green')
            } catch (e) {
                createToast(t('toast_oprate_failed'), 'red')
            }
        }
    }
})
if (collapse_smsforward_power_status_btn && collapse_smsforward_power_status_btn_component) {
    collapse_smsforward_power_status_btn.appendChild(collapse_smsforward_power_status_btn_component)
}

const initSmsForwardModal = async () => {
    const btn = document.querySelector('#smsForward')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    btn.style.backgroundColor = 'var(--dark-btn-color)'
    btn.onclick = async () => {
        initSmsForward()
        initSmsForwardSwitch().then(async () => {
            showModal('#smsForwardModal')
            if (collapse_smsforward_power_status_btn_component) {
                try {
                    const { enabled } = await (await fetch(`${HOTBOX_baseURL}/power_status_forward_enabled`, {
                        method: 'GET',
                        headers: common_headers
                    })).json()
                    collapse_smsforward_power_status_btn_component.update(enabled == "1")
                } catch (e) {
                    console.error("power_status_forward_enabled request failed", e)
                }
            }
        })
    }
}
initSmsForwardModal()

const handleSmsForwardForm = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const smtp_host = formData.get('smtp_host')
    const smtp_port = formData.get('smtp_port')
    const smtp_to = formData.get('smtp_to')
    const smtp_username = formData.get('smtp_username')
    const smtp_password = formData.get('smtp_password')
    const forward_dev_info = formData.get('forward_dev_info') != null


    if (!smtp_host || smtp_host.trim() == '') return createToast(t('toast_please_input_smtp_host'), 'red')
    if (!smtp_port || smtp_port.trim() == '') return createToast(t('toast_please_input_smtp_port'), 'red')
    if (!smtp_username || smtp_username.trim() == '') return createToast(t('toast_please_input_smtp_username'), 'red')
    if (!smtp_password || smtp_password.trim() == '') return createToast(t('toast_please_input_smtp_pwd'), 'red')
    if (!smtp_to || smtp_to.trim() == '') return createToast(t('toast_please_input_smtp_receive'), 'red')

    // Request
    try {
        const res = await (await fetch(`${HOTBOX_baseURL}/sms_forward_mail`, {
            method: 'POST',
            headers: {
                ...common_headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                smtp_host: smtp_host.trim(),
                smtp_port: smtp_port.trim(),
                smtp_username: smtp_username.trim(),
                smtp_password: smtp_password.trim(),
                smtp_to: smtp_to.trim(),
                forward_dev_info: forward_dev_info ? "1" : "0"
            })
        })).json()
        if (res.result == 'success') {
            createToast(t('toast_smtp_test_mail'), 'green')
            // form.reset()
            // closeModal('#smsForwardModal')
        } else {
            if (res.error) {
                createToast(res.error, 'red')
            } else {
                createToast(t('toast_set_failed'), 'red')
            }
        }
    }
    catch (e) {
        createToast(t('toast_request_failed'), 'red')
        return
    }
}

const handleSmsForwardCurlForm = async (e) => {
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const curl_text = formData.get('curl_text')

    if (!curl_text || curl_text.trim() == '') return createToast(t('toast_please_input_curl'), 'red')

    // Request
    try {
        const res = await (await fetch(`${HOTBOX_baseURL}/sms_forward_curl`, {
            method: 'POST',
            headers: {
                ...common_headers,
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({
                curl_text: curl_text.trim(),
            })
        })).json()
        if (res.result == 'success') {
            createToast(t('toast_curl_test_msg'), 'green')
            // form.reset()
            // closeModal('#smsForwardModal')
        } else {
            if (res.error) {
                createToast(res.error, 'red')
            } else {
                createToast(t('toast_set_failed'), 'red')
            }
        }
    }
    catch (e) {
        createToast(t('toast_request_failed'), 'red')
        return
    }
}

const handleSmsForwardDingTalkForm = async (e) => {
    console.log('DingTalk form submit triggered')
    e.preventDefault()
    const form = e.target
    const formData = new FormData(form);
    const webhook_url = formData.get('dingtalk_webhook')
    const secret = formData.get('dingtalk_secret')
    const forward_dev_info = formData.get('forward_dev_info') != null


    console.log('DingTalk form data:', { webhook_url, secret, forward_dev_info })

    if (!webhook_url || webhook_url.trim() == '') return createToast(t('no_dingtalk_url'), 'red')

    // Request
    try {
        const res = await (await fetch(`${HOTBOX_baseURL}/sms_forward_dingtalk`, {
            method: 'POST',
            headers: {
                ...common_headers,
                'Content-Type': 'application/json;charset=UTF-8'
            },
            body: JSON.stringify({
                webhook_url: webhook_url.trim(),
                secret: secret.trim(),
                forward_dev_info: forward_dev_info ? "1" : "0"
            })
        })).json()
        if (res.result == 'success') {
            createToast(t('dingtalk_test_msg_success'), 'green')
            // form.reset()
            // closeModal('#smsForwardModal')
        } else {
            if (res.error) {
                createToast(res.error, 'red')
            } else {
                createToast(t('toast_set_failed'), 'red')
            }
        }
    }
    catch (e) {
        createToast(t('toast_request_failed'), 'red')
        return
    }
}

// Switch forwarding method
const switchSmsForwardMethodTab = (e) => {
    const target = e.target
    if (target.tagName != 'BUTTON') return
    const children = target.parentNode?.children
    if (!children) return
    Array.from(children).forEach((item) => {
        if (item != target) {
            item.classList.remove('active')
        }
    })
    target.classList.add('active')
    const method = target.dataset.method
    switchSmsForwardMethod(method)
}

// Config observer: SMS forward toggle
collapseGen("#collapse_smsforward_btn", "#collapse_smsforward", "collapse_smsforward", async (status) => {
    let enabled = undefined
    status == 'open' ? enabled = '1' : enabled = '0'
    if (enabled != undefined) {
        try {
            // Enable master switch
            await (await fetch(`${HOTBOX_baseURL}/sms_forward_enabled?enable=${enabled}`, {
                method: 'post',
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json'
                }
            })).json()
            createToast(`${t('sms_forward')} ${status == 'open' ? t('enabled') : t('disabled')}`, 'green')
        } catch (e) {
            createToast(t('toast_oprate_failed'), 'red')
        }
    }
})

// Alias settings
let click_count_nickname = 1
let nickname_timer = null
const nicknameSettingClick = () => {
    nickname_timer && clearTimeout(nickname_timer)
    nickname_timer = setTimeout(() => {
        click_count_nickname = 1
    }, 1999)
    click_count_nickname++
    if (click_count_nickname <= 2) {
        return
    }
    click_count_nickname = 1
    openNicknameSetting()
}

const openNicknameSetting = async () => {
    try {
        // Get data
        const { nickname, model } = await (await fetch(`${HOTBOX_baseURL}/version_info`, {
            method: 'GET',
            headers: common_headers
        })).json()


        const { el, close } = createFixedToast('hotbox_nickname_set_toast', `
        <div style="pointer-events:all;width:80vw;max-width:400px">
        <div class="title" style="margin:0" data-i18n="forward_nickname_setting_btn">${t('forward_nickname_setting_btn')}</div>
        <input maxlength="255" id="hotbox_nickname_set_phone_list" class="input" style="padding:6px;margin:10px 0 5px 0;width: 100%;box-sizing: border-box;" placeholder="${model}">
        <div style="display:flex;gap:10px">
            <button id="confirm_nickname_set_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="submit_btn">${t("submit_btn")}</button>
            <button id="close_nickname_set_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
        </div>
        </div>
        `)
        const confirmBtn = el.querySelector("#confirm_nickname_set_setting_btn")
        const closeBtn = el.querySelector("#close_nickname_set_setting_btn")
        const nickNameEl = el.querySelector('#hotbox_nickname_set_phone_list')

        if (nickNameEl) {
            nickNameEl.value = nickname || ''
        }

        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                //Submit
                try {
                    const nickName = nickNameEl.value.trim()
                    const res = await (await fetch(`${HOTBOX_baseURL}/set_nickname`, {
                        method: 'post',
                        body: JSON.stringify({
                            nickname: nickName
                        }),
                        headers: {
                            ...common_headers,
                            'Content-Type': 'application/json'
                        }
                    })).json()
                    if (!res.result && res.error) {
                        throw new Error(res.error)
                    }
                    if (res.result && res.result == 'success') {
                        createToast(t('toast_save_success'), 'pink')
                        loadTitle()
                    }
                } catch (e) {
                    createToast(t('toast_save_failed'), 'red')
                }
                close()
            }
        }
        if (closeBtn) {
            closeBtn.onclick = () => {
                close()
            }
        }
        showModal("#" + el.id)
    } catch (e) {
        createToast(t('client_mgmt_fetch_error'), 'red')
        console.error(e)
    }
}
const nicknameSettingBtn = document.querySelector('#forward_nickname_setting_btn')
if (nicknameSettingBtn) {
    nicknameSettingBtn.onclick = openNicknameSetting
}

// SMS forwarding rule settings
const forwardMethodSettingBtn = document.querySelector('#forward_method_setting_btn')
if (forwardMethodSettingBtn) {
    forwardMethodSettingBtn.onclick = async () => {
        try {
            // Get data
            const { keywords, phone } = await (await fetch(`${HOTBOX_baseURL}/sms_forward_blacklist`, {
                method: 'GET',
                headers: common_headers
            })).json()

            const { el, close } = createFixedToast('hotbox_sms_forward_rules_toast', `
        <div style="pointer-events:all;width:80vw;max-width:400px">
        <div class="title" style="margin:0" data-i18n="hotbox_sms_forward_rules_toast_title">${t('hotbox_sms_forward_rules_toast_title')}</div>
        <p class="title" style="margin-top:10px" data-i18n="phone_black_list">${t('phone_black_list')}</p>
        <textarea id="hotbox_sms_forward_rules_phone_list" style="width: 100%;box-sizing: border-box;min-height: 5em;" data-i18n-placeholder="phone_black_list_placeholder" placeholder="${t('phone_black_list_placeholder')}"></textarea>
        <p class="title" style="margin-top:10px" data-i18n="keyword_black_list">${t('keyword_black_list')}</p>
        <textarea id="hotbox_sms_forward_rules_keywords_list" style="width: 100%;box-sizing: border-box;min-height: 6em;" data-i18n-placeholder="keyword_black_list_placeholder" placeholder="${t('keyword_black_list_placeholder')}"></textarea>
        <div style="display:flex;gap:10px">
            <button id="confirm_forward_method_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="submit_btn">${t("submit_btn")}</button>
            <button id="close_forward_method_setting_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
        </div>
        </div>
        `)
            const confirmBtn = el.querySelector("#confirm_forward_method_setting_btn")
            const closeBtn = el.querySelector("#close_forward_method_setting_btn")
            const phoneListEl = el.querySelector('#hotbox_sms_forward_rules_phone_list')
            const keywordsListEl = el.querySelector('#hotbox_sms_forward_rules_keywords_list')

            if (phoneListEl) {
                phoneListEl.value = phone
            }

            if (keywordsListEl) {
                keywordsListEl.value = keywords
            }

            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    //Submit
                    try {
                        if (!/^[0-9\n]*$/.test(phoneListEl.value.trim())) {
                            return createToast(t('phone_param_is_invalid'), 'pink');
                        }
                        const phoneList = phoneListEl.value.trim().split('\n')
                        const keywordsList = keywordsListEl.value.trim().split('\n')
                        const res = await (await fetch(`${HOTBOX_baseURL}/sms_forward_blacklist`, {
                            method: 'post',
                            body: JSON.stringify({
                                keywords: keywordsList.join('\n'),
                                phone: phoneList.join('\n')
                            }),
                            headers: {
                                ...common_headers,
                                'Content-Type': 'application/json'
                            }
                        })).json()
                        if (!res.result && res.error) {
                            throw new Error(res.error)
                        }
                        if (res.result && res.result == 'success') {
                            createToast(t('toast_save_success'), 'pink')
                        }
                    } catch (e) {
                        createToast(t('toast_save_failed'), 'red')
                    }
                    close()
                }
            }
            if (closeBtn) {
                closeBtn.onclick = () => {
                    close()
                }
            }
            showModal("#" + el.id)
        } catch (e) {
            createToast(t('client_mgmt_fetch_error'), 'red')
            console.error(e)
        }
    }
}

// OP
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

    // Register on window
    window.initSmsForward = initSmsForward;
    window.initSmsForwardSwitch = initSmsForwardSwitch;
    window.switchSmsForwardMethod = switchSmsForwardMethod;
    window.initSmsForwardModal = initSmsForwardModal;
    window.handleSmsForwardForm = handleSmsForwardForm;
    window.handleSmsForwardCurlForm = handleSmsForwardCurlForm;
    window.handleSmsForwardDingTalkForm = handleSmsForwardDingTalkForm;
    window.switchSmsForwardMethodTab = switchSmsForwardMethodTab;
    window.nicknameSettingClick = nicknameSettingClick;
    window.openNicknameSetting = openNicknameSetting;
    window.OP = OP;
})();
