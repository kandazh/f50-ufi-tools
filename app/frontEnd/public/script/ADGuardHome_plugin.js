//<script>
(async () => {
    const SH_FILE = "/data/agh/boot.sh"
    const BOOT_SH_FILE = "/sdcard/ufi_tools_boot.sh"

    const AGH_GITHUB_API = "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest";
    const AGH_DOWNLOAD_NAME = "AdGuardHome_linux_arm64.tar.gz";
    const AGH_DOWNLOAD_DIR = "/data";
    const AGH_DOWNLOAD_PATH = `${AGH_DOWNLOAD_DIR}/${AGH_DOWNLOAD_NAME}`;

    // Get installed AdGuard Home version
    const getInstalledVersion = async () => {
        try {
            const res = await runShellWithRoot(`/data/agh/agh/bin/AdGuardHome --version 2>/dev/null`);
            if (res.success && res.content) {
                const match = res.content.match(/v[\d.]+/);
                return match ? match[0] : null;
            }
        } catch {}
        return null;
    };

    // Fetch latest release info from GitHub
    const getLatestRelease = async () => {
        try {
            const res = await runShellWithRoot(
                `/data/data/com.minikano.f50_sms/files/curl -s -L "${AGH_GITHUB_API}"`,
                30 * 1000
            );
            if (res.success && res.content) {
                let data;
                try {
                    data = JSON.parse(res.content);
                } catch (parseErr) {
                    return null;
                }
                const tag = data.tag_name; // e.g. "v0.107.52"
                const asset = data.assets && data.assets.find(a => a.name === AGH_DOWNLOAD_NAME);
                if (tag && asset) {
                    return { version: tag, downloadUrl: asset.browser_download_url };
                }
            }
        } catch {}
        return null;
    };

    // Download latest AdGuard Home binary
    const downloadLatest = async () => {
        if (!(await checkRoot())) {
            createToast("Advanced features not enabled, cannot use!", "red");
            return false;
        }

        createToast("Fetching latest release info...");
        const release = await getLatestRelease();
        if (!release) {
            createToast("Failed to fetch latest release info!", "red");
            return false;
        }

        createToast(`Downloading AdGuard Home ${release.version}...`);
        const dlRes = await runShellWithRoot(
            `/data/data/com.minikano.f50_sms/files/curl -L "${release.downloadUrl}" -o "${AGH_DOWNLOAD_PATH}"`,
            300 * 1000
        );
        if (!dlRes.success) {
            createToast("Download failed!", "red");
            return false;
        }

        createToast("Extracting...");
        await runShellWithRoot(`rm -rf /data/agh_update_tmp`);
        const extRes = await runShellWithRoot(
            `mkdir -p /data/agh_update_tmp && tar -xzf "${AGH_DOWNLOAD_PATH}" -C /data/agh_update_tmp`,
            60 * 1000
        );
        if (!extRes.success) {
            createToast("Extraction failed!", "red");
            return false;
        }

        createToast("Installing new binary...");
        await runShellWithRoot(`/data/agh/action.sh stop 2>/dev/null`);
        await runShellWithRoot(`cp -f /data/agh_update_tmp/AdGuardHome/AdGuardHome /data/agh/agh/bin/AdGuardHome`);
        await runShellWithRoot(`chmod 755 /data/agh/agh/bin/AdGuardHome`);
        await runShellWithRoot(`rm -rf /data/agh_update_tmp "${AGH_DOWNLOAD_PATH}"`);
        await runShellWithRoot(`sh ${SH_FILE} &`);

        createToast(`AdGuard Home updated to ${release.version}!`, "green", 8000);
        return true;
    };

    // Check for updates and prompt
    const checkForUpdate = async () => {
        if (!(await checkRoot())) {
            createToast("Advanced features not enabled, cannot use!", "red");
            return;
        }

        try {
            createToast("Checking for updates...");
            const [installed, release] = await Promise.all([getInstalledVersion(), getLatestRelease()]);

        if (!release) {
            createToast("Failed to fetch latest release info!", "red");
            return;
        }

        if (!installed) {
            createToast(`AdGuard Home not installed. Latest available: ${release.version}`, "orange", 8000);
            if (confirm(`AdGuard Home is not installed.\nLatest version: ${release.version}\n\nDownload and install now?`)) {
                await downloadLatest();
            }
            return;
        }

        if (installed === release.version) {
            createToast(`Already up to date! (${installed})`, "green", 5000);
            return;
        }

        createToast(`Update available: ${installed} → ${release.version}`, "orange", 8000);
        if (confirm(`Current: ${installed}\nLatest: ${release.version}\n\nDownload and install the update?`)) {
            await downloadLatest();
        }
        } catch (e) {
            createToast("Error checking for updates!", "red");
        }
    };

    // Check if advanced features are enabled
    const checkRoot = async () => {
        try {
            const res = await runShellWithRoot('whoami');
            return res.success && res.content.includes('root');
        } catch {
            return false;
        }
    };

    // Uninstall
    const uninstall = async () => {
        if (!(await checkRoot())) {
            createToast("Advanced features not enabled, cannot use!", "red");
            return false;
        }
        createToast("Uninstalling...")
        await runShellWithRoot(`sed -i '/agh.*boot.sh/d' ${BOOT_SH_FILE}`)
        const res = await runShellWithRoot(`/data/agh/action.sh stop`)
        await runShellWithRoot(`/data/agh/uninstall.sh`)

        isBtnDisabled = false
        createToast(`<pre style="white-space:pre-wrap;width:90vw;max-width:600px">${res.content}</pre>`, "", 5000)
        createToast(`Uninstall completed`, "", 5000)
    }

    // Install
    const install = async () => {
        if (!(await checkRoot())) {
            createToast("Advanced features not enabled, cannot use!", "red");
            return false;
        }

        const res = await runShellWithRoot(`awk '{print}' /sdcard/ufi_tools_boot.sh`)
        if (res.content.includes("agh/boot.sh")) {
            return createToast(`AdGuard is already enabled~`, 'red', 5000)
        }

        await runShellWithRoot(`
        rm -rf /data/agh
        rm -f /data/kano_ad_guard_home.zip
        rm -f /data/adg_customize.sh
        `)

        createToast("Copying files from sdcard...")
        const res1 = await runShellWithRoot(`cp /sdcard/Documents/kano_ad_guard_home.zip /data/`, 120 * 1000)
        if (!res1.success) return createToast("Failed to copy files from sdcard!", 'red')

        // createToast("Downloading...")
        // const res1 = await runShellWithRoot(`
        // /data/data/com.minikano.f50_sms/files/curl -L https://pan.kanokano.cn/d/UFI-TOOLS-UPDATE/plugins/kano_ad_guard_home.zip -o /data/kano_ad_guard_home.zip
        // `, 100 * 1000)
        // if (!res1.success) return createToast("Failed to download dependencies!", 'red')

        createToast("Extracting files...")
        const res2 = await runShellWithRoot(`unzip -o /data/kano_ad_guard_home.zip "adg_customize.sh" -d /data/ >/dev/null 2>&1`, 60 * 1000)
        if (!res2.success) return createToast("Error extracting files!", 'red')

        createToast("Checking dependency files, this may take a moment...")
        const res3 = await runShellWithRoot(`ls /data/`, 60 * 1000)
        if (!res3.success || !res3.content.includes('adg_customize.sh')) return createToast("Failed to check dependency files!", 'red')

        createToast("Setting script permissions...")
        const res4 = await runShellWithRoot(`chmod 777 /data/adg_customize.sh`, 60 * 1000)
        if (!res4.success) return createToast("Failed to set script permissions!", 'red')

        createToast("Installing AdGuard...")
        const res5 = await runShellWithRoot(`/data/adg_customize.sh`, 60 * 1000)
        if (!res5.success) return createToast("Failed to install AdGuard!", 'red')

        createToast(`<pre style="white-space:pre-wrap;width:90vw;max-width:600px">${res5.content}</pre>`, "", 10000)

        await runShellWithRoot(`grep -qxF 'sh /data/agh/boot.sh &' ${BOOT_SH_FILE} || echo 'sh /data/agh/boot.sh &' >> ${BOOT_SH_FILE}`)
        await runShellWithRoot(`sh ${SH_FILE} &`)
        createToast(`<div>AdGuard enabled!<br>
        Address: http://192.168.0.1:3000<br>
        Default username and password: root <br>
        </div>`, 'green', 10000)
        isBtnDisabled = false
    }

    const btn = document.createElement('button')
    btn.textContent = "Install AdGuard"
    let isBtnDisabled = false
    btn.onclick = async (e) => {
        if (isBtnDisabled) return
        isBtnDisabled = true
        try {
            await install()
        } finally {
            isBtnDisabled = false
        }
    }

    const btn1 = document.createElement('button')
    btn1.textContent = "Remove AdGuard"
    let timer_close = null
    let count_close = 0

    btn1.onclick = async (e) => {
        if (timer_close) clearTimeout(timer_close)
        timer_close = setTimeout(() => {
            count_close = 0
        }, 2000)
        if (count_close++ < 2) {
            return createToast("Click once more to remove AdGuard")
        }
        await uninstall()
    }

    const btn2 = document.createElement('button')
    btn2.textContent = "Restart AdGuard"
    let disabledBtn2 = false
    btn2.onclick = async (e) => {
        try {
            if (disabledBtn2) return
            disabledBtn2 = true
            await runShellWithRoot(`/data/agh/action.sh stop`)
            createToast(`Restarting`, "", 5000)
            await runShellWithRoot(`sleep 2`)
            const res = await runShellWithRoot(`/data/agh/action.sh toggle`)
            createToast(`<pre style="white-space:pre-wrap;width:90vw;max-width:600px">${res.content}</pre>`, "", 5000)
        } finally {
            disabledBtn2 = false
        }
    }

    const btn3 = document.createElement('button')
    let disabledBtn3 = false
    btn3.textContent = "Stop AdGuard"
    btn3.onclick = async (e) => {
        try {
            if (disabledBtn3) return
            disabledBtn3 = true
            const res = await runShellWithRoot(`/data/agh/action.sh stop`)
            createToast(`<pre style="white-space:pre-wrap;width:90vw;max-width:600px">${res.content}</pre>`, "", 5000)
        } finally {
            disabledBtn3 = false
        }
    }

    const btn4 = document.createElement('button')
    btn4.textContent = "AdGuard Page"
    btn4.onclick = async (e) => {
        window.open(`${location.protocol}//${location.hostname}:3000`, "_blank")
    }

    const btn5 = document.createElement('button')
    btn5.textContent = "Export AdGuard Config"
    btn5.onclick = async (e) => {
        const res = await runShellWithRoot("timeout 2s  awk '{print}' /data/agh/agh/bin/AdGuardHome.yaml")
        if (!res.success) {
            return createToast("Failed to export config", 'red', 5000)
        }
        const content = res.content;
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "AdGuardHome.yaml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        createToast("Config exported successfully", 'green', 5000);
    }

    const btnDownload = document.createElement('button')
    btnDownload.textContent = "Download Latest AdGuard"
    let disabledBtnDownload = false
    btnDownload.onclick = async (e) => {
        try {
            if (disabledBtnDownload) return
            disabledBtnDownload = true
            await downloadLatest()
        } finally {
            disabledBtnDownload = false
        }
    }

    const btnUpdate = document.createElement('button')
    btnUpdate.textContent = "Check for Updates"
    let disabledBtnUpdate = false
    btnUpdate.onclick = async (e) => {
        try {
            if (disabledBtnUpdate) return
            disabledBtnUpdate = true
            await checkForUpdate()
        } finally {
            disabledBtnUpdate = false
        }
    }

    document.querySelector('.actions-buttons').appendChild(btn)
    document.querySelector('.actions-buttons').appendChild(btn1)
    document.querySelector('.actions-buttons').appendChild(btn2)
    document.querySelector('.actions-buttons').appendChild(btn3)
    document.querySelector('.actions-buttons').appendChild(btn4)
    document.querySelector('.actions-buttons').appendChild(btn5)
    document.querySelector('.actions-buttons').appendChild(btnDownload)
    document.querySelector('.actions-buttons').appendChild(btnUpdate)
})();
//</script>