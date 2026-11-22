import assert from "node:assert/strict";
import test from "node:test";

import { understandSystemPrompt } from "../../features/agent-v1/understand/prompt";
import { validateUnderstandOutput } from "../../features/agent-v1/understand/validate";
import { part } from "./graph-kit";

/**
 * agent-design AG05: a part that reads records may narrow the read (readFilter): words copied from the
 * message, newest / oldest / both, open / completed, a date range. Code keeps only what is valid and
 * drops the rest with a note — never a reason to reject the whole output (no repair call for it).
 */

const MESSAGE = "松本彩さんと灰釉の話を最初にしたのはいつでしたか。";
const input = { handles: new Set<string>(), message: MESSAGE, openItemRefs: new Set<string>() };

test("a valid readFilter is kept", () => {
  const result = validateUnderstandOutput({ parts: [part({ readFilter: { from: "2025-01-01", order: "oldest", status: "open", text: "灰釉", to: "2026-11-15" }, requiredCapabilities: ["memo.read"], sourceQuote: MESSAGE })], plainChat: false }, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.output.parts[0].readFilter, { from: "2025-01-01", order: "oldest", status: "open", text: "灰釉", to: "2026-11-15" });
});

test("words not in the message, a bad order or date are dropped (and reported), the part stays", () => {
  const result = validateUnderstandOutput({ parts: [part({ readFilter: { from: "next week", order: "random", status: "maybe", text: "降价", to: "2026-13-40" }, requiredCapabilities: ["memo.read"], sourceQuote: MESSAGE })], plainChat: false }, input);
  assert.equal(result.ok, true);
  if (result.ok !== true) return;
  assert.equal(result.output.parts[0].readFilter, undefined);
  assert.ok(result.dropped.some((item) => item.includes("readFilter.text")));
  assert.ok(result.dropped.some((item) => item.includes("readFilter.order")));
});

test("the prompt says a contact's to-dos and notes are the user's own records (dataOwner other_user is another Orbit user's account)", () => {
  const prompt = understandSystemPrompt();
  assert.match(prompt, /records the user keeps about a person \(their to-dos, notes, meetings: "他的待办"\) are the user's own: self/u);
});

test("a range given backwards is put in order", () => {
  const result = validateUnderstandOutput({ parts: [part({ readFilter: { from: "2026-11-30", to: "2026-11-01" }, requiredCapabilities: ["memo.read"], sourceQuote: MESSAGE })], plainChat: false }, input);
  assert.deepEqual(result.ok && result.output.parts[0].readFilter, { from: "2026-11-01", to: "2026-11-30" });
});
