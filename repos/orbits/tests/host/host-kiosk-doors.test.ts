// 受付「開場まで」：十几天时不再写成「23345分」（2026-11-26 iPad 检查发现）。
import assert from "node:assert/strict";
import test from "node:test";

import { doorsText } from "../../app/(app)/app/orbit-2026/host/HostKiosk";
import { hostTranslator } from "../../app/(app)/app/orbit-2026/host/host-model";

test("doors countdown uses days, then hours, then minutes", () => {
  const t = hostTranslator("ja");
  const now = new Date("2026-11-26T03:00:00.000Z");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
  assert.equal(doorsText(at(23345), now, t), "開場まで あと 16日");
  assert.equal(doorsText(at(180), now, t), "開場まで あと 3時間");
  assert.equal(doorsText(at(14), now, t), "開場まで あと 14分");
  assert.equal(doorsText(at(-5), now, t), null, "already open");
  assert.equal(doorsText(null, now, t), null);
  assert.equal(doorsText(at(23345), now, hostTranslator("zh")), "距开场还有16天");
});
