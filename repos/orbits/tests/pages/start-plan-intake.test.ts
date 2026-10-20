import assert from "node:assert/strict";
import test from "node:test";

import { resumeOrCreateOnboardingIntake } from "../../app/(app)/app/start/start-plan-intake";

test("same-name Task intake is ignored; only a matching onboarding detail resumes", async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const fetcher = async (path: string, options?: RequestInit) => {
    calls.push({ path, body: options?.body ? JSON.parse(String(options.body)) : null });
    const data = path.endsWith("/intakes") && !options?.body
      ? { intakes: [{ intakeId: "task", goal: "資金調達" }, { intakeId: "onboard", goal: "資金調達" }] }
      : path.endsWith("/task")
        ? { intakeId: "task", source: "task", goal: "資金調達", goalKind: "fundraising", href: "/app/plans/flow/task" }
        : { intakeId: "onboard", source: "onboarding", goal: "資金調達", goalKind: "fundraising", href: "/app/plans/flow/onboard" };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  };
  const href = await resumeOrCreateOnboardingIntake({ fetcher: fetcher as typeof fetch, goalText: "資金調達", goalKind: "fundraising", idempotencyKey: "same-action", language: "ja" });
  assert.equal(href, "/app/plans/flow/onboard");
  assert.equal(calls.some((call) => (call.body as { source?: string } | null)?.source === "onboarding"), false);
});

test("new intake sends strict source and stable key, then checks Web href", async () => {
  const calls: unknown[] = [];
  const fetcher = async (_path: string, options?: RequestInit) => {
    if (!options?.body) return new Response(JSON.stringify({ success: true, data: { intakes: [] } }), { status: 200 });
    calls.push(JSON.parse(String(options.body)));
    return new Response(JSON.stringify({ success: true, data: { intakeId: "new", source: "onboarding", goal: "資金調達", goalKind: "fundraising", href: "/app/plans/flow/new" } }), { status: 200 });
  };
  assert.equal(await resumeOrCreateOnboardingIntake({ fetcher: fetcher as typeof fetch, goalText: "資金調達", goalKind: "fundraising", idempotencyKey: "same-action", language: "ja" }), "/app/plans/flow/new");
  assert.deepEqual(calls, [{ goalText: "資金調達", goalKind: "fundraising", source: "onboarding", idempotencyKey: "same-action" }]);
});
