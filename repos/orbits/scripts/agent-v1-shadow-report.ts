// agent-design AG18-2: the shadow comparison records, grouped by account (each group read with that account only).
//
//   npx tsx scripts/agent-v1-shadow-report.ts --env-file=.env.agent-eval [--accounts=A:<actorId>,B:<actorId>] [--out=<file without extension>]
//   npx tsx scripts/agent-v1-shadow-report.ts --from-run=<eval run folder> [--out=…]   (records an `agent-eval:run -- --shadow` kept per case)
//
// Read-only. A remote database needs --confirm-remote=<host>/<database> (需用户授权).
import fs from "node:fs";
import path from "node:path";

import { buildShadowReport, conversationGroupOf, groupOf, shadowReportMarkdown, type ShadowReport } from "../features/agent-v1/rollout/shadow-report";
import { CONVERSATION_SHADOW_COLLECTION, createLiveConversationShadowStore, type ConversationShadowRecord } from "../features/agent-v1/rollout/conversation-shadow";
import { createLiveShadowStore, SHADOW_COLLECTION, type ShadowComparisonRecord } from "../features/agent-v1/rollout/shadow";
import { cliAccounts, cliTarget, cliWrite, flag } from "./agent-v1-rollout-cli";

/**
 * `--from-run <eval run folder>`: the records the eval runner kept per case (cases/<id>/shadow-records.json, written by
 * `agent-eval:run -- --shadow`), grouped by world and the account each record is stored under. Reads files only.
 */
function fromRun(runDir: string): void {
  const groups = new Map<string, { actorId: string; records: ShadowComparisonRecord[] }>();
  const casesDir = path.join(runDir, "cases");
  for (const caseId of fs.readdirSync(casesDir).sort()) {
    const file = path.join(casesDir, caseId, "shadow-records.json");
    if (!fs.existsSync(file)) continue;
    const accounts = (JSON.parse(fs.readFileSync(path.join(casesDir, caseId, "world-before.json"), "utf8")) as { accounts: Record<string, string> }).accounts;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8")) as { ownerAccount: string | null; record: ShadowComparisonRecord; world: string }[]) {
      const key = `${row.world} / ${row.ownerAccount ?? "?"}`;
      const group = groups.get(key) ?? { actorId: accounts[row.ownerAccount ?? ""] ?? "?", records: [] };
      group.records.push({ ...row.record, message: `${caseId}：${row.record.message}` });
      groups.set(key, group);
    }
  }
  const report: ShadowReport = { conversation: [conversationGroupOf("eval", "eval", conversationFromTraces(casesDir))], generatedAt: new Date().toISOString(), groups: [...groups.entries()].map(([key, group]) => groupOf(key, group.actorId, group.records)), totals: { accounts: 0, byField: {}, compared: 0, divergences: 0, foreign: 0, shadowModelCalls: 0 } };
  for (const group of report.groups) {
    report.totals.accounts += 1;
    report.totals.compared += group.compared;
    report.totals.divergences += group.divergences;
    report.totals.foreign += group.foreign.length;
    report.totals.shadowModelCalls += group.shadowModelCalls;
    for (const item of group.items) for (const divergence of item.divergences) report.totals.byField[divergence.field] = (report.totals.byField[divergence.field] ?? 0) + 1;
  }
  cliWrite(`<!-- eval run ${path.basename(runDir)} -->\n${shadowReportMarkdown(report)}`, report);
}

/**
 * The conversation engine's records of an eval run, from each case's trace (conversation.shadow / conversation.applied
 * events; the eval's own database is gone after the run). One group for the run; the message names the case.
 */
function conversationFromTraces(casesDir: string): ConversationShadowRecord[] {
  const out: ConversationShadowRecord[] = [];
  for (const caseId of fs.readdirSync(casesDir).sort()) {
    const file = path.join(casesDir, caseId, "trace.jsonl");
    if (!fs.existsSync(file)) continue;
    const events = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line) as Record<string, any>; } catch { return null; } }).filter((event): event is Record<string, any> => Boolean(event));
    const turns = events.filter((event) => event.type === "turn.user").map((event) => String(event.text ?? event.message ?? ""));
    let turn = 0;
    for (const event of events) {
      if (event.type !== "conversation.shadow" || String(event.requestId ?? "").startsWith("shadow:")) continue;
      const applied = events.filter((item) => item.type === "conversation.applied" && item.requestId === event.requestId).map((item) => ({ detail: item.detail, part: item.part, what: item.what }));
      out.push({ actorId: "eval", applied, comparedAt: String(event.at ?? ""), diffs: event.diffs ?? [], error: event.error ?? null, message: `${caseId}：${turns[turn] ?? ""}`, mode: event.mode, ms: event.ms ?? 0, requestId: String(event.requestId ?? ""), schemaVersion: 1, sessionId: "", status: event.status, workspaceId: "" });
      turn += 1;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const runDir = flag("from-run");
  if (runDir) return fromRun(path.resolve(runDir));
  const target = cliTarget([]);
  const store = createLiveShadowStore();
  if (!store) throw new Error("DATABASE_UNCONFIGURED");
  const accounts = await cliAccounts(async (query) => (await query(`select distinct user_id from orbit_records where workspace_id = $1 and collection_name in ($2, $3) and user_id is not null`, [target.workspaceId, SHADOW_COLLECTION, CONVERSATION_SHADOW_COLLECTION])).rows.map((row) => String(row.user_id)));
  const report = await buildShadowReport(store, accounts, undefined, createLiveConversationShadowStore());
  cliWrite(`<!-- ${target.label}, workspace ${target.workspaceId} -->\n${shadowReportMarkdown(report)}`, report);
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : "SHADOW_REPORT_FAILED");
  process.exit(1);
});
