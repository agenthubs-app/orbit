const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withEntitlementsPlist, withXcodeProject } = require("expo/config-plugins");

const GROUP_ID = "group.app.agenthubs.orbit";
const TARGET_NAME = "OrbitWidgets";
const BUNDLE_ID = "app.agenthubs.orbit.widgets";
const TEMPLATE_DIR = path.join(__dirname, "widgetkit");
const FILES = ["OrbitWidgetBundle.swift", "OrbitWidgets-Info.plist", "OrbitWidgets.entitlements"];

function unquote(value) { return String(value ?? "").replace(/^"|"$/gu, ""); }

function withOrbitWidgetKit(config) {
  config = withEntitlementsPlist(config, mod => {
    const groups = mod.modResults["com.apple.security.application-groups"] ?? [];
    mod.modResults["com.apple.security.application-groups"] = [...new Set([...groups, GROUP_ID])];
    return mod;
  });

  config = withDangerousMod(config, ["ios", async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, TARGET_NAME);
    fs.mkdirSync(directory, { recursive: true });
    for (const file of FILES) fs.copyFileSync(path.join(TEMPLATE_DIR, file), path.join(directory, file));
    return mod;
  }]);

  return withXcodeProject(config, mod => {
    const project = mod.modResults;
    const targets = project.pbxNativeTargetSection();
    const existing = Object.entries(targets).find(([key, target]) => !key.endsWith("_comment") && unquote(target.name) === TARGET_NAME);
    if (existing) return mod;

    const host = project.getFirstTarget();
    if (unquote(host.firstTarget.name) !== "Orbit") throw new Error("R19 needs the Orbit host target");
    const extension = project.addTarget(TARGET_NAME, "app_extension", TARGET_NAME, BUNDLE_ID);
    project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", extension.uuid);
    project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", extension.uuid);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", extension.uuid);

    const group = project.addPbxGroup([], TARGET_NAME, TARGET_NAME);
    const root = project.getPBXGroupByKey(project.getFirstProject().firstProject.mainGroup);
    root.children.push({ value: group.uuid, comment: TARGET_NAME });
    project.addSourceFile("OrbitWidgetBundle.swift", { target: extension.uuid }, group.uuid);
    project.addFile("OrbitWidgets-Info.plist", group.uuid);
    project.addFile("OrbitWidgets.entitlements", group.uuid);

    const list = project.pbxXCConfigurationList()[extension.pbxNativeTarget.buildConfigurationList];
    for (const item of list.buildConfigurations) {
      const settings = project.pbxXCBuildConfigurationSection()[item.value].buildSettings;
      Object.assign(settings, {
        APPLICATION_EXTENSION_API_ONLY: "YES",
        CLANG_ENABLE_MODULES: "YES",
        CODE_SIGN_ENTITLEMENTS: `${TARGET_NAME}/OrbitWidgets.entitlements`,
        CODE_SIGN_STYLE: "Automatic",
        CURRENT_PROJECT_VERSION: 1,
        GENERATE_INFOPLIST_FILE: "NO",
        IPHONEOS_DEPLOYMENT_TARGET: "17.0",
        MARKETING_VERSION: '"0.1.0"',
        SDKROOT: "iphoneos",
        SWIFT_VERSION: "5.0",
        TARGETED_DEVICE_FAMILY: '"1"',
      });
    }
    return mod;
  });
}

module.exports = withOrbitWidgetKit;
