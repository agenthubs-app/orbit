import assert from "node:assert/strict";
import test from "node:test";

import { act } from "react-test-renderer";

import {
  buttonWithText,
  mountAgent,
  renderedText,
  successReply,
  textOf,
  type ObservedCall,
} from "./app-agent-characterization-harness";

// 特征化渲染测试（iOrbit 任务 1a）：锁定 `orbit-real-agent.tsx` 今天的对话行为，
// 使 `use-agent-chat` 抽出后「零变化」可证。覆盖 ask 往返的请求体、三类失败与
// 幂等重试、60s AbortController 预算、hydration 与深链（?q= / ?session= /
// localStorage / pushState / clearConversation）、全局提问落点与跨页交接，
// 以及会话持久化的 POST 体。断言全部落在渲染结果与真实请求上，不做源码正则。

const SUCCESS = (body: Record<string, unknown>) => successReply("已经按你的人脉库整理好了。", body);

function assistantTexts(root: Parameters<typeof renderedText>[0]): string[] {
  return root.root
    // iOrbit 任务 6a：旧壳（`orbit-real-agent.tsx`）的助手正文类是 `body`；
    // 在售的对话屏是 `iorbit-chat.tsx` 的 `ir-a-body`。
    .findAll((node) => typeof node.type === "string" && node.props.className === "ir-a-body")
    .map((node) => textOf(node.children as unknown));
}

function retryButtons(root: Parameters<typeof renderedText>[0]) {
  return root.root.findAllByProps({ "data-agent-message-retry-request": true });
}

test("a question in ?q= is asked once through the reliable v2 contract and its reply is rendered", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  assert.equal(harness.conversationRequests.length, 1);
  const request = harness.conversationRequests[0];
  assert.deepEqual(request.history, []);
  assert.equal(request.message, "找人脉");
  assert.equal(request.locale, "zh");
  assert.equal(request.protocolVersion, 2);
  assert.equal(request.expectedMessageRevision, 0);
  assert.deepEqual(request.references, []);
  assert.match(String(request.clientMessageId), /^message:/);
  assert.match(String(request.requestId), /^request:/);
  assert.equal(typeof request.sessionId, "string");
  assert.ok(String(request.sessionId).length > 0);
  assert.deepEqual(request.origin, {
    entryClient: "web",
    entryPointId: "ai.new_chat",
    initialGroupId: null,
    kind: "manual",
    template: null,
  });

  const conversationCall = harness.calls.find((call) => call.url === "/api/ai/conversations") as ObservedCall;
  assert.equal(conversationCall.method, "POST");
  assert.ok(renderedText(harness.root).includes("已经按你的人脉库整理好了。"));
  assert.ok(renderedText(harness.root).includes("找人脉"));
  assert.equal(retryButtons(harness.root).length, 0);
});

test("the next turn carries the previous turns as the trimmed history window", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  const composers = harness.root.root.findAllByProps({ "data-orbit-agent-chat-composer": true });
  const inputs = harness.root.root.findAllByProps({ "data-orbit-agent-chat-input": true });
  await harness.settle();
  act(() => inputs[0].props.onChange({ target: { value: "第二个问题" } }));
  act(() => composers[0].props.onSubmit({ preventDefault() {} }));
  await harness.settle();

  assert.equal(harness.conversationRequests.length, 2);
  const second = harness.conversationRequests[1];
  assert.deepEqual(second.history, [
    { content: "找人脉", role: "user" },
    { content: "已经按你的人脉库整理好了。", role: "assistant" },
  ]);
  assert.equal(second.message, "第二个问题");
  // 同一会话的后续轮次沿用同一 sessionId，并推进到回执里的 messageRevision。
  assert.equal(second.sessionId, harness.conversationRequests[0].sessionId);
  assert.equal(second.expectedMessageRevision, 2);
  assert.notEqual(second.clientMessageId, harness.conversationRequests[0].clientMessageId);
});

test("a reliable receipt that is not completed shows the unconfirmed copy with an idempotent retry", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) =>
      Response.json({
        success: true,
        data: {
          reliableSend: {
            messageRevision: 1,
            protocolVersion: 2,
            replayed: false,
            requestId: body.requestId,
            sessionId: body.sessionId,
            state: "outcome_unknown",
          },
        },
      }),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  assert.ok(
    assistantTexts(harness.root).some((text) =>
      text.includes("请求结果尚未确认。再次检查会复用同一请求，不会重复生成。"),
    ),
  );
  const first = harness.conversationRequests[0];
  const retry = retryButtons(harness.root);
  assert.ok(retry.length > 0, "an unconfirmed turn keeps a retry control");

  await act(async () => {
    await retry[0].props.onClick();
  });
  await harness.settle();

  assert.equal(harness.conversationRequests.length, 2);
  const resent = harness.conversationRequests[1];
  assert.equal(resent.requestId, first.requestId);
  assert.equal(resent.clientMessageId, first.clientMessageId);
  assert.equal(resent.sessionId, first.sessionId);
  assert.equal(resent.message, "找人脉");
  assert.equal(resent.expectedMessageRevision, first.expectedMessageRevision);
});

test("a provider timeout gets its own resubmit copy, by error code and by message text", async (t) => {
  for (const error of [
    { code: "MODEL_REQUEST_FAILED", message: "provider unavailable" },
    { code: "INTERNAL_ERROR", message: "upstream request timed out after 20s" },
  ]) {
    await t.test(`timeout classified from ${error.code}`, async (inner) => {
      const harness = await mountAgent(inner, {
        conversation: () => Response.json({ success: false, error }, { status: 500 }),
        search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
      });

      assert.ok(
        assistantTexts(harness.root).some((text) =>
          text.includes("iOrbit 的模型没有按时返回，这通常是临时的，请重新提交一次。未执行任何外部动作。"),
        ),
        `expected the timeout copy for ${error.code}`,
      );
      assert.ok(retryButtons(harness.root).length > 0);
      // 供应商原文属于内部诊断，不得拼进用户可见文案。
      assert.ok(!renderedText(harness.root).includes(error.message));
    });
  }
});

test("any other failed reply falls back to the generic copy and keeps the same request for retry", async (t) => {
  const harness = await mountAgent(t, {
    conversation: () => Response.json({ success: false, error: { code: "FORBIDDEN", message: "nope" } }, { status: 403 }),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  assert.ok(assistantTexts(harness.root).some((text) => text.includes("iOrbit 暂时无法完成这次回复，请稍后再试。")));
  // iOrbit 任务 6a：旧壳的桌面树与移动树各渲染一次同样的回合（基线 2）；在售的
  // 对话屏是单套 DOM（「审阅修订」15 记过的壳形态变化），因此基线是 1。
  assert.equal(assistantTexts(harness.root).length, 1);
  const first = harness.conversationRequests[0];
  await act(async () => {
    await retryButtons(harness.root)[0].props.onClick();
  });
  await harness.settle();

  assert.equal(harness.conversationRequests.length, 2);
  assert.equal(harness.conversationRequests[1].requestId, first.requestId);
  assert.equal(harness.conversationRequests[1].clientMessageId, first.clientMessageId);
  // 重试替换失败回合而不是追加：助手回合数量没有增加。
  assert.equal(assistantTexts(harness.root).length, 1);
});

test("the browser gives the request a 60s abort budget and reports the unconfirmed result when it fires", async (t) => {
  const harness = await mountAgent(t, {
    conversation: () => null,
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  const budget = harness.timers.find((timer) => timer.delay === 60_000);
  assert.ok(budget, "the conversation request arms a 60s deadline");
  const call = harness.calls.find((entry) => entry.url === "/api/ai/conversations");
  assert.ok(call?.signal, "the conversation request carries an AbortSignal");
  assert.equal(call.signal.aborted, false);

  await act(async () => {
    budget.fire();
  });
  await harness.settle();

  assert.equal(call.signal.aborted, true);
  assert.ok(
    assistantTexts(harness.root).some((text) =>
      text.includes("浏览器已停止等待，服务器结果尚未确认。再次检查会复用同一请求，不会重复生成。"),
    ),
  );
  assert.ok(retryButtons(harness.root).length > 0);
});

const RESTORED = {
  createdAt: "2026-09-20T00:00:00.000Z",
  id: "session:restored",
  messages: [
    { role: "user", text: "上次问过的问题" },
    { items: [], kind: "people", panelTitle: "", role: "assistant", text: "上次的回答" },
  ],
  title: "上次的对话",
  updatedAt: "2026-09-20T01:00:00.000Z",
};

test("?session= restores that conversation, marks it active in storage and asks nothing", async (t) => {
  const harness = await mountAgent(t, {
    search: "?session=session%3Arestored",
    sessionPages: [[RESTORED]],
  });

  const text = renderedText(harness.root);
  assert.ok(text.includes("上次问过的问题"));
  assert.ok(text.includes("上次的回答"));
  assert.equal(harness.conversationRequests.length, 0);
  assert.equal(harness.localValues.get("orbit-agent-chat-active-session-v1"), "session:restored");
  // 恢复出来的会话不得被立刻再写一次。
  assert.equal(harness.persistedSessions.length, 0);
});

test("picking a stored conversation from history restores it and pushes its deep link", async (t) => {
  const harness = await mountAgent(t, { sessionPages: [[RESTORED]] });

  // iOrbit 任务 6a：常驻历史侧栏随 `orbit-real-agent.tsx` 删除（任务 4 记过的唯一
  // 能力移除），历史条目改从「◷ 历史记录」抽屉里进入。
  await act(async () => {
    buttonWithText(harness.root, "历史记录").props.onClick();
  });
  await harness.settle(1);
  await act(async () => {
    buttonWithText(harness.root, "上次问过的问题").props.onClick();
  });
  await harness.settle();

  assert.deepEqual(harness.pushedUrls, ["/app/agent?session=session%3Arestored"]);
  assert.ok(renderedText(harness.root).includes("上次的回答"));
  assert.equal(harness.localValues.get("orbit-agent-chat-active-session-v1"), "session:restored");
});

// iOrbit 合并前终审 2：`chatOpen → view` 只认上升沿（「返回概览」刻意不清
// `chatOpen`），所以「对话 → 返回概览 → 抽屉」这条路径上，抽屉的两个回调如果不自己
// 把视图带回对话，URL 与线程都换了、人却还留在概览屏。两条用例各钉一条路径。
test("after returning to the overview, picking another conversation lands back in the thread", async (t) => {
  const harness = await mountAgent(t, {
    search: "?session=session%3Arestored",
    sessionPages: [[RESTORED]],
  });
  assert.ok(renderedText(harness.root).includes("上次的回答"));

  await act(async () => {
    buttonWithText(harness.root, "← 返回概览").props.onClick();
  });
  await harness.settle();
  // 概览屏不渲染线程：这是「人已经不在对话里」的证据，不是线程被清了。
  assert.equal(renderedText(harness.root).includes("上次的回答"), false);

  await act(async () => {
    buttonWithText(harness.root, "历史记录").props.onClick();
  });
  await harness.settle(1);
  await act(async () => {
    buttonWithText(harness.root, "上次问过的问题").props.onClick();
  });
  await harness.settle();

  assert.equal(harness.pushedUrls.at(-1), "/app/agent?session=session%3Arestored");
  assert.ok(renderedText(harness.root).includes("上次的回答"));
});

test("after returning to the overview, starting a new chat lands back in the empty thread", async (t) => {
  // 入口取 `?session=`（`restoreSession` 会把 `chatOpen` 置起）：`?q=` 那条路径压根
  // 不动 `chatOpen`，新对话时反而撞出一次上升沿，掩盖掉这个缺陷。
  const harness = await mountAgent(t, {
    search: "?session=session%3Arestored",
    sessionPages: [[RESTORED]],
  });
  assert.ok(renderedText(harness.root).includes("上次的回答"));

  await act(async () => {
    buttonWithText(harness.root, "← 返回概览").props.onClick();
  });
  await harness.settle();

  await act(async () => {
    buttonWithText(harness.root, "历史记录").props.onClick();
  });
  await harness.settle(1);
  await act(async () => {
    harness.root.root.findAllByProps({ className: "btn ir-drawer-new" })[0].props.onClick();
  });
  await harness.settle();

  assert.equal(harness.pushedUrls.at(-1), "/app/agent");
  assert.equal(harness.localValues.has("orbit-agent-chat-active-session-v1"), false);
  // 空线程也必须是**看得见的**空线程：输入区在，旧回合不在。
  assert.equal(harness.root.root.findAllByProps({ "data-orbit-agent-chat-input": true }).length > 0, true);
  assert.equal(renderedText(harness.root).includes("上次的回答"), false);
});

test("leaving the thread clears it, drops the active-session key and returns to /app/agent", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });
  assert.equal(harness.localValues.has("orbit-agent-chat-active-session-v1"), true);

  // iOrbit 任务 6a：设计的「← 返回概览」是**非破坏性**返回（「审阅修订」17），旧壳
  // 的「返回工作台」才会清线程。清空线程这件事今天由抽屉里的「＋ 新对话」承担，
  // 断言因此改走那个控件——被断的能力（回 /app/agent、丢 active-session key、
  // 线程清空）一条没少。
  await act(async () => {
    buttonWithText(harness.root, "历史记录").props.onClick();
  });
  await harness.settle(1);
  await act(async () => {
    harness.root.root.findAllByProps({ className: "btn ir-drawer-new" })[0].props.onClick();
  });
  await harness.settle();

  assert.equal(harness.pushedUrls.at(-1), "/app/agent");
  assert.equal(harness.localValues.has("orbit-agent-chat-active-session-v1"), false);
  assert.equal(renderedText(harness.root).includes("已经按你的人脉库整理好了。"), false);
});

test("a finished turn is persisted to the sessions API with its messages and revision", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    search: "?q=%E6%89%BE%E4%BA%BA%E8%84%89",
  });

  assert.equal(harness.persistedSessions.length, 1);
  const session = harness.persistedSessions[0] as Record<string, unknown>;
  assert.equal(session.id, harness.conversationRequests[0].sessionId);
  assert.equal(session.messageRevision, 2);
  assert.equal(session.panel, null);
  assert.equal(typeof session.createdAt, "string");
  assert.equal(typeof session.updatedAt, "string");
  assert.equal(session.title, "人脉");
  const messages = session.messages as Array<Record<string, unknown>>;
  assert.deepEqual(
    messages.map((message) => [message.role, message.text]),
    [
      ["user", "找人脉"],
      ["assistant", "已经按你的人脉库整理好了。"],
    ],
  );
  const persistCall = harness.calls.find(
    (call) => call.url === "/api/ai/conversations/sessions" && call.method === "POST",
  );
  assert.ok(persistCall);
});

test("the page takes over the global ask box, publishes its chips and busy state", async (t) => {
  const harness = await mountAgent(t, { conversation: (body) => SUCCESS(body) });

  const probe = harness.askProbe();
  assert.ok(probe);
  assert.equal(probe.submitsInPlace, true);
  assert.equal(probe.busy, false);
  assert.deepEqual(
    probe.chips.map((chip) => chip.label),
    ["找值得跟进的人脉", "推荐可拓展活动", "整理关系待办"],
  );

  await act(async () => {
    probe.submit("从全局输入框问的问题", null);
  });
  await harness.settle();

  assert.equal(harness.conversationRequests.length, 1);
  assert.equal(harness.conversationRequests[0].message, "从全局输入框问的问题");
  // 就地提问不得写跨页交接单。
  assert.equal(harness.sessionValues.has("orbit.ask.pending"), false);
});

test("a question handed over from another page is asked once, with its context, and consumed", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    sessionStorageSeed: {
      "orbit.ask.pending": JSON.stringify({
        context: "佐藤 健一 的联系人页",
        from: "/app/contacts/demo-contact-1",
        query: "他最近有什么动向",
      }),
    },
  });

  assert.equal(harness.conversationRequests.length, 1);
  assert.equal(
    harness.conversationRequests[0].message,
    "他最近有什么动向\n\n（我正在看佐藤 健一 的联系人页）",
  );
  assert.equal(harness.sessionValues.has("orbit.ask.pending"), false);
});

test("a contacts-analysis prefill is consumed without sending anything on its own", async (t) => {
  const harness = await mountAgent(t, {
    conversation: (body) => SUCCESS(body),
    sessionStorageSeed: {
      "orbit.agent.prefill": JSON.stringify({
        origin: {
          entryClient: "web",
          entryPointId: "contacts.analysis",
          initialGroupId: null,
          kind: "structured",
          sourceDataVersion: "a".repeat(64),
          template: { id: "contacts.analysis", version: 1 },
        },
        query: "帮我分析这批联系人",
        returnTo: "/app/contacts/dashboard",
      }),
    },
  });

  assert.equal(harness.sessionValues.has("orbit.agent.prefill"), false);
  assert.equal(harness.conversationRequests.length, 0);
});
