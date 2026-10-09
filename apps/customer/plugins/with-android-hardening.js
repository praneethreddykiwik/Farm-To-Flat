/**
 * Android manifest hardening.
 *
 * Three findings from the MobSF static scan of the 0.2.0 APK (B, 52/100), all of which come from
 * boilerplate rather than from anything this app actually does.
 *
 * `expo prebuild` starts every Android manifest from the bare template in
 * @expo/config-plugins, which ships SYSTEM_ALERT_WINDOW under a comment reading
 * "OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED". Nobody removed it. It is the
 * draw-over-other-apps permission — the one a tapjacking overlay needs to sit on top of a
 * payment screen — and no module in this app requests it (it appears nowhere outside that
 * template and React Native's own *debug* manifest). A grocery app asking for it is both a
 * real risk and the kind of thing that stalls a Play Store review.
 *
 * allowBackup defaulted to true, which lets anyone with USB debugging enabled pull the app's
 * private data off the device with `adb backup`. The auth token itself was already safe —
 * expo-secure-store's plugin excludes its store via fullBackupContent — but the SQLite cache
 * and AsyncStorage were not, and those hold the cart, the addresses and the order history.
 *
 * Cleartext HTTP is switched off outright. Every endpoint we talk to is HTTPS already, so this
 * costs nothing today; what it buys is that a future `http://` typo fails loudly in development
 * instead of silently shipping a leak of a customer's address over a cafe's Wi-Fi.
 *
 * READ_/WRITE_EXTERNAL_STORAGE are deliberately left alone: expo-image-picker declares them
 * itself, capped at maxSdkVersion=32, and removing them would break photographing a vegetable
 * or a damaged delivery on Android 10-12.
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/** Permissions from the bare template that nothing in this app uses. */
const DROP = ['android.permission.SYSTEM_ALERT_WINDOW'];

const withAndroidHardening = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const manifest = cfg.modResults.manifest;

    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // tools:node="remove" rather than dropping the element: the permission is merged in from
    // library manifests too, so deleting our copy alone would let it come straight back.
    manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(
      (p) => !DROP.includes(p.$?.['android:name']),
    );
    for (const name of DROP) {
      manifest['uses-permission'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }

    app.$['android:allowBackup'] = 'false';
    app.$['android:usesCleartextTraffic'] = 'false';

    return cfg;
  });

module.exports = withAndroidHardening;
