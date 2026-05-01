/**
 * Change Password Panel
 */
(function () {
  var newPwd = document.getElementById('pwd_new');
  var confirmPwd = document.getElementById('pwd_confirm');
  var strengthEl = document.getElementById('pwd_strength');

  if (!newPwd) return;

  // Eye toggle buttons
  document.querySelectorAll('.pwd-eye-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.dataset.target);
      if (!target) return;
      var isPassword = target.type === 'password';
      target.type = isPassword ? 'text' : 'password';
      btn.classList.toggle('active', isPassword);
    });
  });

  // Password strength indicator
  function updateStrength() {
    var val = newPwd.value;
    if (!val) { strengthEl.textContent = ''; strengthEl.className = 'pwd-strength'; return; }
    var score = 0;
    if (val.length >= 8) score++;
    if (val.length >= 12) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    var labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    var classes = ['very-weak', 'weak', 'fair', 'strong', 'very-strong'];
    var idx = Math.min(score, 4);
    strengthEl.textContent = 'Strength: ' + labels[idx];
    strengthEl.className = 'pwd-strength pwd-' + classes[idx];
  }

  newPwd.addEventListener('input', updateStrength);

  bindCtrlSave('pwd_save_btn', async function () {
    var pwd = newPwd.value.trim();
    var conf = confirmPwd.value.trim();

    if (!pwd) throw new Error('Please enter a password');
    if (pwd.length < 4) throw new Error('Password too short (min 4 characters)');
    if (pwd !== conf) throw new Error('Passwords do not match');

    var res = await fetch(HOTBOX_baseURL + '/update_admin_pwd', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password: pwd })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') {
      throw new Error((data && data.error) || 'Unknown error');
    }
    newPwd.value = '';
    confirmPwd.value = '';
    strengthEl.textContent = '';
    strengthEl.className = 'pwd-strength';
  }, { needsLogin: false, successMsg: 'Password updated' });
})();
