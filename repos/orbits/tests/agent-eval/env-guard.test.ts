import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvalEnvironment, EvalEnvironmentError } from "./lib/env-guard";

const good = {
  ORBIT_AGENT_EVAL: "1",
  ORBIT_DATABASE_TARGET: "local",
  ORBIT_LOCAL_DATABASE_URL: "postgresql://eval@127.0.0.1:5432/orbit_agent_eval",
  ORBIT_WORKSPACE_ID: "workspace:agent-eval",
  ORBIT_LOCAL_WORKSPACE_ID: "workspace:agent-eval",
  ORBIT_AGENT_EVAL_PORT: "3110",
  ORBIT_AGENT_EVAL_HOME: "/tmp/agent-eval-test-home",
  DEEPSEEK_API_KEY: "sk-test-not-real",
};

test("a local orbit_agent_eval on port 3110 is accepted and every database URL is pinned to it", () => {
  const result = buildEvalEnvironment({ PATH: "/usr/bin", ORBIT_EVENT_DATABASE_URL: "postgresql://u@ep-remote.neon.tech/db", GEMINI_API_KEY: "x" }, good);
  assert.equal(result.port, 3110);
  assert.equal(result.database.name, "orbit_agent_eval");
  for (const key of ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"]) {
    assert.equal(result.env[key], good.ORBIT_LOCAL_DATABASE_URL, key);
  }
  assert.equal(result.env.NEXT_TELEMETRY_DISABLED, "1");
  assert.equal(result.env.GEMINI_API_KEY, undefined, "the shell's other provider keys never reach the server");
  assert.equal(result.env.ORBIT_BATCH_IMAGE_STORAGE, undefined);
  assert.match(result.env.ORBIT_BATCH_UPLOAD_DIR, /agent-eval-test-home/u);
  assert.match(result.env.ORBIT_EXPO_PUSH_ENDPOINT, /^http:\/\/127\.0\.0\.1:3110\/__agent-eval\//u);
});

test("a remote database address is refused", () => {
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_LOCAL_DATABASE_URL: "postgresql://u@ep-cool.neon.tech/orbit_agent_eval" }), EvalEnvironmentError);
});

test("a local database with the wrong name is refused", () => {
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_LOCAL_DATABASE_URL: "postgresql://u@127.0.0.1:5432/orbit_events" }), /must be orbit_agent_eval/u);
});

test("ports 3000 and 3100 are refused", () => {
  assert.throws(() => buildEvalEnvironment({}, good, { port: 3000 }), /never uses port 3000/u);
  assert.throws(() => buildEvalEnvironment({}, good, { port: 3100 }), /never uses port 3100/u);
});

test("VERCEL_ENV=production or VERCEL is refused", () => {
  assert.throws(() => buildEvalEnvironment({ VERCEL_ENV: "production" }, good), /VERCEL_ENV=production/u);
  assert.throws(() => buildEvalEnvironment({ VERCEL: "1" }, good), /VERCEL set/u);
});

test("a non-eval workspace or a missing eval flag is refused", () => {
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_LOCAL_WORKSPACE_ID: "workspace:orbit-dev", ORBIT_WORKSPACE_ID: "workspace:orbit-dev" }), /workspace/u);
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_AGENT_EVAL: "0" }), /ORBIT_AGENT_EVAL=1/u);
});
