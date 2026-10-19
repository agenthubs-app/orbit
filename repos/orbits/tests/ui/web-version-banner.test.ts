import assert from "node:assert/strict";
import test from "node:test";

import { dismissWebBuildId, readDismissedWebBuildId, readWebVersionBuildId, shouldShowWebVersionBanner } from "../../app/(app)/app/orbit-2026/auth-public/web-version-banner";

test("new-version banner requires both build IDs and compares identity, not SHA order", () => {
  const oldBuild = "ffffffffffffffffffffffffffffffffffffffff";
  const newBuild = "0000000000000000000000000000000000000001";
  assert.equal(shouldShowWebVersionBanner(oldBuild, { webBuildId: newBuild }), true);
  assert.equal(shouldShowWebVersionBanner(oldBuild, { webBuildId: oldBuild }), false);
  assert.equal(shouldShowWebVersionBanner(undefined, { webBuildId: newBuild }), false);
  assert.equal(shouldShowWebVersionBanner(oldBuild, {}), false);
  assert.equal(shouldShowWebVersionBanner(oldBuild, null), false);
});

test("dismissed build stays hidden until the announced build changes", () => {
  const current = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const dismissed = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: dismissed }, dismissed), false);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: dismissed.toUpperCase() }, dismissed), false);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: "cccccccccccccccccccccccccccccccccccccccc" }, dismissed), true);
});

test("the current page reads only a successful live version envelope", async () => {
  const build = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  let request: RequestInit | undefined;
  assert.equal(await readWebVersionBuildId(async (_input, init) => {
    request = init;
    return Response.json({ success: true, data: { webBuildId: build } });
  }), build);
  assert.equal(request?.cache, "no-store");
  assert.equal(await readWebVersionBuildId(async () => Response.json({ success: true, data: { webBuildId: build } }, { status: 503 })), null);
  assert.equal(await readWebVersionBuildId(async () => Response.json({ success: false, data: { webBuildId: build } })), null);
  assert.equal(await readWebVersionBuildId(async () => { throw new Error("offline"); }), null);
});

test("dismissal survives remount for the same target build and storage failures stay harmless", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
  const current = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const target = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  dismissWebBuildId(storage, target);
  assert.equal(readDismissedWebBuildId(storage), target);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: target }, readDismissedWebBuildId(storage)), false);
  assert.equal(shouldShowWebVersionBanner(current, { webBuildId: "cccccccccccccccccccccccccccccccccccccccc" }, readDismissedWebBuildId(storage)), true);
  assert.equal(readDismissedWebBuildId({ getItem: () => { throw new Error("blocked"); } }), undefined);
  assert.doesNotThrow(() => dismissWebBuildId({ setItem: () => { throw new Error("blocked"); } }, target));
});
