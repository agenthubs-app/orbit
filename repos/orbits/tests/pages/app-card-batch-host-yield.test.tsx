/**
 * W0006 SC-03：全站名片解析宿主（CardBatchHost）在引导页 /app/start 让位。
 * 引导页自己挂着同一个状态机（接上本机进行中的批次）；宿主若也盯着同一批，会重复上传 / 自动导入。
 * 这里用真实组件挂载：同一个进行中批次，在 /app/start 宿主一次批次接口都不请求，在 /app/agent 照常请求。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { SessionProvider } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { act, create } from "react-test-renderer";

import {
  CARD_BATCH_HOST_YIELD_PREFIXES,
  CardBatchHost,
  cardBatchHostYields,
} from "../../app/(app)/app/contacts/card-batch-0918/card-batch-host";

test("the host yields on /app/start next to onboarding, import and account pages", () => {
  assert.ok(CARD_BATCH_HOST_YIELD_PREFIXES.includes("/app/start"));
  for (const pathname of ["/app/start", "/app/profile/onboarding", "/app/contacts/new", "/app/account/login"]) {
    assert.equal(cardBatchHostYields({ authenticated: true, pathname }), true, pathname);
  }
  for (const pathname of ["/app/agent", "/app/contacts", "/app/events"]) {
    assert.equal(cardBatchHostYields({ authenticated: true, pathname }), false, pathname);
  }
  assert.equal(cardBatchHostYields({ authenticated: false, pathname: "/app/agent" }), true);
  assert.equal(cardBatchHostYields({ authenticated: true, pathname: "/events" }), true);
});

// next-auth 的 SessionProvider 会建一个进程级 BroadcastChannel，node 里它会让测试进程不退出；
// 没有 BroadcastChannel 时它用空实现。在它第一次创建之前拿掉全局构造器（本文件只测宿主让位）。
Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: undefined });

function stubBrowser(t: TestContext) {
  const store = new Map([["orbit.cardBatches.active.v1", JSON.stringify(["batch-guide-1"])]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval,
      clearTimeout,
      dispatchEvent() {
        return true;
      },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
      location: { assign() {}, href: "https://orbit.test/app" },
      removeEventListener() {},
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
  const batchRequests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.includes("/batches/")) batchRequests.push(url);
    return Response.json({ success: false }, { status: 404 });
  });
  return batchRequests;
}

async function mountHost(pathname: string) {
  const session = { expires: "2099-01-01T00:00:00.000Z", user: { email: "a@example.test", id: "subject:a", name: "A" } };
  let root!: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <SessionProvider refetchOnWindowFocus={false} session={session}>
        <PathnameContext.Provider value={pathname}>
          <CardBatchHost />
        </PathnameContext.Provider>
      </SessionProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return root;
}

test("on /app/start the host requests nothing for the in-progress batch; on /app/agent it does", async (t) => {
  const batchRequests = stubBrowser(t);
  const onStart = await mountHost("/app/start");
  assert.deepEqual(batchRequests, [], "the host does not touch the batch the guide page owns");
  assert.equal(onStart.toJSON(), null);
  act(() => onStart.unmount());

  const onAgent = await mountHost("/app/agent");
  assert.ok(batchRequests.some((url) => url.endsWith("/batch-guide-1")), "elsewhere the host keeps processing");
  act(() => onAgent.unmount());
});
