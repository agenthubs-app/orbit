import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFLINE_POLICY_REGISTRATIONS,
  OfflineDataPolicyRegistry,
} from "../../shared/api-schema/offline-policy";

const registry = new OfflineDataPolicyRegistry(OFFLINE_POLICY_REGISTRATIONS);

test("every declared Task 1 route and action resolves to three independent policies", () => {
  for (const registration of OFFLINE_POLICY_REGISTRATIONS) {
    const policy = registry.resolve(
      registration.method,
      registration.pathname,
      registration.action,
    );
    assert.equal(policy.domainId, registration.policy.domainId);
    assert.equal(policy.readPersistence, registration.policy.readPersistence);
    assert.equal(policy.mutationPolicy, registration.policy.mutationPolicy);
    assert.equal(policy.binaryPolicy, registration.policy.binaryPolicy);
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
