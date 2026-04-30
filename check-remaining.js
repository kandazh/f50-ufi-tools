const fs = require('fs');
const path = require('path');
const root = __dirname;
const kotlinBase = path.join(root, 'app/src/main/java/com/minikano/f50_sms');
const files = [
  path.join(kotlinBase, 'utils/ShellKano.kt'),
  path.join(kotlinBase, 'utils/KanoUtils.kt'),
  path.join(kotlinBase, 'modules/advanced/advancedToolsModule.kt'),
  path.join(kotlinBase, 'utils/SmsPoll.kt'),
  path.join(kotlinBase, 'MainActivity.kt'),
  path.join(kotlinBase, 'ADBService.kt'),
  path.join(kotlinBase, 'modules/config/configModule.kt'),
  path.join(kotlinBase, 'modules/ota/otaModule.kt'),
  path.join(kotlinBase, 'modules/deviceInfo/baseDeviceInfoModule.kt'),
  path.join(kotlinBase, 'modules/smsForward/smsModule.kt'),
  path.join(kotlinBase, 'modules/theme/themeModule.kt'),
  path.join(kotlinBase, 'modules/scheduledTask/scheduledTaskModule.kt'),
  path.join(kotlinBase, 'WebService.kt'),
  path.join(kotlinBase, 'BootReceiver.kt'),
  path.join(kotlinBase, 'utils/WakeLock.kt'),
  path.join(kotlinBase, 'utils/TaskScheduler.kt'),
  path.join(kotlinBase, 'utils/SmbThrottledRunner.kt'),
  path.join(kotlinBase, 'utils/UniqueDeviceIDManager.kt'),
  path.join(kotlinBase, 'utils/DeviceInfo.kt'),
  path.join(kotlinBase, 'utils/KanoDingTalk.kt'),
  path.join(kotlinBase, 'utils/IPManager.kt'),
  path.join(kotlinBase, 'utils/KanoCURL.kt'),
  path.join(kotlinBase, 'utils/KanoSMTP.kt'),
  path.join(kotlinBase, 'utils/PassHash.kt'),
  path.join(kotlinBase, 'modules/adb/adbModule.kt'),
  path.join(kotlinBase, 'modules/at/atModule.kt'),
  path.join(kotlinBase, 'modules/plugins/pluginsModule.kt'),
  path.join(kotlinBase, 'modules/reverseProxyModule.kt'),
  path.join(kotlinBase, 'modules/anyProxy/anyProxyModule.kt'),
  path.join(kotlinBase, 'utils/kanoGoformRequest.kt'),
  path.join(root, 'app/frontEnd/build.js'),
  path.join(root, 'app/src/main/assets/script/theme.js'),
  path.join(root, 'app/src/main/assets/shell/traffic_limit_bak.sh'),
];
const zh = /[\u4e00-\u9fff]/;
files.forEach(f => {
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (zh.test(l)) {
      console.log(`${path.relative(root, f)}:${i + 1}: ${l.trim()}`);
    }
  });
});
