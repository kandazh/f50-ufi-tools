/**
 * APK Install — Upload APK from local device and install wirelessly.
 */
(function () {
  var fileInput = document.getElementById('apk_install_file');
  var fileLabel = document.getElementById('apk_install_label');
  var filenameEl = document.getElementById('apk_install_filename');
  var installBtn = document.getElementById('apk_install_btn');
  var progressWrap = document.getElementById('apk_install_progress_wrap');
  var progressBar = document.getElementById('apk_install_progress_bar');
  var progressText = document.getElementById('apk_install_progress_text');
  var logEl = document.getElementById('apk_install_log');

  if (!fileInput || !installBtn) return;

  var selectedFile = null;
  var uploaded = false;

  function log(msg) {
    if (!logEl) return;
    logEl.style.display = '';
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
      filenameEl.textContent = 'Please select a valid .apk file';
      installBtn.disabled = true;
      selectedFile = null;
      return;
    }
    selectedFile = file;
    uploaded = false;
    filenameEl.textContent = file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)';
    installBtn.disabled = false;
    installBtn.textContent = 'Install';
    logEl.style.display = 'none';
    logEl.textContent = '';
  });

  installBtn.addEventListener('click', async function () {
    if (!selectedFile && !uploaded) return;
    installBtn.disabled = true;

    // Step 1: Upload if not already uploaded
    if (!uploaded) {
      log('Uploading ' + selectedFile.name + '...');
      progressWrap.style.display = '';
      progressBar.style.width = '0%';
      progressText.textContent = 'Uploading...';

      var formData = new FormData();
      formData.append('file', selectedFile);

      try {
        var xhr = new XMLHttpRequest();
        var uploadDone = await new Promise(function (resolve, reject) {
          xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
              var pct = Math.round((e.loaded / e.total) * 100);
              progressBar.style.width = pct + '%';
              progressText.textContent = 'Uploading... ' + pct + '%';
            }
          });
          xhr.addEventListener('load', function () {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error('Upload failed: ' + xhr.status));
            }
          });
          xhr.addEventListener('error', function () { reject(new Error('Upload network error')); });
          xhr.open('POST', HOTBOX_baseURL + '/upload_apk');
          var _token = common_headers.authorization || localStorage.getItem('hotbox_sms_token') || '';
          if (_token) xhr.setRequestHeader('authorization', _token);
          var _t = Date.now();
          var _sig = hmacSignature('hotbox_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd', 'hotboxPOST/api/upload_apk' + _t);
          xhr.setRequestHeader('hotbox-t', _t);
          xhr.setRequestHeader('hotbox-sign', _sig);
          xhr.send(formData);
        });

        uploaded = true;
        progressBar.style.width = '100%';
        progressText.textContent = 'Upload complete';
        log('Upload complete. Ready to install.');
      } catch (e) {
        log('Upload failed: ' + e.message);
        progressText.textContent = 'Upload failed';
        installBtn.disabled = false;
        installBtn.textContent = 'Retry';
        return;
      }
    }

    // Step 2: Install
    log('Installing APK...');
    installBtn.textContent = 'Installing...';

    try {
      var res = await fetch(HOTBOX_baseURL + '/install_apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': localStorage.getItem('token') || '' },
        body: JSON.stringify({})
      });
      var text = await res.text();

      try {
        var data = JSON.parse(text);
        if (data.result === 'success') {
          log('Install command sent. App will restart...');
          installBtn.textContent = 'Waiting for restart...';

          // Poll until app comes back online
          var attempts = 0;
          var maxAttempts = 20;
          var checkAlive = function () {
            return new Promise(function (resolve) {
              setTimeout(function () {
                fetch(HOTBOX_baseURL + '/version_info', { cache: 'no-store' })
                  .then(function (r) { return r.json(); })
                  .then(function (info) {
                    resolve(true);
                  })
                  .catch(function () { resolve(false); });
              }, 3000);
            });
          };

          await new Promise(function (r) { setTimeout(r, 5000); }); // initial wait for kill+install
          log('Checking if app restarted...');

          while (attempts < maxAttempts) {
            var alive = await checkAlive();
            attempts++;
            if (alive) {
              log('App is back online! Install successful.');
              installBtn.textContent = 'Done ✓';
              progressText.textContent = 'Install complete';
              return;
            }
            log('Waiting... (' + attempts + '/' + maxAttempts + ')');
          }

          log('App did not respond after ' + maxAttempts + ' attempts. Check device manually.');
          installBtn.textContent = 'Install';
          installBtn.disabled = false;
        } else if (data.error) {
          log('Install error: ' + data.error);
          installBtn.textContent = 'Install';
          installBtn.disabled = false;
        }
      } catch (e) {
        log('Install response: ' + text);
        installBtn.textContent = 'Install';
        installBtn.disabled = false;
      }
    } catch (e) {
      log('Install request failed (app may be restarting): ' + e.message);
      installBtn.textContent = 'Waiting for restart...';

      // The install killed the app, so the request failed — poll for it to come back
      await new Promise(function (r) { setTimeout(r, 5000); });
      log('Checking if app restarted...');
      var attempts = 0;
      var maxAttempts = 20;
      while (attempts < maxAttempts) {
        await new Promise(function (r) { setTimeout(r, 3000); });
        attempts++;
        try {
          var r = await fetch(HOTBOX_baseURL + '/version_info', { cache: 'no-store' });
          await r.json();
          log('App is back online! Install successful.');
          installBtn.textContent = 'Done ✓';
          progressText.textContent = 'Install complete';
          return;
        } catch (e2) {
          log('Waiting... (' + attempts + '/' + maxAttempts + ')');
        }
      }
      log('App did not respond. Check device manually.');
      installBtn.textContent = 'Install';
      installBtn.disabled = false;
    }
  });
})();
