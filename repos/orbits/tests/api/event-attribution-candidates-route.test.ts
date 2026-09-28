/**
 * W0015 SC-01：`GET /api/agent/event-attribution/candidates`。身份只在服务端解析；批次按本人读取，
 * 报名状态按本人的 Auth.js 用户 id 读取——他人报名的活动、他人的批次都看不到。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createEventAttributionCandidateRouteHandlers } from "../../app/api/agent/event-attribution/candidates/route-handlers";
import type { BusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import type { AttributionEvent, EventAttributionSource } from "../../features/plans/event-attribution";

// 活动 9/27 19:00 JST 开始。
const MIXER: AttributionEvent = { eventId: "event:mixer", startsAt: "2026-09-27T10:00:00.000Z", title: "Tokyo Startup Mixer" };

function item(cardId: string, seq: number, createdAt: string) {
  return { cardId, createdAt, seq };
}

/** alice 的批次：c1 在活动当晚扫、c2 在第三天扫；bob 的批次对 alice 不存在。 */
const BATCHES: Record<string, Record<string, ReturnType<typeof item>[]>> = {
  "actor:alice": {
    "batch:alice": [item("c1", 1, "2026-09-27T12:30:00.000Z"), item("c1", 2, "2026-09-27T12:30:01.000Z"), item("c2", 3, "2026-09-29T02:00:00.000Z")],
  },
  "actor:bob": { "batch:bob": [item("b1", 1, "2026-09-27T12:30:00.000Z")] },
};

function ingestRepository(): BusinessCardIngestRepository {
  return {
    async getBatch({ actorId, batchId }: { actorId: string; batchId: string }) {
      const items = BATCHES[actorId]?.[batchId];
      return items ? ({ batch: { id: batchId }, items } as never) : null;
    },
  } as unknown as BusinessCardIngestRepository;
}

function source(registered: Record<string, string[]>): EventAttributionSource {
  return {
    async listEventsStartingBetween(from, to) {
      return [MIXER].filter((event) => event.startsAt >= from && event.startsAt < to);
    },
    async registeredEventIds({ eventIds, userId }) {
      return new Set(eventIds.filter((id) => registered[userId]?.includes(id)));
    },
  };
}

function handlers(actor: { id: string; userId?: string } | null, registered: Record<string, string[]>) {
  return createEventAttributionCandidateRouteHandlers({
    ingestRepository: async () => ingestRepository(),
    resolveActor: async () => actor,
    source: async () => source(registered),
  });
}

async function get(route: ReturnType<typeof handlers>, batchId: string | null) {
  const url = batchId === null ? "http://test/candidates" : `http://test/candidates?batchId=${encodeURIComponent(batchId)}`;
  const response = await route.GET(new Request(url));
  const body = (await response.json()) as { data?: Record<string, unknown>; error?: { code?: string } };
  return { body, status: response.status };
}

test("the registered event is the candidate only for cards scanned on its start day or the next day", async () => {
  const result = await get(handlers({ id: "actor:alice", userId: "user:alice" }, { "actor:alice": [MIXER.eventId] }), "batch:alice");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { cards: { c1: MIXER.eventId, c2: null }, events: [MIXER] });
});

test("registrations are read by account id: a registration kept only under the session user id is not a candidate", async () => {
  // 报名路由以 actor.id（账号 id）写报名；账号 id 与 Auth.js 会话 id 不同时，必须按账号 id 读。
  const underSession = await get(handlers({ id: "actor:alice", userId: "user:alice" }, { "user:alice": [MIXER.eventId] }), "batch:alice");
  assert.deepEqual(underSession.body.data, { cards: { c1: null, c2: null }, events: [] });
  const underAccount = await get(handlers({ id: "actor:alice", userId: "user:alice" }, { "actor:alice": [MIXER.eventId] }), "batch:alice");
  assert.deepEqual(underAccount.body.data, { cards: { c1: MIXER.eventId, c2: null }, events: [MIXER] });
});

test("another user's registration is invisible: no candidate for the signed-in user", async () => {
  const result = await get(handlers({ id: "actor:alice", userId: "user:alice" }, { "actor:bob": [MIXER.eventId] }), "batch:alice");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { cards: { c1: null, c2: null }, events: [] });
});

test("another actor's batch is 404, a missing batchId is 400, and signed-out is 401", async () => {
  const route = handlers({ id: "actor:alice", userId: "user:alice" }, { "actor:alice": [MIXER.eventId] });
  assert.equal((await get(route, "batch:bob")).status, 404);
  assert.equal((await get(route, null)).status, 400);
  assert.equal((await get(handlers(null, {}), "batch:alice")).status, 401);
});

test("an unconfigured event catalogue (feature off) yields no candidates instead of an error", async () => {
  const route = createEventAttributionCandidateRouteHandlers({
    ingestRepository: async () => ingestRepository(),
    resolveActor: async () => ({ id: "actor:alice", userId: "user:alice" }),
    source: async () => null,
  });
  const result = await get(route, "batch:alice");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { cards: {}, events: [] });
});

test("without a configured batch database the route answers 503", async () => {
  const route = createEventAttributionCandidateRouteHandlers({
    ingestRepository: async () => null,
    resolveActor: async () => ({ id: "actor:alice" }),
    source: async () => source({}),
  });
  assert.equal((await get(route, "batch:alice")).status, 503);
});

test("a configured catalogue that throws answers 503 so the client retries instead of treating it as no candidates", async () => {
  const route = createEventAttributionCandidateRouteHandlers({
    ingestRepository: async () => ingestRepository(),
    resolveActor: async () => ({ id: "actor:alice", userId: "user:alice" }),
    source: async () => ({
      async listEventsStartingBetween() {
        throw new Error("event catalogue down");
      },
      async registeredEventIds() {
        return new Set<string>();
      },
    }),
  });
  assert.equal((await get(route, "batch:alice")).status, 503);
});
