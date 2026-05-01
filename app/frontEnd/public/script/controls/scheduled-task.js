/**
 * Scheduled Task Panel (merged into schedule_reboot panel)
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="schedule_reboot"]');
  if (!panel) return;

  var idInput = document.getElementById('task_id');
  var timeInput = document.getElementById('task_time');
  var actionSelect = document.getElementById('task_action');

  // Time stepper (12hr AM/PM)
  (function () {
    var hourDisp = document.getElementById('task_hour_display');
    var minDisp = document.getElementById('task_min_display');
    var ampmToggle = document.getElementById('task_ampm_toggle');
    if (!hourDisp || !minDisp || !ampmToggle) return;

    var selHour = 3, selMin = 0, selAmPm = 'AM';

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function to24(h12, ampm) {
      if (ampm === 'AM') return h12 === 12 ? 0 : h12;
      return h12 === 12 ? 12 : h12 + 12;
    }

    function sync() {
      hourDisp.textContent = pad(selHour);
      minDisp.textContent = pad(selMin);
      var h24 = to24(selHour, selAmPm);
      timeInput.value = pad(h24) + ':' + pad(selMin);
      ampmToggle.querySelectorAll('.ctrl-ampm-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.val === selAmPm);
      });
    }

    document.getElementById('task_hour_up').addEventListener('click', function () {
      selHour = selHour >= 12 ? 1 : selHour + 1;
      sync();
    });
    document.getElementById('task_hour_down').addEventListener('click', function () {
      selHour = selHour <= 1 ? 12 : selHour - 1;
      sync();
    });
    document.getElementById('task_min_up').addEventListener('click', function () {
      selMin = selMin >= 59 ? 0 : selMin + 1;
      sync();
    });
    document.getElementById('task_min_down').addEventListener('click', function () {
      selMin = selMin <= 0 ? 59 : selMin - 1;
      sync();
    });

    ampmToggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.ctrl-ampm-btn');
      if (!btn) return;
      selAmPm = btn.dataset.val;
      sync();
    });

    sync();
  })();
  var addBtn = document.getElementById('task_add_btn');
  var clearBtn = document.getElementById('task_clear_btn');
  var listEl = document.getElementById('task_list');
  var repeatSwitch;

  setTimeout(function () {
    repeatSwitch = createCtrlToggle('TASK_REPEAT_SWITCH');
    repeatSwitch.set(true);
  }, 0);

  async function loadTasks() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/list_tasks', { headers: common_headers });
      var data = await res.json();
      var tasks = data.tasks || [];

      if (tasks.length === 0) {
        listEl.innerHTML = '<div class="sched-empty">No scheduled tasks</div>';
        return;
      }

      listEl.innerHTML = tasks.map(function (t) {
        var actionLabel = t.actionMap && t.actionMap.goformId ? t.actionMap.goformId : 'Custom';
        return '<div class="sched-item">' +
          '<div class="sched-item-info">' +
            '<span class="sched-item-id">' + escapeHtml(t.id) + '</span>' +
            '<span class="sched-item-time">' + escapeHtml(t.time) + '</span>' +
            '<span class="sched-item-meta">' + escapeHtml(actionLabel) +
              ' · ' + (t.repeatDaily ? '🔁 Daily' : '⏱️ Once') +
              (t.hasTriggered ? ' · ✅' : '') + '</span>' +
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
    var id = idInput.value.trim();
    var time = timeInput.value;
    var goformId = actionSelect.value;

    if (!id) { showCtrlToast('Enter a Task ID', 'error'); return; }
    if (!time) { showCtrlToast('Set a time', 'error'); return; }

    var repeatDaily = repeatSwitch ? repeatSwitch.get() : true;

    try {
      await fetch(HOTBOX_baseURL + '/add_task', {
        method: 'POST',
        headers: { ...common_headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          time: time + ':00',
          repeatDaily: repeatDaily,
          action: { goformId: goformId }
        })
      });
      showCtrlToast('Task added', 'success');
      idInput.value = '';
      loadTasks();
    } catch (e) {
      showCtrlToast('Failed to add task', 'error');
    }
  });

  clearBtn.addEventListener('click', async function () {
    try {
      await fetch(HOTBOX_baseURL + '/clear_task', {
        method: 'POST',
        headers: { ...common_headers, 'Content-Type': 'application/json' },
        body: '{}'
      });
      showCtrlToast('All tasks cleared', 'success');
      loadTasks();
    } catch (e) {
      showCtrlToast('Failed to clear', 'error');
    }
  });

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'schedule_reboot') loadTasks();
  });
})();
