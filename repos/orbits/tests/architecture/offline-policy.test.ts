import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFLINE_POLICY_REGISTRATIONS,
  OfflineDataPolicyRegistry,
} from "../../shared/api-schema/offline-policy";

const registry = new OfflineDataPolicyRegistry(OFFLINE_POLICY_REGISTRATIONS);

const APPROVED_POLICY_MATRIX = [
  ["GET", "/api/notes", "read", "note", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/notes/:id", "read", "note", "durable_normalized", "online_only", "metadata_only"],
  ["POST", "/api/notes", "create", "note", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/notes/:id", "update", "note", "durable_normalized", "offline_queue", "metadata_only"],
  ["GET", "/api/tasks", "read", "task", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/tasks/:id", "read", "task", "durable_normalized", "online_only", "metadata_only"],
  ["POST", "/api/tasks", "create", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "update", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "complete", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "reopen", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "cancel", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["DELETE", "/api/tasks/:id", "delete", "task", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "relationship_followup.update", "relationship_followup", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "relationship_followup.complete", "relationship_followup", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "relationship_followup.reopen", "relationship_followup", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/tasks/:id", "relationship_followup.cancel", "relationship_followup", "durable_normalized", "offline_queue", "metadata_only"],
  ["DELETE", "/api/tasks/:id", "relationship_followup.delete", "relationship_followup", "durable_normalized", "offline_queue", "metadata_only"],
  ["GET", "/api/schedule-items", "read", "personal_schedule", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/schedule-items/:id", "read", "personal_schedule", "durable_normalized", "online_only", "metadata_only"],
  ["POST", "/api/schedule-items", "create", "personal_schedule", "durable_normalized", "offline_queue", "metadata_only"],
  ["PATCH", "/api/schedule-items/:id", "update", "personal_schedule", "durable_normalized", "offline_queue", "metadata_only"],
  ["DELETE", "/api/schedule-items/:id", "delete", "personal_schedule", "durable_normalized", "offline_queue", "metadata_only"],
  // Sprint 0119: relationship messages read the device copy first.
  ["GET", "/api/relationship-communication/conversations/:id/messages", "read", "relationship_message", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/relationship-communication/conversation-summaries", "read", "relationship_conversation", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/relationship-communication/unread-summary", "read", "relationship_conversation", "durable_normalized", "online_only", "metadata_only"],
  // Sprint 0135: message send is queued offline (message plan M4).
  ["POST", "/api/relationship-communication/conversations/:id/messages", "send", "relationship_message", "durable_normalized", "offline_queue", "metadata_only"],
  ["GET", "/api/events/public", "read", "public_event", "encrypted_ttl_snapshot", "online_only", "on_demand_encrypted"],
  // Sprint 0115: the registered attendee's event day is read from the device mirror; every write needs the network.
  ["GET", "/api/events/public/:id", "read", "registered_event", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/events/:id/registration", "read", "event_registration", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/events/:id/operations", "read", "event_published_result", "durable_normalized", "online_only", "metadata_only"],
  // Sprint 0116: the account's contacts read the device copy first (sync domain contacts).
  ["GET", "/api/contacts/page", "read", "contact", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/contacts/summary", "read", "contact", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/contacts/:id", "read", "contact", "durable_normalized", "online_only", "metadata_only"],
  // Sprint 0117: the dashboard and contacts analysis are computed on the device (sync domain dashboard-graph).
  ["GET", "/api/dashboard", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/dashboard/summary", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/dashboard/opportunities", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/dashboard/network-gaps", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/dashboard/distributions", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/mobile/contacts-dashboard", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/dashboard/structure/:dimension/:bucketId", "read", "dashboard_graph", "durable_normalized", "online_only", "metadata_only"],
  // Sprint 0118: the typed inbox and the AI sessions read the device copy first.
  ["GET", "/api/inbox/notifications", "read", "inbox_notification", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/inbox/notifications/:id", "read", "inbox_notification", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/ai/conversations/sessions", "read", "ai_session", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/ai/conversations/sessions/:id", "read", "ai_session_message", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/profile", "read", "self_profile", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/agent/actions", "read", "agent_actions", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/agent/ledger", "read", "agent_ledger", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/relationship-tasks/page", "read", "relationship_tasks", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/task-suggestions/page", "read", "task_suggestions", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/today", "read", "today", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/connections/:id/lifecycle", "read", "relationship_lifecycle", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/schedule-items/:id/meeting-details", "read", "meeting_details", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/appointments/:id", "read", "meeting_details", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/audit/provenance", "read", "provenance_audit", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["GET", "/api/recommendations/events", "read", "event_recommendations", "encrypted_ttl_snapshot", "online_only", "metadata_only"],
  ["POST", "/api/auth/mobile/credentials", "authenticate", "account_secret", "online_only_secret", "online_only", "never_local"],
] as const;

test("Task 1 policy registrations exactly match the independently approved matrix", () => {
  assert.deepEqual(
    OFFLINE_POLICY_REGISTRATIONS.map((registration) => [
      registration.method,
      registration.pathname,
      registration.action,
      registration.policy.domainId,
      registration.policy.readPersistence,
      registration.policy.mutationPolicy,
      registration.policy.binaryPolicy,
    ]),
    APPROVED_POLICY_MATRIX,
  );
  assert.equal(OFFLINE_POLICY_REGISTRATIONS.every((entry) =>
    entry.policy.schemaVersion === 1 && entry.policy.registryVersion === 1), true);

  for (const [method, pathname, action, domainId, readPersistence, mutationPolicy, binaryPolicy] of APPROVED_POLICY_MATRIX) {
    const policy = registry.resolve(
      method,
      pathname,
      action,
    );
    assert.equal(policy.domainId, domainId);
    assert.equal(policy.readPersistence, readPersistence);
    assert.equal(policy.mutationPolicy, mutationPolicy);
    assert.equal(policy.binaryPolicy, binaryPolicy);
  }
});

test("read persistence never implies offline mutation permission", () => {
  assert.deepEqual(
    registry.resolve(
      "GET",
      "/api/relationship-communication/conversations/conversation-1/messages",
      "read",
    ),
    {
      domainId: "relationship_message",
      schemaVersion: 1,
      registryVersion: 1,
      readPersistence: "durable_normalized",
      mutationPolicy: "online_only",
      binaryPolicy: "metadata_only",
    },
  );
  assert.equal(
    registry.resolve("GET", "/api/events/public", "read").mutationPolicy,
    "online_only",
  );
  assert.equal(
    registry.resolve("POST", "/api/auth/mobile/credentials", "authenticate")
      .readPersistence,
    "online_only_secret",
  );
  assert.throws(() => registry.resolve("DELETE", "/api/notes/note-1", "delete"), /policy-not-registered/);
});

test("mutation policy is exact by method, path template and action", () => {
  assert.equal(
    registry.resolve("POST", "/api/notes", "create").mutationPolicy,
    "offline_queue",
  );
  assert.equal(
    registry.resolve("PATCH", "/api/tasks/task-1", "complete").mutationPolicy,
    "offline_queue",
  );
  assert.equal(
    registry.resolve(
      "PATCH",
      "/api/tasks/followup-1",
      "relationship_followup.update",
    ).domainId,
    "relationship_followup",
  );

  for (const [method, pathname, action] of [
    ["POST", "/api/messages", "create"],
    ["POST", "/api/tasks", "suggestion.accept"],
    ["POST", "/api/tasks", "relationship_followup.create"],
    ["PATCH", "/api/account/profile", "update"],
    ["DELETE", "/api/account", "delete"],
  ] as const) {
    assert.throws(
      () => registry.resolve(method, pathname, action),
      /policy-not-registered/,
    );
  }
});

test("unknown URLs, queries, methods and prefix lookalikes fail closed", () => {
  for (const [method, pathname, action] of [
    ["GET", "/api/unknown", "read"],
    ["GET", "/api/notes?unknown=true", "read"],
    ["GET", "https://evil.example/api/notes", "read"],
    ["GET", "//evil.example/api/notes", "read"],
    ["GET", "/api/notes-archive", "read"],
    ["GET", "/api/notes/one/extra", "read"],
    ["PUT", "/api/notes/one", "update"],
    ["GET", "/API/notes", "read"],
  ] as const) {
    assert.throws(
      () => registry.resolve(method, pathname, action),
      /policy-not-registered/,
    );
  }
});
