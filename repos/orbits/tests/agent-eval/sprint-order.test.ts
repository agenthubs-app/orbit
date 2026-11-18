import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { loadAreaFiles, selectCases, SPRINT_EXECUTION_ORDER, sprintOrder } from "./lib/cases";
import { SPRINTS_MD } from "./lib/paths";

/**
 * agent-design AG12 run-02 (coordinator, REF ×5): sprints run in dependency order, not number order — AG11 depends on AG13
 * and runs after it (SPRINTS.md 登记表). "Not later than this sprint" for the invariant pack, a case's `gate` and a rubric
 * item's `gate` compare positions in SPRINT_EXECUTION_ORDER (eval README §6, §3.3).
 */

function registry(): { id: string; deps: string[] }[] {
  return fs.readFileSync(SPRINTS_MD, "utf8").split(/\r?\n/u).map((line) => line.split("|").map((cell) => cell.trim())).filter((cells) => /^AG\d{2}$/u.test(cells[1] ?? "")).map((cells) => ({ deps: [...(cells[4] ?? "").matchAll(/AG\d{2}/gu)].map((match) => match[0]), id: cells[1] }));
}

test("the execution order holds every sprint of the registry once, each after the sprints it depends on", () => {
  const rows = registry();
  assert.deepEqual([...SPRINT_EXECUTION_ORDER].sort(), rows.map((row) => row.id).sort());
  for (const row of rows) for (const dep of row.deps) assert.ok(sprintOrder(dep) < sprintOrder(row.id), `${row.id} depends on ${dep}`);
  assert.ok(sprintOrder("AG13") < sprintOrder("AG11") && sprintOrder("AG11") < sprintOrder("AG14"));
  assert.ok(sprintOrder("AG10") < sprintOrder("AG12") && sprintOrder("AG12") < sprintOrder("AG13"));
  assert.throws(() => sprintOrder("AG99"));
});

test("the AG12 gate has no AG11 invariants; the AG11 gate has its own REF cases except those gated to AG14; AG14 has them", () => {
  const files = loadAreaFiles();
  const ag12 = selectCases(files, { gate: "AG12" }).cases.map((item) => item.id);
  assert.ok(!ag12.some((id) => id.startsWith("AE-REF-")), ag12.filter((id) => id.startsWith("AE-REF-")).join(", "));
  assert.ok(ag12.includes("AE-CON-001") && ag12.includes("AE-BND-001"));
  const ag11 = selectCases(files, { gate: "AG11" }).cases.map((item) => item.id);
  for (const id of ["AE-REF-002", "AE-REF-006", "AE-REF-008"]) assert.ok(ag11.includes(id), id);
  for (const id of ["AE-REF-001", "AE-REF-005", "AE-REF-007"]) assert.ok(!ag11.includes(id), `${id} is gated to AG14`);
  assert.ok(ag11.includes("AE-CON-001"), "AG12's invariants run in AG11's gate (AG11 comes after AG12)");
  const ag14 = selectCases(files, { gate: "AG14" }).cases.map((item) => item.id);
  for (const id of ["AE-REF-001", "AE-REF-005", "AE-REF-007"]) assert.ok(ag14.includes(id), id);
});
