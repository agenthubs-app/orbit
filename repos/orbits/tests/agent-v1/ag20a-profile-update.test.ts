import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFirstLayerContext } from "../../features/agent-v1/context/build";
import { resolvePartIntents, type ResolveContext } from "../../features/agent-v1/propose/resolve";
import type { AgentSessionState } from "../../features/agent-v1/context/session-state";
import { ACTOR, contactWorld, memoryContactAccess, runContact, json } from "./contact-kit";
import { recordAccessOf } from "./graph-kit";
import { memo } from "./read-kit";

/**
 * agent-design AG20a, owner's decision 2 (2026-11-20): right after an answer pointed out that a contact's profile is out of
 * date in particular fields, 「那把她的资料也更新了」 makes a card with exactly those fields and the values the answer took
 * from the user's record; nothing is written before the click. Nothing concrete said before: ask, do not guess.
 */

const NOW = "2026-11-15T01:00:00.000Z";
const message = "那把她的资料也更新了";

function world() {
  return contactWorld((records) => records.push(memo(ACTOR, "note:m77", "李薇说她已经加入了晴空影像，现在是艺术总监。", "2026-11-14T03:00:00.000Z", ["contact:c31"], { title: "李薇近况" })));
}

function stateWith(staleProfiles: AgentSessionState["staleProfiles"]): AgentSessionState {
  return { lastMentioned: [{ at: NOW, id: "contact:c31", name: "李薇", type: "contact" }], openItems: [], sessionId: "session:a", shownList: null, updatedAt: NOW, ...(staleProfiles ? { staleProfiles } : {}) };
}

async function resolveWith(state: AgentSessionState, w = world()) {
  const context = buildFirstLayerContext({ messages: [{ createdAt: "2026-11-15T00:59:00.000Z", role: "user", text: "李薇现在在哪家公司？" }, { createdAt: "2026-11-15T00:59:30.000Z", role: "assistant", text: "…" }], now: NOW, references: [], state });
  const ctx: ResolveContext = { asOf: NOW, asked: new Map(), context, language: "zh", message, nameOf: () => null, people: [], records: { ...recordAccessOf(w), contacts: memoryContactAccess(w) }, scope: { accountId: ACTOR, authorizationEpoch: "agent-v1:1", workspaceId: "workspace:test" }, timeZone: "Asia/Tokyo" };
  const she = message.indexOf("她");
  return resolvePartIntents(ctx, { localId: "p1", quote: [0, message.length], refs: [{ entity: "contact", quote: [she, she + 1], recordId: null }] } as never, { intents: [{ capability: "contact.update", localId: "w1", relations: [], selector: [[she, she + 1]] }], picks: {} });
}

const STALE = [
  { at: "2026-11-14T03:00:00.000Z", contactId: "contact:c31", field: "organization" as const, name: "李薇", sourceId: "note:m77", sourceType: "memo", value: "晴空影像" },
  { at: "2026-11-14T03:00:00.000Z", contactId: "contact:c31", field: "role" as const, name: "李薇", sourceId: "note:m77", sourceType: "memo", value: "艺术总监" },
];

test("decision 2: the fields the last answer found out of date, with its values, become the card's change", async () => {
  const outcome = await resolveWith(stateWith(STALE));
  assert.equal(outcome.kind, "ready", JSON.stringify(outcome));
  const [op] = (outcome as { ops: { capability: string; set: Record<string, string>; targetId: string }[] }).ops;
  assert.equal(op.capability, "contact.update");
  assert.equal(op.targetId, "contact:c31");
  assert.deepEqual(op.set, { organization: "晴空影像", role: "艺术总监" });
});

test("decision 2: nothing concrete said before, or the record no longer says it: ask which field, never guess", async () => {
  const none = await resolveWith(stateWith(undefined));
  assert.deepEqual([none.kind, (none as { reason?: string }).reason], ["stop", "field_missing"]);
  const changed = world();
  const note = changed.records.find((record) => record.id === "note:m77")!;
  (note.payload.note as Record<string, unknown>).body = "李薇最近很忙。";
  const gone = await resolveWith(stateWith(STALE), changed);
  assert.deepEqual([gone.kind, (gone as { reason?: string }).reason], ["stop", "field_missing"]);
  // Another person's stale fields are not hers.
  const other = await resolveWith(stateWith(STALE.map((item) => ({ ...item, contactId: "contact:c30" }))));
  assert.deepEqual([other.kind, (other as { reason?: string }).reason], ["stop", "field_missing"]);
});

test("decision 2: the session state keeps the answer's stale fields for the next turn only (a turn without them clears them)", async () => {
  const run = await runContact("今天天气怎么样？", [{ deliverable: "answer", requiredCapabilities: [], sourceQuote: "今天天气怎么样？" }], [], { answer: () => json({ segments: [{ cites: [], partId: "p1", text: "我查不了天气。" }] }) });
  assert.equal(run.state?.staleProfiles, undefined);
});
