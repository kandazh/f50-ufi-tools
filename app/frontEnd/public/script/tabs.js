/* ==========================================================
   Tab Navigation — Icon bar switches content panels
   ========================================================== */
const TAB_KEY = 'ufi_active_tab';

function switchTab(tabName, save) {
    const panels = document.querySelectorAll('.tab-panel');
    const buttons = document.querySelectorAll('.icon-bar-btn');
    panels.forEach(p => {
        p.style.display = p.dataset.tab === tabName ? '' : 'none';
    });
    buttons.forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
    if (save !== false) {
        try { localStorage.setItem(TAB_KEY, tabName); } catch (e) { }
    }
    if (typeof window.dispatchCtrlLayoutActivePanels === 'function') {
        const activePanel = document.querySelector(`.tab-panel[data-tab="${tabName}"]`);
        window.dispatchCtrlLayoutActivePanels(activePanel);
    }
}

// Restore last tab or default to dashboard
(() => {
    const saved = localStorage.getItem(TAB_KEY);
    const panels = document.querySelectorAll('.tab-panel');
    const validTabs = Array.from(panels).map(p => p.dataset.tab);
    switchTab(validTabs.includes(saved) ? saved : 'dashboard', false);
})();
