import assert from "node:assert/strict";
import test from "node:test";
import { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { OrbitRealAgent, parseAgentChatHistoryStorage } from "../../app/(app)/app/agent/orbit-real-agent";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";

const suggestion = { state: "suggested", title: "准备会面", category: "work", suggestionId: "suggestion:one/two", dueAt: "2026-09-09T01:00:00.000Z" };
const task = {
  id: "task:one/two", accountId: "account:test", ownerUserId: "account:test", title: "准备会面",
  status: "open", category: "work", priority: "normal", source: "ai_confirmed",
  createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
};

function restored(interaction: unknown, rich = false) {
  return parseAgentChatHistoryStorage(JSON.stringify([{
    id: "session:one", title: "会面准备", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z",
    messages: [{ role: "user", text: "准备会面" }, {
      ...(rich ? { items: [], kind: "people", panelTitle: "" } : {}),
      role: "assistant", text: "可以加入待办。", taskInteraction: interaction,
    }],
  }]))[0].messages[1] as unknown as { text: string; taskInteraction?: Record<string, unknown> };
}

test("minimal shared assistant history restores its task suggestion instead of losing the card", () => {
  assert.deepEqual(restored(suggestion).taskInteraction, suggestion);
});

test("created task history keeps the canonical task ID", () => {
  const created = { state: "created", title: "准备会面", category: "work", taskId: "task:one/two" };
  assert.deepEqual(restored(created).taskInteraction, created);
});

test("malformed persisted interactions cannot expose confirmation buttons or fake task links", () => {
  for (const invalid of [
    { ...suggestion, suggestionId: 7 },
    { ...suggestion, state: "created", taskId: " " },
    { ...suggestion, state: { toString: "invalid", valueOf: "invalid" } },
  ]) {
    const message = restored(invalid, true);
    assert.equal(message.text, "可以加入待办。");
    assert.equal(message.taskInteraction?.state, "unavailable");
    assert.equal(message.taskInteraction?.taskId, undefined);
    assert.equal(message.taskInteraction?.suggestionId, undefined);
  }
});

test("dismissed task history stays resolved when reopened", () => {
  assert.equal(restored({ ...suggestion, state: "dismissed" }).taskInteraction?.state, "dismissed");
});

async function mountCard(t: any, interaction: unknown, fetcher?: typeof fetch) {
  if (fetcher) t.mock.method(globalThis, "fetch", fetcher);
  const { AgentTaskInteractionCard } = await import("../../app/(app)/app/agent/agent-task-interaction-card");
  const { useAgentTaskSuggestions } = await import("../../app/(app)/app/agent/agent-task-interaction-client");
  const { parseAgentTaskInteraction } = await import("../../app/(app)/app/agent/agent-task-interaction-view-model");
  const resolved: unknown[] = [];
  function Card() {
    const [view, setView] = useState(parseAgentTaskInteraction(interaction)!);
    const actions = useAgentTaskSuggestions((_original, next) => { resolved.push(next); setView(next); });
    return <AgentTaskInteractionCard interaction={view} language="zh" {...actions.forInteraction(view)} />;
  }
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Card />); });
  t.after(() => act(() => root.unmount()));
  return { root: root!, resolved };
}

test("created and failed cards offer no accept operation", async (t) => {
  const created = await mountCard(t, { state: "created", title: "准备会面", category: "work", taskId: "task:one/two" });
  assert.ok(created.root.root.findByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }));
  assert.equal(created.root.root.findAllByType("button").length, 0);
  const failed = await mountCard(t, { state: "failed", title: "准备会面", category: "work", reason: "存储不可用" });
  assert.match(JSON.stringify(failed.root.toJSON()), /未能创建待办/);
  assert.equal(failed.root.root.findAllByType("button").length, 0);
  assert.ok(failed.root.root.findByProps({ role: "alert" }));
});

test("accept uses the suggestion API once while pending and replaces controls with the returned task link", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let respond!: (response: Response) => void;
  const { root, resolved } = await mountCard(t, suggestion, (async (path, init) => {
    calls.push({ path: String(path), init });
    return new Promise<Response>((resolve) => { respond = resolve; });
  }) as typeof fetch);
  let request: Promise<void>;
  await act(async () => {
    const accept = root.root.findByProps({ "aria-label": "加入待办：准备会面" });
    request = accept.props.onClick();
    void accept.props.onClick();
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/task-suggestions/suggestion%3Aone%2Ftwo/accept");
  assert.equal(calls[0].init?.method, "POST");
  assert.ok(JSON.parse(String(calls[0].init?.body)).idempotencyKey);
  assert.ok(root.root.findAllByType("button").every((button) => button.props.disabled));
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  assert.ok(root.root.findByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }));
  assert.equal(root.root.findAllByType("button").length, 0);
  assert.equal((resolved[0] as any).state, "created");
});

test("dismiss waits for API success before persisting a resolved card", async (t) => {
  const paths: string[] = [];
  const { root, resolved } = await mountCard(t, suggestion, (async (path) => {
    paths.push(String(path));
    return Response.json({ success: true, data: { suggestion: { id: suggestion.suggestionId, status: "dismissed" } } });
  }) as typeof fetch);
  await act(async () => { await root.root.findByProps({ "aria-label": "暂不需要：准备会面" }).props.onClick(); });
  assert.deepEqual(paths, ["/api/task-suggestions/suggestion%3Aone%2Ftwo/dismiss"]);
  assert.match(JSON.stringify(root.toJSON()), /已忽略/);
  assert.equal((resolved[0] as any).state, "dismissed");
});

test("a lost acceptance response stays actionable and reuses its idempotency key on retry", async (t) => {
  const keys: string[] = [];
  const { root, resolved } = await mountCard(t, suggestion, (async (_path, init) => {
    keys.push(JSON.parse(String(init?.body)).idempotencyKey);
    if (keys.length === 1) throw new Error("Disconnected");
    return Response.json({ success: true, data: { task } });
  }) as typeof fetch);
  await act(async () => { await root.root.findByProps({ "aria-label": "加入待办：准备会面" }).props.onClick(); });
  assert.equal(resolved.length, 0);
  assert.ok(root.root.findByProps({ role: "alert" }));
  await act(async () => { await root.root.findByProps({ "aria-label": "加入待办：准备会面" }).props.onClick(); });
  assert.equal(keys[0], keys[1]);
  assert.ok(root.root.findByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }));
});

test("malformed dismissal acknowledgments keep the card actionable until its own dismissed status is confirmed", async (t) => {
  const responses = [
    {},
    { suggestion: { id: "suggestion:other", status: "dismissed" } },
    { suggestion: { id: suggestion.suggestionId, status: "pending" } },
    { suggestion: { id: suggestion.suggestionId, status: "dismissed" } },
  ];
  const keys: string[] = [];
  const { root, resolved } = await mountCard(t, suggestion, (async (_path, init) => {
    keys.push(JSON.parse(String(init?.body)).idempotencyKey);
    return Response.json({ success: true, data: responses.shift() });
  }) as typeof fetch);
  for (let attempt = 0; attempt < 3; attempt++) {
    await act(async () => { await root.root.findByProps({ "aria-label": "暂不需要：准备会面" }).props.onClick(); });
    assert.equal(resolved.length, 0);
    assert.ok(root.root.findByProps({ role: "alert" }));
  }
  await act(async () => { await root.root.findByProps({ "aria-label": "暂不需要：准备会面" }).props.onClick(); });
  assert.equal((resolved[0] as any).state, "dismissed");
  assert.equal(new Set(keys).size, 1);
});

test("an old card's delayed response cannot update a conversation after it unmounts", async (t) => {
  let respond!: (response: Response) => void;
  const { root, resolved } = await mountCard(t, suggestion, (async () => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  let request: Promise<void>;
  await act(async () => { request = root.root.findByProps({ "aria-label": "加入待办：准备会面" }).props.onClick(); });
  act(() => root.unmount());
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  assert.equal(resolved.length, 0);
});

async function mountPage(
  t: any,
  deferSaves = false,
  reply: Record<string, unknown> = {
    assistantMessage: "可以加入待办。",
    taskInteraction: suggestion,
    artifacts: [],
  },
  restoredSession?: Record<string, unknown>,
  analysisPrefill?: { query: string; origin: Record<string, unknown>; returnTo: string },
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  if (analysisPrefill) sessionValues.set("orbit.agent.prefill", JSON.stringify(analysisPrefill));
  const storageFor = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { search: analysisPrefill ? "" : restoredSession ? `?session=${encodeURIComponent(String(restoredSession.id))}` : "?q=准备会面", origin: "https://orbit.test" }, history: { pushState() {} },
    localStorage: storageFor(localValues), sessionStorage: storageFor(sessionValues), addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setInterval, clearInterval, setTimeout, clearTimeout,
  } });
  let root: ReactTestRenderer | undefined;
  const pendingSaves: Array<() => void> = [];
  t.after(async () => {
    act(() => root?.unmount());
    while (pendingSaves.length) await act(async () => pendingSaves.shift()!());
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  });
  const persisted: Array<{ messages: Array<{ role: string; taskInteraction?: Record<string, unknown> }> }> = [];
  const requests: Array<{ path: string; body: unknown }> = [];
  const organizationMutations: Array<Record<string, unknown>> = [];
  const conversationRequests: Array<Record<string, unknown>> = [];
  let respond!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const path = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/api/ai/conversations/groups") {
      return Response.json({ success: true, data: { groups: [{
        createdAt: "2026-09-08T00:00:00.000Z",
        id: "group:work",
        name: "工作",
        revision: 1,
        updatedAt: "2026-09-08T00:00:00.000Z",
      }] } });
    }
    if (path === "/api/ai/conversations/sessions" && init?.method === "POST") {
      const commit = () => {
        persisted.push(body.session);
        return Response.json({ success: true, data: { storage: { persisted: true } } });
      };
      if (deferSaves) return new Promise<Response>((resolve) => pendingSaves.push(() => resolve(commit())));
      return commit();
    }
    if (path.startsWith("/api/ai/conversations/sessions/") && init?.method === "PATCH") {
      organizationMutations.push(body);
      const patch = body.patch as Record<string, unknown>;
      return Response.json({ success: true, data: { session: {
        ...(restoredSession ?? { createdAt: "2026-09-08T00:00:00Z", id: "session:test", messages: [{ role: "user", text: "准备会面" }], title: "会面准备", updatedAt: "2026-09-08T00:00:00Z" }),
        customTitle: patch.customTitle,
        organization: { customTitle: patch.customTitle ?? null, groupId: patch.groupId ?? null, pinned: patch.pinned === true, revision: 1 },
        pinned: patch.pinned === true,
      }, storage: { configured: true, persisted: true } } });
    }
    if (path.startsWith("/api/ai/conversations/sessions")) return Response.json({ success: true, data: { sessions: restoredSession ? [restoredSession] : [] } });
    if (path === "/api/ai/conversations") {
      conversationRequests.push(body);
      return Response.json({ success: true, data: {
        ...reply,
        reliableSend: {
          messageRevision: 2,
          protocolVersion: 2,
          replayed: false,
          requestId: body.requestId,
          sessionId: body.sessionId,
          state: "completed",
        },
      } });
    }
    if (path.startsWith("/api/task-suggestions/")) {
      requests.push({ path, body });
      return new Promise<Response>((resolve) => { respond = resolve; });
    }
    return Response.json({ success: true, data: {} });
  });
  const home = analysisPrefill ? { account: { fullName: "本人", headline: "", initial: "本" }, events: [], stats: { events: 0, people: 1, inProgress: 0 } } : undefined;
  await act(async () => { root = create(<OrbitRealAgent home={home} viewModel={createOrbitAgentStarterViewModel()} />); });
  return { root: root!, persisted, requests, organizationMutations, conversationRequests, pendingSaves, respond: (response: Response) => respond(response) };
}

async function waitForPendingSessionSave(pendingSaves: Array<() => void>) {
  for (let attempt = 0; attempt < 8 && pendingSaves.length === 0; attempt += 1) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
}

async function drainPendingSessionSaves(pendingSaves: Array<() => void>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (pendingSaves.length > 0) {
      await act(async () => pendingSaves.shift()!());
    } else {
      await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
    }
  }
}

test("Web first send uses the reliable protocol and records a controlled origin", async (t) => {
  const { conversationRequests } = await mountPage(t);
  assert.equal(conversationRequests.length, 1);
  assert.equal(conversationRequests[0]?.protocolVersion, 2);
  assert.equal(conversationRequests[0]?.expectedMessageRevision, 0);
  assert.equal(typeof conversationRequests[0]?.sessionId, "string");
  assert.equal(typeof conversationRequests[0]?.clientMessageId, "string");
  assert.equal(typeof conversationRequests[0]?.requestId, "string");
  assert.deepEqual(conversationRequests[0]?.origin, {
    entryClient: "web",
    entryPointId: "ai.new_chat",
    initialGroupId: null,
    kind: "manual",
    template: null,
  });
});

test("new chat keeps a persistent composer and sends its next turn through reliable v2", async (t) => {
  const { root, conversationRequests } = await mountPage(t);
  const forms = root.root.findAllByProps({ "data-orbit-agent-chat-composer": true });
  const inputs = root.root.findAllByProps({ "data-orbit-agent-chat-input": true });
  assert.equal(forms.length, 2, "desktop and mobile trees share the chat composer contract");
  assert.equal(inputs.length, 2, "desktop and mobile trees expose the chat textbox");

  const input = inputs[0];
  act(() => input.props.onChange({ target: { value: "继续确认这个推荐" } }));
  act(() => forms[0].props.onSubmit({ preventDefault() {} }));
  assert.ok(
    root.root.findAllByProps({ "data-orbit-agent-chat-input": true }).every((candidate) => candidate.props.disabled),
    "the chat composer is disabled while the shared request is in flight",
  );

  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  assert.equal(conversationRequests.length, 2);
  assert.equal(conversationRequests[1]?.message, "继续确认这个推荐");
  assert.equal(conversationRequests[1]?.protocolVersion, 2);
  assert.ok(
    root.root.findAllByProps({ "data-orbit-agent-chat-input": true }).every((candidate) => !candidate.props.disabled),
    "the chat composer reopens after the request settles",
  );
});

test("contacts analysis opens as an editable draft and sends its structured origin only after submit", async (t) => {
  const sourceDataVersion = "a".repeat(64);
  const origin = {
    entryClient: "web",
    entryPointId: "contacts.analysis",
    initialGroupId: null,
    kind: "structured",
    sourceDataVersion,
    template: { id: "contacts.analysis", version: 1 },
  };
  const { root, conversationRequests } = await mountPage(t, false, undefined, undefined, {
    origin,
    query: "请根据我的关系目标和当前人脉数据生成分析报告。",
    returnTo: "/app/contacts/dashboard",
  });

  assert.equal(conversationRequests.length, 0, "opening a prefill must not generate");
  const inputs = root.root.findAllByProps({ "aria-label": "向 iOrbit 提问" });
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.props.value === "请根据我的关系目标和当前人脉数据生成分析报告。"));
  const input = inputs[0];
  await act(async () => { input.props.onChange({ target: { value: "请重点分析我在东京制造业的人脉缺口。" } }); });
  await act(async () => {
    root.root.findAllByProps({ className: "glass brief-input" })[0].props.onSubmit({ preventDefault() {} });
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  assert.equal(conversationRequests.length, 1);
  assert.equal(conversationRequests[0]?.message, "请重点分析我在东京制造业的人脉缺口。");
  assert.deepEqual(conversationRequests[0]?.origin, origin);
});

test("Web chat started from a group records the origin and persists group membership after the first reply", async (t) => {
  const { root, organizationMutations, conversationRequests } = await mountPage(t);
  act(() => root.root.findAllByType("button").find((button) => button.children.includes("分组"))!.props.onClick());
  act(() => root.root.findAllByType("button").find((button) => button.children.includes("新建"))!.props.onClick());
  await act(async () => {
    await root.root.findAllByProps({ className: "chip" })[0]!.props.onClick();
  });

  assert.equal((conversationRequests.at(-1)?.origin as { initialGroupId?: string } | undefined)?.initialGroupId, "group:work");
  assert.deepEqual(organizationMutations.at(-1)?.patch, { groupId: "group:work" });
  assert.equal(organizationMutations.at(-1)?.expectedRevision, 0);
});

test("opening a restored Web session performs no automatic POST", async (t) => {
  const session = {
    createdAt: "2026-09-14T00:00:00.000Z",
    id: "session:restored",
    messages: [
      { id: "message:1", role: "user", text: "已经保存的问题" },
      { id: "message:2", role: "assistant", text: "已经保存的回答", items: [], kind: "people", panelTitle: "" },
    ],
    title: "恢复会话",
    updatedAt: "2026-09-14T00:01:00.000Z",
  };
  const { root, persisted } = await mountPage(t, false, undefined, session);

  assert.equal(persisted.length, 0);
  assert.equal(
    root.root.findAllByProps({ "data-orbit-agent-chat-input": true }).length,
    2,
    "restored sessions keep the same persistent chat composer",
  );
});

const emptyEvidenceMessage = /No verifiable result|本次没有从你已授权/u;
const arbitraryAssistantMessage = "服务端任意回复，不可作为推荐依据。";

test("a created task without recommendation evidence renders its status and encoded task link", async (t) => {
  const { root } = await mountPage(t, false, {
    assistantMessage: arbitraryAssistantMessage,
    artifacts: [],
    taskInteraction: { state: "created", title: "准备会面", category: "work", taskId: "task:one/two" },
  });
  const rendered = JSON.stringify(root.toJSON());
  assert.doesNotMatch(rendered, emptyEvidenceMessage);
  assert.doesNotMatch(rendered, /服务端任意回复/u);
  assert.match(rendered, /已创建待办：准备会面/u);
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 2);
});

test("a suggested task without recommendation evidence remains an explicit user decision", async (t) => {
  const { root } = await mountPage(t, false, {
    assistantMessage: arbitraryAssistantMessage,
    artifacts: [],
    taskInteraction: suggestion,
  });
  const rendered = JSON.stringify(root.toJSON());
  assert.doesNotMatch(rendered, emptyEvidenceMessage);
  assert.doesNotMatch(rendered, /服务端任意回复/u);
  assert.match(rendered, /要把“准备会面”加入待办吗？/u);
  assert.equal(root.root.findAllByProps({ "aria-label": "加入待办：准备会面" }).length, 2);
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 0);
});

test("a failed task without recommendation evidence exposes neither success nor acceptance", async (t) => {
  const { root } = await mountPage(t, false, {
    assistantMessage: arbitraryAssistantMessage,
    artifacts: [],
    taskInteraction: { state: "failed", title: "准备会面", category: "work", reason: "存储不可用" },
  });
  const rendered = JSON.stringify(root.toJSON());
  assert.doesNotMatch(rendered, emptyEvidenceMessage);
  assert.doesNotMatch(rendered, /服务端任意回复/u);
  assert.match(rendered, /待办“准备会面”暂时没有写入成功，请稍后重试。/u);
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 0);
  assert.equal(root.root.findAllByProps({ "aria-label": "加入待办：准备会面" }).length, 0);
});

test("a malformed created task keeps the evidence guard and suppresses arbitrary assistant prose", async (t) => {
  const { root } = await mountPage(t, false, {
    assistantMessage: arbitraryAssistantMessage,
    artifacts: [],
    taskInteraction: { state: "created", title: "准备会面", category: "work" },
  });
  const rendered = JSON.stringify(root.toJSON());
  assert.match(rendered, emptyEvidenceMessage);
  assert.doesNotMatch(rendered, /服务端任意回复/u);
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 0);
  assert.equal(root.root.findAllByProps({ "aria-label": "加入待办：准备会面" }).length, 0);
});

test("an absent task interaction keeps the evidence guard and suppresses arbitrary assistant prose", async (t) => {
  const { root } = await mountPage(t, false, {
    assistantMessage: arbitraryAssistantMessage,
    artifacts: [],
  });
  const rendered = JSON.stringify(root.toJSON());
  assert.match(rendered, emptyEvidenceMessage);
  assert.doesNotMatch(rendered, /服务端任意回复/u);
  assert.equal(root.root.findAllByProps({ "data-agent-task-state": "unavailable" }).length, 0);
});

test("real AI replies render in both responsive trees with a shared operation lock and persist the accepted task", async (t) => {
  const { root, persisted, requests, respond } = await mountPage(t);
  const accept = root.root.findAllByProps({ "aria-label": "加入待办：准备会面" });
  assert.equal(accept.length, 2);
  let request: Promise<void>;
  await act(async () => { request = accept[0].props.onClick(); void accept[1].props.onClick(); });
  assert.equal(requests.length, 1);
  assert.ok(root.root.findAllByProps({ "aria-label": "加入待办：准备会面" }).every((button) => button.props.disabled));
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 2);
  assert.deepEqual(persisted.at(-1)?.messages.at(-1)?.taskInteraction, {
    state: "created", title: "准备会面", category: "work", taskId: "task:one/two",
  });
});

test("starting a new conversation during acceptance never writes the old card into the new thread", async (t) => {
  const { root, persisted, respond } = await mountPage(t);
  const accept = root.root.findAllByProps({ "aria-label": "加入待办：准备会面" });
  assert.equal(accept.length, 2);
  let request: Promise<void>;
  await act(async () => { request = accept[0].props.onClick(); });
  act(() => root.root.findAllByProps({ className: "orbit-agent-new-chat" })[0].props.onClick());
  assert.equal(
    root.root.findAllByProps({ "data-orbit-agent-chat-input": true }).length,
    2,
    "starting a new conversation keeps the persistent composer visible",
  );
  const savedCount = persisted.length;
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 0);
  assert.equal(persisted.length, savedCount);
});

test("delayed history writes cannot overwrite a newer accepted-task snapshot", async (t) => {
  const { root, pendingSaves, persisted, respond } = await mountPage(t, true);
  await waitForPendingSessionSave(pendingSaves);
  assert.equal(pendingSaves.length, 1, "only one session snapshot can be in flight");
  let request: Promise<void>;
  await act(async () => { request = root.root.findAllByProps({ "aria-label": "加入待办：准备会面" })[0].props.onClick(); });
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  assert.equal(pendingSaves.length, 1);
  await drainPendingSessionSaves(pendingSaves);
  assert.equal(pendingSaves.length, 0);
  assert.equal(persisted.at(-1)?.messages.at(-1)?.taskInteraction?.state, "created");
});

test("renaming while a task is accepted preserves both the name and task in saved and reopened history", async (t) => {
  const { root, pendingSaves, persisted, organizationMutations, respond } = await mountPage(t, true);
  await waitForPendingSessionSave(pendingSaves);
  act(() => root.root.findAllByProps({ "aria-label": "更多操作" })[0].props.onClick());
  const rename = root.root.findAll((node) => node.type === "button" && node.props["data-orbit-agent-history-rename"])[0];
  act(() => rename.props.onClick());
  const input = root.root.findByProps({ "aria-label": "重命名对话" });
  act(() => input.props.onChange({ target: { value: "会面资料" } }));
  const renameForm = root.root.findAllByType("form").find((form) =>
    form.findAll((node) => Boolean(node.props["data-orbit-agent-history-rename-input"])).length > 0,
  );
  assert.ok(renameForm, "the history rename form remains distinct from the responsive chat composers");
  act(() => renameForm!.props.onSubmit({ preventDefault() {} }));
  let request: Promise<void>;
  await act(async () => { request = root.root.findAllByProps({ "aria-label": "加入待办：准备会面" })[0].props.onClick(); });
  await act(async () => { respond(Response.json({ success: true, data: { task } })); await request; });
  await drainPendingSessionSaves(pendingSaves);
  assert.equal(persisted.at(-1)?.messages.at(-1)?.taskInteraction?.state, "created");
  assert.equal((organizationMutations.at(-1) as any).patch.customTitle, "会面资料");
  await act(async () => root.root.findAllByProps({ className: "btn btn-quiet orbit-agent-history-entry" })[0].props.onClick());
  assert.equal(root.root.findAllByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }).length, 2);
});

test("the shared Web suggestion client accepts and dismisses through real actor-scoped handlers", async () => {
  const { createTaskSuggestionAcceptPostHandler } = await import("../../app/api/task-suggestions/[id]/accept/handler");
  const { createTaskSuggestionDismissPostHandler } = await import("../../app/api/task-suggestions/[id]/dismiss/handler");
  const { createTasksClient } = await import("../../app/(app)/app/tasks/tasks-client");
  const { createTaskService } = await import("../../features/tasks/service");
  const { createTaskRepository } = await import("../../features/tasks/repository");
  const { createTaskSuggestionService } = await import("../../features/tasks/suggestion-service");
  const { createTaskSuggestionRepository } = await import("../../features/tasks/suggestion-repository");
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:agent-task-client";
  const actorId = "account:test";
  const now = "2026-09-08T00:00:00.000Z";
  const taskService = createTaskService({ repository: createTaskRepository({ store, workspaceId }) });
  const repository = createTaskSuggestionRepository({ store, workspaceId });
  const service = createTaskSuggestionService({ repository, taskService });
  const deps = { service, now: () => now, resolveActor: async () => ({ id: actorId, workspaceId }) };
  const accept = createTaskSuggestionAcceptPostHandler(deps);
  const dismiss = createTaskSuggestionDismissPostHandler(deps);
  const client = createTasksClient((async (input, init) => {
    const path = String(input);
    const id = decodeURIComponent(path.split("/").at(-2)!);
    const handler = path.endsWith("/accept") ? accept : dismiss;
    return handler(new Request(new URL(path, "https://orbit.test"), init), { params: Promise.resolve({ id }) });
  }) as typeof fetch);
  const seed = (key: string) => service.suggest({
    actorId, title: "准备会面", category: "work", reason: "会面前准备资料", relatedConversationId: "session:test",
    confidence: 0.9, evidenceIds: [], deduplicationKey: key, now,
  });
  const first = await seed("accept");
  const second = await seed("dismiss");
  const accepted = await client.resolveSuggestion(first.id, "accept");
  assert.ok(accepted);
  assert.equal(accepted.href, `/app/tasks/${encodeURIComponent(accepted.id)}`);
  await client.resolveSuggestion(second.id, "dismiss");
  assert.equal((await repository.get(actorId, second.id))?.status, "dismissed");
  const tasks = await taskService.list({ actorId });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, accepted.id);
  assert.equal(tasks[0].relatedConversationId, "session:test");
  assert.equal(tasks[0].source, "ai_confirmed");
});
