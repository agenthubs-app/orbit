import assert from "node:assert/strict";
import test from "node:test";
import { contactsToSummaries, contactDetailToSummary, contactDimensionFilterOptions, filterContactListPayloadByDimensions } from "../src/view-models/contacts";
import { contactDetailReadSchema, contactDetailEditorFrom } from "../src/view-models/contact-detail-editor";

export const pendingDetail = () => ({ state: "success", editableStatusOptions: ["active", "needs_follow_up", "nurture", "archived"], contact: {
  id: "pending", displayName: "QA", role: "", organization: "", location: "", relationshipContext: "认识于活动", nextAction: "Legacy generated action",
  status: "active", lifecycleInitialization: "pending", source: { type: "event_import", label: "QA event" }, tags: [], evidence: [], notes: [],
  publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "event_note", occurredAt: "2026-09-17T00:00:00Z", summary: "" }
} });

test("explicit pending renders its own label in all languages, with no invented goal or canonical actions", () => {
  for (const [language, label] of [["zh", "待设置关系"], ["en", "Pending initialization"], ["ja", "関係設定待ち"]] as const) {
    const raw = pendingDetail();
    const summary = contactsToSummaries({ contacts: [raw.contact] }, language)[0];
    assert.ok(summary);
    assert.equal(summary.status, label);
    assert.equal(summary.nextAction, "");
    const detail = contactDetailToSummary(raw, language);
    assert.equal(detail.status, label);
    assert.equal(detail.archiveAction, null);
    assert.equal(detail.statusAction, null);
    assert.equal(detail.nextAction, "");
  }
});

test("pending remains in all contacts but outside canonical progress/action buckets", () => {
  const data = { contacts: [pendingDetail().contact, { id: "ordinary", status: "active" }, { id: "archived", status: "archived" }],
    availableFilters: { statuses: [{ value: "active", count: 1 }, { value: "archived", count: 1 }, { value: "needs_follow_up", count: 0 }, { value: "nurture", count: 0 }] } };
  assert.equal(contactsToSummaries(filterContactListPayloadByDimensions(data, {})).length, 3);
  for (const relationshipProgress of ["active", "nurture", "archived"] as const) {
    assert.ok(contactsToSummaries(filterContactListPayloadByDimensions(data, { relationshipProgress })).every(contact => contact.id !== "pending"));
  }
  const followup = { contacts: [{ ...pendingDetail().contact, status: "needs_follow_up" }] };
  assert.equal(contactsToSummaries(filterContactListPayloadByDimensions(followup, { actionState: "needs_follow_up" })).length, 0);
  const options = contactDimensionFilterOptions(data);
  assert.equal(options.relationshipProgress[0]?.count, 3);
  assert.equal(options.relationshipProgress.find(option => option.value === "active")?.count, 1);
});

test("pending captured shell validates for display but cannot open legacy stage editor", () => {
  for (const status of ["captured", "active", "needs_follow_up"]) {
    const data = pendingDetail(); data.contact.status = status;
    assert.equal(contactDetailReadSchema.safeParse(data).success, true);
    assert.equal(contactDetailEditorFrom(data, "pending"), null);
  }
});

test("ordinary legacy contacts and ready contacts retain their prior semantics", () => {
  const data = pendingDetail();
  Reflect.deleteProperty(data.contact, "lifecycleInitialization");
  assert.equal(contactDetailToSummary(data).status, "推进中");
  assert.ok(contactDetailEditorFrom(data, "pending"));
  data.contact.lifecycleInitialization = "ready";
  assert.equal(contactDetailToSummary(data).status, "推进中");
  data.contact.status = "captured";
  assert.equal(contactDetailReadSchema.safeParse(data).success, false);
});
