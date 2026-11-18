import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";

import type { EvalEnvironment } from "./env-guard";
import { baseUrl, PRELOAD, processAlive, readServerState, type ServerState } from "./eval-env";
import { evalPaths, ORBITS_ROOT } from "./paths";

export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startServer(environment: EvalEnvironment): Promise<ServerState> {
  const existing = readServerState(environment);
  if (existing && processAlive(existing.pid)) throw new Error(`The eval server is already running (pid ${existing.pid}).`);
  if (await portInUse(environment.port)) throw new Error(`Port ${environment.port} is in use by another process; not starting (the eval never reuses another server).`);
  const buildIdFile = path.join(ORBITS_ROOT, ".next", "BUILD_ID");
  if (!fs.existsSync(buildIdFile)) throw new Error("No production build; run npm run agent-eval:env -- --build.");
  const paths = evalPaths(environment.env);
  fs.mkdirSync(paths.serverLogs, { recursive: true });
  const logFile = path.join(paths.serverLogs, `server-${environment.worker > 1 ? `w${environment.worker}-` : ""}${new Date().toISOString().replace(/[:.]/gu, "-")}.log`);
  const log = fs.openSync(logFile, "a");
  const child = spawn(path.join(ORBITS_ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(environment.port), "-H", "127.0.0.1"], {
    cwd: ORBITS_ROOT,
    detached: true,
    env: { ...environment.env, NODE_OPTIONS: `--require ${PRELOAD}` } as unknown as NodeJS.ProcessEnv,
    stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  child.unref();
  const state: ServerState = { buildId: fs.readFileSync(buildIdFile, "utf8").trim(), log: logFile, pid: child.pid!, port: environment.port, startedAt: new Date().toISOString() };
  fs.writeFileSync(paths.stateFile, JSON.stringify(state, null, 2));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!processAlive(state.pid)) throw new Error(`The eval server exited early; see ${logFile}`);
    try {
      const response = await fetch(`${baseUrl(environment)}/__agent-eval/state`);
      if (response.ok) return state;
    } catch {
      // not up yet
    }
    await wait(500);
  }
  throw new Error(`The eval server did not come up in 90s; see ${logFile}`);
}

export async function stopServer(environment: EvalEnvironment): Promise<boolean> {
  const state = readServerState(environment);
  if (!state || !processAlive(state.pid)) return false;
  try {
    process.kill(-state.pid, "SIGTERM");
  } catch {
    process.kill(state.pid, "SIGTERM");
  }
  for (let i = 0; i < 20 && processAlive(state.pid); i += 1) await wait(250);
  if (processAlive(state.pid)) {
    try {
      process.kill(-state.pid, "SIGKILL");
    } catch {
      process.kill(state.pid, "SIGKILL");
    }
  }
  fs.rmSync(evalPaths(environment.env).stateFile, { force: true });
  return true;
}

export async function serverControl<T = Record<string, unknown>>(environment: EvalEnvironment, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl(environment)}/__agent-eval/${route}`, body === undefined ? undefined : { body: JSON.stringify(body), method: "POST" });
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`control ${route}: ${json.error ?? response.status}`);
  return json;
}

/**
 * AG13 opening 4: waits until the eval server has no model call in flight and nothing traced for a quiet spell (the
 * preload's `drain`). Null when the server does not answer the control route.
 */
export async function drainServer(environment: EvalEnvironment, options: { quietMs?: number; timeoutMs?: number } = {}): Promise<{ drained: boolean; inFlight: number; inFlightAtStart: number; waitedMs: number } | null> {
  try {
    return await serverControl(environment, "drain", { quietMs: options.quietMs ?? 500, timeoutMs: options.timeoutMs ?? 30_000 });
  } catch {
    return null;
  }
}

/** Per account and kind, the rows the product holds now (owner = account actor). */
export async function countWorldRows(url: string, actors: Record<string, string>): Promise<Record<string, Record<string, number>>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const out: Record<string, Record<string, number>> = {};
    const collections: Record<string, string> = {
      agentAutomations: "rules",
      agentMemories: "memory",
      contacts: "contacts",
      notes: "memos",
      orbit_agent_chat_sessions: "conversations",
      personal_schedule_items: "schedule",
      tasks: "todos_and_followups",
    };
    for (const [label, actor] of Object.entries(actors)) {
      const rows = await client.query<{ collection_name: string; n: string }>(
        `select collection_name, count(*) as n from orbit_records
         where collection_name = any($1::text[]) and lifecycle_state <> 'deleted'
           and (user_id = $2 or workspace_id like '%:agent-actor:' || $2 or workspace_id like '%:actor:' || $3)
         group by collection_name`,
        [Object.keys(collections), actor, encodeURIComponent(actor)],
      );
      out[label] = Object.fromEntries(rows.rows.map((row) => [collections[row.collection_name], Number(row.n)]));
      const registrations = await client.query<{ n: string }>("select count(*) as n from event_ops_membership_heads where actor_id = $1", [actor]).catch(() => ({ rows: [{ n: "0" }] }));
      out[label].my_events = Number(registrations.rows[0]?.n ?? 0);
    }
    const events = await client.query<{ n: string }>("select count(*) as n from event_ops_events");
    out.platform = { platform_events: Number(events.rows[0].n) };
    return out;
  } finally {
    await client.end();
  }
}
