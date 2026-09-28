import assert from "node:assert/strict";
import test from "node:test";

import { compareText, parseTimestamp } from "../../shared/compute/compute-text";

// Sprint 0117: the shared computations sort labels and read timestamps with
// compute-text instead of the runtime's localeCompare / Date parsing, so the
// server and the App agree. These pin the helper to what the production server
// (Node, en-US ICU, TZ=UTC) returned for the same inputs.

const PRINTABLE = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));
const collator = new Intl.Collator("en-US");
const sign = (value: number) => (value < 0 ? -1 : value > 0 ? 1 : 0);

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("printable-ASCII strings sort exactly like en-US localeCompare (ICU root), without asking the runtime", () => {
  const random = seeded(117);
  const pick = (alphabet: readonly string[]) => alphabet[Math.floor(random() * alphabet.length)]!;
  const timestampish = ["0", "1", "2", "9", "-", ":", ".", "T", "t", "Z", "z", " ", "+", "_"];
  const mismatches: string[] = [];
  for (let index = 0; index < 60_000; index += 1) {
    const alphabet = index % 3 === 0 ? timestampish : PRINTABLE;
    const length = 1 + Math.floor(random() * 8);
    let left = "";
    for (let char = 0; char < length; char += 1) left += pick(alphabet);
    // Often a near neighbour: one position changed, truncated or case-flipped.
    let right = left;
    const mode = Math.floor(random() * 4);
    const at = Math.floor(random() * left.length);
    if (mode === 0) right = left.slice(0, at) + pick(alphabet) + left.slice(at + 1);
    else if (mode === 1) right = left.slice(0, at);
    else if (mode === 2) right = left.slice(0, at) + (left[at] === left[at]!.toUpperCase() ? left[at]!.toLowerCase() : left[at]!.toUpperCase()) + left.slice(at + 1);
    else for (let char = 0; char < length; char += 1) right = (char === 0 ? "" : right) + pick(alphabet);
    if (compareText(left, right) !== sign(collator.compare(left, right))) mismatches.push(`${JSON.stringify(left)} vs ${JSON.stringify(right)}`);
  }
  for (const [left, right] of [["a", "B"], ["B", "a"], ["a", "A"], ["", "a"], ["_", "-"], ["2026-09-19 23:59:59", "2026-09-19T23:59:59Z"], ["Zeta", "alpha"], ["a-b", "ab"]] as const) {
    if (compareText(left, right) !== sign(collator.compare(left, right))) mismatches.push(`${left} vs ${right}`);
  }
  assert.deepEqual(mismatches.slice(0, 10), []);
});

test("other strings use the en-US collator, so the server gives the same order in any process locale", () => {
  const labels = ["东京", "大阪", "張偉", "佐藤 花子", "Émile", "emile", "Zoë", "İstanbul", "ΟΔΥΣΣΕΥΣ", "김민수", "ｶﾀｶﾅ", "カタカナ", "かたかな", "🚀 Rocket", "上海", "深圳", "IT", "制造"];
  for (const left of labels) for (const right of labels) {
    assert.equal(compareText(left, right), sign(collator.compare(left, right)), `${left} / ${right}`);
  }
});

test("ISO timestamps parse as the production server (TZ=UTC) parsed them, whatever the host's zone", () => {
  const samples = [
    "2026-09-28", "2026-09-28T10:00", "2026-09-28T10:00:05", "2026-09-28T10:00:05.1", "2026-09-28T10:00:05.123456", "2026-09-28T10:00:05.9999999Z",
    "2026-09-28T10:00:05Z", "2026-09-28t10:00:05z", "2026-09-28T10:00:05+09:00", "2026-09-28T10:00:05-0330", "2026-09-28T23:59:59.999999+00:00",
    "2026-09-28 10:00:05", "2026-02-30T00:00:00Z", "2026-04-31", "2026-09-28T24:00:00Z", "2026-12-31T23:59:59.5+09:00",
    "2026-13-01", "2026-09-28T10:60:00Z", "not a date", "", "２０２６-09-19T00:00:00.000Z", "2026-09-28T10:00:05+09",
  ];
  const original = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const production = new Map(samples.map((value) => [value, Date.parse(value)]));
    process.env.TZ = "Asia/Tokyo";
    for (const value of samples) {
      const expected = production.get(value)!;
      const actual = parseTimestamp(value);
      assert.ok(Number.isNaN(expected) ? Number.isNaN(actual) : actual === expected, `${JSON.stringify(value)}: ${actual} vs production ${expected}`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
