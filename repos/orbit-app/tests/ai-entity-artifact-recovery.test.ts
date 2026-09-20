import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { contactArtifactDisplaySchema, entityArtifactToDisplay } from "../src/api/schema/ai-artifacts";
import { createTranslator } from "../src/i18n/messages";
import { sessionContactArtifacts, sessionEntityCards } from "../src/view-models/ai-artifacts";

/**
 * Sprint 0095: a reply survives being reloaded from history.
 *
 * Sprint 0094 gave all five entities the same card, but only for the turn as it
 * arrived. Recovery kept contact recommendations and dropped everything else, so
 * reopening the session left a task or note reply with prose and no cards. These
 * tests run the real captured payloads through the server's recovery mapping and
 * then through the client's card reader, which is the path the App takes.
 */
const fixtures = JSON.parse(
  readFileSync(new URL("./helpers/ai-entity-artifact-fixtures.json", import.meta.url), "utf8"),
) as Record<string, { taskKind: string; presentation: Record<string, unknown>; sections: { items: Record<string, unknown>[] }[] }>;

const t = createTranslator("zh");
const session = { id: "session:1", messages: [{ id: "u", role: "user" }, { id: "a", role: "assistant" }] };
const CONVERSATION = "conversation:1";

function artifactFor(kind: string, conversationId: string | null = CONVERSATION): unknown {
  const fixture = fixtures[kind]!;
  const shared = { artifactId: `artifact:${kind}`, taskId: `task:${kind}`, status: "ready", presentation: fixture.presentation };
  return {
    task: { ...shared, conversationId, kind: fixture.taskKind, artifactProducer: `${kind}_producer`, query: "q", createdAt: "2026-09-20", updatedAt: "2026-09-20" },
    result: { ...shared, kind: fixture.taskKind, generatedView: { summary: "摘要", sections: fixture.sections }, nextAction: "" },
  };
}

const recoveryOf = (...artifacts: unknown[]) => ({
  truncated: false,
  turns: [{ sessionId: session.id, requestId: "r", userMessageId: "u", assistantMessageId: "a", status: "ready", artifacts }],
});

test("recovery keeps the real kind of every entity artifact instead of relabelling it a contact", () => {
  for (const [kind, fixture] of Object.entries(fixtures)) {
    const display = entityArtifactToDisplay(artifactFor(kind));
    assert.equal(display.kind, fixture.taskKind, kind);
    assert.equal(display.status, "ready", kind);
    assert.ok(display.sections.some((section) => section.items.length > 0), kind);
  }
});

test("a reloaded session still shows cards for all five entities, not only contacts", () => {
  for (const kind of Object.keys(fixtures)) {
    const restored = sessionEntityCards(session, recoveryOf(entityArtifactToDisplay(artifactFor(kind))), t);
    assert.ok(restored, `${kind} recovered no cards`);
    assert.equal(restored.assistantMessageId, "a");
    assert.ok(restored.cards.length > 0, kind);
  }
});

test("restored cards carry the attributes that identify the record and still drop the producer's internals", () => {
  const task = sessionEntityCards(session, recoveryOf(entityArtifactToDisplay(artifactFor("task"))), t)!.cards[0]!;
  assert.equal(task.kind, "task");
  assert.ok(task.meta && task.meta.length > 0, "a task recovered without its due date or category");

  const schedule = sessionEntityCards(session, recoveryOf(entityArtifactToDisplay(artifactFor("schedule"))), t)!.cards[0]!;
  assert.ok(schedule.meta && schedule.meta.length > 0, "a schedule recovered without its start time");

  const serialized = JSON.stringify(entityArtifactToDisplay(artifactFor("schedule")));
  for (const label of ["timeZone", "missingFields", "meetingMethod", "allDay"]) {
    assert.doesNotMatch(serialized, new RegExp(label, "u"), `${label} is the producer's working state, not the card's`);
  }
});

test("a restored card links to its own record, derived rather than taken from the payload", () => {
  const cards = Object.keys(fixtures).flatMap((kind) => sessionEntityCards(session, recoveryOf(entityArtifactToDisplay(artifactFor(kind))), t)!.cards);
  // A schedule entry links to the route for its own kind, not a flat /schedule/<id>.
  const paths: Record<string, string> = { contact: "/contacts/", event: "/events/", note: "/notes/", schedule: "/schedule/personal/", task: "/tasks/" };
  for (const card of cards) {
    assert.ok(card.href, `${card.kind} card lost its link in recovery`);
    assert.ok(card.href!.startsWith(paths[card.kind]!), `${card.kind} -> ${card.href}`);
  }
});

test("an action pointing at another record voids the stored link for every kind, not just contacts", () => {
  for (const kind of Object.keys(fixtures)) {
    const artifact = JSON.parse(JSON.stringify(artifactFor(kind))) as { result: { generatedView: { sections: { items: Record<string, unknown>[] }[] } } };
    for (const section of artifact.result.generatedView.sections) {
      for (const item of section.items) {
        item.evidenceIds = ["evidence:1"];
        item.actions = [{ actionId: `contact:review:${String(item.id).replace(/^[a-z-]+:/u, "")}`, label: "x", requiresConfirmation: false, href: "https://outside.test/contacts/other" }];
      }
    }
    const display = entityArtifactToDisplay(artifact);
    const hrefs = display.sections.flatMap((section) => section.items.map((item) => item.contactHref));
    assert.deepEqual(new Set(hrefs), new Set([null]), `${kind} trusted an off-record href`);
  }
});

test("a stored link that no longer matches its own id is refused when the session is read back", () => {
  const display = entityArtifactToDisplay(artifactFor("contact")) as { sections: { items: { contactHref: string | null }[] }[] };
  assert.equal(contactArtifactDisplaySchema.safeParse(display).success, true);
  const tampered = JSON.parse(JSON.stringify(display)) as typeof display;
  tampered.sections[0]!.items[0]!.contactHref = "/contacts/someone-else";
  assert.equal(contactArtifactDisplaySchema.safeParse(tampered).success, false);
});

test("a non-contact turn is not mistaken for an unrecoverable contact panel", () => {
  assert.deepEqual(sessionContactArtifacts(session, recoveryOf(entityArtifactToDisplay(artifactFor("task")))), []);
  const contacts = sessionContactArtifacts(session, recoveryOf(entityArtifactToDisplay(artifactFor("contact"))));
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0]?.status, "ready");
});
