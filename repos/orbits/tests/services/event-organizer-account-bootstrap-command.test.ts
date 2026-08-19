import assert from "node:assert/strict";
import test from "node:test";

import { parseEventOrganizerAccountBootstrapCommand } from "../../scripts/bootstrap-event-organizer-accounts";

const userId = "user_mry5y200_58jpi8";
const hash = "a".repeat(64);

test("organizer bootstrap command accepts only the reviewed dry-run and apply forms", () => {
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--dry-run", "--xiaoyu-auth-user-id", userId,
  ]), { kind: "dry-run", xiaoyuAuthUserId: userId });
  assert.deepEqual(parseEventOrganizerAccountBootstrapCommand([
    "--apply", "--xiaoyu-auth-user-id", userId,
    "--expected-count", "20", "--expected-plan-hash", hash,
  ]), {
    expectedCount: 20,
    expectedPlanHash: hash,
    kind: "apply",
    xiaoyuAuthUserId: userId,
  });
});

test("organizer bootstrap command rejects mixed, duplicate, and unknown flags before database setup", () => {
  for (const args of [
    [],
    ["--dry-run", "--apply", "--xiaoyu-auth-user-id", userId],
    ["--dry-run", "--dry-run", "--xiaoyu-auth-user-id", userId],
    ["--dry-run", "--xiaoyu-auth-user-id", userId, "--unknown"],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "19", "--expected-plan-hash", hash],
    ["--apply", "--xiaoyu-auth-user-id", userId, "--expected-count", "20", "--expected-plan-hash", "A".repeat(64)],
  ]) {
    assert.throws(() => parseEventOrganizerAccountBootstrapCommand(args));
  }
});
