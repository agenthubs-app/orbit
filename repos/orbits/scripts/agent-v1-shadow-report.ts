// agent-design AG18-2: the shadow comparison records, grouped by account (each group read with that account only).
//
//   npx tsx scripts/agent-v1-shadow-report.ts --env-file=.env.agent-eval [--accounts=A:<actorId>,B:<actorId>] [--out=<file without extension>]
//
// Read-only. A remote database needs --confirm-remote=<host>/<database> (需用户授权).
import { buildShadowReport, shadowReportMarkdown } from "../features/agent-v1/rollout/shadow-report";
import { createLiveShadowStore, SHADOW_COLLECTION } from "../features/agent-v1/rollout/shadow";
import { cliAccounts, cliTarget, cliWrite } from "./agent-v1-rollout-cli";

async function main(): Promise<void> {
  const target = cliTarget([]);
  const store = createLiveShadowStore();
  if (!store) throw new Error("DATABASE_UNCONFIGURED");
  const accounts = await cliAccounts(async (query) => (await query(`select distinct user_id from orbit_records where workspace_id = $1 and collection_name = $2 and user_id is not null`, [target.workspaceId, SHADOW_COLLECTION])).rows.map((row) => String(row.user_id)));
  const report = await buildShadowReport(store, accounts);
  cliWrite(`<!-- ${target.label}, workspace ${target.workspaceId} -->\n${shadowReportMarkdown(report)}`, report);
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "SHADOW_REPORT_FAILED");
  process.exit(1);
});
