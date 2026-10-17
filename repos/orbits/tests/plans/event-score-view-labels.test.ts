/** R24-06b：内訳「会える人の適合」副行写计划人物类型短名 + 人数，不露内部类型键。 */
import assert from "node:assert/strict";
import test from "node:test";

import { eventScoreView } from "../../features/plans/v2/overview";

const result = { items: [{ criterion: "fit" as const, estimated: true, max: 45, score: 20 }], rubricVersion: "v1", total: 20, verdict: "conditional" as const };
const fact = (attendeeSource: string) => ({ eventId: "e1", facts: { attendeeSource, expected: { cvc: 4, funded_founder: 12, unknown_key: 3 } }, startsAt: "", title: "", venue: null }) as never;

test("fit line uses the plan's short labels, never internal keys", () => {
  const labels = { cvc: "CVC", funded_founder: "起業家" };
  assert.deepEqual(eventScoreView(result, fact("speakers"), "ja", labels).scoreBreakdown[0]?.facts, ["CVC 約4名 · 起業家 約12名"]);
  assert.deepEqual(eventScoreView(result, fact("registrants"), "ja", labels).scoreBreakdown[0]?.facts, ["CVC 4名 · 起業家 12名"], "registrant tags are public → exact counts");
  assert.deepEqual(eventScoreView(result, fact("speakers"), "ja").scoreBreakdown[0]?.facts, ["推定"], "no labels → no raw keys");
});
