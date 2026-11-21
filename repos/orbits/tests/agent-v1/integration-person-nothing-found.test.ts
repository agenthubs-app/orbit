import assert from "node:assert/strict";
import test from "node:test";

import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { todoNothingLine } from "../../features/agent-v1/graph/nodes/wider-read";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf, type ModelCall } from "./graph-kit";
import { contact, smallWorld, todo } from "./read-kit";

/**
 * Integration seam (2026-11-20): where AG20b's R25 (a question about a person is answered from the profile) meets the
 * hotfix's "nothing under this narrowing" (part 1b item 4: a person's read that finds nothing says who and what was looked
 * for). R25 first; when it does not answer, the hotfix's sentence — which never gives the person's own name as the words
 * looked for, and never answers "what to handle today" from a profile.
 */

const NOW = "2026-11-15T01:00:00.000Z";
const INES = "contact:ines";

function world(extra: ReturnType<typeof todo>[] = []) {
  const made = smallWorld();
  for (const record of made.records) if (record.userId === "user:a") record.userId = "actor:a";
  made.records.push(contact("actor:a", INES, "Inès Moreau", { organization: "Atelier Lune", role: "Head of Partnerships" }), ...extra);
  return made;
}

async function ask(message: string, clueText: string, records: ReturnType<typeof world>) {
  // The first layer as it tagged AE-RD-004; when a record is found, the answer step cites the to-do it was given.
  const model = deepseekStub((call: ModelCall) => {
    if (call.node === "understand") return json({ language: "en", parts: [part({ dataSources: ["orbit_records"], deliverable: "list", localId: "p1", objectClues: [{ entity: "contact", text: "Inès Moreau" }, { entity: "todo", text: clueText }], readFilter: { status: "open" }, requiredCapabilities: ["contact.read", "todo.read"], sourceQuote: message })], plainChat: false });
    const handle = /(s\d+) — to-do/u.exec(call.user)?.[1];
    return json({ segments: [{ cites: handle ? [{ sentenceIds: [1], sourceRef: handle }] : [], partId: "p1", text: "One open to-do: send the partnership deck." }] });
  });
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(records) });
    const result = await runAgentGraph(kit.deps, kit.input(message, { locale: "en" }));
    return { events: trace.events, result };
  } finally {
    trace.restore();
  }
}

test("the to-do clue carries her name (AE-RD-004 as the first layer tagged it): who and what was looked for, her name is not the words", async () => {
  const message = "Do I have any open to-dos for Inès Moreau?";
  const { events, result } = await ask(message, "open to-dos for Inès Moreau", world());
  assert.equal(result.text, "Open to-dos for Inès Moreau: none.");
  assert.deepEqual(result.partResults[0].gaps, ["no_record"]);
  assert.ok(!events.some((event) => event.type === "resolve.profile_answers"), "a list of to-dos is not answered from the profile");
  assert.ok(events.some((event) => event.type === "resolve.person_words_not_searched_for"));
});

test("the same question when a completed to-do of hers exists: it is said and shown (the hotfix's wider read, by status)", async () => {
  const message = "Do I have any open to-dos for Inès Moreau?";
  const done = todo("actor:a", "task:ines-done", "Send the partnership deck", { completedAt: "2026-11-12T01:00:00.000Z", relatedContactId: INES, status: "completed" });
  const { result } = await ask(message, "open to-dos for Inès Moreau", world([done]));
  assert.match(result.text, /^Open to-dos for Inès Moreau: none\. You do have 1 completed to-do for Inès Moreau\./u);
  assert.ok(result.blocks.some((block) => block.type === "records" && block.items.some((item) => item.id === "task:ines-done")));
});

test("an open to-do of hers that does not hold her name is found as before (the read is unchanged)", async () => {
  const message = "Do I have any open to-dos for Inès Moreau?";
  const open = todo("actor:a", "task:ines-open", "Send the partnership deck", { relatedContactId: INES });
  const { result } = await ask(message, "open to-dos for Inès Moreau", world([open]));
  assert.ok(result.sourceRefs.includes("todo:task:ines-open"), `${result.text} ${result.sourceRefs.join(", ")}`);
  assert.doesNotMatch(result.text, /: none\./u);
});

test("words of the clue that name something else stay what was looked for", async () => {
  const message = "Do I have any open budget to-dos for Inès Moreau?";
  const { result } = await ask(message, "open budget to-dos for Inès Moreau", world());
  assert.equal(result.text, 'To-dos for Inès Moreau containing "budget": none.');
});

test("the sentence: the person after the head whatever its case, never inside the quoted words, a name is no pattern", () => {
  assert.equal(todoNothingLine("en", "to-dos list items for Emily", { person: { id: "c", name: "Emily Carter" }, statusSaid: false, text: "to-dos list" }), 'To-dos for Emily Carter containing "to-dos list": none.');
  assert.equal(todoNothingLine("en", "open to-dos for her", { person: { id: "c", name: "A$& B" }, status: "open", statusSaid: true }), "Open to-dos for A$& B: none.");
  assert.equal(todoNothingLine("en", "open to-dos", { status: "open", statusSaid: true }), "Open to-dos: none.");
});

test("'what to handle today' about a picked person is the hotfix's plate, not a profile answer (R25 does not take it)", async () => {
  const message = "@Inès Moreau 今天有什么要处理的？";
  const later = todo("actor:a", "task:ines-later", "寄合作方案", { dueAt: "2026-11-20T03:00:00.000Z", relatedContactId: INES });
  for (const records of [world(), world([later])]) {
    const model = deepseekStub([json({ language: "zh", parts: [part({ dataSources: ["orbit_records"], localId: "p1", objectClues: [{ entity: "contact", referenceId: "r1", text: "@Inès Moreau" }], requiredCapabilities: ["contact.read", "todo.read"], sourceQuote: message })], plainChat: false })]);
    const trace = captureTrace();
    try {
      const kit = graphKit(model.fetchImplementation, { now: NOW, records: recordAccessOf(records), references: [{ id: INES, name: "Inès Moreau", type: "contact" }] as never });
      const result = await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: INES, type: "contact" }] as never }));
      assert.ok(trace.events.some((event) => event.type === "understand.todays_plate"), "the first layer's part is the plate");
      assert.ok(!trace.events.some((event) => event.type === "resolve.profile_answers"), result.text);
      assert.match(result.text, /Inès Moreau名下.*待办：没有。/u, result.text);
      assert.doesNotMatch(result.text, /按联系人资料回答/u);
      if (records.records.some((record) => record.id === "task:ines-later")) {
        assert.match(result.text, /另有 1 项还没完成的待办/u, result.text);
        assert.ok(result.blocks.some((block) => block.type === "records" && block.items.some((item) => item.id === "task:ines-later")));
      } else {
        assert.deepEqual(result.partResults[0].gaps, ["no_record"]);
      }
    } finally {
      trace.restore();
    }
  }
});
