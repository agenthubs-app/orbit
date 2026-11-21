// agent-design AG18-3: the rollback drill on a local database, card by card, with the product's ledger, queue and
// to-do executors (the same code the server runs; the switch is the deployment's ORBIT_AGENT_V1_PROPOSALS).
//
//   ORBIT_DRILL_DATABASE_URL=postgresql://127.0.0.1:5432/<local test database> npx tsx scripts/agent-v1-rollback-drill.ts --out=<file without extension>
//
// It makes four cards (waiting, approved and not run, outcome unknown, done), pauses, takes the reconcile list,
// restores, carries each one on, and takes the list again. Local databases only; it works in its own schema and drops it.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { agentCardPreview } from "../features/agent/runtime/card-view";
import { AgentExecutionOutcomeUnknownError } from "../features/agent/runtime/service";
import { runWithConfirmBoundary } from "../features/agent-v1/entry/confirm-boundary";
import { isProposalsPausedError, readAgentProposalsState } from "../features/agent-v1/rollout/rollback";
import { reconcileList, reconcileMarkdown } from "../features/agent-v1/rollout/reconcile";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { ACTOR, createCardKit, decide, freeze } from "../tests/services/agent-ledger-card-kit";

const url = process.env.ORBIT_DRILL_DATABASE_URL;
const outArg = process.argv.slice(2).find((arg) => arg.startsWith("--out="))?.slice("--out=".length);

async function main(): Promise<void> {
  if (!url || !/^(localhost|127\.0\.0\.1|::1)$/u.test(new URL(url).hostname)) throw new Error("ORBIT_DRILL_DATABASE_URL must be a local database.");
  const schema = `agent_v1_drill_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const scoped = new URL(url);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  await admin.query(`create schema "${schema}"`);
  const client = createTransactionalPostgresClient({ connectionString: scoped.toString(), max: 4 });
  const lines: string[] = [];
  const log = (line = "") => {
    lines.push(line);
    console.log(line);
  };
  const setSwitch = (value: "open" | "paused") => {
    process.env.ORBIT_AGENT_V1_PROPOSALS = value;
    log(`**开关**：ORBIT_AGENT_V1_PROPOSALS=${value}（读回：${readAgentProposalsState()}）`);
    log();
  };
  try {
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    let unknownOnce = true;
    const kit = createCardKit({
      client,
      start: "2026-11-21T01:00:00.000Z",
      workspaceId: "workspace:agent-v1-drill",
      wrapExecutor: (executor) => ({ ...executor, execute: async (payload, context) => {
        if (unknownOnce && JSON.stringify(payload).includes("预订会议室")) {
          unknownOnce = false;
          throw new AgentExecutionOutcomeUnknownError("drill: the write may or may not have happened (connection lost)");
        }
        return executor.execute(payload, context);
      } }),
    });
    const show = async (label: string, actionId: string) => {
      const action = (await kit.runtime.getAction(actionId))!;
      const preview = agentCardPreview(action, await kit.runtime.getRun(action.runId), kit.now());
      log(`- ${label} ${actionId}：卡片状态 ${preview.status}，第 ${preview.revision} 版；${preview.operations.map((op) => `「${op.text}」${op.status}`).join("；")}`);
    };
    const todoOf = async (id: string) => (await kit.tasks.get({ actorId: ACTOR, taskId: id }))!;
    setSwitch("open");
    log("## 1. 回退前造出四种卡（本机 Postgres，产品的账本、队列和待办执行器）");
    log();
    const sample = await kit.todo("给李薇寄样片", "2026-11-10");
    const quote = await kit.todo("给小林发修订报价", "2026-11-18");
    const waiting = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: sample.id }] as never, "action:drill:waiting");
    const approved = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: quote.id }] as never, "action:drill:approved");
    const unknown = await freeze(kit, [{ capability: "todo.create", set: { title: "预订会议室" } }] as never, "action:drill:unknown");
    const done = await freeze(kit, [{ capability: "todo.create", set: { plannedDate: "2026-11-30", title: "更新报价模板" } }] as never, "action:drill:done");
    await decide(kit, done, "confirm", "drill:done");
    await kit.runtime.processOutbox({ actionId: done.actionId, limit: 20, workerId: "drill" });
    await decide(kit, unknown, "confirm", "drill:unknown");
    await kit.runtime.processOutbox({ actionId: unknown.actionId, limit: 20, workerId: "drill" });
    // Approved, then the worker went away before running it (the queue had not got to it).
    await decide(kit, approved, "confirm", "drill:approved");
    for (const [label, card] of [["等确认", waiting], ["已批准未执行", approved], ["执行中结果未知", unknown], ["已完成", done]] as const) await show(label, card.actionId);
    log();

    setSwitch("paused");
    log("## 2. 回退期间");
    log();
    try {
      await freeze(kit, [{ capability: "todo.create", set: { title: "再新建一条" } }] as never, "action:drill:new");
      log("- 新卡：**出了卡（不应该）**");
    } catch (error) {
      log(`- 新提案（聊天、定时任务、MCP 都经同一处）：${isProposalsPausedError(error) ? "拒收，没有出卡" : `出错 ${String(error)}`}`);
    }
    const click = await decide(kit, waiting, "confirm", "drill:click-paused");
    log(`- 点等确认的卡：${click?.outcome}（${click?.reason}）「${click?.message}」`);
    const typed = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: "确认", requestId: "request:drill-typed", run: async () => ({ reply: "", sourceRefs: [] }), sessionId: "session:test" });
    log(`- 打字“确认”：「${typed.text}」（没有调用模型：${!typed.modelCalled}）`);
    const queue = await kit.runtime.processOutbox({ limit: 20, workerId: "drill" });
    log(`- 执行队列跑一次：处理 ${queue.processed} 项（暂停中不领取）`);
    // Meanwhile someone edits the waiting card's to-do on another device: the card must be re-checked on restore.
    const current = await todoOf(sample.id);
    await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current.updatedAt, idempotencyKey: "drill:external", now: kit.now(), patch: { plannedDate: "2026-11-12" }, taskId: sample.id });
    log("- 回退期间别处把「给李薇寄样片」的计划日改成了 11月12日");
    for (const [label, card] of [["等确认", waiting], ["已批准未执行", approved], ["执行中结果未知", unknown], ["已完成", done]] as const) await show(label, card.actionId);
    log(`- 「给小林发修订报价」现在的计划日：${(await todoOf(quote.id)).plannedDate}（还没执行）`);
    log();
    log("### 对账清单（回退中）");
    log();
    const before = await reconcileList(kit.runtime, kit.now());
    for (const line of reconcileMarkdown("drill", before)) log(line);

    setSwitch("open");
    log("## 3. 恢复");
    log();
    const calls = kit.executorCalls.length;
    await kit.runtime.processOutbox({ limit: 20, workerId: "drill" });
    log(`- 执行队列跑一次：已批准未执行的那张执行了（执行器新调用 ${kit.executorCalls.length - calls} 次，操作键 ${kit.executorCalls.slice(calls).map((call) => call.idempotencyKey).join("、")}）`);
    await kit.runtime.processOutbox({ limit: 20, workerId: "drill" });
    log(`- 再跑一次：执行器新调用 ${kit.executorCalls.length - calls - 1} 次（没有第二次效果）`);
    const unknownOp = (await kit.runtime.getAction(unknown.actionId))!.operations[0].operationId;
    const retried = await decide(kit, (await kit.runtime.getAction(unknown.actionId))!, "retry", "drill:retry", { operationId: unknownOp });
    log(`- 结果未知的那项按 AG02 点「重试」：${retried?.outcome}「${retried?.message}」`);
    await kit.runtime.processOutbox({ actionId: unknown.actionId, limit: 20, workerId: "drill" });
    const meetingRooms = (await kit.listTasks()).filter((task: { title: string }) => task.title === "预订会议室").length;
    log(`- 「预订会议室」现在有 ${meetingRooms} 条（重试沿用原操作键，不会多出第二条）`);
    const first = await decide(kit, waiting, "confirm", "drill:after-restore");
    log(`- 等确认的卡恢复后点确认：${first?.outcome}（${first?.reason ?? "—"}）「${first?.message}」`);
    const revised = (await kit.runtime.getAction(waiting.actionId))!;
    const second = await decide(kit, revised, "confirm", "drill:after-restore-2");
    log(`- 看过新版（第 ${revised.revision} 版）再点：${second?.outcome}「${second?.message}」`);
    await kit.runtime.processOutbox({ actionId: waiting.actionId, limit: 20, workerId: "drill" });
    for (const [label, card] of [["等确认", waiting], ["已批准未执行", approved], ["执行中结果未知", unknown], ["已完成", done]] as const) await show(label, card.actionId);
    log(`- 「给李薇寄样片」计划日：${(await todoOf(sample.id)).plannedDate}；「给小林发修订报价」计划日：${(await todoOf(quote.id)).plannedDate}`);
    const keys = kit.executorCalls.map((call) => call.idempotencyKey);
    log(`- 执行器一共被调用 ${keys.length} 次，不同操作键 ${new Set(keys).size} 个：${keys.join("、")}`);
    log();
    log("### 对账清单（恢复后）");
    log();
    const after = await reconcileList(kit.runtime, kit.now());
    for (const line of reconcileMarkdown("drill", after)) log(line);
    if (outArg) {
      const base = path.resolve(outArg);
      mkdirSync(path.dirname(base), { recursive: true });
      writeFileSync(`${base}.md`, `# 回退演练记录（${new Date().toISOString()}，本机库，schema ${schema}）\n\n${lines.join("\n")}\n`);
      writeFileSync(`${base}.json`, `${JSON.stringify({ after, before, executorCalls: kit.executorCalls }, null, 2)}\n`);
    }
  } finally {
    await client.close();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
