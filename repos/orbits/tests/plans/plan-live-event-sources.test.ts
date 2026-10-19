import assert from "node:assert/strict";
import test from "node:test";
import { createLivePlanEventSources } from "../../features/events/assessment/plan-sources";
import type { ConfiguredEventAssessmentRuntime } from "../../features/events/assessment/configured";

const window = { from: "2026-10-18T00:00:00.000Z", until: "2026-12-17T00:00:00.000Z", limit: 20 };

test("strict plan event source propagates a failed external read", async () => {
  let migrationsRequested = 0;
  const queries: string[] = [];
  const runtime = {
    workspaceId: "w",
    repository: { listAddedExternal: async () => { migrationsRequested++; throw Error("MIGRATION_REQUESTED"); } },
    client: { query: async (sql: string) => { queries.push(sql); throw Error("EVENT_EXTERNAL_FAILED"); } },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.myExternal(window), /EVENT_EXTERNAL_FAILED/);
  assert.equal(migrationsRequested, 0);
  assert.equal(queries.length, 1);
  assert.match(queries[0] ?? "", /^select \*/);
});

test("strict plan event source propagates a failed my-events read", async () => {
  const runtime = {
    workspaceId: "w",
    client: { query: async () => { throw Error("MY_EVENTS_FAILED"); } },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.myEventIds(window), /MY_EVENTS_FAILED/);
});

test("strict plan event source treats a missing membership table as unavailable", async () => {
  const runtime = {
    workspaceId: "w",
    client: { query: async (sql: string) => {
      if (sql.includes("event_ops_membership_heads")) throw Object.assign(Error("MISSING_MEMBERSHIP"), { code: "42P01" });
      return { rows: [] };
    } },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.myEventIds(window), /MISSING_MEMBERSHIP/);
});

test("strict plan event source propagates a failed published-event fact read", async () => {
  const runtime = {
    workspaceId: "w",
    client: { query: async () => ({ rows: [] }) },
    orbitEvents: { planEventFact: async () => { throw Error("EVENT_FACT_FAILED"); } },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.orbitFacts([{ eventId: "e1", title: "Event", startsAt: window.from }]), /EVENT_FACT_FAILED/);
});

test("strict plan event source rejects a missing published-event fact", async () => {
  const runtime = {
    workspaceId: "w",
    client: { query: async () => ({ rows: [] }) },
    orbitEvents: { planEventFact: async () => null },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.orbitFacts([{ eventId: "e1", title: "Event", startsAt: window.from }]), /EVENT_FACT_UNAVAILABLE/);
});

test("strict plan event source does not hide a failed preference read", async () => {
  const runtime = {
    workspaceId: "w",
    client: { query: async (sql: string) => {
      if (sql.includes("eventPreferences")) throw Error("EVENT_PREF_FAILED");
      if (sql.includes("from event_assessments")) return { rows: [{ actor_id: "actor", id: "assessment-1", facts: { startsAt: window.from, title: "Night", speakers: [] }, created_at: window.from, updated_at: window.from }] };
      return { rows: [] };
    } },
  } as unknown as ConfiguredEventAssessmentRuntime;
  const sources = await createLivePlanEventSources("actor", { runtime, strict: true });
  assert.ok(sources);
  await assert.rejects(sources.myExternal(window), /EVENT_PREF_FAILED/);
});
