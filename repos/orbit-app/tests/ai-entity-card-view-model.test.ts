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
