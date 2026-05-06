/**
 * Auth — Login/logout, power menu, quick toggles
 */
(function () {
    var toastTimer = null;

    var onTokenConfirm = debounce(async function () {
        var createTimer = function () { return setTimeout(function () { createToast(t('toast_logining'), 'pink'); }, 2000); };
        try {
            var login_method = document.querySelector('#login_method');
            if (login_method) {
                loginMethod = login_method.value == '1' ? "1" : "0";
                localStorage.setItem('login_method', loginMethod);
            }
            toastTimer && clearTimeout(toastTimer);
            createToast(t('toast_login_checking'), '', 2000);
            toastTimer = createTimer();
            await needToken();
            toastTimer && clearTimeout(toastTimer);
            var tokenInput = document.querySelector('#TOKEN');
            var pwdInput = document.querySelector('#PWDINPUT');
            var token = tokenInput && (tokenInput.value);
            var password = pwdInput && (pwdInput.value);
            if (!password || !password?.trim()) return createToast(t('toast_please_input_pwd'), 'red');
            HOTBOX_PASSWORD = password.trim();
            if (window.isNeedToken) {
                if (!token || !token?.trim()) return createToast(t('toast_please_input_token'), 'red');
            }
            HOTBOX_TOKEN = SHA256(token.trim()).toLowerCase();
            common_headers.authorization = HOTBOX_TOKEN;

            var data = new URLSearchParams({ cmd: 'psw_fail_num_str,login_lock_time' });
            data.append('isTest', 'false');
            data.append('_', Date.now());
            toastTimer = createTimer();
            var res = await fetchWithTimeout(HOTBOX_baseURL + "/goform/goform_get_cmd_process?" + data.toString(), {
                method: "GET",
                headers: { ...common_headers, "Content-Type": "application/x-www-form-urlencoded" },
            }, 3000);
            toastTimer && clearTimeout(toastTimer);

            if (res.status != 200) {
                if (res.status == 401) return createToast(t('toast_token_failed'), 'red');
                throw new Error(res.status + "：" + t('toast_login_failed_catch'), 'red');
            }

            toastTimer = createTimer();
            var json = await res.json();
            var psw_fail_num_str = json.psw_fail_num_str;
            var login_lock_time = json.login_lock_time;
            toastTimer && clearTimeout(toastTimer);

            if (psw_fail_num_str == '0' && login_lock_time != '0') {
                createToast(t('toast_pwd_failed_limit') + login_lock_time + 'S', 'red');
                out();
                toastTimer = createTimer();
                await needToken();
                toastTimer && clearTimeout(toastTimer);
                return null;
            }
            var cookie = await login();
            toastTimer && clearTimeout(toastTimer);
            if (!cookie) {
                createToast(t('toast_pwd_failed') + (psw_fail_num_str != undefined ? ' ' + t('toast_pwd_failed_count') + '：' + psw_fail_num_str : ''), 'red');
                out();
                toastTimer = createTimer();
                await needToken();
                toastTimer && clearTimeout(toastTimer);
                return null;
            }
            var update_res = await updateAdminPsw(password.trim());
            if (!update_res || update_res.result != 'success') {
                console.error('Update admin password failed:', update_res ? update_res.message : 'No response');
            }
            createToast(t('toast_login_success'), 'green');
            localStorage.setItem('hotbox_sms_pwd', password.trim());
            localStorage.setItem('hotbox_sms_token', SHA256(token.trim()).toLowerCase());
            closeModal('#tokenModal');
            window.initRenderMethod();
            if (typeof initMessage === 'function') initMessage();
            updateLoginIcon();
            var loginRememberMe = document.querySelector('#loginRememberMe');
            if (loginRememberMe && loginRememberMe.checked) {
                if (CryptoJS) {
                    var payload = CryptoJS.AES.encrypt(password.trim() + '<hotbox_CryptoJS_split>' + token.trim(), 'hotbox_secret_key_1145141919810721');
                    localStorage.setItem('hotbox_remembered_loginfo', payload);
                }
            } else if (loginRememberMe && !loginRememberMe.checked) {
                localStorage.removeItem('hotbox_remembered_loginfo');
            }
        } catch (e) {
            toastTimer && clearTimeout(toastTimer);
            createToast(t('toast_login_failed_catch'), 'red');
        }
    }, 200);

    var toggleLoginLogout = function () {
        var isLoggedIn = !!localStorage.getItem('hotbox_sms_pwd');
        if (isLoggedIn) {
            out();
            createToast('Logged out', 'green');
        } else {
            showModal('#tokenModal');
        }
        updateLoginIcon();
    };

    var updateLoginIcon = function () {
        var btn = document.querySelector('#loginBtnIcon');
        if (!btn) return;
        var isLoggedIn = !!localStorage.getItem('hotbox_sms_pwd');
        if (isLoggedIn) {
            btn.innerHTML = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>';
            btn.parentElement.title = 'Logout';
        } else {
            btn.innerHTML = '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>';
            btn.parentElement.title = 'Login';
        }
    };

    // --- Power menu ---
    var closePowerMenuOutside = function (e) {
        var menu = document.getElementById('powerMenu');
        var wrap = document.querySelector('.gs-power-wrap');
        if (menu && wrap && !wrap.contains(e.target)) {
            menu.classList.remove('open');
        }
    };

    var togglePowerMenu = function () {
        var menu = document.getElementById('powerMenu');
        if (!menu) return;
        menu.classList.toggle('open');
        if (menu.classList.contains('open')) {
            setTimeout(function () {
                document.addEventListener('click', closePowerMenuOutside, { once: true });
            }, 0);
        }
    };

    var headerRebootCount = 0;
    var headerRebootTimer = null;
    var headerReboot = async function () {
        var menu = document.getElementById('powerMenu');
        headerRebootCount++;
        if (headerRebootCount < 2) {
            var item = menu?.querySelector('.gs-power-item span');
            if (item) item.textContent = 'Confirm?';
            clearTimeout(headerRebootTimer);
            headerRebootTimer = setTimeout(function () {
                headerRebootCount = 0;
                if (item) item.textContent = 'Restart';
            }, 3000);
            return;
        }
        headerRebootCount = 0;
        if (menu) menu.classList.remove('open');
        if (!(await window.initRequestData())) {
            createToast(t('toast_please_login'), 'red');
            return;
        }
        try {
            var cookie = await login();
            if (!cookie) { createToast(t('toast_login_failed_check_network'), 'red'); return; }
            var res = await (await postData(cookie, { goformId: 'REBOOT_DEVICE' })).json();
            if (res.result === 'success') createToast(t('toast_rebot_success'), 'green');
            else throw new Error();
        } catch { createToast(t('toast_reboot_failed'), 'red'); }
    };

    // --- Quick Toggles ---
    var qtSet = function (id, on) {
        var btn = document.getElementById('qt-' + id);
        if (!btn) return;
        btn.classList.toggle('qt-on', !!on);
    };

    var qtBusy = function (id, busy) {
        var btn = document.getElementById('qt-' + id);
        if (!btn) return;
        btn.classList.toggle('qt-busy', !!busy);
    };

    var qtUpdateAll = function () {
        var d = window.UFI_DATA || {};
        qtSet('data', d.ppp_status && d.ppp_status !== 'ppp_disconnected');
    };

    var qtToggle = async function (id) {
        if (id !== 'data') return;
        if (!(await window.initRequestData())) {
            createToast(t('toast_please_login'), 'red'); return;
        }
        qtBusy(id, true);
        try {
            var cookie = await login();
            if (!cookie) { createToast(t('toast_login_failed_check_network'), 'red'); return; }
            var d = window.UFI_DATA || {};
            var on = d.ppp_status && d.ppp_status !== 'ppp_disconnected';
            await (await postData(cookie, { goformId: on ? 'DISCONNECT_NETWORK' : 'CONNECT_NETWORK' })).json();
            d.ppp_status = on ? 'ppp_disconnected' : 'ppp_connected';
            qtSet('data', !on);
            createToast(t('toast_oprate_success'), 'green');
        } catch {
            createToast(t('toast_oprate_failed'), 'red');
        } finally {
            qtBusy(id, false);
        }
    };

    // --- Key bindings ---
    document.querySelector('#PWDINPUT')?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') onTokenConfirm();
    });
    document.querySelector('#TOKEN')?.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') onTokenConfirm();
    });

    // Register on window
    window.onTokenConfirm = onTokenConfirm;
    window.toggleLoginLogout = toggleLoginLogout;
    window.updateLoginIcon = updateLoginIcon;
    window.togglePowerMenu = togglePowerMenu;
    window.headerReboot = headerReboot;
    window.qtSet = qtSet;
    window.qtBusy = qtBusy;
    window.qtUpdateAll = qtUpdateAll;
    window.qtToggle = qtToggle;
})();
