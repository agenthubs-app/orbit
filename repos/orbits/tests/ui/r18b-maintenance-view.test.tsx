import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MaintenanceView, formatMaintenanceUntil, maintenanceFromVersionResponse, readMaintenanceFromApi } from "../../app/(app)/app/orbit-2026/auth-public/MaintenanceView";

test("only an explicit successful active version response enters maintenance", () => {
  assert.deepEqual(maintenanceFromVersionResponse({ success: true, data: { maintenance: { active: true, until: "2026-10-19T03:00:00Z" } } }), { until: "2026-10-19T03:00:00Z" });
  assert.deepEqual(maintenanceFromVersionResponse({ success: true, data: { maintenance: { active: true, until: "not-a-date" } } }), {});
  assert.equal(maintenanceFromVersionResponse({ success: true, data: { maintenance: { active: false } } }), null);
  assert.equal(maintenanceFromVersionResponse({ success: false, error: { code: "UNAVAILABLE" } }), null);
  assert.equal(maintenanceFromVersionResponse({ maintenance: { active: true } }), null);
});

test("valid maintenance ETA uses the real instant in Tokyo and unknown ETA stays honest", () => {
  assert.equal(formatMaintenanceUntil("2026-10-19T03:00:00Z", "ja"), "10月19日 12:00（日本時間）");
  assert.equal(formatMaintenanceUntil(undefined, "ja"), null);
  const unknown = renderToStaticMarkup(<MaintenanceView language="ja" untilText={null} onRetry={() => undefined} />);
  assert.match(unknown, /ただいまメンテナンス中です/);
  assert.match(unknown, /確認でき次第、お知らせします。/);
  assert.match(unknown, /再読み込み/);
  assert.doesNotMatch(unknown, /10月19日 12:00/);
  const scheduled = renderToStaticMarkup(<MaintenanceView language="ja" untilText="10月19日 12:00（日本時間）" onRetry={() => undefined} />);
  assert.match(scheduled, /10月19日 12:00（日本時間）/);
});

test("HTTP 503 and offline are not maintenance even if their body mentions active", async () => {
  const activeBody = { success: true, data: { maintenance: { active: true } } };
  assert.deepEqual(await readMaintenanceFromApi(async () => Response.json(activeBody)), {});
  assert.equal(await readMaintenanceFromApi(async () => Response.json(activeBody, { status: 503 })), null);
  assert.equal(await readMaintenanceFromApi(async () => { throw new Error("offline"); }), null);
});
