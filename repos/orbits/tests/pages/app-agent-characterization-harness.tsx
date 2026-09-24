/**
 * 特征化测试共用夹具（iOrbit 任务 1a）。
 *
 * 这个文件不是测试文件（文件名不含 `.test.`），只提供对话壳的挂载夹具：
 * window / document 桩、fetch 路由、计时器记录。`app-agent-chat-characterization.test.tsx`
 * 与 `app-agent-history-characterization.test.tsx` 共用它，
 * 使 `ask` / 历史 两个 hook 抽出后可以用同一组断言证明行为未变。
 *
 * iOrbit 任务 4 的两处追加（都带默认值，既有两套特征化一行未改）：
 *   - `element`：默认挂 `IOrbitShell`（任务 6a：旧 `OrbitRealAgent` 已删除，默认树
 *     因此换成新壳的对话分支 `initialDeepLink`），调用方仍可以传自己的树；
 *   - document 监听器改为记录 + `fireDocumentEvent`，`useOrbitModalA11y` 的 Esc
 *     是挂在 document 上的，原来的空实现没法在测试里触发。
 */
import type { ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { IOrbitShell } from "../../app/(app)/app/agent/iorbit-0918/iorbit-shell";
import {
  OrbitAskProvider,
  useOrbitAsk,
  type OrbitAskChip,
} from "../../app/(app)/app/orbit-global-ask/orbit-ask-context";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";

export interface ObservedCall {
  body: unknown;
  method: string;
  signal?: AbortSignal;
  url: string;
}

export interface TimerRegistration {
  delay: number;
  fire: () => void;
  id: number;
}

export interface StoredSessionFixture {
  createdAt: string;
  customTitle?: string;
  id: string;
  messages: Array<Record<string, unknown>>;
  organization?: Record<string, unknown>;
  panel?: unknown;
  pinned?: boolean;
  title: string;
  updatedAt: string;
}

export interface AskProbe {
  busy: boolean;
  chips: readonly OrbitAskChip[];
  submit: (query: string, context: string | null) => void;
  submitsInPlace: boolean;
}

export interface HarnessOptions {
  /** 要挂载的树；默认 `<IOrbitShell home={null} initialDeepLink viewModel={starter} />`。 */
  element?: ReactNode;
  /** `/api/ai/conversations` 的应答；返回 null 表示该次请求永不 settle（用于超时用例）。 */
  conversation?: (body: Record<string, unknown>, call: ObservedCall) => Response | Promise<Response> | null;
  /** 分组列表。 */
  groups?: Array<Record<string, unknown>>;
  /** `PATCH /api/ai/conversations/sessions/{id}` 是否写入成功。 */
  organizationPersisted?: boolean;
  /** `DELETE` 是否写入成功。 */
  removePersisted?: boolean;
  search?: string;
  sessionStorageSeed?: Record<string, string>;
  /** 按 cursor 分页返回的会话页。 */
  sessionPages?: StoredSessionFixture[][];
}

export interface Harness {
  askProbe: () => AskProbe | null;
  calls: ObservedCall[];
  conversationRequests: Array<Record<string, unknown>>;
  fireDocumentEvent: (type: string, event?: Record<string, unknown>) => Promise<void>;
  fireWindowEvent: (type: string) => Promise<void>;
  localValues: Map<string, string>;
  pushedUrls: string[];
  persistedSessions: Array<Record<string, unknown>>;
  organizationPatches: Array<{ body: Record<string, unknown>; sessionId: string }>;
  deletedSessionIds: string[];
  root: ReactTestRenderer;
  sessionValues: Map<string, string>;
  settle: (rounds?: number) => Promise<void>;
  timers: TimerRegistration[];
}

function storageFor(values: Map<string, string>) {
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
  };
}

export async function mountAgent(
  t: { after: (fn: () => unknown) => void; mock: { method: typeof import("node:test").mock.method } },
  options: HarnessOptions = {},
): Promise<Harness> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>(Object.entries(options.sessionStorageSeed ?? {}));
  const pushedUrls: string[] = [];
  const timers: TimerRegistration[] = [];
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const documentListeners = new Map<string, Set<(event: unknown) => void>>();
  const search = options.search ?? "";
  let timerId = 0;

  const location = {
    href: `https://orbit.test/app/agent${search}`,
    origin: "https://orbit.test",
    pathname: "/app/agent",
    search,
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener(type: string, handler: (event: unknown) => void) {
        const set = documentListeners.get(type) ?? new Set();
        set.add(handler);
        documentListeners.set(type, set);
      },
      documentElement: { lang: "zh" },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        documentListeners.get(type)?.delete(handler);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, handler: (event: unknown) => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(handler);
        listeners.set(type, set);
      },
      clearInterval: (id: number) => clearInterval(id as unknown as NodeJS.Timeout),
      // 计时器被记录而不是真正排期：`fetchAgentConversation` 的 60s 预算在测试里
      // 必须可断言、可手动触发，真实排期会让 node:test 挂着一个 60 秒句柄。
      clearTimeout: (id: number) => {
        const index = timers.findIndex((timer) => timer.id === id);
        if (index >= 0) timers.splice(index, 1);
      },
      history: {
        pushState(_state: unknown, _title: string, url: string) {
          pushedUrls.push(url);
          location.href = new URL(url, location.origin).href;
          location.search = new URL(url, location.origin).search;
        },
        replaceState() {},
      },
      localStorage: storageFor(localValues),
      location,
      matchMedia: () => ({ addEventListener() {}, matches: false, removeEventListener() {} }),
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler);
      },
      sessionStorage: storageFor(sessionValues),
      setInterval: (handler: () => void, delay: number) => setInterval(handler, delay) as unknown as number,
      setTimeout: (handler: () => void, delay: number) => {
        timerId += 1;
        timers.push({ delay, fire: handler, id: timerId });
        return timerId;
      },
    },
  });

  const calls: ObservedCall[] = [];
  const conversationRequests: Array<Record<string, unknown>> = [];
  const persistedSessions: Array<Record<string, unknown>> = [];
  const organizationPatches: Array<{ body: Record<string, unknown>; sessionId: string }> = [];
  const deletedSessionIds: string[] = [];
  const pages = options.sessionPages ?? [[]];

  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const call: ObservedCall = {
      body,
      method: (init?.method ?? "GET").toUpperCase(),
      signal: init?.signal ?? undefined,
      url,
    };
    calls.push(call);

    if (url === "/api/ai/conversations") {
      conversationRequests.push(body ?? {});
      const responder = options.conversation;
      const response = responder ? responder(body ?? {}, call) : Response.json({ success: false, error: { code: "NO_RESPONDER" } });
      if (response === null) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
          });
        });
      }
      return response;
    }
    if (url === "/api/ai/conversations/groups") {
      return Response.json({ success: true, data: { groups: options.groups ?? [] } });
    }
    if (url === "/api/ai/conversations/sessions" && call.method === "POST") {
      persistedSessions.push((body?.session as Record<string, unknown>) ?? {});
      return Response.json({ success: true, data: { storage: { persisted: true } } });
    }
    if (url.startsWith("/api/ai/conversations/sessions?")) {
      const cursor = new URL(url, "https://orbit.test").searchParams.get("cursor");
      const index = cursor ? Number(cursor) : 0;
      const sessions = pages[index] ?? [];
      const nextCursor = index + 1 < pages.length ? String(index + 1) : null;
      return Response.json({ success: true, data: { nextCursor, sessions } });
    }
    if (url.startsWith("/api/ai/conversations/sessions/") && call.method === "PATCH") {
      const sessionId = decodeURIComponent(url.slice("/api/ai/conversations/sessions/".length));
      organizationPatches.push({ body: body ?? {}, sessionId });
      if (options.organizationPersisted === false) {
        return Response.json({ success: false, error: { code: "STORAGE_UNAVAILABLE" } }, { status: 503 });
      }
      const patch = (body?.patch ?? {}) as Record<string, unknown>;
      const stored = pages.flat().find((session) => session.id === sessionId);
      return Response.json({
        success: true,
        data: {
          session: {
            ...(stored ?? {}),
            organization: {
              customTitle: (patch.customTitle as string | undefined) ?? null,
              groupId: (patch.groupId as string | null | undefined) ?? null,
              pinned: patch.pinned === true,
              revision: 1,
            },
          },
          storage: { configured: true, persisted: true },
        },
      });
    }
    if (url.startsWith("/api/ai/conversations/sessions/") && call.method === "DELETE") {
      const sessionId = decodeURIComponent(url.slice("/api/ai/conversations/sessions/".length));
      deletedSessionIds.push(sessionId);
      if (options.removePersisted === false) {
        return Response.json({ success: false, error: { code: "STORAGE_UNAVAILABLE" } }, { status: 503 });
      }
      return Response.json({ success: true, data: { storage: { persisted: true } } });
    }
    if (url.startsWith("/api/ai/conversations/sessions/")) {
      const sessionId = decodeURIComponent(url.slice("/api/ai/conversations/sessions/".length));
      const stored = pages.flat().find((session) => session.id === sessionId);
      return stored
        ? Response.json({ success: true, data: { session: stored } })
        : Response.json({ success: false }, { status: 404 });
    }
    return Response.json({ success: true, data: {} });
  });

  let probe: AskProbe | null = null;
  function AskProbeReader() {
    const value = useOrbitAsk();
    probe = value
      ? { busy: value.busy, chips: value.chips, submit: value.submit, submitsInPlace: value.submitsInPlace }
      : null;
    return null;
  }

  const router = {
    back() {},
    forward() {},
    prefetch() {},
    push() {},
    refresh() {},
    replace() {},
  } as unknown as AppRouterInstance;

  const settle = async (rounds = 6) => {
    for (let round = 0; round < rounds; round += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      });
    }
  };

  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <AppRouterContext.Provider value={router}>
        <OrbitAskProvider>
          {options.element ?? (
            <IOrbitShell
              home={null}
              initialDeepLink
              viewModel={createOrbitAgentStarterViewModel()}
            />
          )}
          <AskProbeReader />
        </OrbitAskProvider>
      </AppRouterContext.Provider>,
    );
  });
  await settle();

  t.after(() => {
    act(() => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  return {
    askProbe: () => probe,
    calls,
    conversationRequests,
    deletedSessionIds,
    async fireDocumentEvent(type: string, event: Record<string, unknown> = {}) {
      await act(async () => {
        for (const handler of [...(documentListeners.get(type) ?? [])]) {
          handler({ preventDefault() {}, stopPropagation() {}, type, ...event });
        }
      });
      await settle();
    },
    async fireWindowEvent(type: string) {
      await act(async () => {
        for (const handler of listeners.get(type) ?? []) handler({ type });
      });
      await settle();
    },
    localValues,
    organizationPatches,
    persistedSessions,
    pushedUrls,
    root,
    sessionValues,
    settle,
    timers,
  };
}

/** 递归取节点文本，用于断言渲染出来的回合正文。 */
export function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object") {
    // 同时覆盖 toJSON 的节点与 ReactTestInstance（两者都用 children 暴露子节点）。
    const children = (node as { children?: unknown }).children;
    if (children !== undefined && children !== null) return textOf(children);
  }
  return "";
}

export function renderedText(root: ReactTestRenderer): string {
  return textOf(root.toJSON() as unknown);
}

export function buttonWithText(root: ReactTestRenderer, label: string) {
  const found = root.root
    .findAll((node) => node.type === "button")
    .find((node) => textOf(node.children as unknown).includes(label));
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
}

/**
 * 成功应答：带一条 contact_recommendations artifact（只有 provenance，没有条目），
 * 使 `ask` 走「有据可依」分支并渲染 assistantMessage 原文。
 */
export function successReply(assistantMessage: string, body: Record<string, unknown>) {
  return Response.json({
    success: true,
    data: {
      artifacts: [
        {
          result: {
            generatedView: { sections: [], summary: "摘要" },
            kind: "contact_recommendations",
            presentation: { title: "人脉推荐" },
            provenance: {
              evidenceIds: ["evidence:one"],
              generatedAt: "2026-09-20T00:00:00.000Z",
              sourceModules: ["contacts"],
            },
          },
        },
      ],
      assistantMessage,
      reliableSend: {
        messageRevision: 2,
        protocolVersion: 2,
        replayed: false,
        requestId: body.requestId,
        sessionId: body.sessionId,
        state: "completed",
      },
    },
  });
}
