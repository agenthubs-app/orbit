import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SCRIPT, createCompletionRuntimeFixture } from "../tests/support/completion-runtime-fixture";
import type { RuntimeScenarios } from "../tests/support/completion-runtime-scenarios";

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    try { await access(APP_SCRIPT); } catch { throw new Error("MISSING_APP_CONSUMER_TASK1_INCOMPLETE"); }
  }
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--web-only" || !["auth", "experience", "current", "legacy", "contacts", "tasks", "conversation", "registration"].includes(args[1]))) throw new Error("INVALID_RUNTIME_ARGUMENTS");
  const fixture = await createCompletionRuntimeFixture();
  console.info(JSON.stringify({ resource: "owned", schema: fixture.schema, nextPid: fixture.nextPid, nextOrigin: fixture.origin, temp: fixture.temp, tableCount: fixture.tableCount }));
  let failed = false;
  let state: RuntimeScenarios | undefined;
  try {
    const { prepareRuntimeScenarios, runWebDiagnostics, runIntegratedRuntime } = await import("../tests/support/completion-runtime-scenarios");
    state = await prepareRuntimeScenarios(fixture);
    console.info(JSON.stringify({ resource: "owned-http", origin: state.origin, pid: process.pid }));
    const result = args.length === 0 ? await runIntegratedRuntime(state) : await runWebDiagnostics(state, args[1]);
    console.info(JSON.stringify({ ...result, pass: true, task1: args.length === 0 ? "RUNTIME_CASES_PASSED_REVIEW_PENDING" : "INCOMPLETE_APP_ACCEPTANCE_PENDING" }));
  } catch (error) {
    failed = true;
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{0,100}$/.test(error.message) ? error.message : "WEB_DIAGNOSTIC_FAILED";
    const frame = error instanceof Error ? error.stack?.match(/completion-runtime-scenarios\.ts:(\d+):\d+/)?.[1] : undefined;
    console.info(JSON.stringify({ case: args[1] ?? "integrated-runtime", pass: false, code, scenarioLine: frame ? Number(frame) : undefined, nextDiagnostics: [...fixture.nextDiagnostics], task1: "INCOMPLETE" }));
  } finally {
    const failures = await fixture.close();
    if (state) {
      state.delivery.clear(); state.owner.cookie = ""; state.foreign.cookie = ""; state.owner.password = ""; state.foreign.password = ""; state.secret = "";
      state.image.fill(0); state.replacement.fill(0); state = undefined;
    }
    delete process.env.AUTH_SECRET;
    console.info(JSON.stringify({ cleanup: failures.length ? "PARTIAL_FAILURE" : "CLOSED", failures }));
    if (failed || failures.length) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{0,100}$/.test(error.message) ? error.message : "RUNTIME_FAILED";
    console.error(JSON.stringify({ pass: false, code, task1: "INCOMPLETE" })); process.exitCode = 1;
  });
}
