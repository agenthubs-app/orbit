/**
 * W0011 SC-02／SC-03：iOrbit 首页 /app/agent 上全站名片宿主（CardBatchHost）不让位，只隐藏
 * 「N 张名片待你确认」胶囊（待确认已作为今日要事出现）；解析进度胶囊与解析完成弹窗照常。
 * 今日要事的只读数据源 use-pending-cards 只发 GET，不启动第二个名片状态机。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { SessionProvider } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import {
  CARD_BATCH_HOST_HIDE_PENDING_PILL_PATHS,
  CARD_BATCH_HOST_YIELD_PREFIXES,
  CardBatchHost,
  cardBatchHostHidesPendingPill,
  cardBatchHostYields,
} from "../../app/(app)/app/contacts/card-batch-0918/card-batch-host";
import { PENDING_CARDS_COALESCE_MS, usePendingCards } from "../../app/(app)/app/agent/iorbit-0918/use-pending-cards";

// next-auth 的 SessionProvider 在 node 里建的 BroadcastChannel 会让进程不退出（同 host-yield 测试）。
Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

const BATCH = "batch-agent-1";

function item(overrides: Partial<IngestItemDTO> = {}): IngestItemDTO {
  return {
    id: "item-1", batchId: BATCH, cardId: "card-1", side: "front", seq: 1, status: "extracted", version: 1,
    sourceFileName: "IMG_1.png", rawSize: 1, rawMimeType: "image/png", clientDigest: "sha256:x", imageDigest: "sha256:y",
    derivativeObjectKey: "k", derivativeSize: 1,
    extraction: {
      fullName: "山本 健一", nativeFullName: "山本 健一", romanizedFullName: null, organization: "株式会社ソニック", title: "部長",
      departments: [], emails: [{ value: "k@example.jp" }], contactPoints: [], addresses: [], website: null, certifications: [], detectedLanguages: ["ja"],
    } as unknown as IngestItemDTO["extraction"],
    // 有一条疑点：不会被自动导入，留给用户确认。
    extractionSchemaVersion: 1, reviewIssues: [{ code: "NATIVE_ROMANIZED_NAME_CONFLICT", field: "romanizedFullName", message: "" }] as IngestItemDTO["reviewIssues"],
    usage: null, confirmedContactId: null, attemptCount: 1, nextRetryAt: null,
    leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: "", updatedAt: "",
    ...overrides,
  } as IngestItemDTO;
}

function detail(status: string, items: IngestItemDTO[] = [item()]) {
  return {
    batch: {
      actorId: "a", createdAt: "2026-09-28T01:05:00.000Z", expectedItems: items.length, expiresAt: "2026-10-28T00:00:00.000Z",
      finalizedAt: null, id: BATCH, idempotencyKey: "k", manifestFingerprint: "f", reviewGeneration: 1, status,
      statusReason: null, updatedAt: "2026-09-28T01:06:00.000Z", version: 1,
    },
    items,
  };
}

interface Stub {
  /** 之后的批次 GET 一律 503（模拟读取失败）。 */
  failGets: { on: boolean };
  requests: Array<{ method: string; url: string }>;
  store: Map<string, string>;
}

function stubBrowser(t: TestContext, options: { detail: unknown; later?: string[]; notified: boolean }): Stub {
  const store = new Map([["orbit.cardBatches.active.v1", JSON.stringify([BATCH])]]);
  store.set(`orbit.cardBatch.ledger.v1:${BATCH}`, JSON.stringify({ auto: [], later: options.later ?? [], merged: [], notified: options.notified, user: [] }));
  const failGets = { on: false };
  const listeners = new Map<string, Set<() => void>>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      },
      clearInterval,
      clearTimeout,
      dispatchEvent(event: Event) {
        // 与浏览器一样把事件对象交给监听者（W0021：宿主的事件带状态与计数）。
        for (const listener of listeners.get(event.type) ?? []) (listener as (event: Event) => void)(event);
        return true;
      },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
      location: { assign() {}, href: "https://orbit.test/app" },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      setInterval,
      setTimeout,
    },
  });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  });
  const requests: Stub["requests"] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("/batches/")) requests.push({ method, url });
    // W0021 review：SessionProvider 没有预置会话时自己 GET /api/auth/session（先 loading）。
    if (url.includes("/api/auth/session")) return Response.json(SESSION);
    if (url.endsWith("/duplicates")) return Response.json({ data: { matches: { "card-1": null, "card-2": null } } });
    // W0021：今日要事读 `?view=cards`（分组与状态列）；夹具的完整详情是它的超集。
    if (method === "GET" && (url.endsWith(`/${BATCH}`) || url.endsWith(`/${BATCH}?view=cards`))) {
      return failGets.on ? Response.json({ success: false }, { status: 503 }) : Response.json({ data: options.detail });
    }
    return Response.json({ success: false }, { status: 404 });
  });
  return { failGets, requests, store };
}

function textOf(root: ReactTestRenderer): string {
  const walk = (node: unknown): string => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(walk).join("");
    return walk((node as { children?: unknown }).children ?? null);
  };
  return walk(root.toJSON());
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const SESSION = { expires: "2099-01-01T00:00:00.000Z", user: { email: "a@example.test", id: "subject:a", name: "A" } };

async function mount(pathname: string, children: React.ReactNode = <CardBatchHost />, session: typeof SESSION = SESSION) {
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <SessionProvider refetchOnWindowFocus={false} session={session}>
        <PathnameContext.Provider value={pathname}>{children}</PathnameContext.Provider>
      </SessionProvider>,
    );
  });
  await wait(20);
  return root;
}

function PendingProbe({ onValue }: { onValue: (value: readonly { batchId: string; pending: number }[]) => void }) {
  onValue(usePendingCards(true).batches);
  return null;
}

function hostWithReader(onValue: (value: readonly { batchId: string; pending: number }[]) => void = () => undefined) {
  return (
    <>
      <CardBatchHost />
      <PendingProbe onValue={onValue} />
    </>
  );
}

test("the hide-pending-pill rule is exact /app/agent only and separate from the yield list", () => {
  assert.deepEqual([...CARD_BATCH_HOST_HIDE_PENDING_PILL_PATHS], ["/app/agent"]);
  assert.equal(cardBatchHostHidesPendingPill("/app/agent", "ready"), true);
  assert.equal(cardBatchHostHidesPendingPill("/app/agent/", "ready"), true);
  assert.equal(cardBatchHostHidesPendingPill("/app/agent", "pending"), true);
  // 兜底：今日要事读不到或没挂时，胶囊照常。
  assert.equal(cardBatchHostHidesPendingPill("/app/agent", "unavailable"), false);
  assert.equal(cardBatchHostHidesPendingPill("/app/agent", "absent"), false);
  for (const pathname of ["/app/agent/plan", "/app/contacts", "/app/events", "/app"]) {
    assert.equal(cardBatchHostHidesPendingPill(pathname, "ready"), false, pathname);
  }
  // 宿主在 /app/agent 不让位：状态机照常在这里运行。
  assert.ok(!(CARD_BATCH_HOST_YIELD_PREFIXES as readonly string[]).includes("/app/agent"));
  assert.equal(cardBatchHostYields({ authenticated: true, pathname: "/app/agent" }), false);
});

test("on /app/agent the pending pill is hidden; on another /app page it still shows", async (t) => {
  stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  const onAgent = await mount("/app/agent", hostWithReader());
  assert.doesNotMatch(textOf(onAgent), /张名片待你确认/, "iOrbit lists pending cards as a today item instead");
  act(() => onAgent.unmount());

  const onContacts = await mount("/app/contacts");
  assert.match(textOf(onContacts), /1 张名片待你确认/);
  act(() => onContacts.unmount());
});

test("fallback: on /app/agent without the today-item reader (e.g. the chat view) the pending pill still shows", async (t) => {
  stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  const alone = await mount("/app/agent");
  assert.match(textOf(alone), /1 张名片待你确认/);
  act(() => alone.unmount());
});

test("fallback: when the reader's batch GET fails (5xx), the host shows the pending pill again on /app/agent", async (t) => {
  const { failGets } = stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  const root = await mount("/app/agent", hostWithReader());
  assert.doesNotMatch(textOf(root), /张名片待你确认/);
  failGets.on = true;
  await act(async () => {
    window.dispatchEvent(new Event("orbit-card-batches"));
  });
  // W0021：连续事件合并后再读。
  await wait(PENDING_CARDS_COALESCE_MS + 30);
  assert.match(textOf(root), /1 张名片待你确认/, "pending cards are never left without a reminder");
  act(() => root.unmount());
});

test("count parity: one card deferred with 稍后处理 plus one pending gives 1 in both the pill and the today-item reader", async (t) => {
  const twoCards = [item(), item({ cardId: "card-2", clientDigest: "sha256:z", id: "item-2", seq: 2 })];
  stubBrowser(t, { detail: detail("ready_for_review", twoCards), later: ["card-1"], notified: true });
  let seen: readonly { batchId: string; pending: number }[] = [];
  const root = await mount("/app/contacts", hostWithReader((value) => (seen = value)));
  assert.match(textOf(root), /1 张名片待你确认/);
  assert.deepEqual(seen.map((entry) => entry.pending), [1]);
  act(() => root.unmount());
});

test("on /app/agent the parsing-progress pill still shows", async (t) => {
  stubBrowser(t, { detail: detail("processing", [item({ extraction: null, reviewIssues: [], status: "processing" })]), notified: false });
  const parsing = await mount("/app/agent");
  assert.match(textOf(parsing), /正在解析名片 0\/1/);
  act(() => parsing.unmount());
});

test("on /app/agent the parse-done modal still opens when recognition finishes", async (t) => {
  stubBrowser(t, { detail: detail("ready_for_review"), notified: false });
  const done = await mount("/app/agent");
  const text = textOf(done);
  assert.match(text, /1 张名片解析完毕/);
  assert.match(text, /去确认 1 张名片/);
  act(() => done.unmount());
});

test("with the host and the today-item reader both on /app/agent, one state machine runs and the reader only GETs", async (t) => {
  const { requests } = stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  let seen: readonly { batchId: string; pending: number }[] = [];
  const root = await mount("/app/agent", hostWithReader((value) => (seen = value)));
  // 等过宿主查重的 350 ms 防抖：两个状态机就会有两次查重 POST。
  await wait(450);
  assert.deepEqual(seen.map((entry) => [entry.batchId, entry.pending]), [[BATCH, 1]]);
  const posts = requests.filter((request) => request.method !== "GET");
  assert.deepEqual(posts.map((request) => request.url.split("/").at(-1)), ["duplicates"], "only the host's single state machine writes");
  const gets = requests.filter((request) => request.method === "GET");
  // 宿主读完整详情，今日要事只读 `?view=cards`，而且冷启动只读一次（宿主首次广播的状态与它读到的一致，不重读）。
  assert.ok(gets.every((request) => request.url.endsWith(`/${BATCH}`) || request.url.endsWith(`/${BATCH}?view=cards`)));
  assert.equal(gets.filter((request) => request.url.endsWith("?view=cards")).length, 1, JSON.stringify(gets));
  act(() => root.unmount());

  // 只挂读取器：只有 GET 批次详情，没有上传、识别、查重或确认请求。
  requests.length = 0;
  const alone = await mount("/app/agent", <PendingProbe onValue={(value) => (seen = value)} />);
  assert.ok(requests.length > 0);
  assert.ok(requests.every((request) => request.method === "GET" && request.url.endsWith(`/${BATCH}?view=cards`)), JSON.stringify(requests));
  act(() => alone.unmount());
});

test("use-pending-cards never mounts the card-batch state machine", () => {
  const source = readFileSync("app/(app)/app/agent/iorbit-0918/use-pending-cards.ts", "utf8");
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), /useCardBatch|use-card-batch|postAction|uploadItemContent/);
});

/* ── W0021 SC-W0021-03：进行中批次登记表按账号隔离 ─────────────────────── */

const SESSION_B = { expires: "2099-01-01T00:00:00.000Z", user: { email: "b@example.test", id: "subject:b", name: "B" } };

test("W0021: the active-batch registry is per account — A's batches are never read after B signs in on the same tab", async (t) => {
  const { requests, store } = stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  let seen: readonly { batchId: string; pending: number }[] = [];
  const asA = await mount("/app/agent", <PendingProbe onValue={(value) => (seen = value)} />);
  assert.deepEqual(seen.map((entry) => entry.batchId), [BATCH]);
  // 旧的全局 key 并入 A 的 key 后删除。
  assert.equal(store.get("orbit.cardBatches.active.v1"), undefined);
  assert.equal(store.get("orbit.cardBatches.active.v1:subject:a"), JSON.stringify([BATCH]));
  act(() => asA.unmount());

  requests.length = 0;
  const asB = await mount("/app/agent", <PendingProbe onValue={(value) => (seen = value)} />, SESSION_B);
  assert.deepEqual(seen, []);
  assert.deepEqual(requests, [], "B's tab never asks for A's batch");
  act(() => asB.unmount());
});

test("W0021: a host event with the state the reader already has does not re-read; a changed state re-reads that batch once", async (t) => {
  const { requests } = stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  const root = await mount("/app/agent", <PendingProbe onValue={() => undefined} />);
  const reads = () => requests.filter((request) => request.url.endsWith("?view=cards")).length;
  assert.equal(reads(), 1);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("orbit-card-batches", { detail: { batchId: BATCH, confirmed: 0, pending: 1, status: "ready_for_review" } }));
  });
  await wait(PENDING_CARDS_COALESCE_MS + 30);
  assert.equal(reads(), 1, "same status and counts: nothing to re-read");
  // 连续三个事件（状态变了）合并成一次读取。
  await act(async () => {
    for (const pending of [0, 0, 0]) {
      window.dispatchEvent(new CustomEvent("orbit-card-batches", { detail: { batchId: BATCH, confirmed: 1, pending, status: "ready_for_review" } }));
    }
  });
  await wait(PENDING_CARDS_COALESCE_MS + 30);
  assert.equal(reads(), 2);
  act(() => root.unmount());
});

test("W0021 review: when the session resolves from loading to authenticated, readers pick up the account-scoped batches (still one read each)", async (t) => {
  const { requests, store } = stubBrowser(t, { detail: detail("ready_for_review"), notified: true });
  // 批次只登记在账号 key 下（旧全局 key 不存在）。
  store.delete("orbit.cardBatches.active.v1");
  store.set("orbit.cardBatches.active.v1:subject:a", JSON.stringify([BATCH]));
  let seen: readonly { batchId: string; pending: number }[] = [];
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <SessionProvider refetchOnWindowFocus={false}>
        <PathnameContext.Provider value="/app/contacts">{hostWithReader((value) => (seen = value))}</PathnameContext.Provider>
      </SessionProvider>,
    );
  });
  await wait(450);
  assert.deepEqual(seen.map((entry) => [entry.batchId, entry.pending]), [[BATCH, 1]], "the today reader sees the account's batch");
  assert.match(textOf(root), /1 张名片待你确认/, "the host watches the account's batch");
  const cardsReads = requests.filter((request) => request.method === "GET" && request.url.endsWith(`/${BATCH}?view=cards`));
  assert.equal(cardsReads.length, 1, JSON.stringify(requests));
  act(() => root.unmount());
});
