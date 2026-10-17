import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { personalScheduleDraftOverlap } from "../src/screens/calendar/personal-schedule-overlap";
import type { PersonalScheduleDraft } from "../src/view-models/personal-schedule-editor";

const actorId = "actor-1", zone = "Asia/Tokyo";
const now = Date.parse("2026-10-01T00:00:00.000Z");
const draft: PersonalScheduleDraft = { title: "Dinner", startDate: "2026-10-07", startTime: "19:00", endDate: "2026-10-07", endTime: "20:30", location: "" };
const row = (id: string, startsAt: string, endsAt: string, extra: Record<string, unknown> = {}) => ({ payload: { id, sourceId: id, accountId: actorId, ownerUserId: actorId, kind: "personal", category: "personal", state: "upcoming", title: id, startsAt, endsAt, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...extra }, deletedAt: null });

test("pre-save warning names a known personal overlap, not an adjacent item", () => {
  const records = [row("overlap", "2026-10-07T10:30:00.000Z", "2026-10-07T11:30:00.000Z"), row("adjacent", "2026-10-07T11:30:00.000Z", "2026-10-07T12:00:00.000Z")];
  const result = personalScheduleDraftOverlap({ actorId, baseline: null, draft, now, records, zone });
  assert.deepEqual(result, { kind: "known_overlap", itemId: "overlap", title: "overlap" });
});

test("daily series expands before checking and honors a cancelled occurrence", () => {
  const recurring = row("daily", "2026-10-06T10:00:00.000Z", "2026-10-06T11:00:00.000Z", { timeZone: zone, recurrence: { frequency: "daily", until: "2026-10-08" }, occurrenceExceptions: [{ occurrenceDate: "2026-10-07", cancelled: true, patch: {} }] });
  assert.deepEqual(personalScheduleDraftOverlap({ actorId, baseline: null, draft, now, records: [recurring], zone }), { kind: "none_seen" });
  const active = { ...recurring, payload: { ...recurring.payload, occurrenceExceptions: [] } };
  assert.deepEqual(personalScheduleDraftOverlap({ actorId, baseline: null, draft, now, records: [active], zone }), { kind: "known_overlap", itemId: "daily:occurrence:2026-10-07", title: "daily" });
});

test("corrupt or foreign mirror data is unavailable, never asserted clear", () => {
  const foreign = row("foreign", "2026-10-07T10:00:00.000Z", "2026-10-07T11:00:00.000Z", { accountId: "actor-2" });
  assert.deepEqual(personalScheduleDraftOverlap({ actorId, baseline: null, draft, now, records: [foreign], zone }), { kind: "unavailable" });
  assert.deepEqual(personalScheduleDraftOverlap({ actorId, baseline: null, draft: { ...draft, endTime: "" }, now, records: [], zone }), { kind: "none_seen" });
});

test("editor warns from the device mirror and change-time opens the existing picker", () => {
  // Native hook/picker wiring cannot be clicked by the static RN-web renderer.
  const screen = readFileSync(join(process.cwd(), "src/screens/schedule/PersonalScheduleScreen.tsx"), "utf8");
  const block = readFileSync(join(process.cwd(), "src/screens/schedule/PersonalScheduleTimeBlock.tsx"), "utf8");
  assert.match(screen, /personalScheduleDraftOverlap\(/u);
  assert.match(screen, /calendar\.view\.overlap/u);
  assert.match(screen, /setTimePickerRequest/u);
  assert.match(block, /initialExpanded\s*\?\s*"startTime"/u);
});
