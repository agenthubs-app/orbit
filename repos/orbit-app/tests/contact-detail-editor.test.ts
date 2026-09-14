import assert from "node:assert/strict";
import test from "node:test";
import * as editor from "../src/view-models/contact-detail-editor";

const payload = () => ({ state: "success", editableStatusOptions: ["active", "needs_follow_up", "nurture", "archived"], editableTagOptions: [], contact: {
  id: "contact:/1", displayName: "林悦", role: "设计师", organization: "云间", location: "东京", primaryIndustryId: "professional_services", primaryEmail: "lin@example.test", relationshipContext: "活动认识", nextAction: "确认合作", status: "active", tags: ["topic:community", "私有标签"], source: { type: "manual", label: "手动记录" }, evidence: [], notes: [],
  publicProfile: { bio: "设计合作", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "email_signal", occurredAt: "2026-09-10", summary: "讨论合作方向" }
} });
function original() {
  assert.equal(typeof editor.contactDetailEditorFrom, "function", "editor must read the actual detail before constructing a draft");
  const value = editor.contactDetailEditorFrom(payload(), "contact:/1"); assert.ok(value); return value;
}

test("editor keeps opaque raw tags and makes an unchanged draft a no-op", () => {
  const value = original(); assert.deepEqual(value.draft.tags, ["topic:community", "私有标签"]);
  assert.deepEqual(editor.buildContactDetailEditRequest(value, value.draft), { success: true, body: {} });
});
test("combined changes contain only changed writable fields, never identity or unrelated interaction", () => {
  const value = original();
  assert.deepEqual(editor.buildContactDetailEditRequest(value, { ...value.draft, status: "nurture", tags: ["topic:community", " 新合作 ", "新合作"], primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }), { success: true, body: { status: "nurture", tags: ["topic:community", "新合作"], primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" } });
});
test("clearing tags and industry sends explicit clearing values", () => {
  const value = original();
  assert.deepEqual(editor.buildContactDetailEditRequest(value, { ...value.draft, tags: [], primaryIndustryId: null }), { success: true, body: { tags: [], primaryIndustryId: null } });
});
test("editing an interaction preserves its channel instead of creating a manual event", () => {
  const value = original();
  assert.deepEqual(editor.buildContactDetailEditRequest(value, { ...value.draft, lastInteraction: { ...value.draft.lastInteraction, summary: "  已确认范围  " } }), { success: true, body: { lastInteraction: { channel: "email_signal", occurredAt: "2026-09-10", summary: "已确认范围" } } });
});
test("unsupported status, industry, channel and unsupported interaction clearing are rejected", () => {
  const value = original();
  for (const draft of [{ ...value.draft, status: "fake" }, { ...value.draft, primaryIndustryId: "fake" }, { ...value.draft, lastInteraction: { ...value.draft.lastInteraction, channel: "微信" } }, { ...value.draft, lastInteraction: { ...value.draft.lastInteraction, summary: "" } }]) {
    const result = editor.buildContactDetailEditRequest(value, draft as typeof value.draft); assert.equal(result.success, false);
  }
  const limited = editor.contactDetailEditorFrom({ ...payload(), editableStatusOptions: ["active"] }, "contact:/1")!;
  assert.equal(editor.buildContactDetailEditRequest(limited, { ...limited.draft, status: "nurture" }).success, false);
});
test("editor refuses pending, mismatched, incomplete or unsupported option responses", () => {
  assert.equal(typeof editor.contactDetailEditorFrom, "function");
  for (const data of [{}, { ...payload(), state: "pending" }, { ...payload(), contact: { id: "contact:/1", displayName: "林悦" } }, { ...payload(), editableStatusOptions: ["fake"] }, { ...payload(), editableStatusOptions: undefined }]) assert.equal(editor.contactDetailEditorFrom(data, "contact:/1"), null);
  assert.equal(editor.contactDetailEditorFrom(payload(), "other"), null);
});
test("confirmation verifies every changed persisted field and the same contact", () => {
  assert.equal(typeof editor.confirmContactDetailEdit, "function");
  const body = { status: "nurture" as const, tags: [], primaryIndustryId: null, lastInteraction: { channel: "email_signal", occurredAt: "2026-09-10", summary: "确认范围" } };
  const acknowledged = { ...payload(), contact: { ...payload().contact, ...body } };
  assert.equal(editor.confirmContactDetailEdit(acknowledged, "contact:/1", body), true);
  for (const patch of [{ id: "wrong" }, { status: "active" }, { tags: ["旧标签"] }, { primaryIndustryId: "professional_services" }, { lastInteraction: payload().contact.lastInteraction }]) assert.equal(editor.confirmContactDetailEdit({ ...acknowledged, contact: { ...acknowledged.contact, ...patch } }, "contact:/1", body), false);
  assert.equal(editor.confirmContactDetailEdit({ ...acknowledged, state: "pending" }, "contact:/1", body), false);
  assert.equal(editor.confirmContactDetailEdit({}, "contact:/1", body), false);
});
