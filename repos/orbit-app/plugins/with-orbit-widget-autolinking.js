const { withPodfile } = require("expo/config-plugins");

const BRIDGE = "orbit-widget-snapshot";

function rewritePodfile(contents, enabled) {
  const line = /^([ \t]*)use_expo_modules!(?:\(exclude: \['orbit-widget-snapshot'\]\))?$/mu;
  if (!line.test(contents)) throw new Error("Orbit Podfile has no Expo autolinking call");
  return contents.replace(line, (_, indent) =>
    `${indent}use_expo_modules!${enabled ? "" : `(exclude: ['${BRIDGE}'])`}`);
}

function withOrbitWidgetAutolinking(config) {
  const enabled = process.env.ORBIT_ENABLE_WIDGETS === "1";
  return withPodfile(config, mod => {
    mod.modResults.contents = rewritePodfile(mod.modResults.contents, enabled);
    return mod;
  });
}

module.exports = withOrbitWidgetAutolinking;
module.exports.rewritePodfile = rewritePodfile;
