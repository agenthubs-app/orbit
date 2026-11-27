/**
 * iOrbit 对话计量（2026-11-27）：账本迁移 v9「ai-usage-agent-chat」——`agent_chat` 可记账（user 池、max_calls 10），
 * 每人每东京日 100 轮、独立计数，不占用户池 10 次总熔断；一轮经过入口 = 一行操作 + 每次模型 HTTP 一行子账（带 token）；
 * 第 101 轮不发模型请求。真实 PostgreSQL（本机回环库，随机 schema）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { AGENT_CHAT_DAILY_LIMIT, AI_QUOTA_MAX_CALLS, AI_QUOTA_PURPOSE_POOLS, AI_QUOTA_PURPOSES, USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { acceptMessage, getRequestResult, settleSession, type AgentEntryExecutor } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { AGENT_CHAT_DAILY_LIMIT_TEXT } from "../../features/agent-v1/entry/usage-gate";
import { callMainModel } from "../../features/agent-v1/models/main";
import { NETWORK_ANALYSIS_MIGRATIONS, runNetworkAnalysisMigrations } from "../../features/network-analysis/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:agent-chat-ledger";
const ACTOR = "actor:chat";

test("constants: agent_chat is a user-pool purpose with 10 calls and a 100-round daily limit", () => {
  assert.ok(AI_QUOTA_PURPOSES.includes("agent_chat"));
  assert.equal(AI_QUOTA_PURPOSE_POOLS.agent_chat, "user");
  assert.equal(AI_QUOTA_MAX_CALLS.agent_chat, 10);
  assert.equal(AGENT_CHAT_DAILY_LIMIT, 100);
});

test("ledger v9: a round through the entry records one operation and its calls with tokens; 100 rounds a day, the 101st sends nothing; the user pool's 10 are untouched", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `agent_chat_ledger_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runNetworkAnalysisMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    const applied = (await pool.query("select version, name from network_analysis_schema_migrations order by version")).rows;
    assert.equal(applied.length, NETWORK_ANALYSIS_MIGRATIONS.length);
    assert.deepEqual(applied.at(-1), { name: "ai-usage-agent-chat-draft-assist", version: 9 });

    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WS });
    // The entry stamps the round with its own clock (deps.now); the ledger's day is the Tokyo day of that time.
    const now = new Date("2026-11-27T03:00:00.000Z");

    process.env.DEEPSEEK_API_KEY ??= "test-key-not-real";
    let sent = 0;
    const fetchImplementation = (async () => {
      sent += 1;
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", index: 0, message: { content: "{}", role: "assistant" } }], usage: { completion_tokens: 12, prompt_tokens: 345 } }), { status: 200 });
    }) as typeof fetch;
    const execute: AgentEntryExecutor = async () => {
      const budget = { limit: 4, used: 0 };
      await callMainModel({ budget, fetchImplementation, node: "understand", purpose: "first", requestId: "r", system: "s", user: "u" });
      await callMainModel({ budget, fetchImplementation, node: "answer", purpose: "first", requestId: "r", system: "s", user: "u" });
      return { sourceRefs: [], text: "answered" };
    };
    const deps = { execute, now: () => now.toISOString(), schedule: (task: () => Promise<void>) => { void task(); }, sessions: null, store: createMemoryAgentEntryStore(), usage: ledger };
    const send = async (n: number) => {
      const { receipt } = await acceptMessage(deps, { actorId: ACTOR, body: { clientMessageId: `m:${n}`, locale: "ja", message: "こんにちは", protocolVersion: 3, references: [], sessionId: `session:${n}` } });
      await settleSession(ACTOR, `session:${n}`);
      return (await getRequestResult(deps, { actorId: ACTOR, requestId: receipt.requestId }))!;
    };

    // Round 1 through the entry: one operation, two calls with the provider's tokens.
    const first = await send(1);
    assert.equal(first.answer?.text, "answered");
    const ops = (await pool.query("select id, pool, purpose, trigger, status, max_calls from ai_usage_ledger where actor_id = $1", [ACTOR])).rows;
    assert.equal(ops.length, 1);
    assert.deepEqual({ ...ops[0], id: undefined }, { id: undefined, max_calls: 10, pool: "user", purpose: "agent_chat", status: "succeeded", trigger: "manual" });
    const calls = (await pool.query("select seq, provider, status, input_tokens, output_tokens from ai_usage_calls where operation_id = $1 order by seq", [ops[0].id])).rows;
    assert.deepEqual(calls, [
      { input_tokens: 345, output_tokens: 12, provider: "deepseek", seq: 1, status: "responded" },
      { input_tokens: 345, output_tokens: 12, provider: "deepseek", seq: 2, status: "responded" },
    ]);

    // Rounds 2–100 (straight on the ledger, as the entry would).
    for (let n = 2; n <= AGENT_CHAT_DAILY_LIMIT; n += 1) {
      const reservation = await ledger.reserve({ actorId: ACTOR, idempotencyKey: `agent-chat:fill:${n}`, now, pool: "user", purpose: "agent_chat", takeover: true, trigger: "manual" });
      assert.ok(reservation.ok && reservation.owner, `round ${n}`);
      const { callId } = await ledger.beginCall(reservation.operationId, { model: "deepseek-flash", provider: "deepseek" });
      await ledger.endCall(callId, { inputTokens: 1, outputTokens: 1 });
      await ledger.finish(reservation.operationId, "succeeded");
    }
    let usage = await ledger.readUsageToday(ACTOR, now);
    assert.deepEqual([usage.agentChat, usage.user], [AGENT_CHAT_DAILY_LIMIT, 0], "chat rounds do not count against the user pool");

    // Round 101 through the entry: refused by the ledger, no model request, the fixed reply.
    const before = sent;
    const refused = await send(101);
    assert.equal(sent, before, "no model request");
    assert.equal(refused.status, "completed");
    assert.equal(refused.answer?.text, AGENT_CHAT_DAILY_LIMIT_TEXT.ja);
    assert.deepEqual(await ledger.reserve({ actorId: ACTOR, idempotencyKey: "agent-chat:over", now, pool: "user", purpose: "agent_chat", trigger: "manual" }), { limit: "agent_chat", ok: false, reason: "daily_limit", retryOn: "2026-11-27T15:00:00.000Z" });

    // The user pool's own 10 are all still there.
    for (let n = 0; n < USER_POOL_DAILY_LIMIT; n += 1) assert.equal((await ledger.reserve({ actorId: ACTOR, idempotencyKey: `insight:${n}`, now, pool: "user", purpose: "insight", trigger: "manual" })).ok, true);
    assert.equal((await ledger.reserve({ actorId: ACTOR, idempotencyKey: "insight:over", now, pool: "user", purpose: "insight", trigger: "manual" })).ok, false);
    usage = await ledger.readUsageToday(ACTOR, now);
    assert.deepEqual([usage.agentChat, usage.user], [AGENT_CHAT_DAILY_LIMIT, USER_POOL_DAILY_LIMIT]);

    // The next Tokyo day starts again.
    const tomorrow = new Date("2026-11-27T15:00:00.000Z");
    assert.equal((await ledger.reserve({ actorId: ACTOR, idempotencyKey: "agent-chat:tomorrow", now: tomorrow, pool: "user", purpose: "agent_chat", trigger: "manual" })).ok, true);
    // Only the user pool: chat rounds cannot be reserved from the background pool.
    await assert.rejects(ledger.reserve({ actorId: ACTOR, idempotencyKey: "agent-chat:bg", now, pool: "background", purpose: "agent_chat", trigger: "manual" }), /user pool only/u);
    await client.close().catch(() => undefined);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
