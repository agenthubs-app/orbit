// agent-design AG18-3: the reconcile list of a rollback — every card of every account (or of --accounts), grouped:
// waiting for a click, approved and not run (with its approval), outcome unknown (in review), done (receipts), closed.
//
//   npx tsx scripts/agent-v1-reconcile.ts --env-file=.env.agent-eval [--accounts=A:<actorId>,…] [--out=<file without extension>]
//
// Read-only: it changes no card, no queue item and no record. A remote database needs --confirm-remote (需用户授权).
import { createOrbitAgentRuntimeService } from "../features/agent/runtime/service-factory";
import { AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS } from "../features/agent/storage/agent-runtime-live-record-provider";
import { readAgentProposalsState } from "../features/agent-v1/rollout/rollback";
import { reconcileList, reconcileMarkdown, type ReconcileItem } from "../features/agent-v1/rollout/reconcile";
import { cliAccounts, cliTarget, cliWrite } from "./agent-v1-rollout-cli";

async function main(): Promise<void> {
  const target = cliTarget([]);
  const marker = `${target.workspaceId}:agent-actor:`;
  const accounts = await cliAccounts(async (query) => (await query(`select distinct substring(workspace_id from $2) as actor from orbit_records where workspace_id like $1 and collection_name = $3`, [`${marker}%`, `${marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(.*)$`, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions])).rows.map((row) => String(row.actor)).filter(Boolean));
  const now = new Date().toISOString();
  const lists: { account: string; actorId: string; items: ReconcileItem[] }[] = [];
  for (const { account, actorId } of accounts) lists.push({ account, actorId, items: await reconcileList(createOrbitAgentRuntimeService("live", { actorId }), now) });
  const lines = [`# 对账清单（${now}，${target.label}，写入提议开关：${readAgentProposalsState()}）`, ""];
  for (const list of lists) lines.push(...reconcileMarkdown(list.account, list.items));
  cliWrite(lines.join("\n"), { at: now, lists, proposals: readAgentProposalsState() });
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "RECONCILE_FAILED");
  process.exit(1);
});
