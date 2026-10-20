import assert from "node:assert/strict";
import test from "node:test";

import type { SecretaryPreviewDTO } from "../../shared/contract/secretary-preview";
import type { TodoPageContract } from "../../shared/contract/todo-page";
import { homeRailSuggestions } from "../../app/(app)/app/orbit-2026/home/home-rail-model";

test("rail count reflects distinct visible source-backed actions, never mail or unknown source kinds", () => {
  const secretary = { actorId: "actor:a", asOf: "2026-10-20T00:00:00Z", hasMore: false, items: [
    { key: "mail", kind: "daily_recommendation", notification: { title: "Mail", target: { href: "/app/inbox", status: "available" }, sources: [{ sourceKind: "mail_summary" }] } },
    { key: "prep", kind: "event_prep", notification: { title: "Prepare", target: { href: "/app/events/a/prep", status: "available" }, sources: [{ sourceKind: "event_prep" }] } },
  ] } as unknown as SecretaryPreviewDTO;
  const todo = { nextMoves: { items: [{ key: "one", titlePreview: "Call Hana", taskId: "task:a" }] } } as unknown as TodoPageContract;
  const rail = homeRailSuggestions({ secretary, todo, schedule: [{ id: "same", title: "Event", startsAt: "2026-10-20T08:00:00Z", state: "upcoming" }] });
  assert.deepEqual(rail.map(item => item.title), ["Prepare", "Call Hana", "Event"]);
  assert.equal(rail.length, 3);
  assert.deepEqual(homeRailSuggestions({}), []);
});
