import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { myEventsResponseSchema } from "../../shared/api-schema/events-mine";
import { DESIGN_FIXTURE_NOW, EVENT_DESIGN_FIXTURES } from "../../features/events/design-fixtures";
import { createMyEventsService } from "../../features/events/mine/service";

// R26 设计稿示例 fixture（HOW-TO 第 8 节）：只补数据——每条都过契约 8 / events-mine 的同一 schema；开发接口是 .dev.ts（生产不收录）。
test("every events design fixture is plain contract data", async () => {
  for (const [name, fixture] of Object.entries(EVENT_DESIGN_FIXTURES)) {
    const data = fixture(new Date(DESIGN_FIXTURE_NOW));
    for (const item of data.assessments) assert.ok(eventAssessmentSchema.safeParse(item).success, `${name}: ${item.id}`);
    const mine = await createMyEventsService({ now: () => new Date(DESIGN_FIXTURE_NOW), reader: { rows: async () => data.mine } }).list("actor:fixture", { limit: 20, platform: "web", range: "upcoming" });
    assert.ok(myEventsResponseSchema.safeParse(mine).success, name);
  }
  assert.equal(existsSync("app/api/dev/event-design-fixture/route.dev.ts"), true);
  assert.equal(existsSync("app/api/dev/event-design-fixture/route.ts"), false, "never a production route");
});
