import assert from "node:assert/strict";
import test from "node:test";
import { buildMinimalStagingSeed, STAGING_WORKSPACE } from "../../scripts/lib/minimal-staging";
import { buildRichStagingExpansion, primaryStagingActor, RICH_STAGING_LIMITS } from "../../scripts/lib/rich-staging";

const now = "2026-09-17T09:00:00.000Z";
const password = "Local-synthetic-only-password-2026";

test("rich staging adds 28 unique private contacts and 8 owned canonical events without changing the baseline", async () => {
  const baseline = await buildMinimalStagingSeed(password, now);
  const before = JSON.stringify(baseline.records);
  const plan = await buildRichStagingExpansion(baseline.records, now);
  assert.equal(JSON.stringify(baseline.records), before);
  assert.equal(plan.actorId, baseline.accounts.organizer!.id);
  const contacts = plan.records.filter(r => r.collectionName === "contacts");
  assert.equal(contacts.length, 28);
  assert.equal(new Set(contacts.map(r => r.payload.displayName)).size, 28);
  assert.ok(contacts.every(r => r.userId === plan.actorId && r.payload.organization && r.payload.role && r.payload.profileSnippet));
  assert.equal(plan.records.filter(r => r.collectionName === "connections").length, 28);
  assert.ok(plan.records.every(r => r.workspaceId === STAGING_WORKSPACE && r.userId === plan.actorId));
  assert.ok(plan.records.every(r => !/(auth|account|profile|generation|notification|chat)/i.test(r.collectionName)));
  assert.equal(plan.commands.filter(c => c.stage === "active").length, 8);
  assert.equal(plan.commands.filter(c => c.stage === "needs_follow_up").length, 8);
  assert.equal(plan.commands.filter(c => c.stage === "nurture").length, 6);
  assert.equal(plan.commands.filter(c => c.stage === "archived").length, 6);
  for (const command of plan.commands) {
    if ("nextTask" in command) {
      assert.ok(Date.parse(command.nextTask.dueAt) > Date.parse(now));
      assert.ok(command.nextTask.dueAt.endsWith("T01:00:00.000Z"));
    }
    if (command.stage === "active") assert.ok(command.activeGoal.trim());
  }
  assert.equal(plan.events.count, 8);
  assert.equal(new Set(plan.events.events.map(e => e.eventId)).size, 8);
  assert.equal(new Set(plan.events.events.map(e => e.startsAt)).size, 8);
  assert.ok(plan.events.events.every(e => e.organizerActorId === plan.actorId && e.lifecycleState === "published" && Date.parse(e.endsAt) > Date.parse(e.startsAt)));
  assert.ok(plan.events.events.every(e => e.startsAt.endsWith("T10:30:00.000Z")));
  assert.ok(plan.seedBytes < RICH_STAGING_LIMITS.seedBytes);
});

test("expansion rejects missing identity, changed contact baseline and foreign workspace", async () => {
  const baseline = await buildMinimalStagingSeed(password, now);
  assert.throws(() => primaryStagingActor(baseline.records.filter(r => r.collectionName !== "auth_users")));
  await assert.rejects(buildRichStagingExpansion(baseline.records.filter(r => r.collectionName !== "contacts"), now), /BASELINE_CHANGED/);
  await assert.rejects(buildRichStagingExpansion(baseline.records.map(r => ({...r, workspaceId: "foreign"})), now), /INPUT_INVALID/);
  await assert.rejects(buildRichStagingExpansion(baseline.records, "invalid"), /INPUT_INVALID/);
});
