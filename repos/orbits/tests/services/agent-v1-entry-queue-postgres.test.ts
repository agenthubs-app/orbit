import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { acceptMessage, getRequestRecord, maybeResumeSession, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createPostgresAgentEntryStore, type AgentEntryStore } from "../../features/agent-v1/entry/store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

/**
 * AG01-2 against a real PostgreSQL schema: messages of one session are processed one at a time in
 * the order the server received them, also when they arrive concurrently from two clients and when
 * two processes race for the same session; a request whose process went away is taken over by the
 * next process under its original key; the queue wait is recorded.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_v1_entry_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-v1-entry:${schema}`;

let admin: Pool;
let client: TransactionalPostgresClient;
let store: AgentEntryStore;

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  await runOrbitRecordsMigration(client);
  store = createPostgresAgentEntryStore({ client, workspaceId });
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

function tracker() {
  let running = 0;
  let maxRunning = 0;
  const order: string[] = [];
  return {
    execute: (async ({ input }) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      order.push(input.message);
      await new Promise((resolve) => setTimeout(resolve, 40));
      running -= 1;
      return { sourceRefs: [], text: `答：${input.message}` };
    }) as AgentEntryDependencies["execute"],
    get maxRunning() { return maxRunning; },
    order,
  };
}

test("two clients send at once: each gets its own request, processed one by one in received order", { skip }, async () => {
  const runtime = tracker();
  const deps: AgentEntryDependencies = { execute: runtime.execute, store };
  const actorId = "account:queue-a";
  const sessionId = `session:${randomUUID()}`;
  const send = (clientMessageId: string, message: string) => acceptMessage(deps, { actorId, body: { clientMessageId, locale: "zh", message, protocolVersion: 3, references: [], sessionId } });
  const receipts = (await Promise.all([send("web:1", "明天有什么日程？"), send("app:1", "帮我列两条写会议纪要的小技巧。"), send("web:2", "第三条"), send("app:2", "第四条")])).map((item) => item.receipt);
  assert.deepEqual(receipts.map((receipt) => receipt.receivedSeq).sort(), [1, 2, 3, 4]);
  assert.equal(new Set(receipts.map((receipt) => receipt.requestId)).size, 4);
  assert.equal(receipts.filter((receipt) => receipt.status === "running").length, 1, "only the first received is running at accept time");
  await settleSession(actorId, sessionId);
  const records = await Promise.all(receipts.map((receipt) => getRequestRecord(deps, { actorId, requestId: receipt.requestId })));
  assert.ok(records.every((record) => record?.status === "completed"));
  assert.equal(runtime.maxRunning, 1, "never two requests of the session at the same time");
  const byReceived = [...records].sort((left, right) => left!.receivedSeq - right!.receivedSeq);
  assert.deepEqual(runtime.order, byReceived.map((record) => record!.input.message), "processed in the server's received order");
  for (let index = 1; index < byReceived.length; index += 1) {
    assert.ok(Date.parse(byReceived[index]!.startedAt!) >= Date.parse(byReceived[index - 1]!.endedAt!), "the next round starts after the previous one ended");
  }
  // Queue wait and "arrived while one was running" are recorded per message.
  const last = byReceived[3]!;
  assert.equal(last.arrivedWhileRunning, true);
  assert.equal(last.queueAheadAtArrival, 3);
  assert.ok(Date.parse(last.startedAt!) - Date.parse(last.receivedAt) >= 100, "the fourth waited for three rounds of 40 ms");
  assert.equal(byReceived[0]!.arrivedWhileRunning, false);
  assert.equal(byReceived[0]!.queueAheadAtArrival, 0);
});

test("two processes racing for a session: only one of them claims the next request", { skip }, async () => {
  const actorId = "account:queue-b";
  const sessionId = `session:${randomUUID()}`;
  const now = new Date().toISOString();
  // Process A holds a running request; B and C both wait in the queue.
  await store.accept({ actorId, clientMessageId: "m1", fingerprint: "f1", input: { locale: "zh", message: "一", references: [] }, leaseMs: 30_000, now, requestId: "agreq_race_1", sessionId, workerId: "worker:A" });
  await store.accept({ actorId, clientMessageId: "m2", fingerprint: "f2", input: { locale: "zh", message: "二", references: [] }, leaseMs: 30_000, now, requestId: "agreq_race_2", sessionId, workerId: "worker:A" });
  await store.finish({ actorId, now, outcome: { answer: { sourceRefs: [], text: "一" }, partResults: [], status: "completed" }, requestId: "agreq_race_1", workerId: "worker:A" });
  const claims = await Promise.all(["worker:B", "worker:C", "worker:D"].map((workerId) => store.claimNext({ actorId, leaseMs: 30_000, now, sessionId, workerId })));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims.find(Boolean)?.record.requestId, "agreq_race_2");
  // A late finish from a worker that does not hold the request is not delivered.
  const late = await store.finish({ actorId, now, outcome: { answer: { sourceRefs: [], text: "late" }, partResults: [], status: "completed" }, requestId: "agreq_race_2", workerId: "worker:A" });
  assert.equal(late.delivered, false);
});

test("a process that stops mid-request is replaced by the next one, under the original key", { skip }, async () => {
  const actorId = "account:queue-c";
  const sessionId = `session:${randomUUID()}`;
  let clock = Date.parse("2026-11-15T10:00:00.000Z");
  const now = () => new Date(clock).toISOString();
  let executions = 0;
  const execute: AgentEntryDependencies["execute"] = async ({ input }) => {
    executions += 1;
    return { sourceRefs: [], text: `接手后答：${input.message}` };
  };
  // Process A accepts and claims, then goes away without finishing (no heartbeat any more).
  const claimed = await store.accept({ actorId, clientMessageId: "m1", fingerprint: "fp", input: { locale: "zh", message: "进程中断", references: [] }, leaseMs: 30_000, now: now(), requestId: "agreq_takeover", sessionId, workerId: "worker:gone" });
  assert.equal(claimed.claimed, true);
  // Within the lease nobody else may take it.
  const processB: AgentEntryDependencies = { execute, now, store, workerId: "worker:B" };
  await maybeResumeSession(processB, actorId, sessionId);
  await settleSession(actorId, sessionId);
  assert.equal(executions, 0);
  // After the lease ran out, the next process that reads the session takes it over.
  clock += 31_000;
  await maybeResumeSession(processB, actorId, sessionId);
  await settleSession(actorId, sessionId);
  const record = await getRequestRecord(processB, { actorId, requestId: "agreq_takeover" });
  assert.equal(executions, 1);
  assert.equal(record?.status, "completed");
  assert.equal(record?.attempts, 2);
  assert.equal(record?.workerId, "worker:B");
  assert.equal(record?.document.answer?.text, "接手后答：进程中断");
  assert.equal(record?.requestId, "agreq_takeover");
});

test("the request record is the one in orbit_agent_chat_requests, readable only by its account", { skip }, async () => {
  const deps: AgentEntryDependencies = { execute: async () => ({ sourceRefs: [], text: "好" }), store };
  const sessionId = `session:${randomUUID()}`;
  const { receipt } = await acceptMessage(deps, { actorId: "account:owner", body: { clientMessageId: "m", locale: "en", message: "hi", protocolVersion: 3, references: [], sessionId } });
  await settleSession("account:owner", sessionId);
  const rows = await admin.query(`select collection_name, user_id, payload->>'status' as status from ${schema}.orbit_records where payload->>'requestId' = $1 and collection_name = 'orbit_agent_chat_requests'`, [receipt.requestId]);
  assert.deepEqual(rows.rows, [{ collection_name: "orbit_agent_chat_requests", status: "completed", user_id: "account:owner" }]);
  assert.equal(await store.get("account:intruder", receipt.requestId), null);
  assert.deepEqual(await store.listEvents("account:intruder", sessionId, 0, 50), []);
  assert.equal((await store.listEvents("account:owner", sessionId, 0, 50)).length, 3);
});
