import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8")
) as {
  dependencies?: Record<string, string>;
};
const appConfigSource = readFileSync(join(repoRoot, "app.config.ts"), "utf8");
const iosInfoPlistSource = readFileSync(
  join(repoRoot, "ios", "Orbit", "Info.plist"),
  "utf8"
);

test("native QR scanning has an Expo camera dependency", () => {
  assert.match(packageJson.dependencies?.["expo-camera"] ?? "", /^~/u);
});

test("native QR scanning declares the iOS camera usage string", () => {
  assert.match(appConfigSource, /NSCameraUsageDescription/u);
  assert.match(appConfigSource, /扫描二维码和拍摄名片/u);
  assert.match(iosInfoPlistSource, /NSCameraUsageDescription/u);
  assert.match(iosInfoPlistSource, /扫描二维码和拍摄名片/u);
});

test("native business-card image picking declares the iOS photo usage string", () => {
  assert.match(appConfigSource, /NSPhotoLibraryUsageDescription/u);
  assert.match(appConfigSource, /选择名片图片/u);
  assert.match(iosInfoPlistSource, /NSPhotoLibraryUsageDescription/u);
  assert.match(iosInfoPlistSource, /选择名片图片/u);
});

test("native profile document picking has an Expo document picker dependency", () => {
  assert.match(packageJson.dependencies?.["expo-document-picker"] ?? "", /^~/u);
});
