const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copies assets/android/device_filter.xml → android/app/src/main/res/xml/device_filter.xml
 * and adds the USB device filter meta-data to the main activity (activity level, not inside
 * the intent-filter — that is the correct Android location for USB_DEVICE_ATTACHED).
 */
const withUsbDeviceFilter = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(__dirname, '..', 'assets', 'android', 'device_filter.xml');
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      const dest = path.join(xmlDir, 'device_filter.xml');
      if (!fs.existsSync(xmlDir)) fs.mkdirSync(xmlDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    const activities = app.activity || [];
    for (const activity of activities) {
      const filters = activity['intent-filter'] || [];
      const hasUsbIntentFilter = filters.some((f) =>
        (f.action || []).some(
          (a) => a.$?.['android:name'] === 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
        ),
      );

      if (hasUsbIntentFilter) {
        if (!activity['meta-data']) activity['meta-data'] = [];
        const alreadySet = activity['meta-data'].some(
          (m) => m.$?.['android:name'] === 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
        );
        if (!alreadySet) {
          activity['meta-data'].push({
            $: {
              'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
              'android:resource': '@xml/device_filter',
            },
          });
        }
      }
    }
    return cfg;
  });

  return config;
};

module.exports = withUsbDeviceFilter;
