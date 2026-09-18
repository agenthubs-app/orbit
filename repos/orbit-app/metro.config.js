// expo-sqlite's web build ships wa-sqlite as a wasm file imported from its Worker
// entry; Metro must treat wasm as an asset or the web export fails to resolve it.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

module.exports = config;
