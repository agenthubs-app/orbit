import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PlanHomeView, PlanV2Detail } from "../src/api/contract/plan-v2";
import {
  currentStepIndex,
  draftPieces,
  eventsDoneOf,
  factTextOk,
  homeHeader,
  isPlanHomeV3,
  markedPieces,
  mergeHome,
  monthDay,
  prepLines,
  seatOf,
  typeStepNumber,
  typeToneOf,
  withDone,
} from "../src/screens/plan/plan-home-v3-model";

// R37b: the plan home's pure rules, a port of the Web home-v3-model (R37a). The fixtures are the orbits mock server's
// own overview answers for the three v16 design plans (tests/fixtures/plan-home-v3-mock.json, fixture v16-home-all).
const root = new URL("..", import.meta.url).pathname;
const mock = JSON.parse(readFileSync(join(root, "tests/fixtures/plan-home-v3-mock.json"), "utf8")) as Record<"fund" | "sales" | "hire", PlanV2Detail>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

test("v3 with a home block gets the new page; v2 or no home keeps the R24 overview", () => {
  const fund = clone(mock.fund);
  assert.equal(isPlanHomeV3(fund), true);
  assert.equal(isPlanHomeV3({ ...fund, home: null }), false);
  assert.equal(isPlanHomeV3({ ...fund, content: { ...fund.content, schemaVersion: 2 } }), false);
  const { home: _home, ...withoutHome } = fund;
  assert.equal(isPlanHomeV3(withoutHome), false);
});

test("header: stage first (first unfinished step), found capped per type and skipped types left out, score from the server", () => {
  const fund = clone(mock.fund);
  const header = homeHeader(fund);
  assert.equal(header.stepIndex, 0);
  assert.equal(header.stepCount, fund.content.steps.length);
  assert.equal(header.stepTitle, fund.content.steps[0]!.title);
  assert.equal(header.score, fund.score.total);
  assert.equal(header.total, 100);
  assert.equal(header.need, fund.content.personTypes.reduce((sum, type) => sum + type.targetCount, 0));
  assert.equal(header.found, fund.content.personTypes.reduce((sum, type) => sum + Math.min(type.targetCount, seatOf(fund.home, type.key)?.people.length ?? 0), 0));
  assert.equal(header.barPercent, Math.round((fund.score.total / 100) * 100));

  // a finished first step moves the stage; all finished = the last stage
  const moved = clone(fund);
  moved.content.steps = [{ ...moved.content.steps[0]!, completedAt: "2026-11-01T00:00:00.000Z" }, ...moved.content.steps.slice(1)];
  assert.equal(currentStepIndex(moved), 1);
  moved.content.steps = moved.content.steps.map((step) => ({ ...step, completedAt: "2026-11-01T00:00:00.000Z" }));
  assert.equal(currentStepIndex(moved), moved.content.steps.length - 1);

  // more people than seats count only up to the seats; a skipped type leaves the need
  const capped = clone(fund);
  const type = capped.content.personTypes[0]!;
  const seat = capped.home!.seats!.find((entry) => entry.typeKey === type.key)!;
  seat.people = Array.from({ length: type.targetCount + 3 }, (_, index) => ({ contactId: `c${index}`, name: `N${index}`, note: null }));
  const before = homeHeader(fund).found - Math.min(type.targetCount, seatOf(fund.home, type.key)?.people.length ?? 0);
  assert.equal(homeHeader(capped).found, before + type.targetCount);
  capped.content.personTypes = [{ ...type, skipped: true }, ...capped.content.personTypes.slice(1)];
  assert.equal(homeHeader(capped).need, homeHeader(fund).need - type.targetCount);

  // no seats at all (a tick answer before any overview read) → nobody found
  const { seats: _seats, ...noSeats } = fund.home!;
  assert.equal(homeHeader({ ...fund, home: noSeats as PlanHomeView }).found, 0);
});

test("type tones rotate from blue in plan order; events are pink; stage numbers follow steps", () => {
  const fund = clone(mock.fund);
  const tones = fund.content.personTypes.map((type) => typeToneOf(fund, type.key));
  assert.deepEqual(tones.slice(0, 5), ["blue", "teal", "apricot", "pink", "lav"]);
  if (tones.length > 5) assert.equal(tones[5], "blue");
  assert.equal(typeToneOf(fund, null), "pink");
  for (const type of fund.content.personTypes) {
    const step = fund.content.steps.findIndex((entry) => entry.personTypeKeys.includes(type.key));
    assert.equal(typeStepNumber(fund.content, type.key), step + 1);
  }
  assert.equal(typeStepNumber(fund.content, "nobody"), 1);
});

test("prep lines: who / met / last contact, one line per used fact, then in common (no record → no line)", () => {
  const prep = clone(mock.fund.home!.actions[0]!.prep!);
  const lines = prepLines(prep);
  const order = lines.map((line) => (line.kind === "fact" ? `fact:${line.fact.id}` : line.row.key));
  const expected = [
    ...["who", "met", "last_contact"].filter((key) => prep.rows.some((row) => row.key === key)),
    ...prep.usedFacts.map((fact) => `fact:${fact.id}`),
    ...["common", "when_where", "about", "plan_fit"].filter((key) => prep.rows.some((row) => row.key === key)),
  ];
  assert.deepEqual(order, expected);
  assert.equal(order.includes("last_contact"), false, "the fixture card has no last contact (gap: interaction)");
  assert.deepEqual(prepLines({ ...prep, rows: [], usedFacts: [] }), []);
});

test("marks: pieces cut at the ranges, clamped, reversed ones ignored; the opener underlines are its refs", () => {
  assert.deepEqual(markedPieces("abcdef", [{ end: 4, start: 2 }]), [{ marked: false, text: "ab" }, { marked: true, text: "cd" }, { marked: false, text: "ef" }]);
  assert.deepEqual(markedPieces("abc", [{ end: 99, start: 1 }, { end: 1, start: 2 }]), [{ marked: false, text: "a" }, { marked: true, text: "bc" }]);
  assert.deepEqual(markedPieces("abc", []), [{ marked: false, text: "abc" }]);
  const prep = mock.fund.home!.actions[0]!.prep!;
  const pieces = draftPieces(prep);
  assert.equal(pieces.map((piece) => piece.text).join(""), prep.draft.text);
  assert.deepEqual(pieces.filter((piece) => piece.marked).map((piece) => piece.text), prep.draft.refs.map((ref) => prep.draft.text.slice(ref.start, ref.end)));
});

test("date chip, optimistic tick, merges that keep the last seats, events met, fact length", () => {
  assert.equal(monthDay("2025-09-18"), "09/18");
  assert.equal(monthDay("2025-09-18T10:00:00Z"), "09/18");
  assert.equal(monthDay(null), "");
  assert.equal(monthDay("soon"), "");

  const home = clone(mock.fund.home!);
  const key = home.actions[0]!.actionKey;
  const ticked = withDone(home, key, true);
  assert.equal(ticked.actions[0]!.done, true);
  assert.equal(ticked.actions.slice(1).every((action, index) => action.done === home.actions[index + 1]!.done), true);
  const { seats, ...answer } = ticked;
  assert.deepEqual(mergeHome(home, answer).seats, seats);
  assert.equal(mergeHome(null, answer).seats, undefined);
  const fresh = { ...answer, seats: [] };
  assert.deepEqual(mergeHome(home, fresh).seats, []);

  const fund = clone(mock.fund);
  assert.equal(eventsDoneOf(fund), 0);
  const segment = fund.score.segments.find((entry) => entry.key === "event");
  if (segment) {
    segment.earned = fund.content.event.allocation;
    assert.equal(eventsDoneOf(fund), fund.content.event.targetCount);
  }

  assert.equal(factTextOk("  "), false);
  assert.equal(factTextOk("上海で 3 年"), true);
  assert.equal(factTextOk("あ".repeat(80)), true);
  assert.equal(factTextOk("あ".repeat(81)), false);
});
