/**
 * Plugins and Scheduled Tasks - Plugin management, store, scheduled task CRUD
 */
(function () {
const clearAddTaskForm = () => {
    const form = document.querySelector('#AddTaskForm')
    form.id.value = '' // Clear ID
    form.id.disabled = false // Allow ID edit
    form.date_time.value = '' // Clear time
    form.repeatDaily.checked = false // Clear checkbox
    form.action.value = '' // Clear action params
}
const setAddTaskForm = (task) => {
    const form = document.querySelector('#AddTaskForm')
    form.id.value = task.id
    form.id.disabled = true
    form.date_time.value = task.time
    form.repeatDaily.checked = task.repeatDaily
    form.action.value = JSON.stringify(task.actionMap || {}, null, 2)
}

const initScheduledTask = async () => {
    const btn = document.querySelector('#ScheduledTaskManagement')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    btn.style.backgroundColor = 'var(--dark-btn-color)'
    btn.onclick = async () => {
        showModal('#ScheduledTasksModal')
        handleInitialScheduledTasks()
    }
}
initScheduledTask()

function appendTaskToList(task) {
    const SCHEDULED_TASK_LIST = document.querySelector('#SCHEDULED_TASK_LIST')
    const li = document.createElement('li')
    li.style.marginBottom = '10px'
    li.style.padding = '0 10px'
    li.style.boxSizing = 'border-box'
    li.style.width = '100%'
    li.style.overflow = 'hidden'

    li.innerHTML = `
<div style="background: none;display: flex;width: 100%;margin-top: 10px;overflow: auto;" class="card-item">
  <div style="flex:1;margin-right: 10px;">
    <p><span>${t('task_name_label')}</span><span>${task.id}</span></p>
    <p><span>${t('trigger_time_label')}</span><span>${task.time}</span></p>
    <p><span>${t('last_exe')}</span><span>${task.lastRunTimestamp ? (new Date(task.lastRunTimestamp).toLocaleString('zh-cn').replaceAll('/', '-')) : t('not_exec')}${task.hasTriggered ? `（${t('exec_ed')}）` : ""}</span></p>
    <p><span>${t('repeat_daily_label')}</span><span>${task.repeatDaily ? t('yes') : t('no')}</span></p>
    <p><span>${t('action_param')}:</span></p>
    <p class="text_Area"></p>
  </div>
</div>
<div style="padding-bottom:10px;text-align: right;">
  <button class="btn editBtn" style="margin: 2px;padding: 4px 6px;" onclick="editTask('${task.id}')">${t('edit')}</button>
  <button class="btn deleteBtn" style="margin: 2px;padding: 4px 6px;">${t('delete')}</button>
</div>
  `

    const textarea = document.createElement('textarea')
    textarea.disabled = true
    textarea.style.width = '100%'
    textarea.style.fontSize = '12px'
    textarea.style.padding = '6px'
    textarea.rows = 6
    textarea.value = JSON.stringify(task.actionMap || {}, null, 2)
    li.querySelector('.text_Area').appendChild(textarea)

    let timer = null
    let counter = 0
    // Delete function
    li.querySelector('.deleteBtn').onclick = async () => {
        timer && clearTimeout(timer)
        timer = setTimeout(() => {
            li.querySelector('.deleteBtn').innerHTML = t('delete')
            counter = 0
        }, 1000)
        li.querySelector('.deleteBtn').innerHTML = t('are_you_conform')
        counter += 1
        if (counter >= 2) {
            try {
                const res = await fetchWithTimeout(`${HOTBOX_baseURL}/remove_task`, {
                    method: 'POST',
                    headers: {
                        ...common_headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: task.id })
                })
                const json = await res.json()
                if (json.result === 'removed') {
                    createToast(t('toast_delete_success'), 'green')
                    handleInitialScheduledTasks()
                } else {
                    createToast(t('toast_delete_failed'), 'red')
                }
            } catch (e) {
                console.error(e)
                createToast(t('toast_opration_failed_network'), 'red')
            }
        }
    }

    SCHEDULED_TASK_LIST.appendChild(li)
}

const handleInitialScheduledTasks = async () => {
    const SCHEDULED_TASK_LIST = document.querySelector('#SCHEDULED_TASK_LIST')
    SCHEDULED_TASK_LIST.innerHTML = `<li style="backdrop-filter: none;padding-top: 15px;background:transparent;">
        <strong class="green" style="background:transparent;margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
            <span style="font-size: 50px;" class="spin">🌀</span>
            <span style="font-size: 16px;padding-top: 10px;">loading...</span>
        </strong>
    </li>`
    try {
        const res = await (await fetchWithTimeout(`${HOTBOX_baseURL}/list_tasks`, {
            method: 'GET',
            headers: common_headers
        })).json()
        if (res && res.tasks && res.tasks.length > 0) {
            SCHEDULED_TASK_LIST.innerHTML = ''
            // Reverse
            res.tasks.reverse().forEach((task) => {
                appendTaskToList(task)
            })
        } else {
            SCHEDULED_TASK_LIST.innerHTML = `<li style="padding:10px">${t('no_scheduled_tasks')}</li>`
        }
    }
    catch (e) {
        console.error(e)
        createToast(t('load_scheduled_task_failed_network'), 'red')
        SCHEDULED_TASK_LIST.innerHTML = ''
        return
    }
}

// Add scheduled task
const handleSubmitTask = async (e) => {
    e.preventDefault()
    const form = e.target
    const data = {
        id: form.id.value.trim(),
        time: form.date_time.value.trim(),
        repeatDaily: form.repeatDaily.checked,
        action: {}
    }

    try {
        data.action = form.action.value.trim()
            ? JSON.parse(form.action.value.trim())
            : {}
    } catch (e) {
        return createToast(t('toast_is_not_valid_json'), 'red')
    }

    try {
        const res = await fetchWithTimeout(`${HOTBOX_baseURL}/add_task`, {
            method: 'POST',
            headers: {
                ...common_headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })

        const json = await res.json()
        if (json.result === 'success') {
            createToast(t('toast_save_success'), 'green')
            closeModal('#AddTaskModal', 300, () => {
                showModal("#ScheduledTasksModal")
            })
            handleInitialScheduledTasks()

            // Clear fields
            form.id.value = ''
            form.date_time.value = ''
            form.repeatDaily.checked = false
            form.action.value = ''
        } else {
            createToast(t('toast_add_failed'), 'red')
        }
    } catch (e) {
        console.error(e)
        createToast(t('toast_network_error'), 'red')
    }
}

const addTask = () => {
    clearAddTaskForm()
    showModal('#AddTaskModal')
}

const refreshTask = () => {
    handleInitialScheduledTasks()
}

const editTask = (id) => {
    closeModal("#ScheduledTasksModal", 300, async () => {
        clearAddTaskForm()
        const form = document.querySelector('#AddTaskForm')
        form.id.value = id
        // Get latest data
        try {
            const res = await fetchWithTimeout(`${HOTBOX_baseURL}/get_task?id=${id}`, {
                headers: {
                    ...common_headers,
                    'Content-Type': 'application/json'
                },
            })
            const json = await res.json()
            // Pre-fill form
            setAddTaskForm(json)
            form.id.disabled = true // Disable ID edit
            setTimeout(() => {
                showModal('#AddTaskModal')
            }, 100);
        } catch (e) {
            console.error(e)
            createToast(t('toast_request_error'), 'red')
        }
    })
}

const closeAddTask = () => {
    closeModal('#AddTaskModal', 300, () => {
        showModal("#ScheduledTasksModal")
        clearAddTaskForm()
    })
}

const fillAction = async (e, actionName) => {
    e.preventDefault()
    // Action list
    const actionList = {
        "forward_device_info": {
            "hotbox_do_sms_forward_action": "1"
        },
        "send_sms": {
            "goformId": "SEND_SMS",
            "Number": t("phone_number"),
            "MessageBody": `"${t("sms_content")}"`
        },
        "indicator_light": {
            "goformId": "INDICATOR_LIGHT_SETTING",
            "indicator_light_switch": `${t('one_or_zero_prompt')}`
        },
        "NFC": {
            goformId: 'WIFI_NFC_SET',
            web_wifi_nfc_switch: `${t('one_or_zero_prompt')}`
        },
        "file_sharing": {
            goformId: 'SAMBA_SETTING',
            samba_switch: `${t('one_or_zero_prompt')}`
        },
        "network_roaming": {
            goformId: 'SET_CONNECTION_MODE',
            ConnectionMode: "auto_dial",
            roam_setting_option: `${t('on_or_off_prompt')}`,
            dial_roam_setting_option: `${t('on_or_off_prompt')}`
        },
        "performance_mode": {
            goformId: 'PERFORMANCE_MODE',
            performance_mode: `${t('one_or_zero_prompt')}`
        },
        "usb_debug": {
            goformId: 'USB_PORT_SETTING',
            usb_port_switch: `${t('one_or_zero_prompt')}`
        },
        "data_on": {
            goformId: 'CONNECT_NETWORK',
        },
        "data_off": {
            goformId: 'DISCONNECT_NETWORK',
        },
        "wifi_off": {
            goformId: 'switchWiFiModule',
            SwitchOption: 0
        },
        "wifi_5g_on": {
            goformId: 'switchWiFiChip',
            ChipEnum: 'chip2',
            GuestEnable: 0
        },
        "wifi_24g_on": {
            goformId: 'switchWiFiChip',
            ChipEnum: 'chip1',
            GuestEnable: 0
        },
        "5G/4G/3G": {
            goformId: 'SET_BEARER_PREFERENCE',
            BearerPreference: 'WL_AND_5G'
        },
        "5G NSA": {
            goformId: 'SET_BEARER_PREFERENCE',
            BearerPreference: 'LTE_AND_5G'
        },
        "5G SA": {
            goformId: 'SET_BEARER_PREFERENCE',
            BearerPreference: 'Only_5G'
        },
        "only_4g": {
            goformId: 'SET_BEARER_PREFERENCE',
            BearerPreference: 'Only_LTE'
        },
        "shutdown": {
            goformId: 'SHUTDOWN_DEVICE'
        },
        "reboot": {
            goformId: 'REBOOT_DEVICE'
        },
        "unlock_cell": {
            goformId: 'UNLOCK_ALL_CELL'
        },
        "lock_cell": {
            goformId: 'CELL_LOCK',
            pci: "912",
            earfcn: "504990",
            rat: `${t('cell_lock_prompt')}`
        },
        "switch_sim1": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 0
        },
        "switch_sim2": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 1
        },
        "switch_cmcc": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 0
        },
        "switch_cucc": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 2
        },
        "switch_ctcc": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 1
        },
        "switch_external": {
            goformId: 'SET_SIM_SLOT',
            sim_slot: 11
        }
    }
    const taskAction = document.querySelector('#taskAction')
    if (!taskAction) return
    const action = actionList[actionName]
    if (action) {
        if (actionName == "send_sms") {
            if (!action.MessageBody) return
            const { el, close } = createFixedToast('hotbox_sms_body', `
            <div style="pointer-events:all;width:80vw;max-width:300px;">
            <div class="title" style="margin:0" data-i18n="please_input_sms_body_and_phone">${t('please_input_sms_body_and_phone')}</div>
            <input type="text" id="HOTBOX_SMS_PHONE_NUMBER_FORWARD" style="padding:6px;width:100%;margin:10px 0" data-i18n-placeholder="phone_number" placeholder="${t("phone_number")}" ></input>
            <textarea data-i18n-placeholder="sms_content" placeholder="${t("sms_content")}" id="HOTBOX_SMS_TEXT_FORWARD" style="padding:4px;width:100%;box-sizing:border-box;min-height: 10em;"></textarea>
            <div style="display:flex;gap:10px">
                <button id="close_sms_body_toast_btn" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="confirm_btn">${t("confirm_btn")}</button>
                <button id="close_sms_body_toast_btn1" style="width:100%;font-size:.64rem;margin-top:5px" data-i18n="cancel_btn">${t("cancel_btn")}</button>
            </div>
            </div>
            `, 'red')
            const btn = el.querySelector('#close_sms_body_toast_btn')
            const btn2 = el.querySelector('#close_sms_body_toast_btn1')
            const phone = el.querySelector("#HOTBOX_SMS_PHONE_NUMBER_FORWARD")
            const text = el.querySelector("#HOTBOX_SMS_TEXT_FORWARD")
            const taskAction = document.querySelector("#taskAction")

            if (!btn && !btn2 && !text && !phone) {
                close()
                return
            }
            btn2.onclick = () => {
                close()
            }
            if (taskAction) {
                try {
                    const data = JSON.parse(taskAction.value.trim())
                    phone.value = data.Number
                    text.value = gsmDecode(data.MessageBody.trim())
                } catch (e) {
                    console.log('taskAction parse failed', e)
                }
            }
            btn.onclick = () => {
                const parsedVal = gsmEncode(text.value.trim())
                const parsedPhone = phone.value.trim()
                if (isNaN(parseInt(parsedPhone))) return createToast(t("please_input_correct_phone_number"), 'pink')
                if (parsedVal == "" || !parsedVal) return createToast(t("sms_content_not_empty"), 'pink')
                action.MessageBody = parsedVal
                action.Number = parsedPhone
                taskAction.value = JSON.stringify(action, null, 2)
                createToast(t("toast_save_success", 'pink'))
                close()
            }
        }
        if (actionName == "forward_device_info") {
            try {
                const { enabled } = await (await fetch(`${HOTBOX_baseURL}/sms_forward_enabled`, {
                    method: 'GET',
                    headers: common_headers
                })).json()
                if (enabled != "1") {
                    return createToast(t("action_forward_dev_info_notice") + "<br>" + t("action_forward_dev_info_notice_fail"), "pink", 5000)
                }
            } catch (e) {
                console.error('Failed to get SMS forward info:', e)
                return createToast(t('client_mgmt_fetch_error', 'pink'))
            }
        }
        if (actionName != "send_sms") {
            taskAction.value = JSON.stringify(action, null, 2)
        }
    }
}

// Drag-upload plugin
(() => {
    const dropZone = document.getElementById('pluginDropZone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.border = '2px dashed #007bff';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.border = '2px solid transparent';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.border = '2px solid transparent';
        const files = e.dataTransfer.files;

        if (files.length > 0) {
            const fakeEvent = {
                target: {
                    files: files
                }
            };
            handlePluginFileUpload(fakeEvent);
        }
    });

})()


// Plugin upload
const handlePluginFileUpload = (event) => {
    return new Promise((resolve, reject) => {
        const file = event.target.files[0];

        if (!file) return;

        if (file.size > 1145 * 1024) {
            const msg = `${t('toast_file_size_not_over_than')}${1145}KB！`
            createToast(msg, 'red')
            reject({ msg, data: null })
            return
        }

        const reader = new FileReader();
        reader.readAsText(file);

        reader.onload = (e) => {
            const str = e.target.result;
            const custom_head = document.querySelector("#custom_head");
            if (!custom_head) return;

            const pluginRegex = /<!--\s*\[HOTBOX_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[HOTBOX_PLUGIN_END\]\s*\1\s*-->/g;

            let matched = false;
            let match;
            let msgs = ''
            while ((match = pluginRegex.exec(str)) !== null) {
                console.log('Matched a plugin set');

                matched = true;

                const pluginName =
                    (match[1].trim() || match[3].trim() || file.name).replace(/-->/g, "").trim();
                const pluginContent = match[2].trim();

                custom_head.value += `<!-- [HOTBOX_PLUGIN_START] ${pluginName} -->\n${pluginContent}\n<!-- [HOTBOX_PLUGIN_END] ${pluginName} -->\n\n`;

                if (!plugins.some(el => el.name === pluginName)) {
                    plugins.push({
                        name: pluginName,
                        content: pluginContent
                    });
                } else {
                    msgs += `<p>${t('plugin')}:${pluginName} ${t('exists_skip')}</p>`
                }
            }
            if (msgs) {
                createToast(msgs, 'pink', 5000)
            }

            if (matched) {
                createToast(t('toast_add_success_save_to_submit'), 'green');
                resolve({ msg: 'added as plugin set' });
            } else {
                // No plugin header/footer, manually wrap as one plugin
                const pluginName = file.name;
                custom_head.value += `<!-- [HOTBOX_PLUGIN_START] ${pluginName} -->\n${str}\n<!-- [HOTBOX_PLUGIN_END] ${pluginName} -->\n\n\n\n`;
                if (!plugins.some(el => el.name === pluginName)) {
                    plugins.push({
                        name: pluginName,
                        content: str
                    });
                    createToast(t('toast_add_success_save_to_submit'), 'pink');
                } else {
                    createToast(t('same_plugin'), 'pink')
                }
                resolve({ msg: 'added as single plugin' });
            }

            renderPluginList();
        }
    })
}

// Plugin export
const pluginExport = async () => {
    try {
        const { text } = await (await fetch(`${HOTBOX_baseURL}/get_custom_head`, {
            headers: common_headers
        })).json()
        if (text) {
            const b = new Blob([text], { type: 'text/plain' })
            const date = (new Date()).toLocaleString("zh-cn").replaceAll(" ", "_").replaceAll("/", "_").replaceAll(":", "_")
            saveAs(b, `UFI-TOOLS_Plugins_${date}.txt`)
        }
    } catch (e) {
        console.error(e)
        createToast(t('toast_get_plugin_failed_check_network'), 'red')
    }
}

const onPluginBtn = () => {
    document.querySelector('#pluginFileInput')?.click()
}

// Initialize plugins
let sortable_plugin = null
let plugins = []

const renderPluginList = () => {
    const listEl = document.getElementById('sortable-list')
    const custom_head = document.querySelector('#custom_head')

    listEl.innerHTML = ''

    plugins.forEach((item, index) => {
        const el = document.createElement('li')
        el.dataset.index = index
        el.style.display = "flex"
        el.style.justifyContent = "space-between"
        el.style.alignItems = "center"
        el.style.width = "100%"
        el.style.gap = "10px"

        const deleteBtn = document.createElement('div')
        deleteBtn.style.height = '20px'
        deleteBtn.classList.add('drag-option', 'delete-btn')
        deleteBtn.innerHTML = `<svg fill="var(--dark-text-color)" stroke="currentColor"  width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M736 352.032L736.096 800h-0.128L288 799.968 288.032 352 736 352.032zM384 224h256v64h-256V224z m448 64h-128V202.624C704 182.048 687.232 160 640.16 160h-256.32C336.768 160 320 182.048 320 202.624V288H192a32 32 0 1 0 0 64h32V799.968C224 835.296 252.704 864 288.032 864h447.936A64.064 64.064 0 0 0 800 799.968V352h32a32 32 0 1 0 0-64z"  /><path d="M608 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32M416 690.56a32 32 0 0 0 32-32V448a32 32 0 1 0-64 0v210.56a32 32 0 0 0 32 32"  /></svg>`
        deleteBtn.onclick = () => {
            plugins.splice(index, 1)
            createToast(`${t('deleted_plugin')}：${item.name}，${t('save_to_apply')}！`)
            renderPluginList() // re-render
        }

        const sortBtn = document.createElement('div')
        sortBtn.classList.add('handle', 'drag-option')
        sortBtn.style.height = '20px'
        sortBtn.innerHTML = `<svg fill="var(--dark-text-color)" stroke="currentColor"  width="20px" height="20px" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M909.3 506.3L781.7 405.6c-4.7-3.7-11.7-0.4-11.7 5.7V476H548V254h64.8c6 0 9.4-7 5.7-11.7L517.7 114.7c-2.9-3.7-8.5-3.7-11.3 0L405.6 242.3c-3.7 4.7-0.4 11.7 5.7 11.7H476v222H254v-64.8c0-6-7-9.4-11.7-5.7L114.7 506.3c-3.7 2.9-3.7 8.5 0 11.3l127.5 100.8c4.7 3.7 11.7 0.4 11.7-5.7V548h222v222h-64.8c-6 0-9.4 7-5.7 11.7l100.8 127.5c2.9 3.7 8.5 3.7 11.3 0l100.8-127.5c3.7-4.7 0.4-11.7-5.7-11.7H548V548h222v64.8c0 6 7 9.4 11.7 5.7l127.5-100.8c3.7-2.9 3.7-8.5 0.1-11.4z" /></svg>`

        const text = document.createElement('span')
        text.innerHTML = item.disabed ? `<del style="opacity:.6">${item.name}</del>` : item.name
        text.style.padding = '2px 6px'

        text.onclick = () => {
            const editSinglePlugin = document.querySelector('#editSinglePlugin')
            if (editSinglePlugin) {
                const currentItem = item
                document.querySelector('#currentPluginName').textContent = currentItem.name
                showModal('#editSinglePluginModal')
                editSinglePlugin.value = currentItem.content
                const submitEditSinglePlugin = document.querySelector('#submitEditSinglePlugin')
                if (submitEditSinglePlugin) {
                    submitEditSinglePlugin.onclick = () => {
                        const index = plugins.findIndex(el => el.name == currentItem.name)
                        if (index != -1 && plugins[index]) {
                            plugins[index].content = editSinglePlugin.value
                            const arr = editSinglePlugin.value.split('\n')
                            if (arr[0].includes("[hotbox_disabled]") && arr[arr.length - 1].includes("[hotbox_disabled]")) {
                                plugins[index].disabed = true
                            } else {
                                plugins[index].disabed = false
                            }
                            renderPluginList()
                            closeModal('#editSinglePluginModal')
                            editSinglePlugin.value = ''
                            document.querySelector('#currentPluginName').textContent = ''
                            createToast(t('toast_add_success_save_to_submit'), 'pink')
                        }
                    }
                }
            }
        }

        el.appendChild(sortBtn)
        el.appendChild(text)
        el.appendChild(deleteBtn)
        listEl.appendChild(el)
    })

    const enablePlugin = (flag = false) => {
        const editSinglePlugin = document.querySelector('#editSinglePlugin')
        if (editSinglePlugin) {
            const arr = editSinglePlugin.value.split('\n')
            if (arr[0].includes("[hotbox_disabled]")) {
                arr.shift()
            }
            if (arr[arr.length - 1].includes("[hotbox_disabled]")) {
                arr.pop()
            }
            editSinglePlugin.value = arr.join('\n')
            !flag && createToast(t('enabled') + "," + t('save_to_apply'))
        }
    }

    const disablePlugin = (flag = false) => {
        const editSinglePlugin = document.querySelector('#editSinglePlugin')
        if (editSinglePlugin) {
            enablePlugin(true)
            editSinglePlugin.value = "<!-- [hotbox_disabled]\n" + editSinglePlugin.value + "\n[hotbox_disabled] -->"
            !flag && createToast(t('disabled') + "," + t('save_to_apply'))
        }
    }

    // Mount
    window.disablePlugin = disablePlugin
    window.enablePlugin = enablePlugin

    // Initialize or rebind drag
    if (sortable_plugin && sortable_plugin.destroy) {
        sortable_plugin.destroy()
        sortable_plugin = null
    }

    sortable_plugin = new Sortable(listEl, {
        animation: 150,
        handle: '.handle',
        onEnd: (evt) => {
            const moved = plugins.splice(evt.oldIndex, 1)[0]
            plugins.splice(evt.newIndex, 0, moved)
            renderPluginList() // re-render after drag
        }
    })

    // Sync textarea content
    custom_head.value = plugins.map(item =>
        `<!-- [HOTBOX_PLUGIN_START] ${item.name} -->\n${item.content}\n<!-- [HOTBOX_PLUGIN_END] ${item.name} -->\n\n\n\n`
    ).join('')

    // Sync plugin count
    const PLUGINS_NUM = document.querySelector('#PLUGINS_NUM')
    if (PLUGINS_NUM) PLUGINS_NUM.innerHTML = plugins.length
}

const initPluginSetting = async () => {
    const btn = document.querySelector('#PLUGIN_SETTING')
    if (!btn) return null
    if (!(await window.initRequestData())) {
        btn.onclick = () => createToast(t('toast_please_login'), 'red')
        btn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
        return null
    }
    btn.style.backgroundColor = 'var(--dark-btn-color)'
    btn.onclick = async () => {
        showModal('#PluginModal')

        try {
            const { text } = await (await fetch(`${HOTBOX_baseURL}/get_custom_head`, {
                headers: common_headers
            })).json()
            const custom_head = document.querySelector('#custom_head')
            custom_head.value = text || ''

            // Extract plugins
            const pluginRegex = /<!--\s*\[HOTBOX_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[HOTBOX_PLUGIN_END\]\s*\1\s*-->/g;

            plugins = []
            let match
            while ((match = pluginRegex.exec(text)) !== null) {
                const name = match[1].trim()
                const content = match[2].trim()
                const disabed = content.includes('[hotbox_disabled]')
                plugins.push({ name, content, disabed })
            }

            renderPluginList() // initial render
        } catch (e) {
            console.error(e)
            createToast(t('toast_get_plugin_failed'), 'red')
        }
    }
}
initPluginSetting()

const clearPluginText = () => {
    const custom_head = document.querySelector('#custom_head')
    custom_head.value = ''
    createToast(t('toast_clear_success_save_to_submit'), 'green')
    plugins.length = 0
    renderPluginList()
}

const savePluginSetting = async (e) => {
    const custom_head = document.querySelector('#custom_head')
    if ((await window.initRequestData())) {
        setCustomHead(custom_head.value?.trim() || '').then(async ({ result, error }) => {
            if (result != "success") {
                if (error)
                    createToast(error, 'red')
                else
                    createToast(t('plugin_save_fail_network'), 'red')
            } else {
                createToast(t('save_plugin_success_refresh'), 'green')
                closeModal('#PluginModal')
                setTimeout(() => {
                    location.reload()
                }, 2000)
            }
        })
    } else {
        createToast(t("not_login_not_save_plugin"), 'yellow')
    }
}


const installPluginFromStore = async (url, name) => {
    const { close, el } = createFixedToast('download_ing', t('download_ing'))
    try {
        const res = await fetchWithTimeout(`${HOTBOX_baseURL}/proxy/--${url}`, {
            method: 'GET',
        })
        if (!res.ok) {
            createToast(t('download_failed'), 'red')
            close()
            return
        }
        const text = await res.text()
        createToast(t('install_ing'), 'pink', 3000, () => {
            close() // close download toast
        })
        await handlePluginFileUpload({
            target: {
                files: [new File([text], name, { type: 'text/plain' })]
            }
        })
    } catch {
        createToast(t('download_failed'), 'red')
    } finally {
        close()
    }
}

// Render plugins
const renderPluginItems = (items, download_url) => {
    const items_el = document.querySelector('#plugin_store .plugin-items')
    items_el.innerHTML = '' // clear previous content
    items.forEach(plugin => {
        const li = document.createElement('li')
        li.className = 'plugin-item'
        li.innerHTML = `
                        <div class="plugin-title">
                        ${plugin.name}
                        </div>
                        <div class="info">
                            <span>MD5:${plugin?.hash_info?.md5}</span><br>
                            <span>last-modified: ${new Date(plugin?.modified).toLocaleString('zh-cn')}</span>
                        </div>
                        <div class="actions">
                            <button onclick="installPluginFromStore('${download_url}/${plugin.name}','${plugin.name}')">${t('one_click_install')}</button>
                            <button onclick="downloadUrl('${download_url}/${plugin.name}')">${t('only_download')}</button>
                        </div>
                    `
        items_el.appendChild(li)
    })
}

const scrollToElementWithScrollContainerAndElement = ({ scrollContainer, el, highLightKeyWord }) => {
    // Calculate el position relative to scrollContainer
    const topOffset = -15
    const elTop = el.getBoundingClientRect().top;
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const relativeTop = elTop - containerTop + scrollContainer.scrollTop + topOffset;

    // Smooth scroll to position
    scrollContainer.scrollTo({
        top: relativeTop,
        behavior: 'smooth'
    });
    if (highLightKeyWord) {
        // Highlight this plugin
        let outerEl = el.parentElement
        outerEl.style.boxShadow = '0 0 4px 1px yellow'
        setTimeout(() => {
            outerEl.style.boxShadow = ''
        }, 5000);
    }
}

// Search plugin, scroll to position
const scrollToElement = (elementsName = '#plugin_store .plugin-title', keyword, highLightKeyWord = true) => {
    let found = false
    let foundList = []
    let scrollContainer = null
    document.querySelectorAll(elementsName).forEach(el => {
        const find = el.textContent?.toLowerCase()?.includes(keyword?.toLowerCase())
        if (find) {
            // Find nearest scrollable container
            scrollContainer = el.parentElement;
            while (scrollContainer && scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
                scrollContainer = scrollContainer.parentElement;
            }

            if (scrollContainer) {
                scrollToElementWithScrollContainerAndElement({
                    scrollContainer, el, highLightKeyWord
                })
                foundList.push(el)
                found = true
            } else {
                found = false
            }
        }
    });

    console.log(foundList);

    if (scrollContainer) {
        if (foundList.length > 0) {
            scrollToElementWithScrollContainerAndElement({
                scrollContainer,
                el: foundList[0],
                highLightKeyWord
            })
        }
    }

    return found
}

// Plugin market
const plugin_store_modal = document.querySelector('#plugin_store')
plugin_store_modal.onclick = (e) => {
    e.stopPropagation()
    const pluginModal = document.querySelector('#PluginModal')
    const classList = Array.from(e?.target?.classList || [])
    const id = e.target.id
    if (classList && classList.includes('mask')) {
        if (id) {
            closeModal(`#${id}`);
            setTimeout(() => {
                showModal('#PluginModal')
            }, 200);
        }
    }
}

const plugin_store = document.querySelector('#plugin_store_btn')
const pluginsResultRes = []
let timer_input = null
plugin_store.onclick = (e) => {
    // Hide plugins modal
    const pluginModal = document.querySelector('#PluginModal')
    pluginModal.style.display = 'none'

    const plugin_store_close_btn = document.querySelector('#plugin_store_close_btn')
    plugin_store_close_btn.onclick = () => {
        closeModal('#plugin_store', 200, () => {
            showModal('#PluginModal')
        })
    }

    const pluginSearchInputEl = document.querySelector("#pluginSearchInput")
    if (pluginSearchInputEl) {
        const searchListEl = document.querySelector("#plugin_store .searchList")
        if (searchListEl) {
            pluginSearchInputEl.oninput = (e) => {
                const keyword = e.target.value.trim()
                const foundList = []
                searchListEl.innerHTML = ''
                if (pluginsResultRes.length > 0) {
                    pluginsResultRes.forEach(el => {
                        let name_lower = el.name.toLowerCase()
                        let keyword_lower = keyword.toLowerCase()
                        if (keyword_lower && name_lower.includes(keyword_lower)) {
                            foundList.push(el)
                        }
                    })
                }
                if (foundList.length) {
                    searchListEl.style.display = 'block'
                    foundList.forEach(el => {
                        const itemEl = document.createElement("div")
                        itemEl.className = "searchListItem"
                        itemEl.innerHTML = el.name
                        itemEl.onclick = () => {
                            pluginSearchInputEl.value = el.name
                            document.querySelector("#pluginSearchBtn").click()
                        }
                        searchListEl.appendChild(itemEl)
                    })
                } else {
                    searchListEl.style.display = 'none'
                }
            }
            pluginSearchInputEl.onblur = () => {
                timer_input && clearTimeout(timer_input)
                timer_input = setTimeout(() => {
                    searchListEl.style.display = 'none'
                }, 200);
            }
        }
    }
    showModal('#plugin_store')
    const items = document.querySelector('#plugin_store .plugin-items')
    //loading
    items.innerHTML = `
    <li style="padding-top: 15px;overflow:hidden">
        <strong class="green" style="text-align: center;margin: 10px auto;margin-top: 0; display: flex;flex-direction: column;padding: 40px;">
            <span style="font-size: 50px;" class="spin">🌀</span>
            <span style="font-size: 16px;padding-top: 10px;">loading...</span>
        </strong>
    </li>
    `
    const total = document.querySelector('#plugin_store .total')
    // Load plugins
    pluginsResultRes.length = 0
    fetchWithTimeout(`${HOTBOX_baseURL}/plugins_store`)
        .then(res => res.json())
        .then(({ res, download_url }) => {
            const data = res.data || {}
            items.innerHTML = ''
            if (data && data.content && data.content.length > 0) {
                pluginsResultRes.push(...data.content)
                total.innerHTML = `${t('plugin_modal_num')}: ${data.content.length}`
                // Pagination
                const pageSize = 10
                const totalPages = Math.ceil(data.content.length / pageSize)
                let pageNum = 0
                const cur_page_el = document.querySelector('#plugin_store_cur_page')
                const total_page_el = document.querySelector('#plugin_store_total_page')
                cur_page_el.innerHTML = pageNum + 1
                total_page_el.innerHTML = totalPages
                renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)

                // Next page
                const nextPageBtn = document.querySelector('#plugin_store_next_page')
                nextPageBtn.style.backgroundColor = totalPages <= 1 ? 'var(--dark-btn-disabled-color)' : ''
                nextPageBtn.onclick = () => {
                    pageNum++
                    if (pageNum >= totalPages - 1) {
                        nextPageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                    } else {
                        nextPageBtn.style.backgroundColor = ''
                    }
                    if (pageNum >= totalPages) {
                        pageNum = totalPages - 1
                        return
                    }
                    prevageBtn.style.backgroundColor = ''
                    cur_page_el.innerHTML = pageNum + 1
                    total_page_el.innerHTML = totalPages
                    renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                }

                // Previous page
                const prevageBtn = document.querySelector('#plugin_store_prev_page')
                prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                prevageBtn.onclick = () => {
                    pageNum--
                    if (pageNum <= 0) {
                        prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                    } else {
                        prevageBtn.style.backgroundColor = ''
                    }
                    if (pageNum < 0) {
                        pageNum = 0
                        return
                    }
                    nextPageBtn.style.backgroundColor = ''
                    cur_page_el.innerHTML = pageNum + 1
                    total_page_el.innerHTML = totalPages
                    renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                }

                // Search plugins
                const pluginSearchBtn = document.querySelector('#pluginSearchBtn')
                pluginSearchBtn.onclick = () => {
                    const pluginSearchInput = document.querySelector('#pluginSearchInput')
                    const keyword = pluginSearchInput.value.trim()

                    const scrollToFirstPage = () => {
                        pageNum = 0
                        prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        nextPageBtn.style.backgroundColor = ''
                        cur_page_el.innerHTML = pageNum + 1
                        renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                        scrollToElement('#plugin_store .plugin-title', data.content[0].name, false)
                    }

                    if (!keyword || keyword == '') {
                        return scrollToFirstPage()
                    }

                    // Find existing page number and jump

                    const cur_index = data.content.findIndex(plugin => {
                        return plugin.name?.toLowerCase()?.includes(keyword?.toLowerCase())
                    })

                    if (cur_index == -1) {
                        createToast(`${t('no_plugins_found')}：${keyword}`, 'red')
                        return scrollToFirstPage()
                    }

                    pageNum = Math.floor(cur_index / pageSize)

                    if (pageNum == 0) {
                        prevageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                        nextPageBtn.style.backgroundColor = ''
                    } else if (pageNum == totalPages - 1) {
                        prevageBtn.style.backgroundColor = ''
                        nextPageBtn.style.backgroundColor = 'var(--dark-btn-disabled-color)'
                    } else {
                        prevageBtn.style.backgroundColor = ''
                        nextPageBtn.style.backgroundColor = ''
                    }

                    cur_page_el.innerHTML = pageNum + 1
                    renderPluginItems(data.content.slice(pageNum * pageSize, pageNum * pageSize + pageSize), download_url)
                    scrollToElement('#plugin_store .plugin-title', keyword)
                    return
                }

                const plugin_search_reset_btn = document.querySelector('#pluginSearchResetBtn')
                plugin_search_reset_btn.onclick = () => {
                    const pluginSearchInput = document.querySelector('#pluginSearchInput')
                    pluginSearchInput.value = '';
                    pluginSearchBtn.click() // trigger search
                }

            } else {
                items.innerHTML = `<li style="padding:10px">${t('no_plugins_found')}</li>`
            }
        })
        .catch(err => {
            console.error(err)
            items.innerHTML = `<li style="padding:10px">${t('error_loading_plugins')}</li>`
        })

}

const handlePluginStoreSearchInput = (e) => {
    if (e.code.toLowerCase() == 'enter') {
        const pluginSearchBtn = document.querySelector('#pluginSearchBtn')
        if (pluginSearchBtn) {
            pluginSearchBtn.click()
        }
    }
}

    // Register on window
    window.clearAddTaskForm = clearAddTaskForm;
    window.setAddTaskForm = setAddTaskForm;
    window.initScheduledTask = initScheduledTask;
    window.appendTaskToList = appendTaskToList;
    window.handleInitialScheduledTasks = handleInitialScheduledTasks;
    window.handleSubmitTask = handleSubmitTask;
    window.addTask = addTask;
    window.refreshTask = refreshTask;
    window.editTask = editTask;
    window.closeAddTask = closeAddTask;
    window.fillAction = fillAction;
    window.handlePluginFileUpload = handlePluginFileUpload;
    window.pluginExport = pluginExport;
    window.onPluginBtn = onPluginBtn;
    window.renderPluginList = renderPluginList;
    window.initPluginSetting = initPluginSetting;
    window.clearPluginText = clearPluginText;
    window.savePluginSetting = savePluginSetting;
    window.installPluginFromStore = installPluginFromStore;
    window.renderPluginItems = renderPluginItems;
    window.scrollToElement = scrollToElement;
    window.handlePluginStoreSearchInput = handlePluginStoreSearchInput;
})();
