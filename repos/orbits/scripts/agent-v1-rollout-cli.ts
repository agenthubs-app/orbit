/**
 * agent-design AG18: what the shadow report and the reconcile list share — the flags, the env file, the local-only
 * guard (a remote database needs --confirm-remote=<host>/<database>, which the rollout runbook marks 需用户授权), and the
 * accounts to report on.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { assertBackfillTarget, loadEnvFrom } from "./backfill-agent-v1-fields";

export function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

export interface CliTarget {
  workspaceId: string;
  label: string;
}

/** Loads the env (never `.env` when --env-file is given) and refuses a remote database without its confirmation. */
export function cliTarget(known: readonly string[]): CliTarget {
  loadEnvFrom(flag("env-file"));
  const allowed = new Set([...known, "env-file", "confirm-remote", "out", "accounts"]);
  const unknown = process.argv.slice(2).filter((arg) => !allowed.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  // Reading a remote database is as much the owner's decision as writing one.
  const target = assertBackfillTarget({ apply: true, confirmRemote: flag("confirm-remote"), connectionString: config.connectionString, target: config.target });
  return { label: `${config.target} ${target.host}/${target.database}`, workspaceId: config.workspaceId };
}

/** `--accounts=A:<actorId>,B:<actorId>`; without it, every account found by `discover`. */
export async function cliAccounts(discover: (query: (text: string, values: unknown[]) => Promise<{ rows: readonly Record<string, unknown>[] }>) => Promise<string[]>): Promise<{ account: string; actorId: string }[]> {
  const given = flag("accounts");
  if (given) return given.split(",").filter(Boolean).map((item) => {
    const at = item.indexOf(":");
    return at > 0 ? { account: item.slice(0, at), actorId: item.slice(at + 1) } : { account: item, actorId: item };
  });
  const config = resolveLiveDatabaseConnectionConfig();
  const client = createTransactionalPostgresClient({ connectionString: config!.connectionString, max: 1 });
  try {
    const ids = await discover((text, values) => client.query(text, values));
    return ids.sort().map((actorId) => ({ account: actorId, actorId }));
  } finally {
    await client.close();
  }
}

/** Writes `<out>.md` and `<out>.json` when --out is given; prints the Markdown either way. */
export function cliWrite(markdown: string, json: unknown): void {
  console.log(markdown);
  const out = flag("out");
  if (!out) return;
  const base = path.resolve(out);
  mkdirSync(path.dirname(base), { recursive: true });
  writeFileSync(`${base}.md`, `${markdown}\n`);
  writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`written: ${base}.md, ${base}.json`);
}
