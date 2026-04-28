/* ==========================================================
   Tab Navigation — switches between Dashboard / Controls / Network
   ========================================================== */
(() => {
    const TAB_KEY = 'ufi_active_tab';
    const panels = document.querySelectorAll('.tab-panel');
    const buttons = document.querySelectorAll('.tab-bar .tab-btn');

    function switchTab(tabName, save) {
        panels.forEach(p => {
            p.style.display = p.dataset.tab === tabName ? '' : 'none';
        });
        buttons.forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabName);
        });
        if (save !== false) {
            try { localStorage.setItem(TAB_KEY, tabName); } catch (e) { }
        }
    }

    // Bind clicks
    buttons.forEach(b => {
        b.addEventListener('click', () => switchTab(b.dataset.tab));
    });

    // Restore last tab or default to dashboard
    const saved = localStorage.getItem(TAB_KEY);
    const validTabs = Array.from(panels).map(p => p.dataset.tab);
    switchTab(validTabs.includes(saved) ? saved : 'dashboard', false);
})();
