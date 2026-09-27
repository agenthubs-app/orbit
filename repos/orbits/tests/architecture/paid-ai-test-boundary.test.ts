import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const fixture = "tests/architecture/fixtures/paid-ai-request.fixture.ts";

function runFixture(env: Record<string, string>) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  delete childEnv.ORBIT_TEST_PAID_AI_LEDGER;
  delete childEnv.NODE_TEST_CONTEXT; // let the nested runner execute its file
  return spawnSync(process.execPath, ["scripts/run-node-tests.mjs", fixture], {
    encoding: "utf8",
    env: childEnv,
  });
}

test("standard test entry fails the run when a test reaches a paid AI provider, even if the product swallows the error", () => {
  const result = runFixture({ DEEPSEEK_API_KEY: "fixture-not-a-real-key", ORBIT_TEST_ALLOW_PAID_AI: "" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /paid AI request\(s\) refused[\s\S]*api\.deepseek\.com [^\n]*paid-ai-request\.fixture\.ts/u);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-not-a-real-key/u);
});

test("the boundary is installed by default and removed only by the explicit opt-in", () => {
  const guarded = runFixture({ PAID_AI_FIXTURE_MODE: "inspect", ORBIT_TEST_ALLOW_PAID_AI: "" });
  assert.equal(guarded.status, 0, guarded.stderr);
  assert.match(guarded.stdout, /fetch-name:paidAiBoundaryFetch/u);

  // Opt-in run inspects fetch only; it never sends a request.
  const optedIn = runFixture({ PAID_AI_FIXTURE_MODE: "inspect", ORBIT_TEST_ALLOW_PAID_AI: "1" });
  assert.equal(optedIn.status, 0, optedIn.stderr);
  assert.doesNotMatch(optedIn.stdout, /fetch-name:paidAiBoundaryFetch/u);
});
