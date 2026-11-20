import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEvalEnvironment, EvalEnvironmentError, isEvalDatabaseName, isEvalLineName, isWorkerDatabaseName } from "./lib/env-guard";
import { evalPathsForRuns } from "./lib/eval-env";
import { evalPaths } from "./lib/paths";

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

/**
 * harness/eval-parallel-workers: `agent-eval:run -- --workers N`. Worker 1 is today's environment exactly;
 * worker k ≥ 2 gets its own local database orbit_agent_eval_w<k>, port 3110 + k − 1, trace directory,
 * server state file and file storage. Every database URL of a worker is pinned to its own database.
 */
test("worker 1 is the plain eval environment; worker k gets its own database, port, trace and storage", () => {
  const plain = buildEvalEnvironment({ PATH: "/usr/bin" }, good);
  assert.deepEqual(buildEvalEnvironment({ PATH: "/usr/bin" }, good, { worker: 1 }), plain);
  const w3 = buildEvalEnvironment({ PATH: "/usr/bin", ORBIT_EVENT_DATABASE_URL: "postgresql://u@ep-remote.neon.tech/db" }, good, { worker: 3 });
  assert.equal(w3.database.name, "orbit_agent_eval_w3");
  assert.equal(w3.database.host, "127.0.0.1");
  assert.equal(w3.port, 3112);
  assert.equal(w3.worker, 3);
  for (const key of ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"]) {
    assert.equal(w3.env[key], "postgresql://eval@127.0.0.1:5432/orbit_agent_eval_w3", key);
  }
  assert.equal(w3.env.PORT, "3112");
  assert.match(w3.env.ORBIT_EXPO_PUSH_ENDPOINT, /^http:\/\/127\.0\.0\.1:3112\/__agent-eval\//u);
  assert.equal(w3.env.ORBIT_AGENT_TRACE_DIR, "/tmp/agent-eval-test-home/env/trace/w3");
  assert.equal(w3.env.ORBIT_BATCH_UPLOAD_DIR, "/tmp/agent-eval-test-home/env/storage/w3/batch-uploads");
  assert.equal(w3.env.ORBIT_LOCAL_EXPORT_STORAGE_DIR, "/tmp/agent-eval-test-home/env/storage/w3/exports");
  assert.equal(evalPaths(w3.env).stateFile, "/tmp/agent-eval-test-home/env/server-w3.json");
  assert.equal(evalPaths(w3.env).snapshots, evalPaths(plain.env).snapshots, "workers restore the same snapshots");
  assert.equal(evalPaths(w3.env).runs, evalPaths(plain.env).runs, "workers write into the same run directory");
  assert.equal(plain.env.ORBIT_AGENT_EVAL_WORKER, undefined);
});

test("a worker number outside 1–16 is refused, and so is a worker port of 3000 or 3100", () => {
  assert.throws(() => buildEvalEnvironment({}, good, { worker: 0 }), /worker/u);
  assert.throws(() => buildEvalEnvironment({}, good, { worker: 17 }), /worker/u);
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_AGENT_EVAL_PORT: "3098" }, { worker: 3 }), /never uses port 3100/u);
});

test("only orbit_agent_eval and orbit_agent_eval_w<k> are eval database names", () => {
  assert.equal(isEvalDatabaseName("orbit_agent_eval"), true);
  assert.equal(isEvalDatabaseName("orbit_agent_eval_w2"), true);
  assert.equal(isEvalDatabaseName("orbit_agent_eval_w"), false);
  assert.equal(isEvalDatabaseName("orbit_events"), false);
  assert.equal(isEvalDatabaseName("orbit_agent_eval_w2x"), false);
  assert.equal(isWorkerDatabaseName("orbit_agent_eval"), false, "the main eval database is never a worker's (never dropped by cleanup)");
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_w4"), true);
});

/**
 * harness/eval-lines: a second checkout runs its own eval at the same time. Its env file names a line; the line
 * has its own database (and worker databases), and must bring its own port and home directory.
 */
const lineEnv = { ...good, ORBIT_AGENT_EVAL_LINE: "ag14", ORBIT_LOCAL_DATABASE_URL: "postgresql://eval@127.0.0.1:5432/orbit_agent_eval_ag14", ORBIT_AGENT_EVAL_PORT: "3130", ORBIT_AGENT_EVAL_HOME: "/tmp/agent-eval-test-home-ag14" };

test("a line runs on its own database, port and home; its workers get the line's own worker databases", () => {
  const main = buildEvalEnvironment({ PATH: "/usr/bin" }, good);
  assert.equal(main.line, null);
  const line = buildEvalEnvironment({ PATH: "/usr/bin" }, lineEnv);
  assert.equal(line.line, "ag14");
  assert.equal(line.database.name, "orbit_agent_eval_ag14");
  assert.equal(line.port, 3130);
  assert.notEqual(evalPaths(line.env).snapshots, evalPaths(main.env).snapshots, "a line restores its own snapshots");
  assert.notEqual(evalPaths(line.env).runs, evalPaths(main.env).runs);
  const w2 = buildEvalEnvironment({ PATH: "/usr/bin" }, lineEnv, { worker: 2 });
  assert.equal(w2.database.name, "orbit_agent_eval_ag14_w2");
  assert.equal(w2.port, 3131);
  for (const key of ["ORBIT_LOCAL_DATABASE_URL", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"]) {
    assert.equal(w2.env[key], "postgresql://eval@127.0.0.1:5432/orbit_agent_eval_ag14_w2", key);
  }
});

test("a line is refused on the main database, without its own port or home, or with a name that is not a line name", () => {
  assert.throws(() => buildEvalEnvironment({}, { ...lineEnv, ORBIT_LOCAL_DATABASE_URL: good.ORBIT_LOCAL_DATABASE_URL }), /must be orbit_agent_eval_ag14/u);
  assert.throws(() => buildEvalEnvironment({}, { ...good, ORBIT_LOCAL_DATABASE_URL: lineEnv.ORBIT_LOCAL_DATABASE_URL }), /must be orbit_agent_eval,/u, "the main eval never runs on a line's database");
  const { ORBIT_AGENT_EVAL_PORT: _port, ...noPort } = lineEnv;
  assert.throws(() => buildEvalEnvironment({}, noPort), /its own ORBIT_AGENT_EVAL_PORT/u);
  const { ORBIT_AGENT_EVAL_HOME: _home, ...noHome } = lineEnv;
  assert.throws(() => buildEvalEnvironment({}, noHome), /its own ORBIT_AGENT_EVAL_PORT and ORBIT_AGENT_EVAL_HOME/u);
  for (const bad of ["w3", "AG14", "a", "ag-14", "ag14; drop", "orbit_events"]) {
    assert.equal(isEvalLineName(bad), false, bad);
    assert.throws(() => buildEvalEnvironment({}, { ...lineEnv, ORBIT_AGENT_EVAL_LINE: bad }), EvalEnvironmentError, bad);
  }
});

test("a line's worker databases are only its own: the main eval and other lines never match", () => {
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_ag14_w2", "ag14"), true);
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_ag14", "ag14"), false, "a line's main database is never dropped by cleanup");
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_w2", "ag14"), false);
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_ag15_w2", "ag14"), false);
  assert.equal(isWorkerDatabaseName("orbit_agent_eval_ag14_w2"), false, "the main eval never manages a line's worker");
  assert.equal(isEvalDatabaseName("orbit_agent_eval_ag14", "ag14"), true);
  assert.equal(isEvalDatabaseName("orbit_agent_eval_ag14"), false);
});

test("judge-pack and report find a line's runs: the env file's home is used unless the shell names one", () => {
  const fromFile = evalPathsForRuns({}, () => ({ ORBIT_AGENT_EVAL_HOME: "/tmp/agent-eval-test-home-ag14" }));
  assert.equal(fromFile.runs, "/tmp/agent-eval-test-home-ag14/runs");
  const shellWins = evalPathsForRuns({ ORBIT_AGENT_EVAL_HOME: "/tmp/elsewhere" }, () => ({ ORBIT_AGENT_EVAL_HOME: "/tmp/agent-eval-test-home-ag14" }));
  assert.equal(shellWins.runs, "/tmp/elsewhere/runs");
  const noFile = evalPathsForRuns({ HOME: "/Users/someone" }, () => {
    throw new Error("no env file");
  });
  assert.match(noFile.runs, /orbit-sprint-evidence\/agent-eval\/runs$/u);
});
