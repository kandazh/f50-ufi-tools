/**
 * SMS Panel — Two-view messenger: Inbox list → Chat conversation
 * SMS Forwarding — Tab switching for method forms.
 */
(function () {
  // === Messaging accordion (Inbox & Chat / Auto Forward) ===
  (function initMsgAccordion() {
    var panel = document.querySelector('[data-ctrl-panel="sms"]');
    if (!panel) return;
    var items = panel.querySelectorAll('.sched-accordion-item');
    items.forEach(function (item) {
      var header = item.querySelector('.sched-accordion-header');
      if (!header) return;
      header.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        // Close all open items
        items.forEach(function (other) {
          if (other.classList.contains('open')) {
            var ob = other.querySelector('.sched-accordion-body');
            if (ob) {
              ob.style.transition = 'none';
              ob.style.height = ob.scrollHeight + 'px';
              void ob.offsetHeight;
              other.classList.remove('open');
              ob.style.transition = '';
              void ob.offsetHeight;
              ob.style.height = '0';
            } else {
              other.classList.remove('open');
            }
          }
        });
        // Open clicked item if it wasn't already open
        if (!isOpen) {
          var body = item.querySelector('.sched-accordion-body');
          if (body) {
            item.classList.add('open');
            var h = body.scrollHeight;
            body.style.transition = 'none';
            body.style.height = '0';
            void body.offsetHeight;
            body.style.transition = '';
            void body.offsetHeight;
            body.style.height = h + 'px';
            body.addEventListener('transitionend', function handler() {
              body.removeEventListener('transitionend', handler);
              body.style.height = 'auto';
            });
          } else {
            item.classList.add('open');
          }
        }
      });
    });
  })();

  var smsPollTimer = null;
  var allMessages = [];
  var currentContact = null; // phone number of open conversation
  var isFirstLoad = true;

  // DOM refs
  function $id(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function decodeContent(base64) {
    return typeof decodeBase64 === 'function' ? decodeBase64(base64) : atob(base64);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split(','); p.pop();
    return p[0] + '/' + String(p[1]).padStart(2, '0') + '/' + String(p[2]).padStart(2, '0') + ' ' + String(p[3]).padStart(2, '0') + ':' + String(p[4]).padStart(2, '0');
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split(','); p.pop();
    return String(p[3]).padStart(2, '0') + ':' + String(p[4]).padStart(2, '0');
  }

  function getInitials(number) {
    if (!number) return '?';
    var clean = number.replace(/[^0-9+]/g, '');
    return clean.slice(-2);
  }

  // Group messages by contact number
  function groupByContact(messages) {
    var groups = {};
    messages.forEach(function (m) {
      var key = m.number;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    });
    return groups;
  }

  // Sort messages chronologically
  function sortMessages(msgs) {
    return msgs.slice().sort(function (a, b) {
      var da = a.date.split(','); da.pop();
      var db = b.date.split(','); db.pop();
      return Number(da.join('')) - Number(db.join(''));
    });
  }

  // ========== INBOX VIEW ==========
  function renderInbox() {
    var listEl = $id('smsPanel_inbox-list');
    if (!listEl) return;

    if (!allMessages.length) {
      listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">📭</span>No conversations</div>';
      return;
    }

    var groups = groupByContact(allMessages);
    // Build sorted conversation list (latest message first)
    var convos = Object.keys(groups).map(function (number) {
      var msgs = sortMessages(groups[number]);
      var last = msgs[msgs.length - 1];
      var unread = msgs.filter(function (m) { return m.tag === '1'; }).length;
      return { number: number, lastMsg: last, messages: msgs, unread: unread };
    });
    // Sort by last message date (newest first)
    convos.sort(function (a, b) {
      var da = a.lastMsg.date.split(','); da.pop();
      var db = b.lastMsg.date.split(','); db.pop();
      return Number(db.join('')) - Number(da.join(''));
    });

    listEl.innerHTML = convos.map(function (c) {
      var preview = decodeContent(c.lastMsg.content);
      if (preview.length > 40) preview = preview.substring(0, 40) + '…';
      var time = formatShortDate(c.lastMsg.date);
      var badge = c.unread > 0 ? '<span class="sms-inbox-item__badge">' + c.unread + '</span>' : '';

      return '<div class="sms-inbox-item" data-contact="' + escapeHtml(c.number) + '">' +
        '<div class="sms-inbox-item__avatar">' + getInitials(c.number) + '</div>' +
        '<div class="sms-inbox-item__body">' +
          '<div class="sms-inbox-item__top">' +
            '<span class="sms-inbox-item__name">' + escapeHtml(c.number) + '</span>' +
            '<span class="sms-inbox-item__time">' + time + '</span>' +
          '</div>' +
          '<div class="sms-inbox-item__preview">' + escapeHtml(preview) + '</div>' +
        '</div>' +
        '<div class="sms-inbox-item__meta">' + badge + '</div>' +
      '</div>';
    }).join('');

    // Click handler for conversation items
    listEl.querySelectorAll('.sms-inbox-item').forEach(function (el) {
      el.addEventListener('click', function () {
        openChat(el.dataset.contact);
      });
    });
  }

  // ========== CHAT VIEW ==========
  function openChat(number) {
    currentContact = number;
    var inbox = $id('smsPanel_inbox');
    var chat = $id('smsPanel_chat');
    var newPanel = $id('smsPanel_new');
    if (inbox) inbox.style.display = 'none';
    if (newPanel) newPanel.style.display = 'none';
    if (chat) chat.style.display = 'flex';
    var contactEl = $id('smsPanel_chatContact');
    if (contactEl) contactEl.textContent = number;
    renderChat();
  }

  function renderChat() {
    var listEl = $id('smsPanel_sms-list');
    if (!listEl || !currentContact) return;

    var msgs = allMessages.filter(function (m) { return m.number === currentContact; });
    msgs = sortMessages(msgs);

    if (!msgs.length) {
      listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">💬</span>No messages yet</div>';
      return;
    }

    // Mark unread as read
    var unread = msgs.filter(function (m) { return m.tag === '1'; }).map(function (m) { return m.id; });
    if (unread.length && typeof readSmsByIds === 'function') {
      readSmsByIds(unread).catch(function () {});
    }

    listEl.innerHTML = msgs.map(function (item) {
      var isSent = item.tag === '2' || item.tag === '3';
      var isFailed = item.tag === '3';
      var content = decodeContent(item.content);
      var date = formatDate(item.date);
      var cls = 'sms-bubble ' + (isSent ? 'sms-bubble--out' : 'sms-bubble--in') + (isFailed ? ' sms-bubble--failed' : '');

      return '<div class="' + cls + '" data-sms-id="' + item.id + '">' +
        '<div class="sms-bubble__text">' + escapeHtml(content) + '</div>' +
        '<div class="sms-bubble__meta">' +
          (isFailed ? '<span class="sms-bubble__status">Failed</span>' : '') +
          '<span class="sms-bubble__time">' + date + '</span>' +
          '<span class="sms-bubble__actions">' +
            (isFailed ? '<button onclick="window._smsPanelResend(' + item.id + ')" title="Resend">↻</button>' : '') +
            '<button onclick="window._smsPanelDelete(' + item.id + ')" title="Delete">✕</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    // Scroll to bottom
    var container = $id('smsPanel_list');
    if (container) container.scrollTop = container.scrollHeight;
  }

  // ========== NAVIGATION ==========
  window._smsPanelBack = function () {
    currentContact = null;
    var inbox = $id('smsPanel_inbox');
    var chat = $id('smsPanel_chat');
    var newPanel = $id('smsPanel_new');
    if (chat) chat.style.display = 'none';
    if (newPanel) newPanel.style.display = 'none';
    if (inbox) inbox.style.display = '';
    renderInbox();
  };

  window._smsPanelNewChat = function () {
    var inbox = $id('smsPanel_inbox');
    var newPanel = $id('smsPanel_new');
    if (inbox) inbox.style.display = 'none';
    if (newPanel) newPanel.style.display = 'flex';
    var phoneInput = $id('smsPanel_PhoneInput');
    if (phoneInput) { phoneInput.value = ''; phoneInput.focus(); }
  };

  // ========== SEND ==========
  window._smsPanelSend = async function () {
    var phone, msg;
    if (currentContact) {
      // In chat view — send to current contact
      phone = currentContact;
      var smsInput = $id('smsPanel_SMSInput');
      msg = smsInput ? smsInput.value.trim() : '';
    } else {
      // In new message view
      var phoneInput = $id('smsPanel_PhoneInput');
      var newMsgInput = $id('smsPanel_NewMsgInput');
      phone = phoneInput ? phoneInput.value.trim() : '';
      msg = newMsgInput ? newMsgInput.value.trim() : '';
    }

    if (!phone || !msg) {
      if (typeof createToast === 'function') createToast('Enter phone & message', 'red');
      return;
    }

    try {
      var res = await sendSms_UFI({ content: msg, number: phone });
      if (res && (res.result === 'success' || res.result === '0')) {
        if (currentContact) {
          var smsInput = $id('smsPanel_SMSInput');
          if (smsInput) smsInput.value = '';
        } else {
          // After sending from new message, open chat for that number
          currentContact = phone;
          var inbox = $id('smsPanel_inbox');
          var newPanel = $id('smsPanel_new');
          var chat = $id('smsPanel_chat');
          if (inbox) inbox.style.display = 'none';
          if (newPanel) newPanel.style.display = 'none';
          if (chat) chat.style.display = 'flex';
          var contactEl = $id('smsPanel_chatContact');
          if (contactEl) contactEl.textContent = phone;
        }
        if (typeof createToast === 'function') createToast('SMS sent', 'green');
        await loadMessages();
      } else {
        if (typeof createToast === 'function') createToast((res && res.message) || 'Send failed', 'red');
      }
    } catch (e) {
      if (typeof createToast === 'function') createToast('Send failed', 'red');
    }
  };

  // ========== DELETE / RESEND ==========
  var deleteConfirm = {};
  window._smsPanelDelete = function (id) {
    if (deleteConfirm[id]) {
      clearTimeout(deleteConfirm[id]);
      delete deleteConfirm[id];
      if (typeof removeSmsById === 'function') {
        removeSmsById(id).then(function (res) {
          if (res && (res.result === 'success' || res.result === '0')) {
            if (typeof createToast === 'function') createToast('Deleted', 'green');
            loadMessages();
          } else {
            if (typeof createToast === 'function') createToast('Delete failed', 'red');
          }
        });
      }
    } else {
      if (typeof createToast === 'function') createToast('Tap again to confirm', 'orange');
      deleteConfirm[id] = setTimeout(function () { delete deleteConfirm[id]; }, 2000);
    }
  };

  window._smsPanelResend = function (id) {
    if (typeof removeSmsById === 'function') {
      removeSmsById(id).then(function () { loadMessages(); });
    }
  };

  // ========== DATA LOADING ==========
  var lastIdHash = null;

  async function loadMessages() {
    if (typeof getSmsInfo !== 'function') {
      var listEl = $id('smsPanel_inbox-list');
      if (listEl) listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">⚠️</span>SMS module not ready</div>';
      return;
    }

    if (!localStorage.getItem('hotbox_sms_pwd')) {
      var listEl = $id('smsPanel_inbox-list');
      if (listEl) listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">🔒</span>Set SMS password to view messages</div>';
      return;
    }

    if (!common_headers.authorization) {
      var token = localStorage.getItem('hotbox_sms_token');
      if (token) common_headers.authorization = token;
    }

    try {
      var res = await getSmsInfo();
      if (!res || !res.messages || !res.messages.length) {
        allMessages = [];
      } else {
        var ids = res.messages.map(function (m) { return m.id; }).join('');
        if (ids === lastIdHash) return; // no change
        lastIdHash = ids;
        allMessages = res.messages;
      }

      // Render appropriate view
      if (currentContact) {
        renderChat();
      } else {
        renderInbox();
      }
    } catch (e) {
      var listEl = $id('smsPanel_inbox-list');
      if (listEl) listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">❌</span>Failed to load</div>';
    }
  }

  // ========== POLLING ==========
  function startPolling() {
    stopPolling();
    if (isFirstLoad) {
      var listEl = $id('smsPanel_inbox-list');
      if (listEl) listEl.innerHTML = '<div class="sms-empty"><span class="sms-empty-icon">💬</span>Loading...</div>';
      isFirstLoad = false;
    }
    loadMessages();
    smsPollTimer = setInterval(loadMessages, 3000);
  }

  function stopPolling() {
    if (smsPollTimer) { clearInterval(smsPollTimer); smsPollTimer = null; }
  }

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'sms') {
      isFirstLoad = true;
      lastIdHash = null;
      currentContact = null;
      // Reset to inbox
      var inbox = $id('smsPanel_inbox');
      var chat = $id('smsPanel_chat');
      var newPanel = $id('smsPanel_new');
      if (inbox) inbox.style.display = '';
      if (chat) chat.style.display = 'none';
      if (newPanel) newPanel.style.display = 'none';
      startPolling();
    } else {
      stopPolling();
    }
  });

  // Enter-to-send
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target) {
      if (e.target.id === 'smsPanel_SMSInput' || e.target.id === 'smsPanel_NewMsgInput') {
        e.preventDefault();
        window._smsPanelSend();
      }
    }
  });

  // === SMS Forwarding Panel ===
  var fwdTabs = document.getElementById('smsForwardPanel_tabs');
  if (fwdTabs) {
    fwdTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.sms-fwd-tab');
      if (!btn) return;
      var method = btn.dataset.method;
      fwdTabs.querySelectorAll('.sms-fwd-tab').forEach(function (t) { t.classList.toggle('active', t === btn); });
      var smsf = document.getElementById('smsForwardPanel_sms');
      var smtp = document.getElementById('smsForwardPanel_smtp');
      var curl = document.getElementById('smsForwardPanel_curl');
      var whatsapp = document.getElementById('smsForwardPanel_whatsapp');
      var ding = document.getElementById('smsForwardPanel_dingtalk');
      if (smsf) smsf.style.display = method === 'sms' ? '' : 'none';
      if (smtp) smtp.style.display = method === 'smtp' ? '' : 'none';
      if (curl) curl.style.display = method === 'curl' ? '' : 'none';
      if (whatsapp) whatsapp.style.display = method === 'whatsapp' ? '' : 'none';
      if (ding) ding.style.display = method === 'dingtalk' ? '' : 'none';
    });
  }

  // === Forwarding Toggle Switch ===
  var fwdSwitchContainer = document.getElementById('smsForwardPanel_switch');
  var fwdSwitch;
  if (fwdSwitchContainer) {
    fwdSwitch = createCtrlToggle(fwdSwitchContainer, function (checked) {
      var enabled = checked ? '1' : '0';
      fetch(HOTBOX_baseURL + '/sms_forward_enabled?enable=' + enabled, { headers: common_headers })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function () {
          if (typeof createToast === 'function') createToast('Forwarding ' + (enabled === '1' ? 'enabled' : 'disabled'), 'green');
        })
        .catch(function () {
          if (typeof createToast === 'function') createToast('Failed to update', 'red');
          fwdSwitch.set(!checked);
        });
    });

    // Load initial state
    fetch(HOTBOX_baseURL + '/sms_forward_enabled', { headers: common_headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { fwdSwitch.set(data.enabled === '1'); })
      .catch(function () {});
  }

  // === Call Notification Toggle Switch ===
  var callSwitchContainer = document.getElementById('callNotifyPanel_switch');
  var callSwitch;
  if (callSwitchContainer) {
    callSwitch = createCtrlToggle(callSwitchContainer, function (checked) {
      var enabled = checked ? '1' : '0';
      fetch(HOTBOX_baseURL + '/call_notify_enabled?enable=' + enabled, { headers: common_headers })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function () {
          if (typeof createToast === 'function') createToast('Call notifications ' + (enabled === '1' ? 'enabled' : 'disabled'), 'green');
        })
        .catch(function () {
          if (typeof createToast === 'function') createToast('Failed to update', 'red');
          callSwitch.set(!checked);
        });
    });

    // Load initial state
    fetch(HOTBOX_baseURL + '/call_notify_enabled', { headers: common_headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) { callSwitch.set(data.enabled === '1'); })
      .catch(function () {});
  }

  // === Device Info Toggle Switches ===
  var devInfoSwitches = {};
  var devInfoContainers = ['smsForwardPanel_devinfo_switch', 'smtpPanel_devinfo_switch', 'waPanel_devinfo_switch', 'dingtalkPanel_devinfo_switch'];
  devInfoContainers.forEach(function (id) {
    var container = document.getElementById(id);
    if (container) {
      devInfoSwitches[id] = createCtrlToggle(container);
    }
  });
  function getDevInfoValue(switchId) {
    var sw = devInfoSwitches[switchId];
    return sw ? sw.get() : false;
  }

  // === Message Format Save ===
  bindCtrlSave('fwd_format_save_btn', async function () {
    var smsFormat = (document.getElementById('fwd_sms_format') || {}).value || '';
    var callFormat = (document.getElementById('fwd_call_format') || {}).value || '';
    if (!smsFormat && !callFormat) throw new Error('Enter at least one format');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_format', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json;charset=UTF-8' }),
      body: JSON.stringify({ sms_format: smsFormat, call_format: callFormat })
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  }, { needsLogin: false });

  // Load saved format
  fetch(HOTBOX_baseURL + '/sms_forward_format', { headers: common_headers })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var smsInput = document.getElementById('fwd_sms_format');
      var callInput = document.getElementById('fwd_call_format');
      if (smsInput && data.sms_format) smsInput.value = data.sms_format;
      if (callInput && data.call_format) callInput.value = data.call_format;
    })
    .catch(function () {});

  // === Form Submit Handlers ===
  // SMTP form
  bindCtrlFormSave('smsForwardPanel_smtp', async function (fd) {
    var host = (fd.get('smtp_host') || '').trim();
    var port = (fd.get('smtp_port') || '').trim();
    var username = (fd.get('smtp_username') || '').trim();
    var password = (fd.get('smtp_password') || '').trim();
    var to = (fd.get('smtp_to') || '').trim();
    var devInfo = getDevInfoValue('smtpPanel_devinfo_switch');

    if (!host) throw new Error('Enter SMTP host');
    if (!port) throw new Error('Enter SMTP port');
    if (!username) throw new Error('Enter username');
    if (!password) throw new Error('Enter password');
    if (!to) throw new Error('Enter recipient email');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_mail', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ smtp_host: host, smtp_port: port, smtp_username: username, smtp_password: password, smtp_to: to, forward_dev_info: devInfo ? '1' : '0' })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  });

  // CURL form
  bindCtrlFormSave('smsForwardPanel_curl', async function (fd) {
    var curlText = (fd.get('curl_text') || '').trim();
    if (!curlText) throw new Error('Enter curl command');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_curl', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json;charset=UTF-8' }),
      body: JSON.stringify({ curl_text: curlText })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  });

  // SMS forward form
  bindCtrlFormSave('smsForwardPanel_sms', async function (fd) {
    var number = (fd.get('sms_forward_number') || '').trim();
    var devInfo = getDevInfoValue('smsForwardPanel_devinfo_switch');
    if (!number) throw new Error('Enter forward-to number');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_sms', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json;charset=UTF-8' }),
      body: JSON.stringify({ sms_forward_number: number, forward_dev_info: devInfo ? '1' : '0' })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  });

  // DingTalk form
  bindCtrlFormSave('smsForwardPanel_dingtalk', async function (fd) {
    var webhook = (fd.get('dingtalk_webhook') || '').trim();
    var secret = (fd.get('dingtalk_secret') || '').trim();
    var devInfo = getDevInfoValue('dingtalkPanel_devinfo_switch');
    if (!webhook) throw new Error('Enter webhook URL');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_dingtalk', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json;charset=UTF-8' }),
      body: JSON.stringify({ webhook_url: webhook, secret: secret, forward_dev_info: devInfo ? '1' : '0' })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  });

  // WhatsApp form
  bindCtrlFormSave('smsForwardPanel_whatsapp', async function (fd) {
    var phoneId = (fd.get('wa_phone_id') || '').trim();
    var token = (fd.get('wa_token') || '').trim();
    var to = (fd.get('wa_to') || '').trim();
    var devInfo = getDevInfoValue('waPanel_devinfo_switch');

    if (!phoneId) throw new Error('Enter Phone Number ID');
    if (!token) throw new Error('Enter Access Token');
    if (!to) throw new Error('Enter recipient number');

    var res = await fetch(HOTBOX_baseURL + '/sms_forward_whatsapp', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json;charset=UTF-8' }),
      body: JSON.stringify({ wa_phone_id: phoneId, wa_token: token, wa_to: to, forward_dev_info: devInfo ? '1' : '0' })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  });

  // === CURL Preset Templates ===
  window._smsFwdFillCurl = function (preset) {
    var textarea = document.querySelector('#smsForwardPanel_curl textarea[name="curl_text"]');
    if (!textarea) return;
    var templates = {
      tg: "curl -s -X POST 'https://api.telegram.org/bot<BOT_TOKEN>/sendMessage' -d 'chat_id=<CHAT_ID>&text=From: {{sms-from}}%0ATime: {{sms-time}}%0A{{sms-body}}'",
      whatsapp: "curl -s -G 'https://api.callmebot.com/whatsapp.php' --data-urlencode 'phone=<YOUR_NUMBER>' --data-urlencode 'text=From: {{sms-from}} | {{sms-time}} | {{sms-body}}' -d 'apikey=<API_KEY>'",
      wechat: "curl -s -X POST 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<KEY>' -H 'Content-Type: application/json' -d '{\"msgtype\":\"text\",\"text\":{\"content\":\"From: {{sms-from}}\\nTime: {{sms-time}}\\n{{sms-body}}\"}}'",
      pushplus: "curl -s -X POST 'http://www.pushplus.plus/send' -H 'Content-Type: application/json' -d '{\"token\":\"<TOKEN>\",\"title\":\"SMS from {{sms-from}}\",\"content\":\"{{sms-body}}\"}'",
      bark: "curl -s 'https://api.day.app/<DEVICE_KEY>/SMS%20from%20{{sms-from}}/{{sms-body}}'",
      discord: "curl -s -X POST '<WEBHOOK_URL>' -H 'Content-Type: application/json' -d '{\"content\":\"**SMS from {{sms-from}}**\\n{{sms-time}}\\n{{sms-body}}\"}'"
    };
    textarea.value = templates[preset] || '';
    textarea.focus();
  };

  // === Load saved config when panel opens ===
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'sms') {
      // Load current method and fill form
      fetch(HOTBOX_baseURL + '/sms_forward_method', { headers: common_headers })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var method = (data.sms_forward_method || 'sms').toLowerCase();
          // Activate correct tab
          if (fwdTabs) {
            fwdTabs.querySelectorAll('.sms-fwd-tab').forEach(function (t) {
              t.classList.toggle('active', t.dataset.method === method);
            });
          }
          var smsf = document.getElementById('smsForwardPanel_sms');
          var smtp = document.getElementById('smsForwardPanel_smtp');
          var curl = document.getElementById('smsForwardPanel_curl');
          var whatsapp = document.getElementById('smsForwardPanel_whatsapp');
          var ding = document.getElementById('smsForwardPanel_dingtalk');
          if (smsf) smsf.style.display = method === 'sms' ? '' : 'none';
          if (smtp) smtp.style.display = method === 'smtp' ? '' : 'none';
          if (curl) curl.style.display = method === 'curl' ? '' : 'none';
          if (whatsapp) whatsapp.style.display = method === 'whatsapp' ? '' : 'none';
          if (ding) ding.style.display = method === 'dingtalk' ? '' : 'none';

          // Load config for active method
          if (method === 'sms') {
            fetch(HOTBOX_baseURL + '/sms_forward_sms', { headers: common_headers })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var form = document.getElementById('smsForwardPanel_sms');
                if (!form) return;
                form.querySelector('[name="sms_forward_number"]').value = d.sms_forward_number || '+91';
                if (devInfoSwitches['smsForwardPanel_devinfo_switch'] && devInfoSwitches['smsForwardPanel_devinfo_switch'].update) {
                  devInfoSwitches['smsForwardPanel_devinfo_switch'].update(d.forward_dev_info === '1');
                }
              }).catch(function () {});
          } else if (method === 'smtp') {
            fetch(HOTBOX_baseURL + '/sms_forward_mail', { headers: common_headers })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var form = document.getElementById('smsForwardPanel_smtp');
                if (!form) return;
                form.querySelector('[name="smtp_host"]').value = d.smtp_host || '';
                form.querySelector('[name="smtp_port"]').value = d.smtp_port || '';
                form.querySelector('[name="smtp_username"]').value = d.smtp_username || '';
                form.querySelector('[name="smtp_password"]').value = d.smtp_password || '';
                form.querySelector('[name="smtp_to"]').value = d.smtp_to || '';
                if (devInfoSwitches['smtpPanel_devinfo_switch'] && devInfoSwitches['smtpPanel_devinfo_switch'].update) {
                  devInfoSwitches['smtpPanel_devinfo_switch'].update(d.forward_dev_info === '1');
                }
              }).catch(function () {});
          } else if (method === 'curl') {
            fetch(HOTBOX_baseURL + '/sms_forward_curl', { headers: common_headers })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var ta = document.querySelector('#smsForwardPanel_curl textarea[name="curl_text"]');
                if (ta) ta.value = d.curl_text || '';
              }).catch(function () {});
          } else if (method === 'whatsapp') {
            fetch(HOTBOX_baseURL + '/sms_forward_whatsapp', { headers: common_headers })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var form = document.getElementById('smsForwardPanel_whatsapp');
                if (!form) return;
                form.querySelector('[name="wa_phone_id"]').value = d.wa_phone_id || '';
                form.querySelector('[name="wa_token"]').value = d.wa_token || '';
                form.querySelector('[name="wa_to"]').value = d.wa_to || '';
                if (devInfoSwitches['waPanel_devinfo_switch'] && devInfoSwitches['waPanel_devinfo_switch'].update) {
                  devInfoSwitches['waPanel_devinfo_switch'].update(d.forward_dev_info === '1');
                }
              }).catch(function () {});
          } else if (method === 'dingtalk') {
            fetch(HOTBOX_baseURL + '/sms_forward_dingtalk', { headers: common_headers })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var form = document.getElementById('smsForwardPanel_dingtalk');
                if (!form) return;
                form.querySelector('[name="dingtalk_webhook"]').value = d.webhook_url || '';
                form.querySelector('[name="dingtalk_secret"]').value = d.secret || '';
                if (devInfoSwitches['dingtalkPanel_devinfo_switch'] && devInfoSwitches['dingtalkPanel_devinfo_switch'].update) {
                  devInfoSwitches['dingtalkPanel_devinfo_switch'].update(d.forward_dev_info === '1');
                }
              }).catch(function () {});
          }
        }).catch(function () {});

      // Load toggle state
      fetch(HOTBOX_baseURL + '/sms_forward_enabled', { headers: common_headers })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (fwdSwitch && fwdSwitch.update) fwdSwitch.update(data.enabled === '1');
        }).catch(function () {});
    }
  });
})();
