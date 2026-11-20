import assert from "node:assert/strict";
import test from "node:test";

import { configuredRecordAccess, readCursorKey } from "../../features/agent-v1/domains/configured";
import { matchText } from "../../features/agent-v1/domains/source";
import { resolvePartIntents } from "../../features/agent-v1/propose/resolve";
import type { StoredIntent } from "../../features/agent-v1/propose/schema";
import { ACTOR, ctxOf, partOf } from "./ag20b-kit";
import { recordAccessOf } from "./graph-kit";
import { contact, todo } from "./read-kit";

/**
 * agent-design AG20b — the understanding-and-lookup defects the independent suite found (TRIAGE.md R2, R21). The data
 * here is this sprint's own, not the third party's.
 */

const span = (message: string, words: string): [number, number] => {
  const at = message.indexOf(words);
  assert.ok(at >= 0, `"${words}" in the message`);
  return [at, at + words.length];
};

function lookupWorld() {
  return { events: [], records: [
    contact(ACTOR, "contact:mara", "Mara Lindqvist", { organization: "Fjord Atelier" }),
    todo(ACTOR, "task:reply-mara", "回复 Mara 的报价", { plannedDate: "2026-11-18" }),
    todo(ACTOR, "task:kiln", "窑炉の点検", { plannedDate: "2026-11-19" }),
    todo(ACTOR, "task:other", "整理样品照片", { plannedDate: "2026-11-20" }),
  ] };
}

test("R2 the matching rule: spaces, the particles 的/の, width and case are taken out of both sides the same way", () => {
  assert.equal(matchText("回复 Mara 的报价"), "回复mara报价");
  assert.equal(matchText("窑炉の点検"), "窑炉点検");
  assert.equal(matchText("ＲＥＰＬＹ　Ｍａｒａ"), "replymara", "full-width letters and the ideographic space");
  assert.equal(matchText("「回复 Mara」"), "回复mara", "quote marks");
});

test("R2 the stored text is compared in the same form: a search without particles finds the title with them", async () => {
  const records = recordAccessOf(lookupWorld());
  const scope = records.scope(ACTOR);
  const found = async (text: string) => (await records.reader.read("todo", scope, { limit: 10, status: "open", text })).items.map((view) => view.id);
  assert.deepEqual(await found("回复mara"), ["task:reply-mara"]);
  assert.deepEqual(await found("窑炉点検"), ["task:kiln"]);
  assert.deepEqual(await found("回复 Mara 的报价"), ["task:reply-mara"], "the exact title");
  assert.deepEqual(await found("的"), ["task:reply-mara"], "a search that is only a particle folds to nothing: only the titles holding it as written, never everything");
});

test("R2 '回复 Mara 那条' finds 「回复 Mara 的报价」 and the card is built for it", async () => {
  const message = "把回复 Mara 那条改到周五";
  const records = recordAccessOf(lookupWorld());
  const intent: StoredIntent = { capability: "todo.update", date: span(message, "周五"), localId: "o1", relations: [], selector: [span(message, "回复 Mara 那条")] };
  const outcome = await resolvePartIntents(ctxOf(records, message), partOf(message, message), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  assert.equal(outcome.kind === "ready" && (outcome.ops[0] as { targetId?: string }).targetId, "task:reply-mara");
});

test("R2 '窑炉の点検のToDo' (ja) and the exact title are always found", async () => {
  const records = recordAccessOf(lookupWorld());
  for (const [message, clue] of [["窑炉の点検のToDoを金曜日に変更して", "窑炉の点検のToDo"], ["窑炉の点検を金曜日に変更して", "窑炉の点検"]] as const) {
    const intent: StoredIntent = { capability: "todo.update", date: span(message, "金曜日"), localId: "o1", relations: [], selector: [span(message, clue)] };
    const outcome = await resolvePartIntents(ctxOf(records, message, "ja"), partOf(message, message), { intents: [intent], picks: {} });
    assert.equal(outcome.kind === "ready" && (outcome.ops[0] as { targetId?: string }).targetId, "task:kiln", `${message}: ${JSON.stringify(outcome)}`);
  }
});

test("R2 a title that is not there is still 'not found' (no wider match)", async () => {
  const message = "把回复 Lena 那条改到周五";
  const records = recordAccessOf(lookupWorld());
  const intent: StoredIntent = { capability: "todo.update", date: span(message, "周五"), localId: "o1", relations: [], selector: [span(message, "回复 Lena 那条")] };
  const outcome = await resolvePartIntents(ctxOf(records, message), partOf(message, message), { intents: [intent], picks: {} });
  assert.equal(outcome.kind, "stop");
  assert.equal(outcome.kind === "stop" && outcome.reason, "object_not_found");
});

test("R21 the read cursor key: no secret, or one shorter than 32 bytes, gives no key and no record access (fails closed)", () => {
  const saved = { auth: process.env.AUTH_SECRET, next: process.env.NEXTAUTH_SECRET, read: process.env.ORBIT_READ_CURSOR_SECRET };
  try {
    delete process.env.ORBIT_READ_CURSOR_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    assert.equal(readCursorKey(), null);
    assert.equal(configuredRecordAccess(), null, "no reads without a key");
    process.env.AUTH_SECRET = "short";
    assert.equal(readCursorKey(), null, "too short");
    process.env.AUTH_SECRET = "x".repeat(32);
    assert.equal(readCursorKey()?.byteLength, 32);
  } finally {
    for (const [name, value] of [["AUTH_SECRET", saved.auth], ["NEXTAUTH_SECRET", saved.next], ["ORBIT_READ_CURSOR_SECRET", saved.read]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
