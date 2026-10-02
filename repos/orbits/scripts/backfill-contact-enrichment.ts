import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BACKFILL_DEFAULT_MAX_CALLS,
  applyContactEnrichmentBackfillPlan,
  assertEnrichmentBackfillTarget,
  buildContactEnrichmentBackfillPlan,
  enrichmentBackfillPlanHash,
  type EnrichmentBackfillPlan,
  type EnrichmentBackfillRecord,
} from "../features/contacts/enrichment/backfill";
import { createConfiguredTextEnricher } from "../features/contacts/enrichment/text-enrichment";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { loadLocalEnv } from "./load-local-env";

// W0045：联系人补全回填（行业／职级／规范地区）。默认 dry-run，只写计划文件；本 Sprint 只在本机库演练，
// 生产执行需单独授权。
//
//   npx tsx scripts/backfill-contact-enrichment.ts                       # dry-run：只用确定规则（card），不调模型
//   ... --ai [--max-calls=50]                                            # dry-run 并按文字补全空栏（每次 ≤20 人，串行，间隔 ≥1 秒）
//   ... --apply --plan=<plan.json> --reviewed-hash=<hash>                # 按复核过的计划写入（重复 apply 0 变化）
//   ... --confirm-remote=<host>/<database>                               # 非 localhost 库必须显式确认，否则直接拒绝
//   ... --out-dir=build/contact-enrichment-backfill                      # 计划文件目录
//
// 连接：ORBIT_ENRICHMENT_BACKFILL_DATABASE_URL（优先），否则按 live 数据库配置；工作区：--workspace= 或配置里的工作区。

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === `--${name}` || arg.startsWith(prefix));
  if (!hit) return null;
  return hit.startsWith(prefix) ? hit.slice(prefix.length) : "";
}

function summary(plan: EnrichmentBackfillPlan): string {
  const tokens = plan.ai.usage.reduce((sum, usage) => ({ input: sum.input + usage.inputTokens, output: sum.output + usage.outputTokens }), { input: 0, output: 0 });
  return [
    `plan hash: ${plan.hash}`,
    `contacts ${plan.counts.contacts}, entries ${plan.counts.entries}, card values ${plan.counts.cardValues}, ai values ${plan.counts.aiValues}, provenance marks ${plan.counts.provenanceMarks}`,
    `ai candidates ${plan.counts.aiCandidates}, deferred ${plan.counts.aiDeferred}, calls ${plan.ai.calls} (${plan.ai.model ?? "no model"}), tokens in ${tokens.input} / out ${tokens.output}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const known = new Set(["apply", "plan", "reviewed-hash", "ai", "max-calls", "confirm-remote", "out-dir", "workspace"]);
  const unknown = process.argv.slice(2).filter((arg) => !known.has(arg.replace(/^--/, "").split("=")[0]!));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(" ")}`);
  loadLocalEnv();
  const explicit = process.env.ORBIT_ENRICHMENT_BACKFILL_DATABASE_URL?.trim();
  const config = explicit ? null : resolveLiveDatabaseConnectionConfig();
  const connectionString = explicit || config?.connectionString;
  if (!connectionString) throw new Error("DATABASE_UNCONFIGURED");
  const workspaceId = flag("workspace") || config?.workspaceId || process.env.ORBIT_LOCAL_WORKSPACE_ID || process.env.ORBIT_WORKSPACE_ID;
  if (!workspaceId) throw new Error("WORKSPACE_UNCONFIGURED: pass --workspace=<id>.");
  const target = assertEnrichmentBackfillTarget(connectionString, flag("confirm-remote"));
  const client = createTransactionalPostgresClient({ connectionString, max: 2 });
  try {
    if (flag("apply") !== null) {
      const planPath = flag("plan");
      const reviewedHash = flag("reviewed-hash");
      if (!planPath || !reviewedHash) throw new Error("ENRICHMENT_BACKFILL_REFUSED: --apply needs --plan=<file> and --reviewed-hash=<hash>.");
      const plan = JSON.parse(readFileSync(planPath, "utf8")) as EnrichmentBackfillPlan;
      if (plan.workspaceId !== workspaceId) throw new Error("ENRICHMENT_BACKFILL_REFUSED: the plan belongs to another workspace.");
      if (enrichmentBackfillPlanHash(plan) !== reviewedHash) throw new Error("ENRICHMENT_BACKFILL_REFUSED: the plan file does not match the reviewed hash.");
      const result = await applyContactEnrichmentBackfillPlan(client, plan, reviewedHash);
      console.log(`apply ${target.host}/${target.database} workspace ${workspaceId}: ${JSON.stringify(result)}`);
      return;
    }
    const rows = await client.query<{ record_id: string; user_id: string | null; updated_at: string | Date; payload: Record<string, unknown> }>(
      "select record_id, user_id, updated_at, payload from orbit_records where workspace_id = $1 and collection_name = 'contacts' and lifecycle_state = 'active' and deleted_at is null order by record_id",
      [workspaceId],
    );
    const records: EnrichmentBackfillRecord[] = rows.rows.map((row) => ({
      recordId: row.record_id,
      userId: row.user_id,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
      payload: row.payload,
    }));
    const enricher = flag("ai") !== null ? createConfiguredTextEnricher() : null;
    if (flag("ai") !== null && !enricher) console.log("DEEPSEEK_API_KEY is not configured: skipping the AI layer.");
    const maxCalls = flag("max-calls") ? Number(flag("max-calls")) : BACKFILL_DEFAULT_MAX_CALLS;
    if (!Number.isInteger(maxCalls) || maxCalls < 0) throw new Error("--max-calls must be a non-negative integer.");
    const plan = await buildContactEnrichmentBackfillPlan({ appliedAt: new Date().toISOString(), enricher, maxCalls, records, workspaceId });
    const outDir = path.resolve(flag("out-dir") || path.join("build", "contact-enrichment-backfill"));
    mkdirSync(outDir, { recursive: true });
    const planPath = path.join(outDir, `plan-${target.database}-${plan.appliedAt.replace(/[:.]/g, "")}.json`);
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(`dry-run ${target.host}/${target.database}${target.remote ? " (remote)" : ""} workspace ${workspaceId}\n${summary(plan)}\nplan file: ${planPath}`);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "ENRICHMENT_BACKFILL_FAILED");
  process.exitCode = 1;
});
