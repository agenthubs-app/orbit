import assert from "node:assert/strict";
import test from "node:test";

import { contactDensity, type ContactDensityFacts } from "../../shared/compute/contact-density";

// R12（DESIGN §3.4，D-10）：●○○ 只有身份；●●○ 联系方式且相遇场合；●●● 目标关系 / 往来 / 本人入力。
const none: ContactDensityFacts = { hasIdentity: false, hasContactPoint: false, hasMetContext: false, hasGoalRelation: false, hasInteraction: false, selfReported: false };
const id = { ...none, hasIdentity: true };

const cases: readonly [string, Partial<ContactDensityFacts>, 1 | 2 | 3, string[]][] = [
  ["name only", id, 1, ["identity"]],
  ["name + email, no met context", { ...id, hasContactPoint: true }, 1, ["identity", "contact_point"]],
  ["name + met context, no contact point", { ...id, hasMetContext: true }, 1, ["identity", "met_context"]],
  ["contact point and met context", { ...id, hasContactPoint: true, hasMetContext: true }, 2, ["identity", "contact_point", "met_context"]],
  ["linked to a plan goal", { ...id, hasGoalRelation: true }, 3, ["identity", "goal_relation"]],
  ["has interactions", { ...id, hasInteraction: true }, 3, ["identity", "interaction"]],
  ["self-reported via invite", { ...id, selfReported: true }, 3, ["identity", "self_reported"]],
  ["everything", { hasIdentity: true, hasContactPoint: true, hasMetContext: true, hasGoalRelation: true, hasInteraction: true, selfReported: true }, 3, ["identity", "contact_point", "met_context", "goal_relation", "interaction", "self_reported"]],
  ["nothing at all still reads as the lowest level", none, 1, []],
];

for (const [name, change, level, reasons] of cases) {
  test(`contactDensity: ${name} → ${level}`, () => {
    assert.deepEqual(contactDensity({ ...none, ...change }), { level, reasons });
  });
}
