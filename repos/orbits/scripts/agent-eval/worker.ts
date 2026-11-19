/**
 * One worker of `npm run agent-eval:run -- … --workers N` (harness/eval-parallel-workers). Not run by hand:
 * run.ts forks it with `--worker k --run-id … --run-dir …`.
 *
 * It runs in its own process with worker k's eval environment (database, port, trace directory), so the
 * runner's in-process world writer and the product services it uses talk to worker k's database only. It
 * self-checks its environment, then takes cases one at a time from the parent and runs each with runCase,
 * from a fresh world, exactly as the sequential loop in run.ts does. At the end it settles the run-level
 * checks of the cases it kept (README §4: hard-checks.json is rewritten in place) and exits.
 */
import { loadAreaFiles, type EvalCase } from "../../tests/agent-eval/lib/cases";
import { applyEvalEnvironment, loadEvalEnvironment } from "../../tests/agent-eval/lib/eval-env";
import type { FromWorker, ToWorker } from "../../tests/agent-eval/lib/parallel";
import { crashedOutcome, settleRunLevelChecks } from "../../tests/agent-eval/lib/run-files";
import { runCase, type CaseOutcome, type RunnerContext } from "../../tests/agent-eval/lib/runner";
import { runSelfCheck } from "../../tests/agent-eval/lib/selfcheck";
import { serverControl } from "../../tests/agent-eval/lib/server";

function flag(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

const send = (message: FromWorker) => new Promise<void>((resolve) => process.send!(message, () => resolve()));

async function main(argv: readonly string[]): Promise<void> {
  if (!process.send) throw new Error("worker.ts is started by agent-eval:run --workers N, not by hand.");
  const worker = Number(flag(argv, "--worker"));
  const runId = flag(argv, "--run-id")!;
  const runDir = flag(argv, "--run-dir")!;
  const environment = loadEvalEnvironment({ worker });
  applyEvalEnvironment(environment, { paidKeys: true });
  // The parent going away (Ctrl-C, a crash) ends the worker; the parent removes its server and database.
  process.on("disconnect", () => process.exit(1));
  const sealed = argv.includes("--sealed");
  const areaFiles = loadAreaFiles({ sealed });
  const fileOf = new Map(areaFiles.flatMap((file) => file.cases.map((testCase) => [testCase.id, file] as const)));
  const worlds = (flag(argv, "--worlds") ?? "").split(",").filter(Boolean);
  const selfCheck = await runSelfCheck(environment, worlds);
  await send({ failed: selfCheck.checks.filter((check) => !check.ok).map((check) => check.name), selfCheck, selfCheckOk: selfCheck.ok, type: "ready", worker });
  const ctx: RunnerContext = { areaCases: Object.fromEntries(areaFiles.map((file) => [file.area, file.cases as EvalCase[]])), currentWorld: null, environment, runDir, runId, seedCards: argv.includes("--seed-cards"), writer: null };
  const outcomes = new Map<string, CaseOutcome>();
  let queue = Promise.resolve();
  process.on("message", (message: ToWorker) => {
    // One message at a time: a case runs to its end before the next message is looked at.
    queue = queue.then(async () => {
      if (message.type === "case") {
        const file = fileOf.get(message.caseId);
        const testCase = file?.cases.find((item) => item.id === message.caseId) as EvalCase | undefined;
        let outcome: CaseOutcome;
        try {
          if (!testCase || !file) throw new Error(`case ${message.caseId} is not in the case files`);
          outcome = await runCase(testCase, file.new_patches ?? {}, file.area, ctx);
        } catch (caseError) {
          // A runner failure fails this case and the run goes on.
          outcome = crashedOutcome({ id: message.caseId }, file?.area ?? "", runDir, caseError);
        }
        outcomes.set(message.caseId, outcome);
        const { observation: _observation, ...rest } = outcome;
        await send({ attempt: message.attempt, caseId: message.caseId, outcome: rest, type: "done", worker });
        return;
      }
      if (message.type === "settle") {
        await ctx.writer?.close();
        // Back to idle: no case context, real time (as run.ts does after its loop).
        await serverControl(environment, "context", { caseId: null, clock: new Date().toISOString(), runId: null });
        const kept = message.keep.map((id) => outcomes.get(id)).filter((outcome): outcome is CaseOutcome => Boolean(outcome));
        settleRunLevelChecks(kept, message.run);
        await send({ results: kept.map((outcome) => ({ caseId: outcome.caseId, checks: outcome.checks, hardPass: outcome.hardPass })), type: "settled", worker });
        process.disconnect();
        process.exit(0);
      }
    }).catch(async (error) => {
      await send({ error: error instanceof Error ? error.stack ?? error.message : String(error), type: "fatal", worker });
      process.exit(1);
    });
  });
}

main(process.argv.slice(2)).catch(async (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (process.send) await send({ error: message, type: "fatal", worker: Number(flag(process.argv, "--worker")) });
  console.error(message);
  process.exit(1);
});
