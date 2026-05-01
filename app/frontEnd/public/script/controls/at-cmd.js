/**
 * AT Commands Panel — Send AT commands to the modem via /api/AT
 */
(function () {
  var input = document.getElementById('at_cmd_input');
  var sendBtn = document.getElementById('at_cmd_send');
  var output = document.getElementById('at_cmd_output');
  var clearBtn = document.getElementById('at_cmd_clear');
  var slotSelect = document.getElementById('at_cmd_slot');

  if (!input || !sendBtn) return;

  var history = [];
  var historyIdx = -1;

  function appendOutput(cmd, response, isError) {
    var cmdLine = document.createElement('div');
    cmdLine.className = 'at-cmd-line at-cmd-sent';
    cmdLine.textContent = 'AT> ' + cmd;
    output.appendChild(cmdLine);

    var resLine = document.createElement('div');
    resLine.className = 'at-cmd-line ' + (isError ? 'at-cmd-error' : 'at-cmd-response');
    resLine.textContent = response;
    output.appendChild(resLine);

    output.scrollTop = output.scrollHeight;
  }

  async function sendCommand(cmd) {
    if (!cmd.trim()) return;

    // Ensure it starts with AT
    var atCmd = cmd.trim();
    if (!atCmd.toUpperCase().startsWith('AT')) {
      atCmd = 'AT' + atCmd;
    }

    // Add to history
    history.push(atCmd);
    historyIdx = history.length;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      var slot = slotSelect ? slotSelect.value : '0';
      var url = HOTBOX_baseURL + '/AT?command=' + encodeURIComponent(atCmd) + '&slot=' + slot;
      var res = await fetch(url, { headers: common_headers });
      var data = await res.json();
      var result = data.result || data.output || JSON.stringify(data);
      appendOutput(atCmd, result, false);
    } catch (e) {
      appendOutput(atCmd, 'Error: ' + e.message, true);
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', function () {
    sendCommand(input.value);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendCommand(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIdx > 0) {
        historyIdx--;
        input.value = history[historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx < history.length - 1) {
        historyIdx++;
        input.value = history[historyIdx];
      } else {
        historyIdx = history.length;
        input.value = '';
      }
    }
  });

  clearBtn.addEventListener('click', function () {
    output.innerHTML = '<div class="at-cmd-welcome">Ready. Type an AT command below.</div>';
  });

  // Preset buttons
  var presetBtns = document.querySelectorAll('.at-cmd-preset-btn');
  presetBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      sendCommand(btn.dataset.cmd);
    });
  });
})();
