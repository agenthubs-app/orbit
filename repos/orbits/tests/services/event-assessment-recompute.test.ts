import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_EVENT_SCORE_PREFERENCES } from "../../shared/compute/event-score";
import { eventPickNotification, recomputeAssessments, type RecomputeNotice } from "../../features/events/assessment/recompute-job";
import { createMemoryEventAssessmentRepository, type AssessmentRow } from "../../features/events/assessment/repository";

// R26 assessment-recompute.test（SC-R26-16）：有界（30 天、≤limit）、只规则、名单没变不重算、变化 ≥10 / 名单首次公开写 event_pick、外部活动不重算。
const NOW = new Date("2026-10-07T03:00:00.000Z");
const context = { contacts: [], goalKeywords: [], goalLabel: "G", homeArea: null, language: "ja" as const, planId: "p", preferences: DEFAULT_EVENT_SCORE_PREFERENCES, types: [{ allocation: 30, emoji: "💼", key: "vc_partner", metCount: 0, shortLabel: "VC", skipped: false, targetCount: 3 }] };
const row = (id: string, startsAt: string, extra: Partial<AssessmentRow> = {}): AssessmentRow => ({
  actorId: "actor:a", aiOperationId: null, attempts: 0, attendeeSignature: "0", createdAt: NOW.toISOString(), eventId: `evt-${id}`, factBasis: {}, facts: { startsAt, title: id }, factsRefreshedAt: null, failureReason: null, id, idempotencyKey: id, leaseUntil: null, missingFields: [], pageCandidates: null, planItemId: null, posterAssetIds: [], promptVersion: null, readMs: null, rubricVersion: "event-score-v2", scoreBreakdown: [], sourceDigest: `event:${id}`, sourceHost: null, sourceKind: "orbit_event", sourceUrl: null, status: "ready", total: 20, totalMax: null, totalMin: null, updatedAt: NOW.toISOString(), userDecision: null, userFilledFields: [], verdict: "skip", view: {}, ...extra,
});

test("names published → recompute by rule and one event_pick; unchanged / far / external rows untouched", async () => {
  const repository = createMemoryEventAssessmentRepository();
  for (const item of [row("soon", "2026-10-10T19:00:00+09:00"), row("same", "2026-10-11T19:00:00+09:00", { attendeeSignature: "12" }), row("far", "2026-12-01T19:00:00+09:00"), row("ext", "2026-10-12T19:00:00+09:00", { eventId: null, sourceKind: "url" })]) await repository.insert(item);
  const notices: RecomputeNotice[] = [];
  let factsCalls = 0;
  const summary = await recomputeAssessments({
    notify: async (notice) => { notices.push(notice); },
    now: () => NOW,
    orbitEvents: { facts: async (_actor, eventId) => { factsCalls += 1; return { attendeeSignature: "12", extras: { attendeeSource: "registrants", expected: { vc_partner: 12 }, feeYen: 0, firstDegree: 1, known: [], secondDegree: 0 }, facts: { price: "無料", startsAt: "2026-10-10T19:00:00+09:00", title: eventId, venue: "渋谷" } }; } },
    plan: { addToPlan: async () => null, context: async () => context },
    repository,
  });
  assert.deepEqual(summary, { examined: 2, notified: 1, recomputed: 1 });
  assert.equal(factsCalls, 2);
  assert.equal(notices[0]?.firstPublic, true);
  assert.ok(notices[0]!.to > 20);
  assert.equal(repository.rows.get("soon")?.attendeeSignature, "12");
  const note = eventPickNotification(notices[0]!);
  assert.equal(note.sources[0]?.sourceKind, "event_pick");
  assert.match(note.title, /参加者リストが公開されました · 20 → \d+/);
  assert.equal(note.target.href, "/app/events/assessments/soon");
});
