import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";

import { listAreaFiles, loadAreaFile, loadAreaFiles, selectCases } from "./lib/cases";
import { checkAreaFiles, collectRecordReferences, createCheckerContext } from "./lib/case-checker";

const context = createCheckerContext();

function validCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "AE-H-901",
    title: "checker fixture",
    sprint: "AG00",
    split: "dev",
    invariant: false,
    requirement: ["AG-R19"],
    design: ["§9"],
    locale: "zh",
    world: "base-v1",
    steps: [{ user: "把给小林发修订报价这条待办改到周五。" }],
    hard: [{ no_business_writes: true }, { private_reads_within: ["C17", "M31"] }],
    rubric: [{ id: "R1", text: "回答说出了要点。" }],
    ...overrides,
  };
}

function checkOne(testCase: Record<string, unknown>, area = "H", extra: Record<string, unknown> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-checker-"));
  const file = path.join(dir, `${area}.yaml`);
  fs.writeFileSync(file, yaml.dump({ area, proposed_checks: [], proposed_steps: [], new_patches: {}, ...extra, cases: [testCase] }));
  try {
    return checkAreaFiles([loadAreaFile(file)], context);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

test("a well-formed case passes", () => {
  assert.deepEqual(checkOne(validCase()), []);
});

test("a missing required field is reported with the case id and field", () => {
  const { rubric: _rubric, ...withoutRubric } = validCase();
  const issues = checkOne(withoutRubric);
  assert.ok(issues.some((issue) => issue.caseId === "AE-H-901" && issue.field === "rubric" && /missing/u.test(issue.message)));
});

test("a rubric item may carry a gate: a known sprint not earlier than the case's own attribution", () => {
  assert.deepEqual(checkOne(validCase({ rubric: [{ id: "R1", text: "行为" }, { gate: "AG05", id: "R2", text: "内容" }] })), []);
  assert.deepEqual(checkOne(validCase({ rubric: [{ gate: "AG00", id: "R1", text: "同一 sprint" }] })), []);
  const unknown = checkOne(validCase({ rubric: [{ gate: "AG42", id: "R1", text: "x" }] }));
  assert.ok(unknown.some((issue) => issue.field === "rubric[0].gate" && /unknown sprint "AG42"/u.test(issue.message)));
  const notString = checkOne(validCase({ rubric: [{ gate: 5, id: "R1", text: "x" }] }));
  assert.ok(notString.some((issue) => issue.field === "rubric[0].gate"));
  const early = checkOne(validCase({ gate: "AG03", rubric: [{ gate: "AG02", id: "R1", text: "x" }], sprint: "AG00" }), "H");
  assert.ok(early.some((issue) => issue.field === "rubric[0].gate" && /earlier than the case's gate AG03/u.test(issue.message)));
});

test("undefined step and check words are reported", () => {
  const issues = checkOne(validCase({ steps: [{ teleport: { to: "x" } }], hard: [{ looks_good: true }] }));
  assert.ok(issues.some((issue) => issue.field === "steps[0]" && /undefined step word "teleport"/u.test(issue.message)));
  assert.ok(issues.some((issue) => issue.field === "hard[0]" && /undefined check word "looks_good"/u.test(issue.message)));
});

test("a reference to a record the fixture does not have (T99) is reported", () => {
  const issues = checkOne(validCase({ hard: [{ card_ops: [{ op: "todo.update", target: "T99", set: { plannedDate: "2026-11-20" } }] }] }));
  const issue = issues.find((item) => /T99/u.test(item.message));
  assert.ok(issue, JSON.stringify(issues));
  assert.equal(issue.caseId, "AE-H-901");
  assert.equal(issue.field, "hard[0].card_ops[0].target");
});

test("records added by a patch count as known only when the case uses that patch", () => {
  const withPatch = checkOne(validCase({ patches: ["two-quote-todos"], hard: [{ reads_include: ["T43"] }] }));
  assert.deepEqual(withPatch, []);
  const withoutPatch = checkOne(validCase({ hard: [{ reads_include: ["T43"] }] }));
  assert.ok(withoutPatch.some((issue) => /T43/u.test(issue.message)));
});

test("a patch that exists nowhere is reported", () => {
  const issues = checkOne(validCase({ patches: ["no-such-patch"] }));
  assert.ok(issues.some((issue) => issue.field === "patches" && /no-such-patch/u.test(issue.message)));
});

test("a sprint whose gate has no cases of this area is reported", () => {
  const issues = checkOne(validCase({ sprint: "AG05" }));
  assert.ok(issues.some((issue) => issue.field === "sprint" && /AG05's gate/u.test(issue.message)));
});

test("an id that does not match its file's area is reported", () => {
  const issues = checkOne(validCase({ id: "AE-XL-901" }));
  assert.ok(issues.some((issue) => issue.field === "id" && /does not match file area/u.test(issue.message)));
});

test("bulk ids inside a declared range are known, outside it are not", () => {
  const inRange = checkOne(validCase({ world: "regular-v1", account: "regular", hard: [{ reads_include: ["RC1019"] }] }), "SCL");
  assert.deepEqual(inRange.filter((issue) => /RC1019/u.test(issue.message)), []);
  const outOfRange = checkOne(validCase({ world: "regular-v1", account: "regular", hard: [{ reads_include: ["RC1999"] }] }), "SCL");
  assert.ok(outOfRange.some((issue) => /RC1999/u.test(issue.message)));
});

test("record references are found in nested values and prefixed tokens", () => {
  const refs = collectRecordReferences([{ revoke: { read: "memo:M31" } }, { card_ops: [{ set: { "interaction.actualContactIds": ["C17"] } }] }]);
  assert.deepEqual(refs.map((ref) => ref.id).sort(), ["C17", "M31"]);
});

test("the sealed set is not read unless asked for", () => {
  const visible = listAreaFiles();
  assert.ok(visible.length >= 21);
  assert.ok(visible.every((file) => !file.includes(`${path.sep}sealed${path.sep}`)));
});

test("all visible area files pass the checker", () => {
  const files = loadAreaFiles();
  const cases = files.flatMap((file) => file.cases);
  // AG19 added the ANS area (answer layout and record cards).
  assert.equal(files.length, 22);
  // Hotfix 2026-11-20 added AE-RD-011～013, and AE-ANS-012～038 (every suggested question of the App and the Web).
  assert.equal(cases.length, 283);
  assert.deepEqual(checkAreaFiles(files, context), []);
});

test("gate selection: AG00 is the H area, AE-H-006 must run alone, no invariants before AG02", () => {
  const files = loadAreaFiles();
  const selection = selectCases(files, { gate: "AG00" });
  assert.deepEqual(selection.cases.map((item) => item.id), ["AE-H-001", "AE-H-002", "AE-H-003", "AE-H-004", "AE-H-005", "AE-H-007", "AE-H-008"]);
  assert.deepEqual(selection.solo.map((item) => item.id), ["AE-H-006"]);
  assert.deepEqual(selection.invariants, []);
  const ag04 = selectCases(files, { gate: "AG04" });
  assert.ok(ag04.cases.some((item) => item.id === "AE-CTX-006"), "gate field defers CTX-006 to AG04");
  assert.ok(ag04.invariants.length > 0 && ag04.invariants.every((item) => item.invariant));
  assert.ok(!selectCases(files, { gate: "AG03" }).cases.some((item) => item.id === "AE-CTX-006"));
});

test("gate selection (AG03): a case with a rubric item gated to the sprint runs in that gate, once", () => {
  const rubricGated = (gate: string, sprint = "AG01", extra: Record<string, unknown> = {}) => ({ area: "X", cases: [{ id: `AE-X-${gate.slice(2)}1`, invariant: false, rubric: [{ id: "R1", text: "a" }, { gate, id: "R2", text: "b" }, { gate: "AG05", id: "R3", text: "c" }], sprint, steps: [], ...extra }], file: "x.yaml", raw: {}, sealed: false });
  const files = [rubricGated("AG03"), rubricGated("AG04")] as never;
  assert.deepEqual(selectCases(files, { gate: "AG03" }).cases.map((item) => item.id), ["AE-X-031"], "an item gated to AG03 pulls its case into the AG03 gate");
  assert.deepEqual(selectCases(files, { gate: "AG02" }).cases.map((item) => item.id), [], "not into an earlier gate");
  assert.deepEqual(selectCases(files, { gate: "AG05" }).cases.map((item) => item.id), ["AE-X-031", "AE-X-041"], "AG05 items pull both in");
  const invariantToo = [rubricGated("AG03", "AG01", { invariant: true })] as never;
  assert.deepEqual(selectCases(invariantToo, { gate: "AG03" }).cases.map((item) => item.id), ["AE-X-031"], "listed once even when it is also an invariant");
  const real = selectCases(loadAreaFiles(), { gate: "AG03" });
  assert.ok(real.cases.some((item) => item.id === "AE-ENT-003"), "AE-ENT-003 R3 is gated to AG03");
  assert.ok(!real.cases.some((item) => item.id === "AE-ENT-002"), "ENT-002's later items do not pull it into AG03");
});
