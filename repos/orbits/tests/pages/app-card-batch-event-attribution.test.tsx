/**
 * W0015：审阅页的活动归属询问，走真实的 useCardBatch 状态机（fetch 打桩）。
 * - 有候选的名片不自动导入：全站宿主在后台运行、用户从没打开审阅页时，不提交 metEventId、不写计划；
 * - 询问只针对当前这张名片自己的候选（不回落到本批其他活动），决定按名片记，默认勾选；
 * - 完成页按每张名片实际写入的活动分组；勾选框上的回车不确认名片。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { CardBatchHost } from "../../app/(app)/app/contacts/card-batch-0918/card-batch-host";
import { CardBatchImport, EventAttributionPrompt, enterConfirmsReview } from "../../app/(app)/app/contacts/card-batch-0918/card-batch-ui";
import { useCardBatch, type CardBatch } from "../../app/(app)/app/contacts/card-batch-0918/use-card-batch";

// next-auth 的 SessionProvider 在 node 里建的 BroadcastChannel 会让进程不退出（同 host 测试）。
Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

const zh = (copy: { zh: string; en: string }) => copy.zh;
const en = (copy: { zh: string; en: string }) => copy.en;
const BATCH = "batch-attr-1";
// 开始于东京 9/27 00:30（UTC 仍是 9/26），用来确认日期按东京时间显示。
const MIXER = { eventId: "event:mixer", startsAt: "2026-09-26T15:30:00.000Z", title: "Tokyo Startup Mixer" };
const BREAKFAST = { eventId: "event:breakfast", startsAt: "2026-09-27T23:00:00.000Z", title: "Founders Breakfast" };

function item(cardId: string, seq: number, options: { issue?: boolean } = {}): IngestItemDTO {
  return {
    id: `item-${cardId}`, batchId: BATCH, cardId, side: "front", seq, status: "extracted", version: 1,
    sourceFileName: `IMG_${seq}.png`, rawSize: 1, rawMimeType: "image/png", clientDigest: `sha256:${seq}`, imageDigest: `sha256:img-${seq}`,
    derivativeObjectKey: `k${seq}`, derivativeSize: 1,
    extraction: {
      fullName: `名前 ${cardId}`, nativeFullName: `名前 ${cardId}`, romanizedFullName: null, organization: "株式会社ソニック", title: "部長",
      departments: [], emails: [{ value: `${cardId}@example.jp` }], contactPoints: [], addresses: [], website: null, certifications: [], detectedLanguages: ["ja"],
    } as unknown as IngestItemDTO["extraction"],
    extractionSchemaVersion: 1,
    reviewIssues: (options.issue ? [{ code: "NATIVE_ROMANIZED_NAME_CONFLICT", field: "romanizedFullName", message: "" }] : []) as IngestItemDTO["reviewIssues"],
    usage: null, confirmedContactId: null, attemptCount: 1, nextRetryAt: null,
    leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: "2026-09-27T12:00:00.000Z", updatedAt: "",
  } as IngestItemDTO;
}

interface Server {
  confirms: Array<{ cardId: string; metEventId: unknown }>;
  candidateCalls: number;
}

/** 最小浏览器 + 服务端桩：批次详情随确认更新，确认回执与真实接口同形（metEventId 回显提交值）。 */
function stubBrowser(
  t: TestContext,
  input: { items: IngestItemDTO[]; cards: Record<string, string | null>; events: unknown[]; candidateFailures?: number },
): Server {
  const items = input.items.map((entry) => ({ ...entry }));
  const store = new Map([["orbit.cardBatches.active.v1", JSON.stringify([BATCH])]]);
  store.set(`orbit.cardBatch.ledger.v1:${BATCH}`, JSON.stringify({ auto: [], later: [], merged: [], notified: true, user: [] }));
  const listeners = new Map<string, Set<() => void>>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      },
      clearInterval, clearTimeout,
      dispatchEvent(event: Event) {
        for (const listener of listeners.get(event.type) ?? []) listener();
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
      setInterval, setTimeout,
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
  const server: Server = { candidateCalls: 0, confirms: [] };
  const detail = () => ({
    batch: {
      actorId: "a", createdAt: "2026-09-27T12:00:00.000Z", expectedItems: items.length, expiresAt: "2026-10-28T00:00:00.000Z",
      finalizedAt: null, id: BATCH, idempotencyKey: "k", manifestFingerprint: "f", reviewGeneration: 1,
      status: items.every((entry) => entry.status === "confirmed") ? "completed" : "ready_for_review",
      statusReason: null, updatedAt: "2026-09-27T12:10:00.000Z", version: 1,
    },
    items,
  });
  t.mock.method(globalThis, "fetch", async (request: unknown, init?: RequestInit) => {
    const url = String(request);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.startsWith("/api/agent/event-attribution/candidates")) {
      server.candidateCalls += 1;
      // 前 N 次读取失败（503），之后正常返回。
      if (server.candidateCalls <= (input.candidateFailures ?? 0)) return Response.json({ success: false }, { status: 503 });
      return Response.json({ data: { cards: input.cards, events: input.events } });
    }
    if (url.endsWith("/duplicates")) return Response.json({ data: { matches: {} } });
    if (method === "GET" && url.endsWith(`/${BATCH}`)) return Response.json({ data: detail() });
    const confirm = url.match(/\/items\/(item-[^/]+)\/confirm$/);
    if (method === "POST" && confirm) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { metEventId?: unknown };
      const target = items.find((entry) => entry.id === confirm[1])!;
      server.confirms.push({ cardId: target.cardId, metEventId: body.metEventId });
      const contactId = `contact-${target.cardId}`;
      Object.assign(target, { confirmedContactId: contactId, status: "confirmed", version: target.version + 1 });
      return Response.json({ data: { contactId, item: target, items: [target], merged: false, metEventId: body.metEventId ?? null, replayed: false, state: "created" } });
    }
    if (url.includes("/api/agent/plans/candidates")) return Response.json({ data: { candidates: [], contactCount: 0, pendingByNeed: {} } });
    return Response.json({ success: false }, { status: 404 });
  });
  return server;
}

async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
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

const SESSION = { expires: "2099-01-01T00:00:00.000Z", user: { email: "a@example.test", id: "subject:a", name: "A" } };

test("background host: a card with an attribution candidate is never auto-imported; a clean card without one still is (no metEventId)", async (t) => {
  const server = stubBrowser(t, {
    cards: { "card-a": MIXER.eventId, "card-b": null },
    events: [MIXER],
    items: [item("card-a", 1), item("card-b", 2)],
  });
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <SessionProvider refetchOnWindowFocus={false} session={SESSION}>
        <PathnameContext.Provider value="/app/contacts">
          <CardBatchHost />
        </PathnameContext.Provider>
      </SessionProvider>,
    );
  });
  await wait(600);
  // 用户从没打开审阅页：只有没有候选的 card-b 被自动导入，且不带 metEventId；card-a 留给用户确认。
  assert.deepEqual(server.confirms, [{ cardId: "card-b", metEventId: undefined }]);
  assert.match(textOf(root), /1 张名片待你确认/);
  act(() => root.unmount());
});

test("mixed batch: the prompt follows each card's own event, unticking one card does not carry over, and the summary groups by what was written", async (t) => {
  const server = stubBrowser(t, {
    cards: { "card-a": MIXER.eventId, "card-b": null, "card-c": BREAKFAST.eventId },
    events: [MIXER, BREAKFAST],
    // 三张都有疑点：B 也留在队列里，好检查它没有询问。
    items: [item("card-a", 1, { issue: true }), item("card-b", 2, { issue: true }), item("card-c", 3, { issue: true })],
  });
  let batch!: CardBatch;
  function Harness() {
    batch = useCardBatch(BATCH, zh);
    return <CardBatchImport available batch={batch} onBatchStarted={() => undefined} onReset={() => undefined} t={zh} />;
  }
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<Harness />); });
  await wait(600);
  const prompt = () => root.root.findAll((node) => node.type === "label" && node.props["data-event-attribution"] !== undefined);
  const confirm = async () => {
    await act(async () => { await batch.act("confirm"); });
    await wait(50);
  };

  // A：问 Mixer，默认勾选；取消勾选后确认，不带 metEventId。
  assert.equal(batch.active?.cardId, "card-a");
  assert.equal(prompt()[0]?.props["data-event-attribution"], MIXER.eventId);
  assert.equal(prompt()[0]!.findByType("input").props.checked, true);
  act(() => prompt()[0]!.findByType("input").props.onChange({ target: { checked: false } }));
  assert.equal(prompt()[0]!.findByType("input").props.checked, false);
  await confirm();

  // B：没有候选——不询问，也不回落到本批其他活动。
  assert.equal(batch.active?.cardId, "card-b");
  assert.equal(prompt().length, 0);
  await confirm();

  // C：问的是它自己的 Breakfast，仍是默认勾选（A 的取消不带过来）；确认带上 Breakfast。
  assert.equal(batch.active?.cardId, "card-c");
  assert.equal(prompt()[0]?.props["data-event-attribution"], BREAKFAST.eventId);
  assert.equal(prompt()[0]!.findByType("input").props.checked, true);
  await confirm();

  assert.deepEqual(server.confirms, [
    { cardId: "card-a", metEventId: undefined },
    { cardId: "card-b", metEventId: undefined },
    { cardId: "card-c", metEventId: BREAKFAST.eventId },
  ]);
  const text = textOf(root);
  assert.match(text, /1 位联系人记为在「Founders Breakfast」认识/);
  assert.doesNotMatch(text, /Tokyo Startup Mixer」认识/);
  act(() => root.unmount());
});

function mountReview() {
  let batch!: CardBatch;
  function Harness() {
    batch = useCardBatch(BATCH, zh);
    return <CardBatchImport available batch={batch} onBatchStarted={() => undefined} onReset={() => undefined} t={zh} />;
  }
  let root!: ReactTestRenderer;
  act(() => { root = create(<Harness />); });
  return { batch: () => batch, root: () => root };
}

test("candidate fetch fails once: auto-import waits, the retry succeeds, the card is kept for the prompt", async (t) => {
  const server = stubBrowser(t, {
    candidateFailures: 1,
    cards: { "card-a": MIXER.eventId, "card-b": null },
    events: [MIXER],
    items: [item("card-a", 1), item("card-b", 2)],
  });
  const view = mountReview();
  await wait(800);
  // 第一次失败、重试还没到：两张都没有被自动导入。
  assert.equal(server.candidateCalls, 1);
  assert.deepEqual(server.confirms, []);
  await wait(2_000);
  assert.equal(server.candidateCalls, 2);
  assert.deepEqual(server.confirms, [{ cardId: "card-b", metEventId: undefined }]);
  assert.equal(view.batch().active?.cardId, "card-a");
  const prompt = view.root().root.findAll((node) => node.type === "label" && node.props["data-event-attribution"] === MIXER.eventId);
  assert.equal(prompt.length, 1);
  act(() => view.root().unmount());
});

test("candidate fetch fails twice: auto-import proceeds for every clean card, without metEventId", async (t) => {
  const server = stubBrowser(t, {
    candidateFailures: 2,
    cards: { "card-a": MIXER.eventId, "card-b": null },
    events: [MIXER],
    items: [item("card-a", 1), item("card-b", 2)],
  });
  const view = mountReview();
  await wait(2_900);
  assert.equal(server.candidateCalls, 2, "exactly one retry, no endless waiting");
  assert.deepEqual(server.confirms, [
    { cardId: "card-a", metEventId: undefined },
    { cardId: "card-b", metEventId: undefined },
  ]);
  act(() => view.root().unmount());
});

test("the prompt names the event, shows its Tokyo date, starts ticked, and reports each change", () => {
  const changes: boolean[] = [];
  function Harness({ t }: { t: typeof zh }) {
    const [on, setOn] = useState(true);
    return <EventAttributionPrompt busy={false} event={MIXER} on={on} onChange={(next) => { changes.push(next); setOn(next); }} t={t} />;
  }
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Harness t={zh} />); });
  const text = JSON.stringify(renderer.toJSON());
  assert.match(text, /这张名片是在「Tokyo Startup Mixer」认识的吗？/);
  assert.match(text, /9月27日/);
  assert.doesNotMatch(text, /自动导入/);
  const checkbox = () => renderer.root.findByType("input");
  assert.equal(checkbox().props.checked, true);
  act(() => checkbox().props.onChange({ target: { checked: false } }));
  act(() => checkbox().props.onChange({ target: { checked: true } }));
  assert.deepEqual(changes, [false, true]);
  let english!: ReactTestRenderer;
  act(() => { english = create(<Harness t={en} />); });
  assert.match(JSON.stringify(english.toJSON()), /Sep 27/);
});

test("Enter on the attribution checkbox never confirms the card", () => {
  const checkbox = { closest: () => null, getAttribute: (name: string) => (name === "type" ? "checkbox" : null), tagName: "INPUT" };
  assert.equal(enterConfirmsReview({ key: "Enter", target: checkbox }), false);
  const radio = { ...checkbox, getAttribute: (name: string) => (name === "type" ? "radio" : null) };
  assert.equal(enterConfirmsReview({ key: "Enter", target: radio }), false);
  const text = { closest: () => null, getAttribute: (name: string) => (name === "type" ? "text" : null), tagName: "INPUT" };
  assert.equal(enterConfirmsReview({ key: "Enter", target: text }), true);
});
