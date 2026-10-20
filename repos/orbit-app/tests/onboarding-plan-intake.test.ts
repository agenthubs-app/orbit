import assert from "node:assert/strict";
import test from "node:test";

import { resumeOrCreateAppOnboardingIntake } from "../src/api/onboarding-plan-intake";

type IntakeApi = Parameters<typeof resumeOrCreateAppOnboardingIntake>[0];

test("matching Task intake is ignored and a matching onboarding intake resumes", async () => {
  const requested: string[] = [];
  let creates = 0;
  const api = {
    listIntakes: async () => ({ ok: true, data: { intakes: [
      { intakeId: "task", goal: "获取客户" }, { intakeId: "onboarding", goal: "获取客户" },
    ] } }),
    getIntake: async (id: string) => {
      requested.push(id);
      return { ok: true, data: { intakeId: id, goal: "获取客户", goalKind: "sales", source: id === "task" ? "task" : "onboarding", href: `/plans/flow/${id}` } };
    },
    createIntake: async () => { creates += 1; throw new Error("must not create"); },
  } as unknown as IntakeApi;
  assert.deepEqual(await resumeOrCreateAppOnboardingIntake(api, { goalText: "获取客户", goalKind: "sales", idempotencyKey: "action-1" }),
    { ok: true, href: "/plans/flow/onboarding" });
  assert.deepEqual(requested, ["task", "onboarding"]);
  assert.equal(creates, 0);
});

test("new intake sends onboarding source and stable key; a Web href is rejected", async () => {
  const bodies: unknown[] = [];
  const api = {
    listIntakes: async () => ({ ok: true, data: { intakes: [] } }),
    getIntake: async () => { throw new Error("no candidate"); },
    createIntake: async (body: unknown) => {
      bodies.push(body);
      return { ok: true, data: { intakeId: "one", goal: "获取客户", goalKind: "sales", source: "onboarding", href: "/app/plans/flow/one" } };
    },
  } as unknown as IntakeApi;
  assert.deepEqual(await resumeOrCreateAppOnboardingIntake(api, { goalText: " 获取客户 ", goalKind: "sales", idempotencyKey: "same-action" }),
    { ok: false, kind: "contract" });
  assert.deepEqual(bodies, [{ goalText: "获取客户", goalKind: "sales", source: "onboarding", idempotencyKey: "same-action" }]);
});
