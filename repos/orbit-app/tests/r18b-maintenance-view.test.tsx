import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { createTranslator } from "../src/i18n/messages";
import { MaintenanceContent } from "../src/screens/public/MaintenanceContent";
import { formatMaintenanceUntil, maintenanceRouteTarget } from "../src/view-models/maintenance-view";
import { renderToHtml, renderedText } from "./helpers/render";

test("a real UTC recovery instant is shown as Tokyo time, not a hard-coded promise", () => {
  assert.equal(formatMaintenanceUntil("2026-10-19T03:00:00Z", "ja"), "10月19日 12:00（日本時間）");
  assert.equal(formatMaintenanceUntil("2026-10-19T12:00:00+09:00", "ja"), "10月19日 12:00（日本時間）");
  assert.equal(formatMaintenanceUntil("2026-10-19T03:00:00Z", "zh"), "10月19日 12:00（日本时间）");
  assert.equal(formatMaintenanceUntil("2026-10-19T03:00:00Z", "en"), "Oct 19, 12:00 (JST)");
  assert.equal(formatMaintenanceUntil(undefined, "ja"), null);
  assert.equal(formatMaintenanceUntil("not-a-date", "ja"), null);
});

test("maintenance screen differentiates unknown ETA from a valid scheduled time", () => {
  const t = createTranslator("ja");
  const unknown = renderedText(<MaintenanceContent t={t} untilText={null} onRetry={() => undefined} />);
  assert.match(unknown, /ただいまメンテナンス中です/);
  assert.match(unknown, /確認でき次第、お知らせします。/);
  assert.match(unknown, /再読み込み/);
  assert.doesNotMatch(unknown, /10月19日 12:00/);
  const scheduled = renderedText(<MaintenanceContent t={t} untilText="10月19日 12:00（日本時間）" onRetry={() => undefined} />);
  assert.match(scheduled, /10月19日 12:00（日本時間）/);
  assert.doesNotMatch(scheduled, /確認でき次第、お知らせします。/);
});

test("the phone maintenance schedule centers its label and value as drawn", () => {
  const html = renderToHtml(<MaintenanceContent t={createTranslator("ja")} untilText={null} onRetry={() => undefined} />);
  assert.match(html, /class="[^"]*r-textAlign-[^"]*"[^>]*>再開の予定/);
  assert.match(html, /class="[^"]*r-textAlign-[^"]*"[^>]*>確認でき次第、お知らせします。/);
});

test("only a maintenance decision stays on the maintenance route", () => {
  assert.equal(maintenanceRouteTarget({ kind: "maintenance" }, false), null);
  assert.equal(maintenanceRouteTarget({ kind: "maintenance", until: "2026-10-19T03:00:00Z" }, true), null);
  assert.equal(maintenanceRouteTarget({ kind: "allow", diagnostic: "policy-unavailable" }, false), "/");
  assert.equal(maintenanceRouteTarget({ kind: "allow" }, true), "/home");
  assert.equal(maintenanceRouteTarget({ kind: "force-update", latestAppVersion: "1.6.0" }, true), "/force-update");
});
