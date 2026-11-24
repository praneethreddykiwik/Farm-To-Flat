/**
 * "Tomorrow's order" in the iPhone Dynamic Island: adds the FooduciaIsland widget extension to the
 * generated Xcode project (ios/ is not kept in git, so this runs at every prebuild and EAS build).
 *
 *   modules/order-island/apple/     the Expo module (a pod) + the shared attributes type
 *   targets/order-island/           the extension: what is drawn, its buttons, its picture
 *
 * The attributes type and the buttons' intents must also be compiled into the app itself: iOS runs
 * those buttons in the app's process and looks them up there.
 *
 * Hand-written rather than a package because adding one means reinstalling every dependency, and the
 * whole job is the few steps below. Runs twice without harm.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

// Not 'OrderIsland': that is the pod's module name, and two modules with one name overwrite each other.
const TARGET = 'FooduciaIsland';
const MIN_IOS = '17.0'; // buttons inside a Live Activity
const SHARED = ['OrderIslandAttributes.swift', 'OrderIslandIntents.swift'];
const SOURCES = [...SHARED, 'OrderIslandWidget.swift'];

const bundleIdOf = (config) => `${config.ios.bundleIdentifier}.${TARGET}`;

const infoPlist = (config) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key><string>Fooducia</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key><string>${config.version || '1.0.0'}</string>
  <key>CFBundleVersion</key><string>${config.ios?.buildNumber || '1'}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string>
  </dict>
  <key>NSSupportsLiveActivities</key><true/>
</dict>
</plist>
`;

/** Copy the Swift files and the picture into ios/FooduciaIsland. */
const withFiles = (config) =>
  withDangerousMod(config, [
    'ios',
    (c) => {
      const root = c.modRequest.projectRoot;
      const out = path.join(c.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(out, { recursive: true });
      const copy = (from, name) =>
        fs.copyFileSync(path.join(root, from, name), path.join(out, name));
      copy('modules/order-island/apple', 'OrderIslandAttributes.swift');
      copy('targets/order-island', 'OrderIslandIntents.swift');
      copy('targets/order-island', 'OrderIslandWidget.swift');
      fs.cpSync(
        path.join(root, 'targets/order-island/Assets.xcassets'),
        path.join(out, 'Assets.xcassets'),
        { recursive: true },
      );
      fs.writeFileSync(path.join(out, `${TARGET}-Info.plist`), infoPlist(c));
      return c;
    },
  ]);

const withTarget = (config) =>
  withXcodeProject(config, (c) => {
    const proj = c.modResults;
    const objects = proj.hash.project.objects;
    if (proj.pbxTargetByName(TARGET) || proj.pbxTargetByName(`"${TARGET}"`)) return c;

    // node-xcode only wires a dependency when these sections already exist.
    objects.PBXTargetDependency ||= {};
    objects.PBXContainerItemProxy ||= {};

    const app = proj.getFirstTarget();
    const group = proj.addPbxGroup([], TARGET, TARGET);
    proj.addToPbxGroup(group.uuid, proj.getFirstProject().firstProject.mainGroup);

    const target = proj.addTarget(TARGET, 'app_extension', TARGET, bundleIdOf(c));
    proj.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);

    for (const name of SOURCES) {
      const file = proj.addSourceFile(name, { target: target.uuid }, group.uuid);
      // The shared ones belong to the app as well: same file, a second build entry.
      if (file && SHARED.includes(name)) {
        const extra = { ...file, uuid: proj.generateUuid(), target: app.uuid };
        proj.addToPbxBuildFileSection(extra);
        proj.addToPbxSourcesBuildPhase(extra);
      }
    }
    // Not addResourceFile: it needs a "Resources" group, which an Expo project does not have.
    const assets = proj.addFile('Assets.xcassets', group.uuid, {
      lastKnownFileType: 'folder.assetcatalog',
    });
    Object.assign(assets, {
      uuid: proj.generateUuid(),
      group: 'Resources',
      target: target.uuid,
    });
    proj.addToPbxBuildFileSection(assets);
    proj.addToPbxResourcesBuildPhase(assets);
    proj.addFramework('WidgetKit.framework', { target: target.uuid, link: true });
    proj.addFramework('SwiftUI.framework', { target: target.uuid, link: true });

    const configs = proj.pbxXCBuildConfigurationSection();
    const mine = objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
    const appList = objects.XCConfigurationList[app.firstTarget.buildConfigurationList];
    const appSettings = configs[appList.buildConfigurations[0].value].buildSettings;
    for (const { value } of mine.buildConfigurations)
      Object.assign(configs[value].buildSettings, {
        ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS: 'NO',
        CLANG_ENABLE_MODULES: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        ...(appSettings.DEVELOPMENT_TEAM ? { DEVELOPMENT_TEAM: appSettings.DEVELOPMENT_TEAM } : {}),
        CURRENT_PROJECT_VERSION: c.ios?.buildNumber || '1',
        MARKETING_VERSION: c.version || '1.0.0',
        GENERATE_INFOPLIST_FILE: 'NO',
        IPHONEOS_DEPLOYMENT_TARGET: MIN_IOS,
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1"',
        SWIFT_EMIT_LOC_STRINGS: 'NO',
      });
    return c;
  });

/** EAS makes the extension's App ID and provisioning profile from this. */
const withEasExtension = (config) => {
  const ext = { targetName: TARGET, bundleIdentifier: bundleIdOf(config), entitlements: {} };
  const eas = (config.extra ??= {}).eas ?? {};
  const list = eas.build?.experimental?.ios?.appExtensions ?? [];
  config.extra.eas = {
    ...eas,
    build: {
      ...eas.build,
      experimental: {
        ...eas.build?.experimental,
        ios: {
          ...eas.build?.experimental?.ios,
          appExtensions: [...list.filter((e) => e.targetName !== TARGET), ext],
        },
      },
    },
  };
  return config;
};

module.exports = function withOrderIsland(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSSupportsLiveActivities = true;
    return c;
  });
  config = withFiles(config);
  config = withTarget(config);
  return withEasExtension(config);
};
