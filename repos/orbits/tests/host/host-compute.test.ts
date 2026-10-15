/** R17：主催的共享纯函数（shared/compute）。参加コード / 受付番号 / QR v2 / <5 抑制 / 待办 / 编组后处理 / 質問案。 */
import assert from "node:assert/strict";
import test from "node:test";

import { cohostCodeFromBytes, normalizeCohostCode, normalizeParticipationCode, participationCodeFromBytes } from "../../shared/compute/participation-code";
import { receptionNumberFor } from "../../shared/compute/reception-number";
import { base64UrlDecode, base64UrlEncode, checkInTokenSigningInput, encodeCheckInToken, parseCheckInToken } from "../../shared/compute/checkin-token";
import { suppressCells, suppressedDistribution, suppressedRate, suppressSmall } from "../../shared/compute/small-cell";
import { hostNextSteps, hostTodoItems, type HostTodoEventFacts } from "../../shared/compute/host-todo";
import { applyMatchingMoves, avoidPreviousTablemates, ensureInvestorPerTable, pairKey, separateSameCompany } from "../../shared/compute/table-constraints";
import { answerSpread, suggestQuestions } from "../../shared/compute/question-suggest";
import { INVITE_CODE_ALPHABET } from "../../shared/compute/invite-code-format";
import type { HostMatchingMember, HostMatchingTable } from "../../shared/contract/host-console";

test("participation code: R15 alphabet, XXXX-XXXX, normalization only for new codes", () => {
  const code = participationCodeFromBytes([0, 1, 2, 3, 29, 30, 31, 200]);
  assert.match(code, /^[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
  for (const char of code.replace("-", "")) assert.ok(INVITE_CODE_ALPHABET.includes(char));
  assert.equal(normalizeParticipationCode(" 7qkm h4tr "), "7QKM-H4TR");
  assert.equal(normalizeParticipationCode("7QKM-H4T0"), null, "0 is not in the alphabet");
  // R27 mock code is an old-style code: it is not a new code and must not be rewritten here.
  assert.equal(normalizeParticipationCode("CFO18NGT"), null);
  assert.throws(() => participationCodeFromBytes([1, 2, 3]));
});

test("co-host code: H- prefix distinguishes it from a participation code", () => {
  assert.match(cohostCodeFromBytes([5, 6, 7, 8, 9, 10, 11, 12]), /^H-[2-9A-Z]{4}-[2-9A-Z]{4}$/u);
  assert.equal(normalizeCohostCode("h 7kqm-2tr4"), "H-7KQM-2TR4");
  assert.equal(normalizeCohostCode("H-7KQM2TR4"), "H-7KQM-2TR4");
  assert.equal(normalizeCohostCode("7KQM-2TR4"), null);
});

test("reception number: A-001…A-999, then the next letter; never zero", () => {
  assert.equal(receptionNumberFor(1), "A-001");
  assert.equal(receptionNumberFor(42), "A-042");
  assert.equal(receptionNumberFor(999), "A-999");
  assert.equal(receptionNumberFor(1000), "B-001");
  assert.throws(() => receptionNumberFor(0));
});

test("QR v2: encode / parse round trip; old plaintext and malformed payloads are rejected", () => {
  assert.equal(base64UrlDecode(base64UrlEncode("event:日本語:1")), "event:日本語:1");
  const parts = { eventId: "demo-event-cfo-night-18", exp: 1_791_000_000, participantId: "event-participant-profile:abc:def" };
  const token = encodeCheckInToken(parts, "c2lnbmF0dXJlLXNpZ25hdHVyZQ");
  assert.ok(token.startsWith("orbit-checkin:v2:"));
  assert.deepEqual(parseCheckInToken(token), { ...parts, signature: "c2lnbmF0dXJlLXNpZ25hdHVyZQ" });
  assert.equal(checkInTokenSigningInput(parts), "v2|demo-event-cfo-night-18|event-participant-profile:abc:def|1791000000");
  assert.equal(parseCheckInToken("orbit-checkin:demo-event-cfo-night-18:A-042"), null);
  assert.equal(parseCheckInToken(`${token}:extra`), null);
  assert.equal(parseCheckInToken(token.replace(/:\d+:/u, ":soon:")), null);
});

test("small cells: <5 shows —, a lone suppressed cell takes the smallest other cell with it", () => {
  assert.equal(suppressSmall(4), null);
  assert.equal(suppressSmall(5), 5);
  assert.deepEqual(suppressCells([19, 17, 3, 15]), [19, 17, null, null]);
  assert.deepEqual(suppressCells([19, 3, 2, 15]), [19, null, null, 15]);
  assert.deepEqual(suppressCells([19, 17, 16]), [19, 17, 16]);
  assert.equal(suppressedRate(3, 4), null);
  assert.equal(suppressedRate(118, 140), 84);
  assert.deepEqual(suppressedDistribution([2, 1]), [null, null]);
  assert.deepEqual(suppressedDistribution([46, 28, 17, 9]), [46, 28, 17, 9]);
});

const facts = (patch: Partial<HostTodoEventFacts>): HostTodoEventFacts => ({ applied: 0, daysToStart: 10, eventId: "e", formPublished: true, formPublishedAt: "2026-10-01T00:00:00.000Z", matchingState: "none", pendingReview: 0, profileIncomplete: 0, status: "upcoming", title: "t", ...patch });

test("host todo: review → matching missing → profile incomplete; ended / draft events are ignored", () => {
  const items = hostTodoItems([
    facts({ eventId: "cfo18", pendingReview: 12, profileIncomplete: 16, status: "live", title: "CFO Night vol.18", matchingState: "draft" }),
    facts({ daysToStart: 14, eventId: "asakai3", title: "朝会 #3" }),
    facts({ eventId: "old", pendingReview: 99, status: "ended" }),
    facts({ eventId: "draft", pendingReview: 50, status: "draft" }),
  ]);
  assert.deepEqual(items.map((item) => [item.kind, item.eventId, item.count ?? item.daysLeft]), [["review_pending", "cfo18", 12], ["matching_missing", "asakai3", 14], ["profile_incomplete", "cfo18", 16]]);
  const steps = hostNextSteps(facts({ applied: 18, pendingReview: 3 }));
  assert.deepEqual(steps.map((step) => [step.kind, step.done]), [["publish_form", true], ["review_pending", false], ["generate_matching", false]]);
  assert.equal(steps[2]?.threshold, 20);
});

const m = (id: string, org: string, standing = "事業会社"): HostMatchingMember => ({ initial: id[0]!, name: id, org, participantId: id, placedByHost: false, role: null, standing });
const t = (letter: string, members: HostMatchingMember[], round = 1): HostMatchingTable => ({ absent: 0, members, round, table: letter, theme: null, why: "w" });

test("matching moves: move between tables and to 未配置; moved people are marked 主催者が配置; input untouched", () => {
  const tables = [t("A", [m("a1", "X"), m("a2", "Y")]), t("B", [m("b1", "Z")])];
  const result = applyMatchingMoves({ tables, unplaced: [m("u1", "Q")] }, [{ participantId: "a1", round: 1, toTable: "B" }, { participantId: "u1", round: 1, toTable: "A" }, { participantId: "b1", round: 1, toTable: null }]);
  assert.deepEqual(result.tables.map((table) => table.members.map((member) => member.participantId)), [["a2", "u1"], ["a1"]]);
  assert.deepEqual(result.unplaced.map((member) => member.participantId), ["b1"]);
  assert.equal(result.tables[1]!.members[0]!.placedByHost, true);
  assert.equal(tables[0]!.members.length, 2, "input not mutated");
});

test("rule post-processing: same company split, previous tablemates avoided, investors spread", () => {
  const sameCompany = separateSameCompany([t("A", [m("a1", "株式会社X"), m("a2", "X")]), t("B", [m("b1", "Y"), m("b2", "Z")])]);
  for (const table of sameCompany.tables) assert.notEqual(table.members[0]!.org?.replace("株式会社", ""), table.members[1]!.org?.replace("株式会社", ""));
  const previous = new Set([pairKey("a1", "a2")]);
  const avoided = avoidPreviousTablemates([t("A", [m("a1", "P"), m("a2", "Q")]), t("B", [m("b1", "R"), m("b2", "S")])], previous, (member) => member.participantId);
  assert.ok(avoided.tables.every((table) => !(table.members.some((x) => x.participantId === "a1") && table.members.some((x) => x.participantId === "a2"))));
  const investor = (member: HostMatchingMember) => member.standing === "投資家";
  const spread = ensureInvestorPerTable([t("A", [m("i1", "P", "投資家"), m("i2", "Q", "投資家")]), t("B", [m("b1", "R"), m("b2", "S")]), t("C", [m("c1", "T")])], investor);
  assert.equal(spread.unsatisfied, 1, "only two investors for three tables");
  assert.ok(spread.tables[1]!.members.some(investor));
});

test("question suggestions: the most spread-out past answers first, existing prompts skipped", () => {
  assert.equal(answerSpread([10, 0]), 0);
  assert.ok(answerSpread([5, 5]) > answerSpread([9, 1]));
  const q = (id: string, prompt: string) => ({ id, kind: "single" as const, options: ["a", "b"], prompt, required: true });
  const picked = suggestQuestions({ existing: [q("x", "立場")], library: [q("standing", "立場"), q("topic", "テーマ"), q("goal", "目的"), q("count", "回数")], past: [{ counts: [9, 1], questionId: "topic" }, { counts: [5, 5], questionId: "goal" }] });
  assert.deepEqual(picked.map((item) => item.id), ["goal", "topic", "count"]);
});
