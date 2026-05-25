/**
 * Scheduled Reboot Panel
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="schedule_reboot"]');
  if (!panel) return;

  // Accordion behavior — only one section open at a time
  (function () {
    var items = panel.querySelectorAll('.sched-accordion-item');
    items.forEach(function (item) {
      var header = item.querySelector('.sched-accordion-header');
      var body = item.querySelector('.sched-accordion-body');
      if (!header || !body) return;

      header.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        // Close all open items
        items.forEach(function (i) {
          if (!i.classList.contains('open')) return;
          var b = i.querySelector('.sched-accordion-body');
          // Set explicit height for transition
          b.style.height = b.scrollHeight + 'px';
          void b.offsetHeight;
          b.style.height = '0';
          i.classList.remove('open');
        });
        // Open clicked if it was closed
        if (!isOpen) {
          item.classList.add('open');
          // Animate from 0 to scrollHeight
          body.style.height = '0';
          void body.offsetHeight;
          body.style.height = body.scrollHeight + 'px';
          body.addEventListener('transitionend', function handler() {
            body.style.height = '';
            body.removeEventListener('transitionend', handler);
          });
        }
      });
    });
  })();

  var timeInput = document.getElementById('reboot_time');
  var addBtn = document.getElementById('reboot_add_btn');
  var listEl = document.getElementById('reboot_task_list');
  var repeatSwitch;

  // Time stepper (12hr AM/PM) — number input style
  (function () {
    var hourInput = document.getElementById('reboot_hour_input');
    var minInput = document.getElementById('reboot_min_input');
    var ampmToggle = document.getElementById('reboot_ampm_toggle');
    if (!hourInput || !minInput || !ampmToggle) return;

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function to24(h12, ampm) {
      if (ampm === 'AM') return h12 === 12 ? 0 : h12;
      return h12 === 12 ? 12 : h12 + 12;
    }

    function getAmPm() {
      var sel = ampmToggle.querySelector('.ctrl-ampm-btn.selected');
      return sel ? sel.dataset.val : 'AM';
    }

    function clamp(val, min, max) {
      if (val < min) return max;
      if (val > max) return min;
      return val;
    }

    function sync() {
      var h = clamp(parseInt(hourInput.value) || 1, 1, 12);
      var m = clamp(parseInt(minInput.value) || 0, 0, 59);
      hourInput.value = h;
      minInput.value = m;
      var h24 = to24(h, getAmPm());
      timeInput.value = pad(h24) + ':' + pad(m);
    }

    hourInput.addEventListener('input', sync);
    hourInput.addEventListener('change', sync);
    minInput.addEventListener('input', sync);
    minInput.addEventListener('change', sync);

    ampmToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.ctrl-ampm-btn');
      if (!btn) return;
      ampmToggle.querySelectorAll('.ctrl-ampm-btn').forEach(function (b) {
        b.classList.toggle('selected', b === btn);
      });
      sync();
    });

    sync();
  })();

  setTimeout(function () {
    repeatSwitch = createCtrlToggle('REBOOT_REPEAT_SWITCH');
    repeatSwitch.set(true);
  }, 0);

  async function loadTasks() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/list_tasks', { headers: common_headers });
      var data = await res.json();
      var tasks = (data.tasks || []).filter(function (t) {
        return t.id && t.id.startsWith('reboot_');
      });

      if (tasks.length === 0) {
        listEl.innerHTML = '<div class="sched-empty">No scheduled reboots</div>';
        return;
      }

      listEl.innerHTML = tasks.map(function (t) {
        return '<div class="sched-item">' +
          '<div class="sched-item-info">' +
            '<span class="sched-item-time">' + escapeHtml(t.time) + '</span>' +
            '<span class="sched-item-meta">' + (t.repeatDaily ? '🔁 Daily' : '⏱️ Once') +
              (t.hasTriggered ? ' · ✅ Triggered' : '') + '</span>' +
          '</div>' +
          '<button class="sched-item-del" data-id="' + escapeHtml(t.id) + '">✕</button>' +
        '</div>';
      }).join('');

      listEl.querySelectorAll('.sched-item-del').forEach(function (btn) {
        btn.addEventListener('click', function () { removeTask(btn.dataset.id); });
      });
    } catch (e) {
      listEl.innerHTML = '<div class="sched-empty">Failed to load</div>';
    }
  }

  async function removeTask(id) {
    try {
      await fetch(HOTBOX_baseURL + '/remove_task', {
        method: 'POST',
        headers: { ...common_headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      showCtrlToast('Task removed', 'success');
      loadTasks();
    } catch (e) {
      showCtrlToast('Failed to remove', 'error');
    }
  }

  addBtn.addEventListener('click', async function () {
    var time = timeInput.value;
    if (!time) { showCtrlToast('Set a time first', 'error'); return; }

    var id = 'reboot_' + time.replace(':', '') + '_' + Date.now();
    var repeatDaily = repeatSwitch ? repeatSwitch.get() : true;

    try {
      await fetch(HOTBOX_baseURL + '/add_task', {
        method: 'POST',
        headers: { ...common_headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          time: time + ':00',
          repeatDaily: repeatDaily,
          action: { goformId: 'REBOOT_DEVICE' }
        })
      });
      showCtrlToast('Reboot scheduled', 'success');
      loadTasks();
    } catch (e) {
      showCtrlToast('Failed to add', 'error');
    }
  });

  bindCtrlSave('reboot_now_btn', async function (cookie) {
    await postData(cookie, { goformId: 'REBOOT_DEVICE' });
  }, { successMsg: 'Rebooting...', errorMsg: 'Reboot failed' });

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'schedule_reboot') loadTasks();
  });
})();
