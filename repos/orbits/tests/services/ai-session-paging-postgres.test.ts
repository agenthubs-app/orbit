import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import ts from "typescript";

import { createOrbitAgentChatSessionHandlers } from "../../app/api/ai/conversations/sessions/[id]/handler";
import { createOrbitAgentChatSessionsHandlers } from "../../app/api/ai/conversations/sessions/handler";
import { readEntityDraftIntent } from "../../features/orbit-ai/entity-drafts/contract";
import { createReliableOrbitAgentSendService, ReliableSendError } from "../../features/orbit-ai/reliable-send-service";
import { createTransactionalOrbitAgentChatRequestStore } from "../../features/orbit-ai/storage/orbit-agent-chat-request-store";
import { createTransactionalOrbitAgentChatSessionArtifactReader } from "../../features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader";
import {
  createStorageOrbitAgentChatSessionProvider,
  OrbitAgentChatSessionWriteError,
  orbitAgentChatSessionActorWorkspaceId,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createTransactionalOrbitAgentChatOrganizationStore } from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

/**
 * Sprint 0112 (AI data B1 + B2) against a real PostgreSQL schema.
 *
 * Opening a session reads the latest page (20 messages) and only that page's
 * cards; earlier pages follow a signed cursor. A reliable send appends its two
 * messages without reading or rewriting the session, and an old client's
 * whole-session POST merges by message id instead of truncating or reindexing.
 * The route handlers, the reliable send service, the session provider, the
 * request store and the artifact reader are the production ones; only the model
 * reply (and unrelated memory/feedback/preference boundaries) is stood in for.
 * Sessions are seeded in the storage shape written before this sprint.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `ai_session_paging_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:ai-session-paging:${schema}`;
const SECRET = "ai-session-paging-test-cursor-secret-0112-xxxxxxxx";
const ACTOR_A = "account:paging-a";
const ACTOR_B = "account:paging-b";

let admin: Pool;
let scoped: Pool;
let client: TransactionalPostgresClient;

interface Cost { reads: number; readRows: number; readBytes: number; writes: number; writeRows: number }
let active: Cost | null = null;
function observe(metric: PostgresReadMetric) {
  if (!active) return;
  if (["insert", "update", "delete", "merge"].includes(metric.queryKind)) {
    active.writes += 1;
    active.writeRows += metric.returnedRows;
  } else {
    active.reads += 1;
    active.readRows += metric.returnedRows;
    active.readBytes += metric.approximateSerializedRowBytes;
  }
}
async function measure<T>(run: () => Promise<T>): Promise<{ result: T; cost: Cost }> {
  assert.equal(active, null, "one measured chain at a time");
  active = { reads: 0, readRows: 0, readBytes: 0, writes: 0, writeRows: 0 };
  try {
    const result = await run();
    return { result, cost: { ...active } };
  } finally {
    active = null;
  }
}

function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  scoped = new Pool({ connectionString: scopedUrl(), max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: observe });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await scoped.end(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

function provider(actorId: string) {
  return createStorageOrbitAgentChatSessionProvider({
    actorId,
    store: createPostgresLiveRecordStore({ client }),
    summaryPageClient: client,
    summaryPageSecret: SECRET,
    transactionClient: client,
    workspaceId,
  } as Parameters<typeof createStorageOrbitAgentChatSessionProvider>[0]);
}

function requestStore(actorId: string) {
  return createTransactionalOrbitAgentChatRequestStore({ actorId, client, workspaceId });
}

function sessionHandlers(actorId: string) {
  return createOrbitAgentChatSessionHandlers({
    resolveActor: async () => ({ id: actorId }) as never,
    providerForActor: () => provider(actorId),
    organizationStoreForActor: () => createTransactionalOrbitAgentChatOrganizationStore({ actorId, client, workspaceId }),
    requestStoreForActor: () => requestStore(actorId),
    artifactReaderForActor: () => createTransactionalOrbitAgentChatSessionArtifactReader({ actorId, client, workspaceId }),
  });
}

function sessionsHandlers(actorId: string) {
  return createOrbitAgentChatSessionsHandlers({
    resolveActor: async () => ({ id: actorId }) as never,
    providerForActor: () => provider(actorId),
    organizationStoreForActor: () => createTransactionalOrbitAgentChatOrganizationStore({ actorId, client, workspaceId }),
  });
}

type PageBody = {
  success: boolean;
  error?: { code: string };
  data: {
    session: { id: string; createdAt: string; messageRevision?: number; messages: Array<{ id?: string; role: string; text: string }> };
    page?: { hasMore: boolean; nextCursor: string | null; limit: number };
    artifactRecovery?: { turns: Array<{ assistantMessageId: string; userMessageId: string; requestId: string; runId?: string; actionIds?: string[]; artifacts: unknown[] }>; truncated: boolean; unavailable?: boolean };
  };
};

async function openPage(actorId: string, sessionId: string, query: Record<string, string> = {}): Promise<{ status: number; body: PageBody }> {
  const search = new URLSearchParams(query).toString();
  const response = await sessionHandlers(actorId).GET(
    new Request(`https://orbit.test/api/ai/conversations/sessions/${encodeURIComponent(sessionId)}${search ? `?${search}` : ""}`),
    { params: Promise.resolve({ id: sessionId }) },
  );
  return { status: response.status, body: await response.json() as PageBody };
}

const legacyRecordId = (sessionId: string, identity: string) =>
  `${sessionId.replace(/[^A-Za-z0-9_-]/g, "_")}:${createHash("sha256").update(JSON.stringify([sessionId, identity])).digest("hex")}`;
const requestRecordId = (actorId: string, requestId: string) =>
  createHash("sha256").update(JSON.stringify([actorId, requestId])).digest("hex");
const textFor = (sessionId: string, index: number) => `${index % 2 === 0 ? "问题" : "回答"} ${String(index).padStart(4, "0")} · ${sessionId.slice(-6)}`;
const messageIdFor = (sessionId: string, index: number) =>
  index % 2 === 0 ? `user:${sessionId}:${index}` : `assistant:request:${sessionId}:${index}`;

/**
 * A session exactly as the pre-0112 provider stored it: one session envelope
 * whose search text holds every message, and one message row per message with
 * its array position in payload.index. `withIds: false` stores id-less
 * messages (the oldest clients), whose rows are keyed by position.
 */
async function seedLegacySession(actorId: string, sessionId: string, count: number, options: { withIds?: boolean; cards?: boolean; actionTurn?: number } = {}) {
  const withIds = options.withIds !== false;
  const actorWorkspaceId = orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId);
  const store = createPostgresLiveRecordStore({ client });
  const at = (index: number) => new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString();
  const texts = Array.from({ length: count }, (_, index) => textFor(sessionId, index));
  const updatedAt = at(count);
  await store.upsertRecord({
    collectionName: "orbit_agent_chat_sessions", createdAt: at(0), evidenceIds: [`evidence:orbit-agent-chat:session:${sessionId}`],
    lifecycleState: "active", occurredAt: updatedAt,
    payload: {
      firstUserMessage: texts[0], createdAt: at(0), customTitle: null, id: sessionId, lastMessagePreview: texts.at(-1),
      messageCount: count, messageRevision: count, origin: null, panel: null, pinned: false, title: `长会话 ${sessionId.slice(-6)}`, updatedAt,
    },
    provider: "orbit-agent-chat-session", providerRecordId: sessionId, recordId: sessionId,
    searchText: [sessionId, `长会话 ${sessionId.slice(-6)}`, texts[0], texts.at(-1), ...texts].join(" "),
    sourceId: `source:orbit-agent-chat:session:${sessionId}`, sourceLabel: "seed", sourceType: "system",
    targetId: sessionId, targetType: "conversation", updatedAt, workspaceId: actorWorkspaceId,
  });
  for (let start = 0; start < count; start += 100) {
    await Promise.all(Array.from({ length: Math.min(100, count - start) }, (_, offset) => {
      const index = start + offset;
      const id = messageIdFor(sessionId, index);
      const recordId = legacyRecordId(sessionId, withIds ? id : `legacy-index:${index}`);
      return store.upsertRecord({
        collectionName: "orbit_agent_chat_messages", createdAt: at(0), evidenceIds: [`evidence:orbit-agent-chat:message:${recordId}`],
        lifecycleState: "active", occurredAt: updatedAt,
        payload: { ...(withIds ? { id } : {}), createdAt: at(index), role: index % 2 === 0 ? "user" : "assistant", text: texts[index], index, sessionId },
        provider: "orbit-agent-chat-message", providerRecordId: recordId, recordId,
        searchText: [sessionId, index % 2 === 0 ? "user" : "assistant", texts[index]].join(" "),
        sourceId: `source:orbit-agent-chat:message:${recordId}`, sourceLabel: "seed", sourceType: "system",
        targetId: sessionId, targetType: "conversation", updatedAt, workspaceId: actorWorkspaceId,
      });
    }));
  }
  if (options.cards || options.actionTurn !== undefined) {
    const turns = Array.from({ length: Math.floor(count / 2) }, (_, turn) => turn * 2 + 1)
      .filter((index) => options.cards || index === options.actionTurn);
    for (let start = 0; start < turns.length; start += 100) {
      await Promise.all(turns.slice(start, start + 100).map((index) => seedRequest(actorId, sessionId, index, texts, options.actionTurn === index)));
    }
  }
  return { texts };
}

/** A completed reliable request record for the turn whose assistant reply sits at `index`. */
async function seedRequest(actorId: string, sessionId: string, index: number, texts: readonly string[], withAction = false) {
  const requestId = `request:${sessionId}:${index}`;
  const at = new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString();
  const presentation = { preferredSurface: "inline_card", title: "候选结果" };
  const task = { artifactId: `artifact:${index}`, taskId: `task:${index}`, conversationId: "runtime:paging", kind: "contact_recommendations", status: "ready",
    artifactProducer: "contact_recommendation_producer", presentation, query: "测试", createdAt: at, updatedAt: at };
  const artifacts = withAction ? [] : [{ task, result: { artifactId: task.artifactId, taskId: task.taskId, kind: task.kind, status: "ready", presentation, nextAction: "复核证据。",
    generatedView: { summary: "1位测试候选人", sections: [{ title: "已有关系", items: [{ id: `contact-recommendation:contact:paging:${index}`, title: `测试候选${index}`, body: "虚构关系证据",
      reason: "虚构项目", metadata: [], actions: [{ actionId: `contact:review:contact:paging:${index}`, label: "查看", requiresConfirmation: true }], evidenceIds: [`evidence:paging:${index}`] }] }] } } }];
  const payload = {
    requestId, sessionId, fingerprint: `seed:${requestId}`, state: "completed",
    result: { success: true, data: {
      activeConversationId: "runtime:paging",
      messages: [
        { messageId: `provider-user:${index}`, role: "user", conversationId: "runtime:paging", content: texts[index - 1] },
        { messageId: `assistant:${requestId}`, role: "assistant", conversationId: "runtime:paging", content: texts[index] },
      ],
      artifacts,
      ...(withAction ? { runId: `run:natural-language:${index}`, actionIds: [`action:${index}:reminder`] } : {}),
    } },
  };
  await createPostgresLiveRecordStore({ client }).upsertRecord({
    collectionName: "orbit_agent_chat_requests", createdAt: at, evidenceIds: [], lifecycleState: "active", payload,
    recordId: requestRecordId(actorId, requestId), searchText: "", sourceId: `orbit-agent-request:${requestId}`, sourceType: "manual",
    updatedAt: at, userId: actorId, workspaceId,
  });
}

async function messageRows(actorId: string, sessionId: string) {
  const { rows } = await scoped.query<{ record_id: string; idx: string; digest: string; lifecycle_state: string }>(
    `select record_id, payload->>'index' as idx, md5(payload::text) as digest, lifecycle_state
       from orbit_records where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages' and target_id = $2
      order by (payload->>'index')::numeric, record_id`,
    [orbitAgentChatSessionActorWorkspaceId(workspaceId, actorId), sessionId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// SC-0112-01: opening reads 20 messages and that page's cards; the cursor walks the rest.

test("SC-01 a 500-turn session stored in the old shape opens on its latest 20 messages and pages back to the first without repeat or gap", { skip, timeout: 180_000 }, async () => {
  const sessionId = "session:paging:walk";
  await seedLegacySession(ACTOR_A, sessionId, 1000);
  const first = await openPage(ACTOR_A, sessionId);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.data.session.messages.map((message) => message.text), Array.from({ length: 20 }, (_, i) => textFor(sessionId, 980 + i)));
  assert.equal(first.body.data.page?.hasMore, true);
  assert.equal(first.body.data.page?.limit, 20);
  assert.equal(typeof first.body.data.page?.nextCursor, "string");
  assert.equal(first.body.data.session.messageRevision, 1000, "the header still carries the session revision");

  const pages: string[][] = [first.body.data.session.messages.map((message) => message.id!)];
  let cursor = first.body.data.page!.nextCursor;
  while (cursor) {
    const page = await openPage(ACTOR_A, sessionId, { cursor });
    assert.equal(page.status, 200);
    assert.ok(page.body.data.session.messages.length <= 20);
    pages.push(page.body.data.session.messages.map((message) => message.id!));
    cursor = page.body.data.page!.hasMore ? page.body.data.page!.nextCursor : null;
    if (!page.body.data.page!.hasMore) assert.equal(page.body.data.page!.nextCursor, null);
    assert.ok(pages.length <= 51, "the walk ends");
  }
  assert.equal(pages.length, 50);
  const all = pages.reverse().flat();
  assert.equal(all.length, 1000);
  assert.equal(new Set(all).size, 1000, "no message repeats across pages");
  assert.deepEqual(all, Array.from({ length: 1000 }, (_, index) => messageIdFor(sessionId, index)), "oldest first, nothing missing");
});

test("SC-01 opening costs the same at 10, 100 and 1000 messages, and recovers cards only for the turns on the page", { skip, timeout: 240_000 }, async () => {
  const costs: Record<number, Cost> = {};
  for (const count of [10, 100, 1000]) {
    const sessionId = `session:paging:open:${count}`;
    await seedLegacySession(ACTOR_A, sessionId, count, { cards: true });
    const { result, cost } = await measure(() => openPage(ACTOR_A, sessionId));
    assert.equal(result.status, 200);
    const pageIds = result.body.data.session.messages.map((message) => message.id!);
    const assistants = pageIds.filter((id) => id.startsWith("assistant:"));
    const turns = result.body.data.artifactRecovery!.turns;
    assert.deepEqual(turns.map((turn) => turn.assistantMessageId).sort(), [...assistants].sort(), `${count}: exactly the page's turns have cards`);
    assert.equal(result.body.data.artifactRecovery!.unavailable, undefined, `${count}: every page turn validated`);
    assert.equal(turns.every((turn) => turn.artifacts.length === 1), true);
    costs[count] = cost;
  }
  // The 10-message session fits on one page; 100 and 1000 read a full page plus the lookahead row.
  assert.equal(costs[100]!.reads, costs[1000]!.reads, "same statements whatever the length");
  assert.equal(costs[100]!.readRows, costs[1000]!.readRows, "same rows whatever the length");
  assert.ok(costs[10]!.readRows <= costs[1000]!.readRows);
  assert.ok(costs[1000]!.readRows <= 1 + 21 + 1 + 10, `rows for one open: ${JSON.stringify(costs[1000])}`);
  assert.ok(costs[1000]!.readBytes < costs[100]!.readBytes * 1.2, `bytes do not grow with the session: ${JSON.stringify(costs)}`);
  console.log("open cost by session length", JSON.stringify(costs));
  assert.equal(costs[1000]!.writes, 0, "opening writes nothing");
});

test("SC-01 an earlier page brings that page's cards, including a turn split across the page boundary", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:boundary";
  // 41 messages: the first page is 21..40 and starts with an assistant reply whose question (20) is on the next page.
  await seedLegacySession(ACTOR_A, sessionId, 41, { cards: true });
  const first = await openPage(ACTOR_A, sessionId);
  assert.equal(first.body.data.session.messages[0]!.id, messageIdFor(sessionId, 21));
  const firstTurns = first.body.data.artifactRecovery!.turns.map((turn) => turn.assistantMessageId).sort();
  assert.ok(firstTurns.includes(messageIdFor(sessionId, 21)), "the split turn's card is restored with the page that shows the reply");
  assert.equal(first.body.data.artifactRecovery!.turns.find((turn) => turn.assistantMessageId === messageIdFor(sessionId, 21))?.userMessageId, messageIdFor(sessionId, 20));
  const second = await openPage(ACTOR_A, sessionId, { cursor: first.body.data.page!.nextCursor! });
  const secondIds = second.body.data.session.messages.map((message) => message.id!);
  assert.deepEqual(secondIds, Array.from({ length: 20 }, (_, i) => messageIdFor(sessionId, 1 + i)));
  assert.deepEqual(second.body.data.artifactRecovery!.turns.map((turn) => turn.assistantMessageId).sort(), secondIds.filter((id) => id.startsWith("assistant:")).sort());
  const last = await openPage(ACTOR_A, sessionId, { cursor: second.body.data.page!.nextCursor! });
  assert.deepEqual(last.body.data.session.messages.map((message) => message.id), [messageIdFor(sessionId, 0)]);
  assert.equal(last.body.data.page!.hasMore, false);
  assert.deepEqual(last.body.data.artifactRecovery!.turns, []);
});

// ---------------------------------------------------------------------------
// SC-0112-04: cursors are bound to the account and the session; accounts stay isolated.

test("SC-04 a cursor only works for the session and account it was issued for; tampered cursors and bad limits are refused", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:shared-id";
  await seedLegacySession(ACTOR_A, sessionId, 60);
  await seedLegacySession(ACTOR_B, sessionId, 60);
  await seedLegacySession(ACTOR_A, "session:paging:other", 60);
  const a = await openPage(ACTOR_A, sessionId);
  const cursor = a.body.data.page!.nextCursor!;
  assert.equal((await openPage(ACTOR_A, sessionId, { cursor })).status, 200);

  const foreign = await openPage(ACTOR_B, sessionId, { cursor });
  assert.equal(foreign.status, 400, "B cannot replay A's cursor on B's session with the same id");
  const otherSession = await openPage(ACTOR_A, "session:paging:other", { cursor });
  assert.equal(otherSession.status, 400, "a cursor does not move to another session");
  const [encoded, signature] = cursor.split(".");
  const forged = `${Buffer.from(JSON.stringify({ pos: { index: 5, id: "x" } })).toString("base64url")}.${signature}`;
  assert.equal((await openPage(ACTOR_A, sessionId, { cursor: forged })).status, 400, "a re-signed position is refused");
  assert.equal((await openPage(ACTOR_A, sessionId, { cursor: `${encoded}.AAAA` })).status, 400);
  for (const limit of ["0", "51", "abc"]) assert.equal((await openPage(ACTOR_A, sessionId, { limit })).status, 400, `limit ${limit}`);
  assert.equal((await openPage(ACTOR_A, sessionId, { limit: "5" })).body.data.session.messages.length, 5);

  const bOnly = "session:paging:b-only";
  await seedLegacySession(ACTOR_B, bOnly, 4);
  assert.equal((await openPage(ACTOR_A, bOnly)).status, 404, "A cannot open B's session");
  const b = await openPage(ACTOR_B, sessionId);
  assert.ok(b.body.data.session.messages.every((message) => message.text.endsWith(sessionId.slice(-6))));
});

// ---------------------------------------------------------------------------
// SC-0112-02: a question appends; its reads and writes do not depend on session length.

function loadRoute<TModule>(path: string, boundaries: Record<string, unknown>, real: readonly string[]): TModule {
  const url = new URL(path, import.meta.url);
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id: string) => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id];
    if (id === "next/server" || id.includes("/shared/") || real.some((suffix) => id.endsWith(suffix))) return require(id);
    return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected dependency: ${id}.${String(key)}`); } });
  }, module, module.exports);
  return module.exports as TModule;
}

const modelHistories: Array<readonly { role: string; content: string }[] | undefined> = [];
function conversationRoute(actorId: string) {
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({ actorId, runtime: {} }) },
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({
      sendMessage: async (input: { history?: readonly { role: string; content: string }[]; message: string }) => {
        modelHistories.push(input.history);
        return { success: true, data: {
          activeConversationId: "conversation:paging", assistantMessage: `答复：${input.message}`,
          messages: [{ role: "assistant", messageId: "provider-local", content: `答复：${input.message}`, createdAt: "2026-09-28T00:00:00.000Z", conversationId: "conversation:paging", evidenceIds: [] }],
          artifacts: [], proposedActionRequests: [],
        } };
      },
    }) },
    "../../../../features/orbit-ai/task-interaction-service-factory": { createConfiguredOrbitAiTaskInteractionService: () => ({ handle: async () => ({ remainingActionRequests: [] }) }) },
    "../../../../features/orbit-ai/entity-drafts/contract": { readEntityDraftIntent },
    "../../../../features/orbit-ai/entity-drafts/service-factory": { createConfiguredEntityDraftService: () => ({
      cancel: async () => null, confirm: async () => ({ draft: null, kind: "not_pending" as const }),
      pending: async () => null, propose: async () => null, revise: async () => null,
    }) },
    "../../../../features/agent/memory/service-factory": { createAgentMemoryService: () => ({ getSettings: async () => ({}), context: async () => undefined }) },
    "../../../../features/agent/feedback/service-factory": { createAgentFeedbackService: () => ({ context: async () => undefined }) },
    "../../../../features/agent/preferences": { createAgentPreferencesService: () => ({ get: async () => ({}) }) },
    "../../../../features/integrations/service-factory": { createConfiguredOrbitIntegrationService: () => undefined },
    "../../../../features/contacts/service-factory": { createContactDetailTagStatusService: () => ({}) },
    "../../../../features/orbit-ai/reliable-send-service": { createReliableOrbitAgentSendService, ReliableSendError },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-request-store": { createOrbitAgentChatRequestStore: () => requestStore(actorId) },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory": { createOrbitAgentChatSessionProvider: () => provider(actorId) },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider": { OrbitAgentChatSessionWriteError },
  };
  return loadRoute<{ POST: (request: Request) => Promise<Response> }>("../../app/api/ai/conversations/route.ts", boundaries, ["/ai-session-reference-authorization"]).POST;
}

async function ask(actorId: string, sessionId: string, turn: string, expectedMessageRevision: number) {
  const response = await conversationRoute(actorId)(new Request("http://orbit.local/api/ai/conversations", {
    method: "POST",
    body: JSON.stringify({ protocolVersion: 2, sessionId, requestId: `request:${sessionId}:${turn}`, clientMessageId: `user:${sessionId}:${turn}`,
      expectedMessageRevision, references: [], locale: "zh", message: `新问题 ${turn}` }),
  }));
  return { status: response.status, body: await response.json() as { data: { reliableSend?: { state: string; messageRevision?: number; replayed: boolean } } } };
}

test("SC-02 a question through the real POST route reads and writes the same rows at 10, 100, 1000 and 3000 messages and only appends", { skip, timeout: 240_000 }, async () => {
  const costs: Record<number, Cost> = {};
  for (const count of [10, 100, 1000, 3000]) {
    const sessionId = `session:paging:ask:${count}`;
    await seedLegacySession(ACTOR_A, sessionId, count);
    const before = await messageRows(ACTOR_A, sessionId);
    modelHistories.length = 0;
    const { result, cost } = await measure(() => ask(ACTOR_A, sessionId, "t1", count));
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.reliableSend?.state, "completed");
    assert.equal(result.body.data.reliableSend?.messageRevision, count + 2);
    costs[count] = cost;

    const afterRows = await messageRows(ACTOR_A, sessionId);
    assert.equal(afterRows.length, count + 2, "two rows added, none removed");
    assert.deepEqual(afterRows.slice(0, count), before, "every earlier message row is byte-for-byte unchanged");
    assert.deepEqual(afterRows.slice(count).map((row) => Number(row.idx)), [count, count + 1]);

    const history = modelHistories[0] ?? [];
    assert.equal(history.length, Math.min(count, 12), "the model sees the latest turns, bounded");
    assert.deepEqual(history.map((turn) => turn.content), Array.from({ length: Math.min(count, 12) }, (_, i) => textFor(sessionId, count - Math.min(count, 12) + i)));

    const page = await openPage(ACTOR_A, sessionId);
    assert.deepEqual(page.body.data.session.messages.slice(-2).map((message) => [message.id, message.text]), [
      [`user:${sessionId}:t1`, "新问题 t1"], [`assistant:request:${sessionId}:t1`, "答复：新问题 t1"],
    ]);
  }
  console.log("ask cost by session length", JSON.stringify(costs));
  for (const count of [1000, 3000]) {
    assert.equal(costs[100]!.reads, costs[count]!.reads, `statements: ${JSON.stringify(costs)}`);
    assert.equal(costs[100]!.readRows, costs[count]!.readRows, `rows: ${JSON.stringify(costs)}`);
    assert.equal(costs[10]!.writes, costs[count]!.writes, `writes: ${JSON.stringify(costs)}`);
    assert.equal(costs[10]!.writeRows, costs[count]!.writeRows);
  }
  assert.ok(costs[3000]!.readRows <= 60, `one question reads a bounded number of rows: ${JSON.stringify(costs[3000])}`);
  // The only length-dependent bytes are the session's search text, which is cut to a fixed size.
  assert.ok(Math.abs(costs[3000]!.readBytes - costs[1000]!.readBytes) < costs[1000]!.readBytes * 0.05, `bytes stop growing: ${JSON.stringify(costs)}`);
  assert.ok(costs[3000]!.readBytes < 40_000, `bytes stay small: ${JSON.stringify(costs)}`);
});

test("SC-02 a replayed request writes nothing more and a stale revision is refused before the model runs", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:replay";
  await seedLegacySession(ACTOR_A, sessionId, 30);
  assert.equal((await ask(ACTOR_A, sessionId, "r1", 30)).status, 200);
  modelHistories.length = 0;
  const replay = await measure(() => ask(ACTOR_A, sessionId, "r1", 30));
  assert.equal(replay.result.body.data.reliableSend?.replayed, true);
  assert.equal(modelHistories.length, 0, "the model is not called again");
  assert.equal((await messageRows(ACTOR_A, sessionId)).length, 32);
  const stale = await ask(ACTOR_A, sessionId, "r2", 30);
  assert.equal(stale.status, 409);
  assert.equal(modelHistories.length, 0);
  assert.equal((await messageRows(ACTOR_A, sessionId)).length, 32);
});

test("SC-02 concurrent appends to one session keep every message at a distinct position; an id retried is stored once", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:concurrent";
  await seedLegacySession(ACTOR_A, sessionId, 40);
  const writer = provider(ACTOR_A) as unknown as { appendMessages: (sessionId: string, input: { messages: Array<{ id: string; role: "user" | "assistant"; text: string; createdAt: string }>; updatedAt: string }) => Promise<unknown> };
  const at = new Date().toISOString();
  await Promise.all(Array.from({ length: 6 }, (_, i) => writer.appendMessages(sessionId, {
    messages: [{ id: `user:parallel:${i}`, role: "user", text: `并发 ${i}`, createdAt: at }], updatedAt: at,
  })));
  await writer.appendMessages(sessionId, { messages: [{ id: "user:parallel:0", role: "user", text: "并发 0", createdAt: at }], updatedAt: at });
  const rows = await messageRows(ACTOR_A, sessionId);
  assert.equal(rows.length, 46);
  assert.deepEqual(rows.map((row) => Number(row.idx)), Array.from({ length: 46 }, (_, i) => i), "positions are 0..45 with no duplicate or gap");
  const header = await scoped.query<{ count: number; next: number }>(
    `select (payload->>'messageCount')::int as count, (payload->>'nextMessageIndex')::int as next from orbit_records where workspace_id = $1 and collection_name = 'orbit_agent_chat_sessions' and record_id = $2`,
    [orbitAgentChatSessionActorWorkspaceId(workspaceId, ACTOR_A), sessionId],
  );
  assert.deepEqual(header.rows[0], { count: 46, next: 46 });
});

// ---------------------------------------------------------------------------
// Compatibility: clients that still POST whole sessions.

async function postSession(actorId: string, session: unknown) {
  const response = await sessionsHandlers(actorId).POST(new Request("https://orbit.test/api/ai/conversations/sessions", { method: "POST", body: JSON.stringify({ session }) }));
  return { status: response.status, body: await response.json() as { data?: { session?: { messages: Array<{ id?: string; text: string }> } } } };
}

test("SC-02 an old client that posts only the page it loaded plus new messages cannot truncate, reorder or duplicate the stored session", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:old-client";
  await seedLegacySession(ACTOR_A, sessionId, 150);
  const before = await messageRows(ACTOR_A, sessionId);
  const loaded = (await openPage(ACTOR_A, sessionId)).body.data.session;
  const snapshot = {
    ...loaded,
    messages: [...loaded.messages, { role: "user", text: "旧版本客户端的新问题" }, { role: "assistant", text: "旧版本客户端的新回答" }],
    updatedAt: new Date().toISOString(),
  };
  const saved = await postSession(ACTOR_A, snapshot);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.data?.session?.messages.map((message) => message.text), snapshot.messages.map((message) => message.text), "the receipt echoes what the client sent");
  const once = await messageRows(ACTOR_A, sessionId);
  assert.equal(once.length, 152);
  assert.deepEqual(once.slice(0, 150), before, "the 130 messages the client never loaded, and the 20 it did, are untouched");
  assert.deepEqual(once.slice(150).map((row) => Number(row.idx)), [150, 151]);

  // The same save retried (the old App reposts its pending snapshot) adds nothing.
  assert.equal((await postSession(ACTOR_A, { ...snapshot, updatedAt: new Date().toISOString() })).status, 200);
  assert.equal((await messageRows(ACTOR_A, sessionId)).length, 152);

  const page = await openPage(ACTOR_A, sessionId);
  assert.deepEqual(page.body.data.session.messages.slice(-2).map((message) => message.text), ["旧版本客户端的新问题", "旧版本客户端的新回答"]);
  assert.equal(page.body.data.session.messages[0]!.text, textFor(sessionId, 132));
});

test("SC-02 an old client's full snapshot of an id-less legacy session keeps positions, and a page of it round-trips without duplicates", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:idless";
  const { texts } = await seedLegacySession(ACTOR_A, sessionId, 30, { withIds: false });
  const before = await messageRows(ACTOR_A, sessionId);
  const page = (await openPage(ACTOR_A, sessionId)).body.data.session;
  assert.deepEqual(page.messages.map((message) => message.id), Array.from({ length: 20 }, (_, i) => `legacy-index:${10 + i}`), "id-less rows are addressed by their stored position");
  assert.equal((await postSession(ACTOR_A, { ...page, updatedAt: new Date().toISOString() })).status, 200);
  assert.deepEqual(await messageRows(ACTOR_A, sessionId), before, "posting a loaded page back changes nothing");

  const full = {
    id: sessionId, title: "旧客户端全量", createdAt: page.createdAt, updatedAt: new Date(Date.now() + 1000).toISOString(),
    messages: [...texts.map((text, index) => ({ role: index % 2 === 0 ? "user" : "assistant", text })), { role: "user", text: "全量快照里的新问题" }],
  };
  assert.equal((await postSession(ACTOR_A, full)).status, 200);
  const rows = await messageRows(ACTOR_A, sessionId);
  assert.equal(rows.length, 31);
  assert.deepEqual(rows.slice(0, 30).map((row) => row.record_id), before.map((row) => row.record_id));
  assert.equal(Number(rows[30]!.idx), 30);
});

test("SC-02 a session that was deleted stays deleted when an old client saves late", { skip, timeout: 60_000 }, async () => {
  const sessionId = "session:paging:deleted";
  await seedLegacySession(ACTOR_A, sessionId, 6);
  const loaded = (await openPage(ACTOR_A, sessionId)).body.data.session;
  const deleted = await sessionHandlers(ACTOR_A).DELETE(new Request("https://orbit.test/x", { method: "DELETE" }), { params: Promise.resolve({ id: sessionId }) });
  assert.equal(deleted.status, 200);
  assert.ok((await messageRows(ACTOR_A, sessionId)).every((row) => row.lifecycle_state === "deleted"));
  const late = await postSession(ACTOR_A, { ...loaded, messages: [...loaded.messages, { id: "late", role: "user", text: "晚到" }], updatedAt: new Date().toISOString() });
  assert.equal(late.status, 410);
  assert.equal((await openPage(ACTOR_A, sessionId)).status, 404);
});

// ---------------------------------------------------------------------------
// 0110 leftover: a restored turn that proposed actions carries its run and actions.

test("0110 a restored page tells the client which turn proposed actions, so the confirm card can be shown", { skip, timeout: 60_000 }, async () => {
  const sessionId = "session:paging:action";
  await seedLegacySession(ACTOR_A, sessionId, 8, { actionTurn: 5 });
  const page = await openPage(ACTOR_A, sessionId);
  const turn = page.body.data.artifactRecovery!.turns.find((item) => item.assistantMessageId === messageIdFor(sessionId, 5));
  assert.ok(turn, JSON.stringify(page.body.data.artifactRecovery));
  assert.equal(turn.runId, "run:natural-language:5");
  assert.deepEqual(turn.actionIds, ["action:5:reminder"]);
  assert.deepEqual(turn.artifacts, []);
});

test("SC-04 deleting a 1000-message session and listing analysis sessions never read the whole session at once", { skip, timeout: 120_000 }, async () => {
  const sessionId = "session:paging:delete-long";
  await seedLegacySession(ACTOR_A, sessionId, 1000);
  const deleted = await measure(() => provider(ACTOR_A).deleteSession(sessionId));
  assert.equal(deleted.result, true);
  assert.ok((await messageRows(ACTOR_A, sessionId)).every((row) => row.lifecycle_state === "deleted"));
  assert.ok(deleted.cost.readRows <= 1 + 1000 + 20, `delete reads each message at most once: ${JSON.stringify(deleted.cost)}`);
  const listed = await measure(() => provider(ACTOR_A).listSessionsByEntryPoint("contacts.analysis"));
  assert.deepEqual(listed.result, []);
  assert.ok(listed.cost.readRows <= 50, `analysis lookup is bounded: ${JSON.stringify(listed.cost)}`);
});
