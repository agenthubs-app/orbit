import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { createTranslator } from "../src/i18n/messages";
import {
  aiEntityCardForItem,
  aiEntityCardKindFor,
  aiEntityCardsFromArtifact,
} from "../src/view-models/ai-entity-card";

/**
 * Sprint 0094: one card shape for five entities. The fixtures are real captures
 * from the live agent — contacts, events, tasks, schedules and notes each asked
 * a genuine question — so the mapping is tested against the payloads the App
 * actually receives rather than against a shape I imagined.
 */
const fixtures = JSON.parse(
  readFileSync(new URL("./helpers/ai-entity-artifact-fixtures.json", import.meta.url), "utf8"),
) as Record<string, { sections: { items: unknown[] }[] }>;

const t = createTranslator("zh");
const cardsFor = (kind: string) => aiEntityCardsFromArtifact({ result: { generatedView: fixtures[kind] } }, t);

test("every one of the five entities produces cards from its real payload", () => {
  for (const kind of ["contact", "event", "task", "schedule", "note"]) {
    const cards = cardsFor(kind);
    assert.ok(cards.length > 0, `${kind} produced no cards`);
    assert.equal(cards[0]?.kind, kind, `${kind} was classified as ${cards[0]?.kind}`);
    assert.ok(cards[0]?.title, `${kind} card has no title`);
  }
});

test("notes get a card, which they did not have before this sprint", () => {
  const [card] = cardsFor("note");
  assert.equal(card?.kind, "note");
  assert.equal(card?.kindLabel, "笔记");
  assert.match(card?.href ?? "", /^\/notes\//u);
});

test("each card links to that entity's own detail page", () => {
  const expected: Record<string, RegExp> = {
    contact: /^\/(contacts|app\/contacts)\//u,
    event: /^\/(app\/)?events\//u,
    note: /^\/notes\//u,
    schedule: /^\/schedule\//u,
    task: /^\/tasks\//u,
  };
  for (const [kind, pattern] of Object.entries(expected)) {
    const [card] = cardsFor(kind);
    assert.match(card?.href ?? "", pattern, `${kind} → ${card?.href}`);
  }
});

test("the identifying attributes land on one line, and machine instants read as days", () => {
  const [task] = cardsFor("task");
  assert.ok(task?.meta, "a task card shows its due date and category");
  assert.doesNotMatch(task?.meta ?? "", /\d{4}-\d{2}-\d{2}T/u, "a raw ISO instant is not a readable attribute");

  const [contact] = cardsFor("contact");
  assert.ok(contact?.meta?.includes(" · "), "a contact shows role and organisation together");
});

test("the reason line is one sentence, not the whole rationale", () => {
  const [contact] = cardsFor("contact");
  assert.ok(contact?.reason, "a recommended contact says why it is here");
  assert.ok((contact?.reason?.length ?? 0) < 120, `reason too long: ${contact?.reason}`);
  assert.equal((contact?.reason?.match(/。/gu) ?? []).length, 1, "exactly one sentence");
});

test("the entity kind comes from the id, including the recommendation wrappers", () => {
  assert.equal(aiEntityCardKindFor("contact-recommendation:contact_089"), "contact");
  assert.equal(aiEntityCardKindFor("event-recommendation:event_signup_02"), "event");
  assert.equal(aiEntityCardKindFor("task:029405a6"), "task");
  assert.equal(aiEntityCardKindFor("personal:c1fdb004"), "schedule");
  assert.equal(aiEntityCardKindFor("note:7705e61d"), "note");
  assert.equal(aiEntityCardKindFor("invoice:1"), null, "an unknown entity produces no card");
});

test("an item the client cannot place becomes no card rather than a blank one", () => {
  assert.equal(aiEntityCardForItem(null, t), null);
  assert.equal(aiEntityCardForItem({ id: "task:1" }, t), null, "no title");
  assert.equal(aiEntityCardForItem({ title: "x" }, t), null, "no id");
  assert.equal(aiEntityCardForItem({ id: "ledger:1", title: "x" }, t), null, "unknown kind");
});

test("the detail link is derived from the record id, not taken from the payload", () => {
  // An artifact that supplies its own href must not be able to aim a card
  // somewhere else; the same binding the server enforces for contacts.
  const base = { id: "task:abc", title: "跟进", metadata: [], evidenceIds: [] };
  assert.equal(aiEntityCardForItem(base, t)?.href, "/tasks/task%3Aabc");
  assert.equal(
    aiEntityCardForItem({ ...base, actions: [{ href: "/tasks/task%3Aabc" }] }, t)?.href,
    "/tasks/task%3Aabc",
    "a matching href is accepted",
  );
  assert.equal(
    aiEntityCardForItem({ ...base, actions: [{ href: "/app/tasks/task%3Aabc" }] }, t)?.href,
    "/tasks/task%3Aabc",
    "the web shell prefix is the same route",
  );
  for (const href of ["/tasks/task%3Aother", "/contacts/task%3Aabc", "https://evil.example/tasks/task%3Aabc", "/tasks/task%3Aabc/../../admin"]) {
    assert.equal(
      aiEntityCardForItem({ ...base, actions: [{ href }] }, t)?.href,
      null,
      `a href pointing elsewhere must produce no link: ${href}`,
    );
  }
});

test("a machine instant reads as a day whatever the reply labelled it, and a bare date is left alone", () => {
  const card = aiEntityCardForItem({
    id: "event-recommendation:event_09", title: "对接会",
    metadata: [{ label: "开始", value: "2026-09-24T05:00:00.000Z" }],
  }, t);
  assert.doesNotMatch(card!.meta!, /T\d{2}:\d{2}/u, "a Chinese-labelled start time stayed in machine format");

  const dated = aiEntityCardForItem({
    id: "task:only-a-day", title: "季度复盘",
    metadata: [{ label: "dueAt", value: "2026-09-21" }],
  }, t);
  assert.equal(dated!.meta, "2026-09-21", "a date with no time must not grow an invented hour");
});

test("a schedule entry links to the route for its own kind, and to nothing when it does not say", () => {
  const routes: Record<string, string> = { event: "/schedule/events/", meeting: "/schedule/meetings/", personal: "/schedule/personal/" };
  for (const [kind, route] of Object.entries(routes)) {
    const card = aiEntityCardForItem({
      id: "personal:entry_01", title: "季度规划",
      metadata: [{ label: "kind", value: kind }, { label: "startsAt", value: "2026-09-21T01:00:00.000Z" }],
    }, t);
    assert.equal(card!.href, `${route}personal%3Aentry_01`);
    assert.doesNotMatch(card!.meta!, new RegExp(kind, "u"), "the routing field is not an attribute to show");
  }
  const unlabelled = aiEntityCardForItem({ id: "personal:entry_02", title: "未知", metadata: [] }, t);
  // /schedule/<id> is not a route: linking there drops the user on the home screen.
  assert.equal(unlabelled!.href, null);
});
