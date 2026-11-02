import assert from "node:assert/strict";
import test from "node:test";
import { OFFLINE_POLICY_REGISTRATIONS } from "../src/api/schema/offline-policy";
import { OfflineDataPolicyRegistry } from "../src/data/offline/policy-registry";
import { isOfflineEligible } from "../src/data/sync/mutation-adapters";

// Sprint 0144 (user decision 2026-11-02): one table says which writes may wait offline, and it matches the App.
const facts = { actorPrivate: true, confirmed: true, connectionActive: true };
const registry = new OfflineDataPolicyRegistry(OFFLINE_POLICY_REGISTRATIONS);
const writePolicy = (method: string, pathname: string, action: string) => registry.resolve(method, pathname, action).mutationPolicy;

test("SC-0144-01: follow-up complete/defer, iOrbit history organize/delete and contact delete are registered offline", () => {
  assert.equal(writePolicy("PATCH", "/api/tasks/followup-1", "relationship_followup.complete"), "offline_queue");
  assert.equal(writePolicy("PATCH", "/api/tasks/followup-1", "relationship_followup.update"), "offline_queue");
  for (const [method, action] of [["PATCH", "reopen"], ["PATCH", "cancel"], ["DELETE", "delete"]] as const) {
    assert.equal(writePolicy(method, "/api/tasks/followup-1", `relationship_followup.${action}`), "online_only", action);
  }
  assert.equal(writePolicy("PATCH", "/api/ai/conversations/sessions/s1", "update"), "offline_queue");
  assert.equal(writePolicy("DELETE", "/api/ai/conversations/sessions/s1", "delete"), "offline_queue");
  assert.equal(writePolicy("DELETE", "/api/contacts/contact-1", "delete"), "offline_queue");
  assert.equal(registry.resolve("DELETE", "/api/contacts/contact-1", "delete").domainId, "contact");
  assert.equal(registry.resolve("PATCH", "/api/ai/conversations/sessions/s1", "update").domainId, "ai_session");
});

test("SC-0144-01: the device check reads the same table", () => {
  for (const [kind, operation] of [["relationship_followup", "complete"], ["relationship_followup", "update"],
    ["ai_session", "update"], ["ai_session", "delete"], ["contact", "delete"]] as const) {
    assert.equal(isOfflineEligible(kind, operation, facts), true, `${kind}.${operation}`);
    assert.equal(isOfflineEligible(kind, operation, { ...facts, connectionActive: false }), false, `${kind}.${operation} inactive`);
  }
  for (const [kind, operation] of [["relationship_followup", "reopen"], ["relationship_followup", "cancel"], ["relationship_followup", "delete"],
    ["contact", "update"], ["contact", "create"], ["ai_session", "create"], ["ai_session_message", "update"], ["ai_session", "read"]] as const) {
    assert.equal(isOfflineEligible(kind, operation, facts), false, `${kind}.${operation}`);
  }
  // Every write the table queues offline is eligible on the device, and nothing else is.
  for (const entry of OFFLINE_POLICY_REGISTRATIONS) {
    const prefix = `${entry.policy.domainId}.`;
    const operation = entry.action.startsWith(prefix) ? entry.action.slice(prefix.length) : entry.action;
    assert.equal(isOfflineEligible(entry.policy.domainId, operation, facts), entry.policy.mutationPolicy === "offline_queue",
      `${entry.method} ${entry.pathname} ${entry.action}`);
  }
});

test("SC-0144-02: message send is no longer an offline write", () => {
  assert.equal(writePolicy("POST", "/api/relationship-communication/conversations/c1/messages", "send"), "online_only");
  assert.equal(isOfflineEligible("relationship_message", "send", facts), false);
});
