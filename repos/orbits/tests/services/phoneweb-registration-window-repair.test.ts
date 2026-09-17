import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPhonewebRegistrationWindowRepairPlan,
  type RepairSource,
} from "../../features/events/registration/phoneweb-registration-window-repair";

import { repairFixture } from "./fixtures/phoneweb-registration-window-repair-fixture";

test("preview derives all thirteen future windows without altering the input or public dates", () => {
  const before = structuredClone(repairFixture);
  const plan = buildPhonewebRegistrationWindowRepairPlan(repairFixture);
  assert.equal(plan.changes.length, 13);
  for (const change of plan.changes) {
    const event = repairFixture.events.find((row) => row.event_id === change.eventId)!;
    assert.equal(change.after.event_starts_at, event.starts_at);
    assert.equal(change.after.event_ends_at, event.ends_at);
    assert.equal(Date.parse(change.after.profile_edit_deadline_at), Date.parse(event.starts_at) - 600_000);
    assert.equal(Date.parse(change.after.registration_cutoff_at), Date.parse(event.starts_at) - 300_000);
    assert.equal(Date.parse(change.after.check_in_opens_at), Date.parse(event.starts_at) - 3_600_000);
    assert.equal(Date.parse(change.after.round_one_starts_at), Date.parse(event.starts_at) + 900_000);
    assert.equal(change.after.table_size, 6);
  }
  assert.deepEqual(repairFixture, before);
});

for (const [name, mutate] of [
  ["wrong database", (value: RepairSource) => { value.database = "orbit_main"; }],
  ["wrong workspace", (value: RepairSource) => { value.workspaceId = "workspace:other"; }],
  ["missing target", (value: RepairSource) => { value.events.pop(); }],
  ["duplicate target", (value: RepairSource) => { value.events[12] = structuredClone(value.events[0]!); }],
  ["unknown target", (value: RepairSource) => { value.events[0]!.event_id = "event_other"; }],
  ["changed catalogue date", (value: RepairSource) => { value.events[0]!.starts_at = "2026-11-17T01:00:00.000Z"; }],
  ["wrong row workspace", (value: RepairSource) => { value.events[0]!.workspace_id = "workspace:other"; }],
  ["noncanonical target", (value: RepairSource) => { value.events[0]!.registration_migration_state = "legacy"; }],
  ["admission policy override", (value: RepairSource) => { value.policies.push({ event_id: "event_01", policy_version: "1" }); }],
  ["dangling head version", (value: RepairSource) => { value.heads[0]!.configuration_version = "2"; }],
  ["invalid maximum version", (value: RepairSource) => { value.maxVersions[0]!.version = "-1"; }],
] as const) {
  test(`preview fails closed for ${name}`, () => {
    const source = structuredClone(repairFixture);
    mutate(source);
    assert.throws(() => buildPhonewebRegistrationWindowRepairPlan(source), /target|scope|catalogue|configuration|policy|version/u);
  });
}

test("preview preserves existing nonregistration settings and advances beyond historical versions", () => {
  const source = structuredClone(repairFixture);
  source.configurations[0]!.table_size = 12;
  source.configurations[0]!.recommendation_count = 7;
  source.configurations[0]!.round_one_starts_at = "2026-08-18T01:20:00.000Z";
  source.maxVersions[0]!.version = "7";
  const change = buildPhonewebRegistrationWindowRepairPlan(source).changes.find((row) => row.eventId === "event_signup_01")!;
  assert.equal(change.after.configuration_version, "8");
  assert.equal(change.after.table_size, 12);
  assert.equal(change.after.recommendation_count, 7);
  assert.equal(change.after.round_one_starts_at, "2026-10-25T01:20:00.000Z");
});

test("already aligned heads produce an empty repair rather than duplicate versions", () => {
  const source = structuredClone(repairFixture);
  const initial = buildPhonewebRegistrationWindowRepairPlan(source);
  source.configurations = initial.changes.map((change) => change.after);
  source.heads = source.configurations.map((configuration) => ({ workspace_id: source.workspaceId, event_id: configuration.event_id, configuration_version: configuration.configuration_version, revision: "1", updated_at: configuration.updated_at }));
  source.maxVersions = source.configurations.map((configuration) => ({ event_id: configuration.event_id, version: configuration.configuration_version }));
  assert.deepEqual(buildPhonewebRegistrationWindowRepairPlan(source).changes, []);
});

test("preview carries a deterministic review hash sensitive to precondition changes", () => {
  const plan = buildPhonewebRegistrationWindowRepairPlan(repairFixture);
  assert.match("planHash" in plan ? String(plan.planHash) : "", /^[a-f0-9]{64}$/u);
  assert.equal(plan.planHash, buildPhonewebRegistrationWindowRepairPlan(structuredClone(repairFixture)).planHash);
  const changed = structuredClone(repairFixture);
  changed.heads[0]!.revision = "2";
  assert.notEqual(plan.planHash, buildPhonewebRegistrationWindowRepairPlan(changed).planHash);
});
