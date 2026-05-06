/**
 * SMS - Send, receive, delete, render SMS messages
 */
(function () {
let getSms = async () => {
    if (!(await window.initRequestData())) {
        window.out()
        return null
    }
    try {
        let res = await getSmsInfo()
        if (!res) {
            createToast(t('client_mgmt_fetch_error'), 'red')
            return null
        }
        return res.messages ? res.messages : []
    } catch (e) {
        createToast(t('client_mgmt_fetch_error'), 'red')
        return null
    }
}

let isDisabledSendSMS = false
let sendSMS = async () => {
    const SMSInput = document.querySelector('#SMSInput')
    const PhoneInput = document.querySelector('#PhoneInput')
    if (SMSInput && SMSInput.value && SMSInput.value.trim()
        && PhoneInput && PhoneInput.value && Number(PhoneInput.value.trim())
    ) {
        try {
            if (isDisabledSendSMS) return createToast(t('toast_do_not_send_repeatly'), 'red')
            const content = SMSInput.value.trim()
            const number = PhoneInput.value.trim()
            isDisabledSendSMS = true
            const res = await sendSms_UFI({ content, number })
            if (res && res.result == 'success') {
                SMSInput.value = ''
                createToast(t('toast_sms_send_success'), 'green')
                handleSmsRender()
            } else {
                createToast((res && res.message) ? res.message : t('toast_sms_send_failed'), 'red')
            }
        } catch {
            createToast(t('toast_sms_send_failed_network'), 'red')
            // window.out()
        }
        isDisabledSendSMS = false
    } else {
        createToast(t('toast_sms_check_phone_and_content'), 'red')
    }
}

const deleteState = new Map();
const deleteSMS = async (id, flag = false) => {
    const message = document.querySelector(`#message${id}`);
    if (!message) return;
    let state = deleteState.get(id) || { confirmCount: 0, timer: null, isDeleting: false };

    if (state.isDeleting) return;

    state.confirmCount += 1;
    if (!flag) {
        message.style.display = '';
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
        state.confirmCount = 0;
        message.style.display = 'none';
        deleteState.set(id, state);
    }, 2000);

    deleteState.set(id, state);

    if (!flag) {
        if (state.confirmCount < 2) return;
    }
    state.isDeleting = true;
    deleteState.set(id, state);

    try {
        const res = await removeSmsById(id);
        if (res?.result === 'success') {
            if (!flag) {
                createToast(t('toast_delete_success'), 'green');
            }
            setTimeout(() => {
                handleSmsRender();
                state.isDeleting = false;
            }, 300)
        } else {
            createToast(res?.message || t('toast_delete_failed'), 'red');
        }
    } catch {
        createToast(t('toast_opration_failed_network'), 'red');
    }

    deleteState.delete(id);
};

let deleteAndReSendSms = async (id) => {
    await deleteSMS(id, true)
    let smsListEl = document.querySelectorAll("#sms-list .sms-item")
    if (!smsListEl || !smsListEl.length) return
    let smsList = Array.from(smsListEl)
    for (let i in smsList) {
        if (smsList[i].dataset.smsId == id) {
            const PhoneInput = document.querySelector('#PhoneInput')
            const SMSInput = document.querySelector('#SMSInput')
            if (PhoneInput && SMSInput) {
                PhoneInput.value = smsList[i].dataset.smsPhone
                SMSInput.value = decodeBase64(smsList[i].dataset.smsContent)
                await sendSMS()
            }
            break
        }
    }
}

let isFirstRender = true
let lastRequestSmsIds = null
let handleSmsRender = async () => {
    let list = document.querySelector('#sms-list')
    if (!list) createToast(t('toast_sms_list_node_not_found'), 'red')
    if (isFirstRender) {
        list.innerHTML = ` <li><h2 style="padding: 30px;text-align:center;height:100vh">Loading...</h2></li>`
    }
    isFirstRender = false
    showModal('#smsList')
    let res = await getSms()
    if (res && res.length) {
        // Skip re-render if same messages
        let ids = res.map(item => item.id).join('')
        if (ids === lastRequestSmsIds) return
        lastRequestSmsIds = ids
        const dateStrArr = [t('year'), t('month'), '&nbsp;', ':', ':', '']
        res.sort((a, b) => {
            let date_a = a.date.split(',')
            let date_b = b.date.split(',')
            date_a.pop()
            date_b.pop()
            return Number(date_b.join('')) - Number(date_a.join(''))
        })
        // Mark unread messages as read (batch)
        const allIds = res?.filter(item => item.tag == '1')?.map(item => item.id)
        if (allIds && allIds.length > 0) {
            readSmsByIds(allIds).catch(e => console.error('Mark read failed', e))
        }
        list.innerHTML = res.map(item => {
            let date = item.date.split(',')
            date.pop()
            date = date.map((item, index) => {
                return item + dateStrArr[index]
            }).join('')
            return `<li class="sms-item" data-sms-id="${item.id}" data-sms-phone="${item.number}" data-sms-content="${item.content}" style="${item.tag == '3' ? 'background-color:#ffc0cb1f;margin-right:15px' : item.tag != '2' ? 'background-color:#0880001f;margin-left:15px' : 'background-color:#ffc0cb1f;margin-right:15px'}">
                                    <div class="arrow" style="${item.tag == '3' ? 'right:-30px;border-color: transparent transparent transparent #ffc0cb1f' : item.tag == '2' ? 'right:-30px;border-color: transparent transparent transparent #ffc0cb1f' : 'left:-30px;border-color: transparent #0880001f transparent transparent'}"></div>
                                    ${item.tag == "3" ? `<svg fill="var(--dark-text-color)" stroke="currentColor"  onclick="deleteAndReSendSms(${item.id})" class="icon" style="position: absolute;right: 50px;top: 18px;" width="14px" height="14px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
            <path d="M815.36 184.96V128a36.48 36.48 0 0 1 10.24-26.88 37.76 37.76 0 0 1 52.48 0 40.96 40.96 0 0 1 11.52 26.88v172.16a40.32 40.32 0 0 1-37.12 37.12h-173.44a40.32 40.32 0 0 1-26.88-11.52 37.76 37.76 0 0 1 0-52.48 35.84 35.84 0 0 1 26.88-10.24h108.8a372.48 372.48 0 0 0-453.12-75.52A367.36 367.36 0 0 0 170.24 364.8a374.4 374.4 0 0 0-19.84 242.56 369.92 369.92 0 0 0 132.48 202.24A375.04 375.04 0 0 0 512 888.32a368.64 368.64 0 0 0 263.68-108.8A376.32 376.32 0 0 0 885.12 512H960A448 448 0 1 1 136.32 270.08a438.4 438.4 0 0 1 192-164.48 444.16 444.16 0 0 1 256-32 455.68 455.68 0 0 1 230.4 111.36z"></path>
        </svg>`: ""}
                                    <div class="icon" onclick="deleteSMS(${item.id})">
                                        <span id="message${item.id}" style="color: red;position: absolute;width: 100px;top: 2px;right: 30px;background: var(--dark-tag-color-active);display: none;text-align: center;padding: 4px;border-radius: 8px;backdrop-filter: blur(var(--blur-rate));">Tap again to delete</span>
                                        <svg fill="var(--dark-text-color)" stroke="currentColor"  xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" t="1742373390977" class="icon" viewBox="0 0 1024 1024" version="1.1" p-id="2837" width="16" height="16"><path d="M848 144H608V96a48 48 0 0 0-48-48h-96a48 48 0 0 0-48 48v48H176a48 48 0 0 0-48 48v48h768v-48a48 48 0 0 0-48-48zM176 928a48 48 0 0 0 48 48h576a48 48 0 0 0 48-48V288H176v640z m480-496a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z m-192 0a48 48 0 1 1 96 0v400a48 48 0 1 1-96 0V432z" p-id="2838"/></svg>
                                    </div>
                                    <p style="color:#adadad;font-size:16px;margin:4px 0">${item.number}${item.tag == '3' ? ` <span style="font-size:.7rem;color:red">(${t("toast_sms_send_failed")})</span>` : ""}</p>
                                    <p>${decodeBase64(item.content)}</p>
                                    <p style="text-align:right;color:#adadad;margin-top:4px">${date}</p>
                                </li > `
        }).join('')
    } else {
        if (!res) {
            return createToast(t('client_mgmt_fetch_error'), 'red')
            // window.out()
        }
        list.innerHTML = ` <li> <h2 style="padding: 30px;text-align:center;">${t('no_sms')}</h2></li >`
    }
}

    // Register on window
    window.getSms = getSms;
    window.sendSMS = sendSMS;
    window.deleteSMS = deleteSMS;
    window.deleteAndReSendSms = deleteAndReSendSms;
    window.handleSmsRender = handleSmsRender;
})();
