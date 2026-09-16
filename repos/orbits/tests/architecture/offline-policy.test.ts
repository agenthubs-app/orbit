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
  ["DELETE", "/api/notes/:id", "delete", "note", "durable_normalized", "offline_queue", "metadata_only"],
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
  ["GET", "/api/relationship-communication/conversations/:id/messages", "read", "message", "durable_normalized", "online_only", "metadata_only"],
  ["GET", "/api/events/public", "read", "public_event", "encrypted_ttl_snapshot", "online_only", "on_demand_encrypted"],
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
      domainId: "message",
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
