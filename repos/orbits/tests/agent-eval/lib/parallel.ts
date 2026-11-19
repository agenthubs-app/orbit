/**
 * harness/eval-parallel-workers: `npm run agent-eval:run -- … --workers N`.
 *
 * Worker 1 is today's eval environment (orbit_agent_eval, port 3110, the running eval server). Worker k ≥ 2
 * gets its own local database orbit_agent_eval_w<k> restored from the same seeded snapshot, and its own server
 * on port 3110 + k − 1 started from the same `.next` build, with its own trace directory and file storage.
 * Each worker is a child process (scripts/agent-eval/worker.ts) that takes cases one at a time from the
 * parent's queue and runs each from a fresh world, exactly as the sequential loop does.
 *
 * Everything a worker creates is removed again on exit, Ctrl-C or failure: its server, its database, its trace
 * and storage directories. The main eval server and orbit_agent_eval are never stopped or dropped.
 */
import { fork, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { BuildIdentity } from "./build-identity";
import type { EvalEnvironment } from "./env-guard";
import { evalDatabaseName, isWorkerDatabaseName, MAX_EVAL_WORKERS } from "./env-guard";
import { loadEvalEnvironment, processAlive, readServerState, type ServerState } from "./eval-env";
import { evalPaths, ORBITS_ROOT } from "./paths";
import { crashedOutcome } from "./run-files";
import type { CaseOutcome } from "./runner";
import type { CheckResult } from "./hard-checks";
import type { SelfCheckResult } from "./selfcheck";
import { serverControl, startServer } from "./server";
import { databaseArgs, RESTORE_LOCK_ENV, restoreSnapshot } from "./snapshot";
import type { TraceEvent } from "./trace-log";

export const WORKER_SCRIPT = path.join(ORBITS_ROOT, "scripts", "agent-eval", "worker.ts");

const BIN = "/opt/homebrew/bin";
const bin = (name: string) => (fs.existsSync(`${BIN}/${name}`) ? `${BIN}/${name}` : name);

/** What a worker sends back for one case: the outcome without the in-memory observation. */
export type WorkerOutcome = Omit<CaseOutcome, "observation">;

export type ToWorker =
  | { type: "case"; caseId: string; attempt: number }
  | { type: "settle"; run: Record<string, unknown>; keep: string[] };

export type FromWorker =
  | { type: "ready"; worker: number; selfCheck: unknown; selfCheckOk: boolean; failed: string[] }
  | { type: "done"; worker: number; caseId: string; attempt: number; outcome: WorkerOutcome }
  | { type: "settled"; worker: number; results: { caseId: string; checks: CheckResult[]; hardPass: boolean }[] }
  | { type: "fatal"; worker: number; error: string };

/** A case's model or judgment responses refused with 429 (the provider's rate limit). */
export function rateLimitedResponses(events: readonly TraceEvent[]): number {
  return events.filter((event) => /\.response$/u.test(event.type) && (event.type.startsWith("model") || event.type.startsWith("judgment")) && Number(event.status) === 429).length;
}

/** Bounded retry of a rate-limited case: at most `MAX_RATE_LIMIT_RETRIES` more attempts, waiting longer each time. */
export const MAX_RATE_LIMIT_RETRIES = 2;
export function rateLimitBackoffMs(attempt: number): number {
  return 15_000 * attempt;
}

/**
 * A work queue in selection order. A case goes to whichever worker asks next, so a long case never holds
 * up a fixed shard; a rate-limited case can be put back once its backoff has passed.
 */
export class CaseQueue {
  private readonly items: { caseId: string; attempt: number; notBefore: number }[];
  constructor(caseIds: readonly string[]) {
    this.items = caseIds.map((caseId) => ({ attempt: 1, caseId, notBefore: 0 }));
  }
  /** The next case that may start now, or null (`waiting` says whether a later one is still pending). */
  take(now = Date.now()): { caseId: string; attempt: number } | null {
    const index = this.items.findIndex((item) => item.notBefore <= now);
    if (index < 0) return null;
    const [item] = this.items.splice(index, 1);
    return { attempt: item.attempt, caseId: item.caseId };
  }
  retry(caseId: string, attempt: number, notBefore: number): void {
    this.items.push({ attempt, caseId, notBefore });
  }
  get size(): number {
    return this.items.length;
  }
  /** When the earliest waiting case may start (null when nothing is waiting). */
  nextStart(): number | null {
    return this.items.length ? Math.min(...this.items.map((item) => item.notBefore)) : null;
  }
}

/** Outcomes in the order the cases were selected, so summary.json lists them as a sequential run does. */
export function inSelectionOrder<T extends { caseId: string }>(outcomes: readonly T[], caseIds: readonly string[]): T[] {
  const position = new Map(caseIds.map((id, index) => [id, index]));
  return [...outcomes].sort((left, right) => (position.get(left.caseId) ?? 0) - (position.get(right.caseId) ?? 0));
}

function assertWorkerDatabase(environment: EvalEnvironment): void {
  if (environment.worker < 2 || !isWorkerDatabaseName(environment.database.name, environment.line) || !["127.0.0.1", "localhost", "::1"].includes(environment.database.host)) {
    throw new Error(`Refusing to create or drop ${environment.database.name} on ${environment.database.host}: only a parallel worker's local database is managed here.`);
  }
}

function runTool(command: string, args: string[]): void {
  const result = spawnSync(bin(command), args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).slice(0, 2000)}`);
}

/** Worker k's database, fresh: drop any leftover, create it empty and restore the seeded snapshot into it. */
export function prepareWorkerDatabase(environment: EvalEnvironment, snapshotFile: string): void {
  assertWorkerDatabase(environment);
  const { args, name } = databaseArgs(environment.database.url);
  runTool("dropdb", [...args, "--if-exists", "--force", name]);
  runTool("createdb", [...args, name]);
  restoreSnapshot(environment.database.url, snapshotFile);
}

/**
 * Leftover worker databases of this line on this Postgres (from a run that was killed with SIGKILL). Another
 * line's workers (harness/eval-lines) are never listed, so a run never drops a database it does not own.
 */
export function listWorkerDatabases(environment: EvalEnvironment): string[] {
  const { args } = databaseArgs(environment.database.url);
  const pattern = `${evalDatabaseName(environment.line).replace(/_/gu, "\\_")}\\_w%`;
  const result = spawnSync(bin("psql"), [...args, "-d", "postgres", "-Atc", `select datname from pg_database where datname like '${pattern}'`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.split("\n").map((line) => line.trim()).filter((name) => isWorkerDatabaseName(name, environment.line)) : [];
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Stop a detached server's process group (synchronous, so it also works from a signal or exit handler). */
export function stopProcessGroupSync(pid: number): void {
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name);
    } catch {
      try {
        process.kill(pid, name);
      } catch {
        // already gone
      }
    }
  };
  if (!processAlive(pid)) return;
  signal("SIGTERM");
  for (let index = 0; index < 40 && processAlive(pid); index += 1) sleepSync(125);
  if (processAlive(pid)) signal("SIGKILL");
}

/**
 * Remove what worker k ≥ 2 created: its server (from its state file), its database, its trace and storage
 * directories. Synchronous and idempotent; it never touches worker 1 (the main eval server and database).
 * Returns what it did, for the run log.
 */
export function cleanupWorkerSync(environment: EvalEnvironment): string[] {
  assertWorkerDatabase(environment);
  const done: string[] = [];
  const paths = evalPaths(environment.env);
  try {
    const state = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as ServerState;
    if (processAlive(state.pid)) {
      stopProcessGroupSync(state.pid);
      done.push(`stopped server pid ${state.pid} (port ${state.port})`);
    }
  } catch {
    // no state file
  }
  fs.rmSync(paths.stateFile, { force: true });
  const { args, name } = databaseArgs(environment.database.url);
  if (listWorkerDatabases(environment).includes(name)) {
    const dropped = spawnSync(bin("dropdb"), [...args, "--if-exists", "--force", name], { encoding: "utf8" });
    done.push(dropped.status === 0 ? `dropped ${name}` : `could not drop ${name}: ${(dropped.stderr || "").trim()}`);
  }
  // Only the worker's own directories (…/trace/w<k>, …/storage/w<k>); the shared ones are never removed.
  for (const dir of [paths.traceDir, path.dirname(paths.exportsDir)]) {
    if (path.basename(dir) === `w${environment.worker}`) fs.rmSync(dir, { force: true, recursive: true });
  }
  return done;
}

/**
 * Postgres connections one worker (its server's pools plus its runner) uses at its peak. Measured on the AG06
 * gate with --workers 4 (2026-11-17): 18–20 per eval database, 78 in all with the rest of the machine. A
 * --workers 6 run went past max_connections 100 ("sorry, too many clients already") and failed most cases.
 */
export const CONNECTIONS_PER_WORKER = 20;

/** How many workers fit in this Postgres's connection limit, beside the connections other databases hold now. */
export function maxWorkersFor(input: { maxConnections: number; reserved: number; otherConnections: number }): number {
  return Math.max(1, Math.floor((input.maxConnections - input.reserved - input.otherConnections) / CONNECTIONS_PER_WORKER));
}

/** The local Postgres's connection limit and what databases other than the eval ones hold now. */
export function readConnectionBudget(environment: EvalEnvironment): { maxConnections: number; reserved: number; otherConnections: number } | null {
  const { args } = databaseArgs(environment.database.url);
  const result = spawnSync(bin("psql"), [...args, "-d", "postgres", "-AtF", " ", "-c", "select current_setting('max_connections'), current_setting('superuser_reserved_connections'), (select count(*) from pg_stat_activity where datname is null or datname not like 'orbit\\_agent\\_eval%')"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const [maxConnections, reserved, otherConnections] = result.stdout.trim().split(/\s+/u).map(Number);
  return [maxConnections, reserved, otherConnections].every(Number.isFinite) ? { maxConnections, otherConnections, reserved } : null;
}

/** A crashed outcome made by the runner itself (the case never ran): a sign of a sick worker, not of the case. */
export function isRunnerCrash(outcome: Pick<WorkerOutcome, "checks" | "error">): boolean {
  return Boolean(outcome.error) && outcome.checks.length === 1 && outcome.checks[0].check === "runner";
}

/** A worker whose cases crash in the runner this many times in a row gets no more cases; those cases go to the others once. */
export const MAX_CONSECUTIVE_RUNNER_CRASHES = 2;

export interface WorkerServer {
  worker: number;
  port: number;
  pid: number;
  database: string;
  buildId: string | null;
  build: BuildIdentity | null;
  log: string | null;
}

/**
 * Worker 1 is `main` (its server must already run). For k = 2…count: remove any leftover of worker k (and of
 * any other worker a killed run left behind), restore the snapshot into a fresh orbit_agent_eval_w<k>, start
 * its server from the same build. Returns every worker's environment and what its server reports it serves.
 */
export async function prepareWorkers(main: EvalEnvironment, count: number, snapshotFile: string, log: (line: string) => void): Promise<{ environments: EvalEnvironment[]; servers: WorkerServer[] }> {
  const budget = readConnectionBudget(main);
  if (!budget) log("  could not read the Postgres connection limit; not checking that the workers fit in it");
  else if (count > maxWorkersFor(budget)) {
    throw new Error(`--workers ${count} needs about ${count * CONNECTIONS_PER_WORKER} Postgres connections, but this Postgres allows ${budget.maxConnections} (${budget.reserved} reserved, ${budget.otherConnections} held by other databases now); use --workers ${maxWorkersFor(budget)} or raise max_connections.`);
  }
  const environments = [main, ...Array.from({ length: count - 1 }, (_, index) => loadEvalEnvironment({ worker: index + 2 }))];
  // The workers (forked after this, so they inherit it) and this process take turns restoring snapshots.
  process.env[RESTORE_LOCK_ENV] = path.join(evalPaths(main.env).envDir, "restore.lock");
  const leftovers = new Set(listWorkerDatabases(main).map((name) => Number(name.slice(name.lastIndexOf("_w") + 2))));
  for (let worker = 2; worker <= MAX_EVAL_WORKERS; worker += 1) {
    if (leftovers.has(worker) || fs.existsSync(evalPaths({ ...main.env, ORBIT_AGENT_EVAL_WORKER: String(worker) }).stateFile)) {
      for (const line of cleanupWorkerSync(environments[worker - 1] ?? loadEvalEnvironment({ worker }))) log(`  leftover of worker ${worker}: ${line}`);
    }
  }
  for (const environment of environments.slice(1)) prepareWorkerDatabase(environment, snapshotFile);
  await Promise.all(environments.slice(1).map((environment) => startServer(environment)));
  const servers: WorkerServer[] = [];
  for (const environment of environments) {
    const state = readServerState(environment);
    const served = await serverControl<{ build?: BuildIdentity | null }>(environment, "state");
    servers.push({ build: served.build ?? null, buildId: state?.buildId ?? null, database: environment.database.name, log: state?.log ?? null, pid: state?.pid ?? 0, port: environment.port, worker: environment.worker });
  }
  return { environments, servers };
}

export interface RetriedAttempt {
  caseId: string;
  attempt: number;
  worker: number;
  /** rate_limited: a model or judgment call got 429; runner_crash: the runner failed before the case ran (a sick worker). */
  reason: "rate_limited" | "runner_crash";
  rateLimited: number;
  realModelCalls: number;
  movedTo: string;
}

export interface PoolResult {
  outcomes: (WorkerOutcome & { worker: number })[];
  retried: RetriedAttempt[];
  problems: string[];
}

interface Slot {
  worker: number;
  child: ChildProcess;
  alive: boolean;
  busy: { caseId: string; attempt: number } | null;
  /** Runner crashes in a row; at MAX_CONSECUTIVE_RUNNER_CRASHES the worker is retired (gets no more cases). */
  crashes: number;
  retired: boolean;
}

type Listener = (slot: Slot, message: FromWorker | null, code?: number | null) => void;

/**
 * The worker processes and the queue between them. `start` forks one worker per environment and waits until
 * each has self-checked; `run` hands out cases until every case has a final outcome; `settle` has every worker
 * settle the run-level checks of the cases it holds; `kill` ends any worker still running.
 */
export class WorkerPool {
  private readonly slots: Slot[] = [];
  private readonly listeners = new Set<Listener>();
  /** `script`: the worker program (tests pass a stand-in; run.ts uses scripts/agent-eval/worker.ts). */
  constructor(private readonly environments: readonly Pick<EvalEnvironment, "worker">[], private readonly options: { runId: string; runDir: string; seedCards: boolean; sealed: boolean; worlds: readonly string[]; script?: string; backoffMs?: (attempt: number) => number }) {}

  async start(): Promise<Map<number, { ok: boolean; failed: string[]; selfCheck: SelfCheckResult }>> {
    const ready = new Map<number, { ok: boolean; failed: string[]; selfCheck: SelfCheckResult }>();
    await new Promise<void>((resolve, reject) => {
      for (const environment of this.environments) {
        const args = ["--worker", String(environment.worker), "--run-id", this.options.runId, "--run-dir", this.options.runDir, "--worlds", this.options.worlds.join(","), ...(this.options.seedCards ? ["--seed-cards"] : []), ...(this.options.sealed ? ["--sealed"] : [])];
        const child = fork(this.options.script ?? WORKER_SCRIPT, args, { cwd: ORBITS_ROOT, execArgv: ["--import", "tsx"], stdio: ["ignore", "inherit", "inherit", "ipc"] });
        const slot: Slot = { alive: true, busy: null, child, crashes: 0, retired: false, worker: environment.worker };
        this.slots.push(slot);
        child.on("message", (message: FromWorker) => {
          if (message.type === "ready") {
            ready.set(slot.worker, { failed: message.failed, ok: message.selfCheckOk, selfCheck: message.selfCheck as SelfCheckResult });
            if (ready.size === this.environments.length) resolve();
          } else if (message.type === "fatal" && !ready.has(slot.worker)) {
            reject(new Error(`worker ${slot.worker} failed before it was ready: ${message.error.split("\n")[0]}`));
          }
          for (const listener of this.listeners) listener(slot, message);
        });
        child.on("exit", (code) => {
          slot.alive = false;
          if (!ready.has(slot.worker)) reject(new Error(`worker ${slot.worker} exited (code ${code}) before it was ready`));
          for (const listener of this.listeners) listener(slot, null, code);
        });
      }
    });
    return ready;
  }

  /** Hands out cases (a work queue, not fixed shards) until every case has a final outcome. */
  run(caseIds: readonly string[], areaOf: (caseId: string) => string, onDone: (outcome: WorkerOutcome & { worker: number }, finished: number) => void): Promise<PoolResult> {
    const queue = new CaseQueue(caseIds);
    const outcomes = new Map<string, WorkerOutcome & { worker: number }>();
    const retried: RetriedAttempt[] = [];
    const problems: string[] = [];
    const crashRequeued = new Set<string>();
    let timer: NodeJS.Timeout | null = null;
    return new Promise<PoolResult>((resolve) => {
      const finish = (caseId: string, outcome: WorkerOutcome & { worker: number }) => {
        outcomes.set(caseId, outcome);
        onDone(outcome, outcomes.size);
      };
      const pump = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
        for (const slot of this.slots) {
          if (!slot.alive || slot.retired || slot.busy) continue;
          const item = queue.take();
          if (!item) break;
          slot.busy = item;
          slot.child.send({ attempt: item.attempt, caseId: item.caseId, type: "case" } satisfies ToWorker);
        }
        if (!this.slots.some((slot) => slot.alive && !slot.retired) && queue.size) {
          // Fail visibly: no worker is left to run the rest.
          for (let item = queue.take(Number.POSITIVE_INFINITY); item; item = queue.take(Number.POSITIVE_INFINITY)) {
            finish(item.caseId, { ...crashedOutcome({ id: item.caseId }, areaOf(item.caseId), this.options.runDir, new Error("no worker was left to run this case")), worker: 0 });
          }
          problems.push("every worker exited or was retired before the queue was empty");
        }
        if (!queue.size && !this.slots.some((slot) => slot.busy)) {
          this.listeners.delete(listener);
          resolve({ outcomes: caseIds.map((id) => outcomes.get(id)).filter((outcome): outcome is WorkerOutcome & { worker: number } => Boolean(outcome)), problems, retried });
          return;
        }
        const next = queue.nextStart();
        if (next !== null && next > Date.now()) timer = setTimeout(pump, next - Date.now() + 10);
      };
      const listener: Listener = (slot, message, code) => {
        if (message?.type === "done") {
          slot.busy = null;
          const outcome = { ...message.outcome, worker: slot.worker };
          const rateLimited = rateLimitedResponses(outcome.events);
          const keepApart = (reason: RetriedAttempt["reason"]) => {
            const movedTo = path.join(this.options.runDir, "retried", `${message.caseId}-attempt-${message.attempt}`);
            fs.mkdirSync(path.dirname(movedTo), { recursive: true });
            fs.renameSync(outcome.dir, movedTo);
            retried.push({ attempt: message.attempt, caseId: message.caseId, movedTo, rateLimited, realModelCalls: outcome.events.filter((event) => event.type === "model.request" && event.source === "real").length, reason, worker: slot.worker });
          };
          const crashed = isRunnerCrash(outcome);
          slot.crashes = crashed ? slot.crashes + 1 : 0;
          if (crashed && slot.crashes >= MAX_CONSECUTIVE_RUNNER_CRASHES && !slot.retired) {
            // A sick worker (its database refused connections in the --workers 6 run) must not run through the queue failing every case.
            slot.retired = true;
            problems.push(`worker ${slot.worker} retired after ${slot.crashes} runner failures in a row (last: ${String(outcome.error).split("\n")[0]})`);
            console.error(`  WORKER PROBLEM: worker ${slot.worker} retired after ${slot.crashes} runner failures in a row`);
          }
          if (crashed && !crashRequeued.has(message.caseId) && this.slots.some((other) => other !== slot && other.alive && !other.retired)) {
            // The runner failed before the case ran: give it once to another worker (it could not run on this one).
            crashRequeued.add(message.caseId);
            keepApart("runner_crash");
            queue.retry(message.caseId, message.attempt + 1, Date.now());
          } else if (rateLimited > 0 && message.attempt <= MAX_RATE_LIMIT_RETRIES) {
            // Harness-side bounded retry (the agent is not changed): keep this attempt's files apart and run the case again from a fresh world.
            keepApart("rate_limited");
            const backoff = (this.options.backoffMs ?? rateLimitBackoffMs)(message.attempt);
            console.log(`  ${message.caseId}: ${rateLimited} rate-limited (429) response(s) on worker ${slot.worker}; attempt ${message.attempt} kept in retried/, again in ${backoff / 1000}s`);
            queue.retry(message.caseId, message.attempt + 1, Date.now() + backoff);
          } else {
            finish(message.caseId, outcome);
          }
          pump();
        } else if (message?.type === "fatal") {
          problems.push(`worker ${slot.worker}: ${message.error.split("\n")[0]}`);
        } else if (message === null) {
          if (slot.busy) {
            const { caseId } = slot.busy;
            slot.busy = null;
            finish(caseId, { ...crashedOutcome({ id: caseId }, areaOf(caseId), this.options.runDir, new Error(`worker ${slot.worker} exited (code ${code}) while running this case`)), worker: slot.worker });
            problems.push(`worker ${slot.worker} exited (code ${code}) during ${caseId}`);
          }
          pump();
        }
      };
      this.listeners.add(listener);
      pump();
    });
  }

  /** Each worker settles the run-level checks of the cases whose final outcome it holds, then exits. */
  async settle(run: Record<string, unknown>, owner: ReadonlyMap<string, number>): Promise<{ results: Map<string, { checks: CheckResult[]; hardPass: boolean }>; problems: string[] }> {
    const results = new Map<string, { checks: CheckResult[]; hardPass: boolean }>();
    const problems: string[] = [];
    await Promise.all(this.slots.map((slot) => new Promise<void>((resolve) => {
      const keep = [...owner.entries()].filter(([, worker]) => worker === slot.worker).map(([caseId]) => caseId);
      if (!slot.alive) {
        if (keep.length) problems.push(`worker ${slot.worker} had exited; the run-level checks of ${keep.join(", ")} were not settled`);
        resolve();
        return;
      }
      const listener: Listener = (from, message) => {
        if (from !== slot) return;
        if (message?.type === "settled") for (const item of message.results) results.set(item.caseId, { checks: item.checks, hardPass: item.hardPass });
        if (message?.type === "settled" || message === null) {
          this.listeners.delete(listener);
          if (message === null && keep.some((caseId) => !results.has(caseId))) problems.push(`worker ${slot.worker} exited before it settled its cases`);
          resolve();
        }
      };
      this.listeners.add(listener);
      slot.child.send({ keep, run, type: "settle" } satisfies ToWorker);
    })));
    return { problems, results };
  }

  kill(): void {
    for (const slot of this.slots) if (slot.alive) slot.child.kill("SIGTERM");
  }
}

/**
 * Cleanup on every way out: normal end, failure, Ctrl-C (SIGINT), SIGTERM, SIGHUP. The handler is synchronous,
 * so it also runs from process 'exit'. Returns a function that runs it now (once).
 */
export function installCleanup(cleanup: () => void): () => void {
  let done = false;
  const runOnce = () => {
    if (done) return;
    done = true;
    cleanup();
  };
  process.once("exit", runOnce);
  // `on`, not `once`: Ctrl-C reaches this process twice (from the terminal and relayed by tsx), and a second
  // signal with no listener left would kill it halfway through the cleanup. The cleanup starts on the next
  // turn: tsx relays the signal and SIGKILLs a child that has not acknowledged it within 30 ms, and the
  // acknowledgement (tsx's preflight, over IPC) only leaves once this turn ends.
  let started = false;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      if (started || done) return;
      started = true;
      console.error(`agent-eval:run: ${signal} — stopping the workers and removing their servers and databases…`);
      setTimeout(() => {
        runOnce();
        process.exit(130);
      }, 200);
    });
  }
  return runOnce;
}
