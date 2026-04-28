/* ==========================================================
   Dashboard Card Distributor
   Watches the hidden #STATUS element (populated by main.js)
   and distributes items into DASH_BASIC, DASH_SIGNAL,
   DASH_SIGNAL table in a modern key-value format.
   ========================================================== */
(() => {
    const statusEl = document.getElementById('STATUS');
    if (!statusEl) return;

    const tables = {
        basic: document.getElementById('DASH_BASIC'),
        signal: document.getElementById('DASH_SIGNAL')
    };

    const counts = {
        basic: document.getElementById('dash-basic-count'),
        signal: document.getElementById('dash-signal-count')
    };

    function parseItem(strong) {
        const text = strong.textContent.trim();
        const m = text.match(/^(.+?)[：:]\s*(.+)$/);
        if (m) return { label: m[1].trim(), value: m[2].trim(), cls: strong.className };
        return { label: text, value: '', cls: strong.className };
    }

    function distribute() {
        const children = Array.from(statusEl.children);
        let section = 'basic';
        const sections = { basic: [], signal: [] };

        for (const child of children) {
            if (child.classList && child.classList.contains('title')) {
                if (section === 'basic') section = 'signal';
                continue;
            }
            const strongs = child.querySelectorAll('strong');
            strongs.forEach(s => {
                const item = parseItem(s);
                if (item.label && !item.label.includes('🌀')) {
                    sections[section].push(item);
                }
            });
        }

        for (const [key, items] of Object.entries(sections)) {
            const table = tables[key];
            if (!table) continue;
            const tbody = table.querySelector('tbody') || table;

            if (counts[key]) counts[key].textContent = items.length;

            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="dash-table-empty">—</td></tr>';
                continue;
            }

            tbody.innerHTML = items.map(item => {
                const colorCls = item.cls.includes('green') ? 'dash-val-green' :
                                 item.cls.includes('blue') ? 'dash-val-blue' : '';
                return `<tr>
                    <td class="dash-table-label">${item.label}</td>
                    <td class="dash-table-value ${colorCls}" onclick="copyText(event)">${item.value}</td>
                </tr>`;
            }).join('');
        }
    }

    const observer = new MutationObserver(() => distribute());
    observer.observe(statusEl, { childList: true, subtree: true, characterData: true });
    distribute();
})();
