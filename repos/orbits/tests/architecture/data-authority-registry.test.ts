import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DATA_AUTHORITY_REGISTRY,
  renderDataAuthorityRegistryMarkdown,
  validateDataAuthorityRegistry,
} from "../../features/data-authority/registry";

const expectedDomains = [
  "ai_provider_context",
  "notes",
  "push_devices",
  "relationship_followups",
  "schedule",
  "tasks",
] as const;

const expectedSyncPolicies = {
  ai_provider_context: ["server_only", "excluded"],
  notes: ["durable_mirror", "available_when_synced"],
  push_devices: ["device_only", "excluded"],
  relationship_followups: ["durable_mirror", "available_when_synced"],
  schedule: ["durable_mirror", "available_when_synced"],
  tasks: ["durable_mirror", "available_when_synced"],
} as const;

test("data authority registry covers Sprint 0029 domains with one canonical source", () => {
  assert.deepEqual(
    DATA_AUTHORITY_REGISTRY.map((entry) => entry.domain).sort(),
    [...expectedDomains].sort(),
  );
  assert.deepEqual(validateDataAuthorityRegistry(DATA_AUTHORITY_REGISTRY), []);

  for (const entry of DATA_AUTHORITY_REGISTRY) {
    assert.ok(entry.canonicalStore.trim());
    assert.ok(entry.ownerKey.trim());
    assert.ok(entry.apiContract.trim());
    assert.ok(entry.aiPolicy.trim());
    assert.deepEqual(
      [entry.localPersistenceClass, entry.aiVisibility],
      expectedSyncPolicies[entry.domain as keyof typeof expectedSyncPolicies],
    );
    assert.ok(entry.migration.status);
    assert.equal(entry.projections.every((projection) => projection.source === entry.canonicalStore), true);
  }
});

test("registry validation rejects duplicate domains and source-free projections", () => {
  const first = DATA_AUTHORITY_REGISTRY[0];
  const invalid = [
    first,
    { ...first },
    {
      ...DATA_AUTHORITY_REGISTRY[1],
      ownerKey: "",
      projections: [{ name: "legacy", source: "" }],
    },
  ];

  assert.deepEqual(validateDataAuthorityRegistry(invalid), [
    `duplicate domain: ${first.domain}`,
    `owner key is required: ${DATA_AUTHORITY_REGISTRY[1].domain}`,
    `projection source is required: ${DATA_AUTHORITY_REGISTRY[1].domain}/legacy`,
  ]);
});

test("the checked-in document is generated from the registry", async () => {
  const document = await readFile(
    new URL("../../docs/architecture/data-authority-registry.md", import.meta.url),
    "utf8",
  );
  assert.equal(document, renderDataAuthorityRegistryMarkdown(DATA_AUTHORITY_REGISTRY));
});
