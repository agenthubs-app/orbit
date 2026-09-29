// expo-sqlite's web build ships wa-sqlite as a wasm file imported from its Worker
// entry; Metro must treat wasm as an asset or the web export fails to resolve it.
const { realpathSync } = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

// Multiple Orbit worktrees can share a physical node_modules tree. Metro's
// transform cache must distinguish router context transforms by this checkout,
// otherwise a bundle can reuse another worktree's Expo Router app-root mapping.
config.cacheVersion = `${config.cacheVersion}:orbit-app:${path.resolve(__dirname)}`;

// Async chunks use dependency paths relative to Metro's server root. When
// node_modules is symlinked outside this checkout, those URLs resolve to the
// symlink target instead of the path Metro can resolve from this project root.
const realNodeModulesPath = new URL(
  `http://metro${realpathSync(path.join(__dirname, "node_modules"))}/`,
).pathname.slice(0, -1);
const realNodeModulesPrefix = `${realNodeModulesPath}/`;
const expoRewriteRequestUrl = config.server.rewriteRequestUrl;

config.server.rewriteRequestUrl = (requestUrl) => {
  const expoRewrittenUrl = expoRewriteRequestUrl(requestUrl);
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(expoRewrittenUrl);
  const isProtocolRelative = expoRewrittenUrl.startsWith("//");
  const url = new URL(expoRewrittenUrl, "http://metro");
  if (!url.pathname.startsWith(realNodeModulesPrefix)) return expoRewrittenUrl;

  const modulePath = url.pathname.slice(realNodeModulesPrefix.length);
  if (!modulePath || modulePath.split("/").some((segment) => segment === "..")) {
    return expoRewrittenUrl;
  }

  url.pathname = `/node_modules/${modulePath}`;
  if (hasScheme) return url.toString();
  const authority = isProtocolRelative ? `//${url.host}` : "";
  return `${authority}${url.pathname}${url.search}${url.hash}`;
};

module.exports = config;
