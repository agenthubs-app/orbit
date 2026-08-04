import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalMembershipMigrationApplyCommandError, parseCanonicalMembershipMigrationApplyCommand, parseCanonicalMembershipMigrationOperatorManifestJson } from "../../features/events/registration/canonical-migration/apply-contract";

const hash = "a".repeat(64);
test("canonical apply command is strict and redaction safe", () => {
  const result = parseCanonicalMembershipMigrationApplyCommand({ connectionString: "postgres://secret", expectedCount: 144, expectedPlanHash: hash, manifestHash: hash, migrationRunId: "run:one", workspaceId: "workspace:one" });
  assert.ok(Object.isFrozen(result));
  assert.equal(parseCanonicalMembershipMigrationApplyCommand({ ...result, expectedCount: 0 }).expectedCount, 0);
  for (const value of [null, { connectionString: "secret" }, { connectionString: "secret", expectedCount: 144, expectedPlanHash: hash, manifestHash: hash, migrationRunId: "run:one", workspaceId: "workspace:one", extra: true }]) {
    assert.throws(() => parseCanonicalMembershipMigrationApplyCommand(value), (error: unknown) => error instanceof CanonicalMembershipMigrationApplyCommandError && !error.message.includes("secret"));
  }
  assert.throws(() => parseCanonicalMembershipMigrationApplyCommand({ ...result, expectedCount: -1 }), CanonicalMembershipMigrationApplyCommandError);
});
test("raw operator manifest JSON rejects duplicate keys before JSON.parse", () => {
  assert.throws(() => parseCanonicalMembershipMigrationOperatorManifestJson('{"events":{},"events":{}}'), CanonicalMembershipMigrationApplyCommandError);
  assert.throws(() => parseCanonicalMembershipMigrationOperatorManifestJson('{"events":{"one":{"evidenceId":"a","evidenceId":"b"}}}'), CanonicalMembershipMigrationApplyCommandError);
  assert.throws(() => parseCanonicalMembershipMigrationOperatorManifestJson('{"events":{"one":1,"\\u006fne":2}}'), CanonicalMembershipMigrationApplyCommandError);
  assert.deepEqual(parseCanonicalMembershipMigrationOperatorManifestJson('{"note":"braces { [ and key-like \\"x\\": stay data","events":{"one":1,"two":2}}'), {
    events: { one: 1, two: 2 },
    note: 'braces { [ and key-like "x": stay data',
  });
});
