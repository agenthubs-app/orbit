import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function configWith(flag?: string) {
  const env = { ...process.env };
  if (flag === undefined) delete env.ORBIT_ENABLE_WIDGETS;
  else env.ORBIT_ENABLE_WIDGETS = flag;
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e",
    "import loaded from './app.config.ts'; const config = loaded.default ?? loaded; console.log(JSON.stringify({ plugins: config.plugins, enabled: config.extra?.widgetkitEnabled }))"],
    { cwd: process.cwd(), env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("WidgetKit extension generation defaults off and enables only with the explicit flag", () => {
  const defaultConfig = configWith();
  const explicitOff = configWith("0");
  const enabled = configWith("1");
  for (const config of [defaultConfig, explicitOff]) {
    assert.equal(config.plugins.includes("./plugins/with-orbit-widgetkit"), false);
    assert.equal(config.enabled, false);
  }
  assert.equal(enabled.plugins.includes("./plugins/with-orbit-widgetkit"), true);
  assert.equal(enabled.enabled, true);
});
