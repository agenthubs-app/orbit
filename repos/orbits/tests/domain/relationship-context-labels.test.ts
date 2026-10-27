import assert from "node:assert/strict";
import test from "node:test";

import {
  localizeRelationshipContext,
  localizeRelationshipContextFields,
  relationshipContextLanguage,
} from "../../shared/compute/relationship-context-labels";

const built = "Event: Tokyo SaaS Night. Looking for: investors; partners. Can offer: design help. Works at Acme.";

test("QA-C4: English context labels read in the reader's language; values and free text stay", () => {
  assert.equal(localizeRelationshipContext(built, "zh"), "活动：Tokyo SaaS Night。想找：investors、partners。能提供：design help。 Works at Acme.");
  assert.equal(localizeRelationshipContext(built, "ja"), "イベント：Tokyo SaaS Night。探しているもの：investors、partners。提供できるもの：design help。 Works at Acme.");
  assert.equal(localizeRelationshipContext(built, "en"), built);
  assert.equal(localizeRelationshipContext("Event: A.B Summit. Can offer: x.", "zh"), "活动：A.B Summit。能提供：x。");
  assert.equal(localizeRelationshipContext("已在活动中交换名片。", "ja"), "已在活动中交换名片。");
});

test("QA-C4: only relationshipContext fields in a response change", () => {
  const body = { items: [{ relationshipContext: "Looking for: CTO.", note: "Looking for: CTO." }], total: 1 };
  assert.deepEqual(localizeRelationshipContextFields(body, "zh"), { items: [{ relationshipContext: "想找：CTO。", note: "Looking for: CTO." }], total: 1 });
  assert.equal(localizeRelationshipContextFields(body, null), body);
});

test("QA-C4: the language comes from x-orbit-lang, else the orbit-lang cookie", () => {
  assert.equal(relationshipContextLanguage(new Request("https://x.test", { headers: { "x-orbit-lang": "ja", cookie: "orbit-lang=zh" } })), "ja");
  assert.equal(relationshipContextLanguage(new Request("https://x.test", { headers: { cookie: "a=1; orbit-lang=zh" } })), "zh");
  assert.equal(relationshipContextLanguage(new Request("https://x.test")), null);
});
