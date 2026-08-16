const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const USB_ACTION = 'android.hardware.usb.action.USB_DEVICE_ATTACHED';
const USB_CATEGORY = 'android.intent.category.DEFAULT';
const CORRUPT_USB_ACTION = `android.intent.action.${USB_ACTION}`;

function getMainActivity(app) {
  const activities = app.activity || [];
  return (
    activities.find((a) => a.$?.['android:name'] === '.MainActivity') ||
    activities.find((a) => a.$?.['android:name']?.endsWith('.MainActivity')) ||
    activities[0]
  );
}

function stripUsbIntentFilters(activity) {
  const filters = activity['intent-filter'] || [];
  activity['intent-filter'] = filters.filter((filter) => {
    const actions = (filter.action || []).map((a) => a.$?.['android:name']);
    return !actions.some(
      (name) => name === USB_ACTION || name === CORRUPT_USB_ACTION,
    );
  });
}

function ensureUsbIntentFilter(activity) {
  if (!activity['intent-filter']) activity['intent-filter'] = [];

  const alreadyHasCorrect = activity['intent-filter'].some((filter) =>
    (filter.action || []).some((a) => a.$?.['android:name'] === USB_ACTION),
  );

  if (!alreadyHasCorrect) {
    activity['intent-filter'].push({
      action: [{ $: { 'android:name': USB_ACTION } }],
      category: [{ $: { 'android:name': USB_CATEGORY } }],
    });
  }
}

function ensureUsbMetaData(activity) {
  if (!activity['meta-data']) activity['meta-data'] = [];

  const alreadySet = activity['meta-data'].some(
    (m) => m.$?.['android:name'] === USB_ACTION,
  );

  if (!alreadySet) {
    activity['meta-data'].push({
      $: {
        'android:name': USB_ACTION,
        'android:resource': '@xml/device_filter',
      },
    });
  }
}

/**
 * Copies assets/android/device_filter.xml → android/app/src/main/res/xml/device_filter.xml
 * and wires USB_DEVICE_ATTACHED intent-filter + device_filter meta-data on the main activity.
 * Expo's app.json intentFilters double-prefixes the action; this plugin owns USB wiring instead.
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

    const activity = getMainActivity(app);
    if (!activity) return cfg;

    stripUsbIntentFilters(activity);
    ensureUsbIntentFilter(activity);
    ensureUsbMetaData(activity);

    return cfg;
  });

  return config;
};

module.exports = withUsbDeviceFilter;
