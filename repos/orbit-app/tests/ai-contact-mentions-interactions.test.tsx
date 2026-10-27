import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeAiTemplatePrefill,
  contactFollowupTemplate,
  registerAiTemplatePrefill,
} from "../src/data/ai-template-prefill";

test("follow-up draft prefill leaves out empty parts instead of sending \"原因：。\"", () => {
  const base = { channel: "email" as const, contactId: "contact:lin", contactName: "林玫" };
  const partial = contactFollowupTemplate({ ...base, organization: "Acme", rationale: "  ", recommendedAction: "约一次会面。" });
  assert.equal(partial.message, "请为 @林玫 起草一段邮件。公司：Acme。建议下一步：约一次会面。只生成可编辑草稿，不要发送。");
  assert.equal(partial.template.id, "contact.followup_email_draft");
  assert.deepEqual(partial.references, [{ id: "contact:lin", type: "contact" }]);
  assert.equal(
    contactFollowupTemplate({ ...base, organization: "", rationale: "", recommendedAction: "" }).message,
    "请为 @林玫 起草一段邮件。只生成可编辑草稿，不要发送。",
  );
  assert.equal(
    contactFollowupTemplate({ ...base, channel: "chat", organization: "Acme", rationale: "展会认识", recommendedAction: "约会面" }).message,
    "请为 @林玫 起草一段联系消息。公司：Acme。建议下一步：约会面。原因：展会认识。只生成可编辑草稿，不要发送。",
  );
});

test("template prefill is one-use, identity scoped and never carries private text in its route id", () => {
  const intentId = registerAiTemplatePrefill({
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    entryPointId: "contact.message_draft",
    message: "请为 @林悦 起草一封联系邮件。",
    references: [{ id: "contact:lin:design", type: "contact" }],
    template: { id: "contact.message_draft", version: 1 },
  });
  assert.doesNotMatch(intentId, /林悦|联系邮件/u);
  assert.equal(consumeAiTemplatePrefill({ id: intentId, actorId: "actor:other", baseUrl: "https://orbit.test" }), null);
  assert.equal(consumeAiTemplatePrefill({ id: intentId, actorId: "actor:one", baseUrl: "https://orbit.test" }), null);

  const validId = registerAiTemplatePrefill({
    actorId: "actor:one",
    baseUrl: "https://orbit.test",
    entryPointId: "inbox.polish_draft",
    message: "请润色这段草稿：\n周四可以见面。",
    references: [{ id: "contact:lin:commerce", type: "contact" }],
    template: { id: "inbox.polish_draft", version: 1 },
  });
  const consumed = consumeAiTemplatePrefill({ id: validId, actorId: "actor:one", baseUrl: "https://orbit.test" });
  assert.equal(consumed?.message, "请润色这段草稿：\n周四可以见面。");
  assert.deepEqual(consumed?.references, [{ id: "contact:lin:commerce", type: "contact" }]);
  assert.equal(consumed?.origin.entryPointId, "inbox.polish_draft");
  assert.equal(consumeAiTemplatePrefill({ id: validId, actorId: "actor:one", baseUrl: "https://orbit.test" }), null);
});

// Search, paging and same-name selection are exercised through the real picker
// and HTTP boundary in ink-signal-ai-conversation.test.ts, not a local array scan.
