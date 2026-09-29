import assert from "node:assert/strict";
import test from "node:test";
import type { ContactSyncPayload } from "../src/api/contract/contact-local-directory";

test("the device groups valid contacts by the shared stage decision and server order", async () => {
  let local: typeof import("../src/view-models/contact-pipeline-local");
  try {
    local = await import("../src/view-models/contact-pipeline-local");
  } catch {
    assert.fail("contact-pipeline-local must project the synchronized contact mirror");
  }

  const row = (input: Partial<ContactSyncPayload> & Pick<ContactSyncPayload, "id">): ContactSyncPayload => ({
    id: input.id,
    card: input.card === undefined ? {
      id: input.id, displayName: input.id, organization: "Orbit", role: "Partner", sourceType: "manual",
      status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z",
    } : input.card,
    tags: [],
    search: input.search ?? { text: "", occurredAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z", error: null },
    detail: null,
  });

  const result = local.contactPipelineLocalProjection([
    row({ id: "z-active", card: { id: "z-active", displayName: "Zed", organization: "Orbit", role: "Partner", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z" } }),
    row({ id: "a-follow-up", card: { id: "a-follow-up", displayName: "Ada", organization: "Orbit", role: "Partner", sourceType: "manual", status: "needs_follow_up", pendingInitialization: false, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z" } }),
    row({ id: "pending", card: { id: "pending", displayName: "Pending", organization: "Orbit", role: "Partner", sourceType: "manual", status: "active", pendingInitialization: true, nextActionPreview: "", updatedAt: "2026-09-26T00:00:00.000Z" } }),
    row({ id: "invalid", card: null }),
    row({ id: "refused", search: { text: "", occurredAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z", error: "CONTACT_PIPELINE_RECORD_INVALID" } }),
  ]);

  assert.deepEqual(result.counts, { to_contact: 1, in_progress: 1, nurture: 0, archived: 0 });
  assert.deepEqual(result.items.to_contact.map(item => item.id), ["a-follow-up"]);
  assert.deepEqual(result.items.in_progress.map(item => item.id), ["z-active"]);
});
