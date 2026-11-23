import fs from "node:fs";
import path from "node:path";

import { evalDatabaseName, type EvalEnvironment } from "./env-guard";
import { baseUrl } from "./eval-env";
import { patchSha256, resolveSnapshotKey, snapshotRecords } from "./patched-world";
import { evalPaths } from "./paths";
import { countWorldRows, serverControl } from "./server";
import { restoreSnapshot } from "./snapshot";
import { loadWorld } from "./world";
import { fileSha256 } from "./yaml";

export interface SeedReportFile {
  world: string;
  accounts: Record<string, { userId: string; email: string }>;
  ids: Record<string, string>;
  counts: Record<string, Record<string, number>>;
  gaps: { record: string; field: string; reason: string }[];
  snapshot: { file: string; sha256: string; createdAt: string };
  fixtureSha256: string;
  generatedSha256: string;
  /** A `<world>+<patch>` snapshot: the replacing patch it was written from. */
  patch?: { name: string; sha256: string };
}

/** `world` is a world name or a `<world>+<patch>` snapshot key (patched-world.ts). */
export function readSeedReport(environment: EvalEnvironment, world: string): SeedReportFile {
  const file = path.join(evalPaths(environment.env).snapshots, `${world}.seed.json`);
  if (!fs.existsSync(file)) throw new Error(`No snapshot for ${world}; run npm run agent-eval:seed first${world.includes("+") ? ` (it writes ${world} for the cases that use the patch; add --sealed for a sealed patch)` : ""}.`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as SeedReportFile;
}

/** What the fixture (with a replacing patch, for a `<world>+<patch>` key) says each account holds, in the kinds the current product can store. */
export function expectedCounts(world: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const bump = (account: string, kind: string) => {
    out[account] ??= {};
    out[account][kind] = (out[account][kind] ?? 0) + 1;
  };
  for (const record of snapshotRecords(world)) {
    const kind = { contact: "contacts", conversation: "conversations", followup: "todos_and_followups", memo: "memos", memory: "memory", my_event: "my_events", platform_event: "platform_events", rule: "rules", schedule: "schedule", todo: "todos_and_followups" }[record.kind as string];
    if (kind) bump(record.account, kind);
  }
  return out;
}

export interface SelfCheckItem {
  name: string;
  ok: boolean;
  detail: unknown;
}

export interface SelfCheckResult {
  ok: boolean;
  checkedAt: string;
  database: { host: string; name: string };
  server: { url: string; environment: Record<string, unknown> | null };
  storage: Record<string, string>;
  worlds: Record<string, { fixtureSha256: string; snapshotSha256: string; snapshotFileSha256: string; expected: Record<string, Record<string, number>>; actual: Record<string, Record<string, number>>; match: boolean; gaps: number }>;
  blockedConnections: unknown[];
  checks: SelfCheckItem[];
}

function countsMatch(expected: Record<string, Record<string, number>>, actual: Record<string, Record<string, number>>): boolean {
  for (const [account, kinds] of Object.entries(expected)) {
    for (const [kind, n] of Object.entries(kinds)) if ((actual[account]?.[kind] ?? 0) !== n) return false;
  }
  return true;
}

/** README §10: local database with the right name, nothing pointing off the machine, counts as the fixture says. */
export async function runSelfCheck(environment: EvalEnvironment, worlds: readonly string[]): Promise<SelfCheckResult> {
  const checks: SelfCheckItem[] = [];
  const push = (name: string, ok: boolean, detail: unknown) => checks.push({ detail, name, ok });
  const paths = evalPaths(environment.env);
  // harness/eval-parallel-workers: worker k ≥ 2 runs on its own orbit_agent_eval_w<k>, and only on that one.
  const expectedName = environment.worker > 1 ? `${evalDatabaseName(environment.line)}_w${environment.worker}` : evalDatabaseName(environment.line);
  push("database is local orbit_agent_eval", ["127.0.0.1", "localhost", "::1"].includes(environment.database.host) && environment.database.name === expectedName, environment.database);
  let serverEnvironment: Record<string, any> | null = null;
  let blocked: unknown[] = [];
  try {
    const state = await serverControl<{ environment: Record<string, any>; blocked: unknown[] }>(environment, "state");
    serverEnvironment = state.environment;
    blocked = state.blocked;
  } catch (error) {
    push("eval server answers on its control endpoint", false, error instanceof Error ? error.message : String(error));
  }
  if (serverEnvironment) {
    const env = serverEnvironment;
    push("server database is the local eval database", env.database?.name === expectedName &&["127.0.0.1", "localhost", "::1"].includes(env.database?.host), env.database);
    push("no database variable points off this machine", (env.remoteDatabaseVariables ?? []).every((item: { host: string | null }) => !item.host || ["127.0.0.1", "localhost", "::1"].includes(item.host)), env.remoteDatabaseVariables);
    push("not a Vercel process", env.vercel === false && !env.vercelEnv, { vercel: env.vercel, vercelEnv: env.vercelEnv });
    push("Next telemetry disabled", env.telemetryDisabled === true, env.telemetryDisabled);
    push("file storage in the eval directory", String(env.storage?.exports ?? "").startsWith(paths.storage) && String(env.storage?.batchUploads ?? "").startsWith(paths.storage) && !env.storage?.batchImageStorage && !env.storage?.blobTokenSet, env.storage);
    push("push goes to the local simulator", String(env.expoPushEndpoint ?? "").startsWith(baseUrl(environment)), env.expoPushEndpoint);
    push("main model is DeepSeek with a key; no other provider keys", env.providers?.agentProvider === "deepseek" && env.providers?.deepseekKeySet && !env.providers?.geminiKeySet && !env.providers?.openaiKeySet, env.providers);
    push("trace directory set", Boolean(env.traceDir), env.traceDir);
    // Blocks inside a case belong to that case's run (and void it); a block outside any case means the server itself reached out.
    const stray = (blocked ?? []).filter((entry) => !(entry as { caseId?: string | null }).caseId);
    push("no blocked connection outside a case", stray.length === 0, stray);
  }
  const worldResults: SelfCheckResult["worlds"] = {};
  for (const world of worlds) {
    const report = readSeedReport(environment, world);
    const resolved = resolveSnapshotKey(world);
    const fixtureSha256 = fileSha256(loadWorld(resolved.world).file);
    push(`${world}: snapshot made from the current fixture`, report.fixtureSha256 === fixtureSha256, { fixture: fixtureSha256, snapshot: report.fixtureSha256 });
    if (resolved.patch) {
      const current = patchSha256(resolved.patch.patch);
      push(`${world}: snapshot made from the current patch`, report.patch?.sha256 === current, { patch: current, snapshot: report.patch?.sha256 ?? null });
    }
    const snapshotFileSha256 = fileSha256(report.snapshot.file);
    push(`${world}: snapshot file unchanged since seeding`, snapshotFileSha256 === report.snapshot.sha256, { recorded: report.snapshot.sha256, now: snapshotFileSha256 });
    restoreSnapshot(environment.database.url, report.snapshot.file);
    const actors = Object.fromEntries(Object.entries(report.accounts).filter(([label]) => label !== "HOST").map(([label, account]) => [label, account.userId]));
    const actual = await countWorldRows(environment.database.url, actors);
    const expected = expectedCounts(world);
    const match = countsMatch(expected, actual);
    push(`${world}: row counts match the fixture`, match, { actual, expected });
    worldResults[world] = { actual, expected, fixtureSha256, gaps: report.gaps.length, match, snapshotFileSha256, snapshotSha256: report.snapshot.sha256 };
  }
  return {
    blockedConnections: blocked,
    checkedAt: new Date().toISOString(),
    checks,
    database: { host: environment.database.host, name: environment.database.name },
    ok: checks.every((check) => check.ok),
    server: { environment: serverEnvironment, url: baseUrl(environment) },
    storage: { batchUploads: paths.batchUploads, exports: paths.exportsDir, logs: paths.serverLogs, runs: paths.runs, snapshots: paths.snapshots, trace: paths.traceDir },
    worlds: worldResults,
  };
}
