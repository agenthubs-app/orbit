import assert from "node:assert/strict";
import test from "node:test";
import { profileToSummary, profileSummaryToEditDraft, buildProfileUpdateRequest, profileBusinessCard } from "../src/view-models/profile";
import { profileDetailSchema, profileSaveReceiptSchema } from "../src/api/profile-detail-contract";
import { contactDetailEditorFrom, buildContactDetailEditRequest, confirmContactDetailEdit } from "../src/view-models/contact-detail-editor";

const selection = { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" } as const;
const updatedAt = "2026-09-14T01:00:00.000Z";
const profile = { id: "self-a", displayName: "A", headline: "", organization: "", role: "", homeMarket: "", relationshipGoal: "", targetRelationshipTypes: [], preferredFollowUpWindow: "", preferredLanguage: "zh" as const, preferredIntroChannels: [], industry: "Legacy description", ...selection, updatedAt };
const detail = { state: "success", profile, completeness: { score: 0, status: "not-started", completedFields: [], missingFields: [], nextBestField: null }, editor: { canSave: true, lastSavedAt: updatedAt, dirtyFields: [], validationMessages: [] }, nextAction: "" };

test("profile IDs survive read, draft, request and receipt while preserving legacy text", () => {
  const parsed = profileDetailSchema.safeParse(detail);
  assert.ok(parsed.success);
  const summary = profileToSummary(parsed.data);
  assert.equal(summary.secondaryIndustryId, selection.secondaryIndustryId);
  const draft = profileSummaryToEditDraft(summary);
  const request = buildProfileUpdateRequest({ ...draft, bio: "New bio" });
  assert.ok(request);
  assert.equal(request.secondaryIndustryId, selection.secondaryIndustryId);
  assert.equal(request.industry, "Legacy description");
  assert.match(profileBusinessCard(summary).metaLine, /人工智能与数据/);
  const receipt = { ...detail, profile: { ...profile, ...request } };
  assert.equal(profileSaveReceiptSchema(profile.id, request).safeParse(receipt).success, true);
  assert.equal(profileSaveReceiptSchema(profile.id, request).safeParse({ ...receipt, profile: { ...receipt.profile, secondaryIndustryId: "technology_internet.cybersecurity" } }).success, false);
  assert.equal(buildProfileUpdateRequest({ ...draft, primaryIndustryId: "finance_investment" }), null);
});

test("profile decoder rejects unknown IDs and mismatches but accepts old primary-only records", () => {
  for (const patch of [{ secondaryIndustryId: "unknown" }, { secondaryIndustryId: 1 }, { primaryIndustryId: "finance_investment" }]) {
    assert.equal(profileDetailSchema.safeParse({ ...detail, profile: { ...profile, ...patch } }).success, false);
  }
  assert.equal(profileDetailSchema.safeParse({ ...detail, profile: { ...profile, secondaryIndustryId: undefined } }).success, true);
});

test("contact draft keeps child IDs, rejects explicit mismatches, and verifies readback", () => {
  const payload = { state: "success", editableStatusOptions: ["active"], contact: {
    id: "contact-a", displayName: "A", role: "", organization: "", location: "", relationshipContext: "", nextAction: "", status: "active", tags: [],
    ...selection, source: { type: "manual", label: "" }, evidence: [], notes: [], publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "manual_note", occurredAt: "", summary: "" },
  } };
  const editor = contactDetailEditorFrom(payload, "contact-a");
  assert.ok(editor);
  assert.equal(editor.draft.secondaryIndustryId, selection.secondaryIndustryId);
  assert.equal(buildContactDetailEditRequest(editor, { ...editor.draft, primaryIndustryId: "finance_investment" }).success, false);
  const cleared = buildContactDetailEditRequest(editor, { ...editor.draft, secondaryIndustryId: null });
  assert.deepEqual(cleared, { success: true, body: { secondaryIndustryId: null } });
  assert.equal(confirmContactDetailEdit(payload, "contact-a", { secondaryIndustryId: null }), false);
  assert.equal(confirmContactDetailEdit({ ...payload, contact: { ...payload.contact, secondaryIndustryId: null } }, "contact-a", { secondaryIndustryId: null }), true);
});
