import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PlanDraftView, PlanMarkedText } from "../src/api/contract/plan-v2";
import { planDraftViewSchema } from "../src/api/schema/plan-v2";
import { PLAN_ALLOCATION_TOTAL, PLAN_TYPE_TARGET_MAX } from "../src/api/compute/plan-allocation";
import {
  adjustAllocation,
  adjustTargetCount,
  adjustTotals,
  adjustmentsOf,
  draftAdjustStateOf,
  isDraftV3,
  PLAN_DRAFT_ALLOCATION_MAX,
  PLAN_DRAFT_ALLOCATION_MIN,
  sourceNumber,
  sourceStale,
  summarySegments,
  toggleType,
  typeAdjusted,
  typeGroups,
} from "../src/screens/plan/plan-draft-v3-model";

// R36b: the pure rules of the v3 draft page (plan-draft-v5-proposal.html v16「手机」·「初稿 · 确认」).
// The fixture is the orbits mock service's own v3 answers, read through the synced schema.
const mock = JSON.parse(readFileSync(new URL("./fixtures/plan-draft-v3-mock.json", import.meta.url), "utf8"));
const v2 = JSON.parse(readFileSync(new URL("./fixtures/plan-flow-mock.json", import.meta.url), "utf8"));
const draft = planDraftViewSchema.parse(mock.fundraising.draft) as PlanDraftView;
const content = draft.content;

test("isDraftV3: the mock's three v3 drafts are v3, the R23 draft (no schemaVersion) is not", () => {
  for (const kind of ["fundraising", "sales", "hiring"]) assert.equal(isDraftV3((planDraftViewSchema.parse(mock[kind].draft) as PlanDraftView).content), true, kind);
  assert.equal(isDraftV3((planDraftViewSchema.parse(v2.draft) as PlanDraftView).content), false);
  assert.equal(isDraftV3({ ...content, schemaVersion: 2 }), false);
  assert.equal(isDraftV3({ ...content, outcome: "" }), false, "a v3 without the outcome falls back too (the hero cannot render)");
});

test("typeGroups: groups follow steps[].personTypeKeys, not the types' own stepKey (SC-05)", () => {
  const groups = typeGroups(content);
  assert.deepEqual(groups.map((group) => [group.stepIndex, group.types.map((type) => type.key)]), [[0, ["cfo", "funded_founder"]], [1, ["angel", "vc_partner"]], [2, ["cvc", "lawyer"]]], "the event-only step has no group");
  // A type moved by hand from step 1 to step 2: the server keeps the stale stepKey, the steps are the truth.
  const moved = {
    ...content,
    steps: content.steps.map((step) => step.key === "step-1" ? { ...step, personTypeKeys: ["cfo"] } : step.key === "step-2" ? { ...step, personTypeKeys: ["funded_founder", ...step.personTypeKeys] } : step),
  };
  assert.deepEqual(typeGroups(moved).map((group) => group.types.map((type) => type.key)), [["cfo"], ["funded_founder", "angel", "vc_partner"], ["cvc", "lawyer"]]);
  // A type no step names: by its stepKey when that step exists, else the first group.
  const orphan = { ...content, steps: content.steps.map((step) => ({ ...step, personTypeKeys: step.personTypeKeys.filter((key) => key !== "lawyer") })) };
  assert.deepEqual(typeGroups(orphan).map((group) => group.types.map((type) => type.key)), [["cfo", "funded_founder"], ["angel", "vc_partner"], ["cvc", "lawyer"]]);
  const lost = { ...orphan, personTypes: orphan.personTypes.map((type) => type.key === "lawyer" ? { ...type, stepKey: "gone" } : type) };
  assert.deepEqual(typeGroups(lost).map((group) => group.types.map((type) => type.key)), [["cfo", "funded_founder", "lawyer"], ["angel", "vc_partner"], ["cvc"]]);
});

test("adjust state: people 1–5, allocation 5–50 by 5, the total and the 100 check come from plan-allocation", () => {
  let state = draftAdjustStateOf(content);
  assert.deepEqual(adjustTotals(content, state), { eventCount: 2, ok: true, peopleCount: 13, total: 100, typeCount: 6 });
  assert.equal(adjustmentsOf(content, state, draft.revision), null, "nothing changed → no adjustments");
  state = adjustTargetCount(state, "cfo", -1);
  assert.equal(state.types.cfo!.targetCount, 1, "cannot go below 1");
  state = adjustTargetCount(state, "cfo", 1);
  assert.equal(state.types.cfo!.targetCount, 2);
  for (let i = 0; i < 10; i += 1) state = adjustTargetCount(state, "cfo", 1);
  assert.equal(state.types.cfo!.targetCount, PLAN_TYPE_TARGET_MAX);
  assert.equal(typeAdjusted(content, state, "cfo"), true);
  assert.equal(typeAdjusted(content, state, "angel"), false);
  state = adjustAllocation(state, "vc_partner", 5);
  assert.equal(state.types.vc_partner!.allocation, 35);
  assert.deepEqual(adjustTotals(content, state).total, 105);
  assert.equal(adjustTotals(content, state).ok, false, "≠ 100 → not ready");
  for (let i = 0; i < 10; i += 1) state = adjustAllocation(state, "vc_partner", 5);
  assert.equal(state.types.vc_partner!.allocation, PLAN_DRAFT_ALLOCATION_MAX);
  for (let i = 0; i < 20; i += 1) state = adjustAllocation(state, "cfo", -5);
  assert.equal(state.types.cfo!.allocation, PLAN_DRAFT_ALLOCATION_MIN);
  const back = adjustAllocation(draftAdjustStateOf(content), "vc_partner", -10);
  assert.equal(back.types.vc_partner!.allocation, 20);
  assert.deepEqual(adjustmentsOf(content, back, draft.revision), {
    event: { allocation: 10, targetCount: 2 },
    expectedRevision: draft.revision,
    personTypes: content.personTypes.map((type) => ({ allocation: type.key === "vc_partner" ? 20 : type.allocation, key: type.key, targetCount: type.targetCount })),
  });
});

test("toggle: a type taken off leaves the total and the adjustments; the last one cannot be taken off", () => {
  let state = toggleType(draftAdjustStateOf(content), "lawyer");
  assert.equal(state.types.lawyer!.on, false);
  assert.deepEqual(adjustTotals(content, state), { eventCount: 2, ok: false, peopleCount: 12, total: 90, typeCount: 5 });
  assert.deepEqual(adjustmentsOf(content, state, draft.revision)?.personTypes.map((type) => type.key), ["cfo", "funded_founder", "angel", "vc_partner", "cvc"]);
  state = toggleType(state, "lawyer");
  assert.equal(state.types.lawyer!.on, true);
  assert.equal(adjustmentsOf(content, state, draft.revision), null, "restored → unchanged again");
  for (const key of ["cfo", "funded_founder", "angel", "vc_partner", "cvc"]) state = toggleType(state, key);
  assert.deepEqual(Object.values(state.types).filter((type) => type.on).length, 1);
  assert.equal(toggleType(state, "lawyer").types.lawyer!.on, true, "the last type stays");
  // Taking 10 points off and moving them: back to 100 → ready again.
  state = toggleType(draftAdjustStateOf(content), "lawyer");
  state = adjustAllocation(state, "vc_partner", 10);
  assert.equal(adjustTotals(content, state).total, PLAN_ALLOCATION_TOTAL);
  assert.equal(adjustTotals(content, state).ok, true);
});

test("summarySegments: bold by index slices, a source badge after each referenced sentence, unknown sources skipped", () => {
  const segments = summarySegments(content.summary!, content.sources ?? [], draft.premise);
  const text = segments.flatMap((segment) => segment.kind === "text" ? [segment.text] : []).join("");
  assert.equal(text, content.summary!.text, "every character is rendered once");
  assert.deepEqual(segments.flatMap((segment) => segment.kind === "text" && segment.bold ? [segment.text] : []), ["VC がリード", "並行で"]);
  assert.deepEqual(segments.filter((segment) => segment.kind !== "text"), [{ kind: "source", n: 1 }, { kind: "source", n: 2 }, { kind: "source", n: 3 }]);
  // The badge follows the sentence it refers to (ends at the ref's end).
  const firstBadge = segments.findIndex((segment) => segment.kind === "source");
  assert.equal(segments.slice(0, firstBadge).flatMap((segment) => segment.kind === "text" ? [segment.text] : []).join("").length, 30);
  const odd: PlanMarkedText = { marks: [{ end: 99, start: 2 }, { end: 1, start: 3 }], refs: [{ end: 5, ref: { kind: "source", sourceId: "nope" }, start: 0 }, { end: 8, ref: { kind: "answer", questionKey: "F1" }, start: 5 }], text: "あいうえおかきくけこ" };
  const oddSegments = summarySegments(odd, content.sources ?? [], draft.premise);
  assert.equal(oddSegments.flatMap((segment) => segment.kind === "text" ? [segment.text] : []).join(""), odd.text);
  assert.deepEqual(oddSegments.flatMap((segment) => segment.kind === "text" && segment.bold ? [segment.text] : []).join(""), "うえおかきくけこ", "a mark past the end is clamped, a reversed one ignored");
  assert.deepEqual(oddSegments.filter((segment) => segment.kind !== "text"), [{ kind: "answer", label: "ラウンドと金額" }], "the unknown source has no badge; an answer ref shows the premise row");
});

test("sources: numbered by list order; a web source fetched over 180 days ago is stale", () => {
  const sources = content.sources ?? [];
  assert.equal(sourceNumber(sources, "S3"), 3);
  assert.equal(sourceNumber(sources, "S9"), null);
  const web = sources.find((source) => source.kind === "web")!;
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(sourceStale(web, now), false);
  assert.equal(sourceStale({ ...web, fetchedAt: "2026-05-06T00:00:00.000Z" }, now), false, "179.5 days");
  assert.equal(sourceStale({ ...web, fetchedAt: "2026-05-04T00:00:00.000Z" }, now), true, "181.5 days");
  assert.equal(sourceStale(sources[0]!, now), false, "the library has no fetch date");
});
