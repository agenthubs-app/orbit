import assert from "node:assert/strict";
import test from "node:test";

import { orbitScheduleItemFromLiveRecord } from "../../features/events/orbit-schedule-reader";
import type { LiveRecord } from "../../shared/storage/live-record-store";

function record(payload: Record<string, unknown>): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: "orbitScheduleItems",
    createdAt: "2026-08-29T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active",
    payload,
    recordId: String(payload.id),
    sourceId: "seed",
    sourceType: "manual",
    updatedAt: "2026-08-29T00:00:00.000Z",
    userId: "actor:a",
    workspaceId: "workspace:test",
  };
}

test("schedule reader preserves personal and meeting kinds from canonical records", () => {
  const personal = orbitScheduleItemFromLiveRecord(record({
    accountId: "actor:a",
    category: "personal",
    endsAt: "2026-08-29T09:30:00.000Z",
    eventId: "schedule:review",
    id: "schedule:review",
    kind: "personal",
    location: "Orbit 办公室",
    sourceId: "schedule:review",
    startsAt: "2026-08-29T08:30:00.000Z",
    title: "本周经营复盘与下周优先级",
  }), "actor:a");

  assert.deepEqual(personal, {
    category: "personal",
    endsAt: "2026-08-29T09:30:00.000Z",
    eventId: "schedule:review",
    evidenceIds: [],
    id: "schedule:review",
    kind: "personal",
    location: "Orbit 办公室",
    sourceId: "schedule:review",
    startsAt: "2026-08-29T08:30:00.000Z",
    title: "本周经营复盘与下周优先级",
  });
});

test("legacy event schedule records retain event defaults", () => {
  const event = orbitScheduleItemFromLiveRecord(record({
    accountId: "actor:a",
    eventId: "event:kansai",
    id: "schedule:kansai",
    startsAt: "2026-09-05T04:30:00.000Z",
    title: "关西企业 AI 实践交流会",
  }), "actor:a");

  assert.equal(event?.kind, "event");
  assert.equal(event?.category, "event");
  assert.equal(event?.sourceId, "event:kansai");
});

test("schedule reader rejects records owned by another actor", () => {
  assert.equal(orbitScheduleItemFromLiveRecord(record({
    accountId: "actor:a",
    eventId: "event:kansai",
    id: "schedule:kansai",
    startsAt: "2026-09-05T04:30:00.000Z",
    title: "关西企业 AI 实践交流会",
  }), "actor:b"), null);
});
