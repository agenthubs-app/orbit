const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const BUILD_REACT_NATIVE_FROM_SOURCE_KEY = "ios.buildReactNativeFromSource";
const ORBIT_BUNDLE_IDENTIFIER = "app.agenthubs.orbit";

function withOrbitIosBuildSettings(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const propertiesPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile.properties.json"
      );
      const properties = readJson(propertiesPath);

      properties[BUILD_REACT_NATIVE_FROM_SOURCE_KEY] = "true";

      fs.writeFileSync(
        propertiesPath,
        `${JSON.stringify(properties, null, 2)}\n`
      );

      return modConfig;
    }
  ]);

  return withXcodeProject(config, (modConfig) => {
    const buildConfigurations =
      modConfig.modResults.pbxXCBuildConfigurationSection();

    for (const [key, buildConfiguration] of Object.entries(
      buildConfigurations
    )) {
      if (key.endsWith("_comment")) {
        continue;
      }

      const buildSettings = buildConfiguration.buildSettings;
      if (
        buildConfiguration.name === "Debug" &&
        buildSettings?.PRODUCT_BUNDLE_IDENTIFIER === ORBIT_BUNDLE_IDENTIFIER
      ) {
        buildSettings.ENABLE_DEBUG_DYLIB = "NO";
      }
    }

    return modConfig;
  });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = withOrbitIosBuildSettings;
