/**
 * W0060（SC-W0060-02，W60-1）：详情 VM 标出「回退值」字段——publicProfile 为空、connection 有 valueTypes／
 * suggestedActions／sharedTopics 时，对外输出照旧（其他消费者不变），但带 `fallbackFields`；
 * 资料里有值时不带回退标记，有来源 via（card_inference）时原样下发到弹窗 VM（`fieldSources`）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contactDetailPayloadFromGraph } from "../../features/contacts/live-detail-service";
import type { ConnectionDTO, ContactDTO } from "../../shared/domain/contracts";

const AT = "2026-09-25T00:00:00.000Z";
const base = { id: "own", displayName: "Mine", stage: "active", source: { type: "manual", id: "fixture" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT };
const connection = {
  accountId: "a", contactId: "own", createdAt: AT, evidenceIds: ["e"], id: "conn", lifecycleInitialization: "ready", sharedTopics: ["community"],
  source: { id: "fixture", type: "manual" }, stage: "active", suggestedActions: ["Send a follow-up note"], summary: "", updatedAt: AT, valueTypes: ["investment"], version: 1,
} as unknown as ConnectionDTO;

const read = (contact: object) => contactDetailPayloadFromGraph({
  collectedAt: AT, connections: [connection], contact: contact as ContactDTO, evidence: [], persistedState: null, provider: { source: "s", sourceLabel: "S" },
})!.contact!.publicProfile;

test("empty profile + relationship values → the output keeps the fallback values but marks all three fields as fallbacks", () => {
  const profile = read(base);
  assert.ok(profile.offering.length > 0 && profile.seeking.length > 0 && profile.topics.length > 0, "other consumers still get the fallback values");
  assert.deepEqual(profile.fallbackFields, ["offering", "seeking", "topics"]);
  assert.equal(profile.fieldSources, undefined);
});

test("real profile values are not fallbacks; card_inference provenance is passed on", () => {
  const profile = read({
    ...base,
    enrichment: { fields: { offering: { origin: "ai", via: "card_inference" } }, version: 1 },
    publicProfile: { offering: ["被投公司资源"], seeking: [], topics: ["制造业数字化"] },
  });
  assert.deepEqual(profile.offering, ["被投公司资源"]);
  assert.deepEqual(profile.fallbackFields, ["seeking"]);
  assert.deepEqual(profile.fieldSources, { offering: "card_inference" });
});

test("the detail page VM passes fieldSources and fallbackFields through to the modal's publicProfile", async () => {
  const { loadAppContactDetailRoute } = await import("../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service");
  const { contactDetailPageViewModel } = await import("../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-page-view-model");
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  route.contact.publicProfile = { ...route.contact.publicProfile, fallbackFields: ["seeking"], fieldSources: { offering: "card_inference" } };
  const profile = contactDetailPageViewModel(route, "zh").connections[0]!.encounters[0]!.context.publicProfile;
  assert.deepEqual(profile.fieldSources, { offering: "card_inference" });
  assert.deepEqual(profile.fallbackFields, ["seeking"]);
  const plain = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (plain.routeState !== "success") throw new Error("Missing fixture");
  const untouched = contactDetailPageViewModel(plain, "zh").connections[0]!.encounters[0]!.context.publicProfile;
  assert.equal("fallbackFields" in untouched, false);
});
