import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

const plugin = createRequire(import.meta.url)("../plugins/with-ios-scene-lifecycle.js") as {
  rewriteAppDelegate: (contents: string) => string;
  SCENE_MANIFEST: { UISceneConfigurations: { UIWindowSceneSessionRoleApplication: Array<Record<string, string>> } };
};

const TEMPLATE = `    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
`;

test("the scene lifecycle plugin is registered in app.config", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e",
    "import loaded from './app.config.ts'; const config = loaded.default ?? loaded; console.log(JSON.stringify(config.plugins))"],
    { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout.trim()).includes("./plugins/with-ios-scene-lifecycle"));
});

test("the AppDelegate no longer creates the window, and the rewrite is idempotent", () => {
  const rewritten = plugin.rewriteAppDelegate(TEMPLATE);
  assert.doesNotMatch(rewritten, /UIWindow\(frame:/u);
  assert.doesNotMatch(rewritten, /startReactNative/u);
  assert.match(rewritten, /reactNativeFactory = factory/u);
  assert.match(rewritten, /return super\.application/u);
  assert.equal(plugin.rewriteAppDelegate(rewritten), rewritten);
});

test("an unknown AppDelegate template fails loudly instead of shipping a launch crash", () => {
  assert.throws(() => plugin.rewriteAppDelegate("class AppDelegate {}"), /no template window block/u);
});

test("the Info.plist scene manifest points at the generated SceneDelegate", () => {
  const [entry] = plugin.SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
  assert.equal(entry.UISceneDelegateClassName, "$(PRODUCT_MODULE_NAME).SceneDelegate");
});
