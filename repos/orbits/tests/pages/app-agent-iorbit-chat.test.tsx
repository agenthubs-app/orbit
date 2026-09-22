/**
 * iOrbit 任务 3：对话屏（`iorbit-chat.tsx`）+ 壳接管两个 hook。
 *
 * 断言分四组，与 `app-agent-iorbit-home.test.tsx` 同一套口径：
 *   1. SSR 结构：设计 256–319 的文案逐条在位、双层作用域、`data-*` 标记
 *   2. 设计 mock 黑名单：三场活动 / 那句提问 / 10:24 时间戳 / 9月18日 一个都不许出现
 *   3. 作用域形态：对话屏的每个 `<button>` 都是 `btn ir-*`，`.btn` 基类整段中和
 *   4. 行为：输入区提问、追问 chips（导航 vs 提问）、重试复用原请求、非破坏性返回、
 *      空态走 `AgentWelcome`、回合内既有富组件全部挂上
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitChat } from "../../app/(app)/app/agent/iorbit-0918/iorbit-chat";
import {
  IOrbitShell,
  IORBIT_STYLES,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-shell";
import type { AgentMessage } from "../../app/(app)/app/agent/iorbit-0918/iorbit-model";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";

const VIEW_MODEL = createOrbitAgentStarterViewModel();

const HOME = {
  account: { fullName: "QA Tester", headline: "Orbit", initial: "Q", relationshipGoal: "" },
  events: [],
  stats: { events: 0, inProgress: 0, people: 0 },
};

function shellMarkup(props: { initialDeepLink?: boolean } = {}): string {
  return renderToStaticMarkup(
    <IOrbitShell
      home={HOME as never}
      viewModel={VIEW_MODEL}
      {...props}
    />,
  );
}

/* ── 1. SSR 结构 ───────────────────────────────────────────────────────── */

test("the chat screen ships every design block from lines 256–319", () => {
  const html = shellMarkup({ initialDeepLink: true });

  for (const copy of [
    // 258 面包屑
    ">iOrbit<",
    " / 对话",
    // 261–262 标题与副标题
    "与 iOrbit 分享你的问题，我会结合活动与人脉信息，为你提供个性化的建议。",
    // 265–266
    "← 返回概览",
    "◷ 历史记录",
    // 306–307 输入区
    "＋",
    "告诉我你想了解什么？例如：推荐活动、寻找合适的人脉、准备会议资料…",
    // 310 试试这些问题
    "试试这些问题：",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from the chat screen: ${copy}`);
  }

  for (const className of [
    "ir-chat",
    "ir-crumb",
    "ir-chat-head",
    "ir-chat-grid",
    "ir-thread",
    "ir-composer",
    "ir-try",
  ]) {
    assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`), `missing .${className}`);
  }

  // 「审阅修订」15 / 28：壳上的标记一个都不能掉，且仍是双层作用域、单套 DOM。
  assert.match(html, /data-orbit-ask-clearance="manual"/);
  assert.match(html, /data-orbit-agent-request-state="idle"/);
  assert.match(html, /data-orbit-agent-screen-title/);
  assert.match(html, /data-orbit-real-page="iorbit-0918"/);
  assert.equal(html.match(/class="ir-composer"/g)?.length, 1, "single DOM: one composer only");

  // 「＋」没有上传能力 → aria-disabled 的静态标记，不是假按钮。
  assert.match(html, /<span aria-disabled="true" class="ir-composer-plus"/);
});

test("the chat screen never renders the design's mock conversation", () => {
  // 样式表里有描述偏差的中文注释（含 ♡ / ⌄ 字样），扫描的是渲染出来的正文。
  const html = shellMarkup({ initialDeepLink: true }).replace(/<style>[\s\S]*?<\/style>/g, "");

  for (const mock of [
    "最近有什么适合我的活动？",
    "根据你的兴趣方向、过往报名记录以及目标人脉",
    "东京 AI 创业者交流会",
    "日本 · 亚洲创业峰会",
    "产品经理 Meetup（东京）",
    "东京国际论坛",
    "虎之门之丘",
    "WeWork 东京",
    "10:24",
    "今天 · 9月18日（周五）",
    "我想推进日本制造业 AI 合作",
    "推荐下个月的行业峰会",
  ]) {
    assert.ok(!html.includes(mock), `design mock leaked into the chat screen: ${mock}`);
  }

  // 「审阅修订」24：♡ / ⌄ 省略，`AgentOutcomeFeedback` 不得出现在对话里。
  assert.ok(!html.includes("♡"));
  assert.ok(!html.includes("⌄"));
  assert.doesNotMatch(html, /data-orbit-agent-outcome-feedback/);
});

/* ── 2. 作用域形态 ─────────────────────────────────────────────────────── */

test("every chat <button> carries the btn ir-* contract", () => {
  // 扫源码而不是 SSR：回合里复用的既有富组件（`AgentWelcome` 的 .chip、
  // `AgentMessageCopyButton`）本就登记在 `orbit-button-ratchet` 的 EXEMPTIONS 里，
  // 属 `orbit-real-agent.tsx` 的样式面；本屏自己写的按钮必须全部是 `btn ir-*`。
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../app/(app)/app/agent/iorbit-0918/iorbit-chat.tsx"),
    "utf8",
  );
  const buttons = source.match(/<button[\s\S]{0,400}?>/g) ?? [];

  assert.ok(buttons.length >= 5, `expected the chat screen's buttons, found ${buttons.length}`);
  for (const tag of buttons) {
    assert.match(tag, /className="btn ir-[a-z-]+/, `button without btn ir-* class: ${tag}`);
  }
});

test("every chat .btn rule neutralises the shared base class and its :active transform", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  for (const className of [
    "ir-back-btn",
    "ir-chat-history-btn",
    "ir-followup",
    "ir-composer-send",
    "ir-try-chip",
    "ir-retry",
  ]) {
    const match = flat.match(new RegExp(`\\.btn\\.${className}(?![-a-z])[^{]*\\{[^}]*\\}`));
    assert.ok(match, `missing .btn override for .${className}`);
    for (const declaration of [
      "height:",
      "display:",
      "align-items:",
      "justify-content:",
      "white-space:",
      "letter-spacing:",
      "line-height:",
      "transition:",
    ]) {
      assert.ok(
        match![0].includes(declaration),
        `.btn override for .${className} misses ${declaration}`,
      );
    }
    const active = flat.match(
      new RegExp(`\\.btn\\.${className}(?![-a-z]):active[^{]*\\{[^}]*\\}`),
    );
    assert.ok(
      active && active[0].includes("transform: none"),
      `missing :active{transform:none} neutralisation for .${className}`,
    );
  }

  // 同一个类同时用于 <a> 与 <button>（追问 chips）→ 必须写两条规则。
  assert.match(flat, /\[data-orbit-real-page="iorbit-0918"\] \.ir-followup \{/);
  assert.match(flat, /\[data-orbit-real-page="iorbit-0918"\] \.btn\.ir-followup \{/);
});

/* ── 3. 行为 ───────────────────────────────────────────────────────────── */

interface Mounted {
  calls: Array<{ body: unknown; method: string; url: string }>;
  emit: (type: string) => void;
  location: { search: string };
  pushedUrls: string[];
  root: ReactTestRenderer;
  sessionValues: Map<string, string>;
  settle: (rounds?: number) => Promise<void>;
}

async function mount(
  t: TestContext,
  element: React.ReactElement,
  options: {
    conversation?: unknown;
    search?: string;
    sessionStorage?: Record<string, string>;
    sessions?: unknown[];
  } = {},
): Promise<Mounted> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const pushedUrls: string[] = [];
  const calls: Array<{ body: unknown; method: string; url: string }> = [];
  const location = {
    href: `https://orbit.test/app/agent${options.search ?? ""}`,
    origin: "https://orbit.test",
    pathname: "/app/agent",
    search: options.search ?? "",
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener() {},
      documentElement: { lang: "zh" },
      removeEventListener() {},
    },
  });
  const sessionValues = new Map(Object.entries(options.sessionStorage ?? {}));
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      clearInterval: () => undefined,
      clearTimeout: () => undefined,
      history: {
        pushState(_state: unknown, _title: string, url: string) {
          pushedUrls.push(url);
        },
        replaceState() {},
      },
      localStorage: {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => undefined,
      },
      location,
      matchMedia: () => ({ addEventListener() {}, matches: false, removeEventListener() {} }),
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== handler));
      },
      sessionStorage: {
        getItem: (key: string) => sessionValues.get(key) ?? null,
        removeItem: (key: string) => {
          sessionValues.delete(key);
        },
        setItem: (key: string, value: string) => {
          sessionValues.set(key, value);
        },
      },
      setInterval: () => 0,
      setTimeout: (handler: () => void, delay: number) =>
        setTimeout(handler, delay) as unknown as number,
    },
  });

  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete (globalThis as { document?: unknown }).document;
  });

  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      method: (init?.method ?? "GET").toUpperCase(),
      url,
    });
    if (url.startsWith("/api/ai/conversations/sessions")) {
      return Response.json({
        data: { nextCursor: null, sessions: options.sessions ?? [] },
        success: true,
      });
    }
    if (url.startsWith("/api/ai/conversations")) {
      return Response.json({
        data: options.conversation ?? {
          items: [],
          kind: "events",
          panelTitle: "",
          status: "completed",
          text: "这是一次真实的回答。",
        },
      });
    }
    return Response.json({ data: {} });
  });

  let root: ReactTestRenderer | null = null;
  await act(async () => {
    root = create(element);
  });
  const settle = async (rounds = 5) => {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  await settle();

  const emit = (type: string) => {
    for (const handler of listeners.get(type) ?? []) handler({ type });
  };

  return { calls, emit, location, pushedUrls, root: root!, sessionValues, settle };
}

const shell = (props: { initialDeepLink?: boolean } = {}) => (
  <IOrbitShell
    home={HOME as never}
    viewModel={VIEW_MODEL}
    {...props}
  />
);

function byClass(mounted: Mounted, className: string) {
  return mounted.root.root.findAll((node) => node.props?.className === className);
}

test("the composer sends the question through the conversations API", async (t) => {
  const mounted = await mount(t, shell({ initialDeepLink: true }));

  const input = byClass(mounted, "ir-composer-input")[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "帮我找下周的活动" } });
  });
  const form = byClass(mounted, "ir-composer")[0]!;
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
  });
  await mounted.settle();

  const ask = mounted.calls.find((call) => call.url.startsWith("/api/ai/conversations?"))
    ?? mounted.calls.find((call) => call.url === "/api/ai/conversations");
  assert.ok(ask, "the composer must POST to /api/ai/conversations");
  assert.equal((ask!.body as { message?: string }).message, "帮我找下周的活动");
  // 用户气泡与助手回合都渲染出来，且只有一棵 DOM。
  assert.equal(byClass(mounted, "ir-user-row").length, 1);
  assert.equal(byClass(mounted, "ir-a-row").length, 1);
});

test("follow-up chips split into two asks and two plain navigation links", async (t) => {
  const asked: string[] = [];
  const mounted = await mount(
    t,
    <IOrbitChat
      ask={(query) => asked.push(query)}
      chatDraft=""
      messages={[{ role: "user", text: "上次问过的问题" }]}
      navigate={() => undefined}
      onBack={() => undefined}
      onDraftChange={() => undefined}
      onOpenHistory={() => undefined}
      onSubmitDraft={() => undefined}
      taskSuggestions={{ forInteraction: () => ({}) } as never}
      thinking={false}
      userInitial="Q"
      viewModel={VIEW_MODEL}
    />,
  );

  const buttons = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-followup",
  );
  const links = mounted.root.root.findAll(
    (node) => node.type === "a" && node.props?.className === "ir-followup",
  );
  assert.equal(buttons.length, 2);
  assert.deepEqual(
    links.map((link) => link.props.href),
    ["/app/agent/strategy", "/app/agent/strategy?view=contacts"],
  );

  await act(async () => {
    buttons[0]!.props.onClick();
  });
  assert.deepEqual(asked, ["这些活动怎么报名？"]);
});

test("the retry button reuses the failed request instead of asking anew", async (t) => {
  const retried: Array<[string, number | undefined]> = [];
  const messages: AgentMessage[] = [
    { role: "user", text: "帮我找活动" },
    {
      items: [],
      kind: "events",
      panelTitle: "",
      reliableRequest: {
        clientMessageId: "message:1",
        expectedMessageRevision: 0,
        locale: "zh",
        message: "帮我找活动",
        requestId: "request:1",
        sessionId: "session:1",
      } as never,
      retryRequest: "帮我找活动",
      role: "assistant",
      text: "服务器结果尚未确认。",
    },
  ];
  const mounted = await mount(
    t,
    <IOrbitChat
      ask={(query, index) => retried.push([query, index])}
      chatDraft=""
      messages={messages}
      navigate={() => undefined}
      onBack={() => undefined}
      onDraftChange={() => undefined}
      onOpenHistory={() => undefined}
      onSubmitDraft={() => undefined}
      taskSuggestions={{ forInteraction: () => ({}) } as never}
      thinking={false}
      userInitial="Q"
      viewModel={VIEW_MODEL}
    />,
  );

  const retry = mounted.root.root.findAll(
    (node) => node.props?.["data-agent-message-retry-request"] !== undefined,
  )[0]!;
  await act(async () => {
    retry.props.onClick();
  });

  // 幂等重试：带着失败回合的下标回到 `ask`，`use-agent-chat` 据此复用原
  // requestId / clientMessageId（行为由特征化套件锁定）。
  assert.deepEqual(retried, [["帮我找活动", 1]]);
});

test("going back to the overview keeps the thread (non-destructive)", async (t) => {
  const mounted = await mount(t, shell({ initialDeepLink: true }));

  const input = byClass(mounted, "ir-composer-input")[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "帮我找下周的活动" } });
  });
  await act(async () => {
    byClass(mounted, "ir-composer")[0]!.props.onSubmit({ preventDefault() {} });
  });
  await mounted.settle();
  assert.equal(byClass(mounted, "ir-user-row").length, 1);

  await act(async () => {
    mounted.root.root
      .findAll((node) => node.type === "button" && node.props?.className === "btn ir-back-btn")[0]!
      .props.onClick();
  });
  await mounted.settle();
  assert.equal(byClass(mounted, "ir-home").length, 1, "back lands on the overview");

  await act(async () => {
    mounted.root.root
      .findAll((node) => node.type === "button" && node.props?.className === "btn ir-enter-btn")[0]!
      .props.onClick();
  });
  await mounted.settle();

  assert.equal(
    byClass(mounted, "ir-user-row").length,
    1,
    "the thread must survive a trip to the overview and back",
  );
});

test("an empty thread keeps the existing welcome screen and the suggest chips", async (t) => {
  const mounted = await mount(t, shell({ initialDeepLink: true }));

  assert.equal(byClass(mounted, "new-empty").length, 1, "AgentWelcome must still render");
  assert.equal(byClass(mounted, "ir-day-sep").length, 0, "no date divider without a thread");
  assert.equal(byClass(mounted, "ir-followups").length, 0, "no follow-ups without a thread");

  const tryChips = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-try-chip",
  );
  assert.equal(tryChips.length, VIEW_MODEL.suggests.slice(0, 3).length);
});

test("the answer body still mounts every existing rich turn component", async (t) => {
  const messages: AgentMessage[] = [
    { role: "user", text: "帮我找活动" },
    {
      actionIds: ["action:1"],
      items: [
        {
          event: {
            code: "EVT-1",
            g: "g-teal",
            id: "event:1",
            name: "真实活动",
            place: "线上",
            startsAt: "2026-09-25T01:00:00Z",
          },
          howto: "",
          reason: "与你的兴趣相符",
          score: 88,
        } as never,
      ],
      kind: "events",
      note: "这条回答用了你的报名记录。",
      panelTitle: "推荐活动",
      role: "assistant",
      runId: "run:1",
      text: "这是正文。",
    },
  ];
  const mounted = await mount(
    t,
    <IOrbitChat
      ask={() => undefined}
      chatDraft=""
      messages={messages}
      navigate={() => undefined}
      onBack={() => undefined}
      onDraftChange={() => undefined}
      onOpenHistory={() => undefined}
      onSubmitDraft={() => undefined}
      taskSuggestions={{ forInteraction: () => ({}) } as never}
      thinking={false}
      userInitial="Q"
      viewModel={VIEW_MODEL}
    />,
  );

  // per-message note 行（`orbit-real-agent.tsx:3546-3551` 的能力）
  assert.equal(byClass(mounted, "ir-a-note").length, 1);
  // 用户行与助手行都有复制按钮（「审阅修订」9）
  assert.equal(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-message-copy"] !== undefined,
    ).length,
    2,
  );
  // PanelCards（事件卡）与 AgentActionStatusCard（run 状态）都挂上了
  assert.ok(
    mounted.root.root.findAll((node) => node.props?.["data-orbit-agent-panel"] !== undefined)
      .length > 0 ||
      JSON.stringify(mounted.root.toJSON()).includes("真实活动"),
    "PanelCards must render the assistant's items",
  );
  assert.ok(
    JSON.stringify(mounted.root.toJSON()).includes("run:1") ||
      mounted.root.root.findAll(
        (node) => node.props?.["data-orbit-agent-action-status"] !== undefined,
      ).length > 0,
    "AgentActionStatusCard must render for a run-backed answer",
  );
  // 日期分隔（设计 271）在有线程时出现
  assert.equal(byClass(mounted, "ir-day-sep").length, 1);
});

test("the thinking turn keeps the existing indicator", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitChat
      ask={() => undefined}
      chatDraft=""
      messages={[{ role: "user", text: "帮我找活动" }]}
      navigate={() => undefined}
      onBack={() => undefined}
      onDraftChange={() => undefined}
      onOpenHistory={() => undefined}
      onSubmitDraft={() => undefined}
      taskSuggestions={{ forInteraction: () => ({}) } as never}
      thinking
      userInitial="Q"
      viewModel={VIEW_MODEL}
    />,
  );

  assert.equal(byClass(mounted, "ir-a-row orbit-agent-thinking-turn").length, 1);
});

/* ── 4. 壳的接线（修订轮 1：这些行为以前只有渲染旧组件的套件覆盖）───────── */

test("the history drawer the shell mounts is visible at desktop width", async (t) => {
  // `orbit-mobile-only` 在生成的参考样式表里是 `display:none !important`，且这条规则
  // 在 ≤640px 的 @media **之外**——沿用组件默认根类会让桌面宽度下抽屉挂得上却看不见。
  const referenceCss = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../public/orbit-reference/orbit-reference.generated.css",
    ),
    "utf8",
  );
  const mobileOnlyRule = referenceCss.match(/\.orbit-mobile-only\s*\{[^}]*\}/);
  assert.ok(mobileOnlyRule, "the reference stylesheet must still define .orbit-mobile-only");
  assert.match(mobileOnlyRule![0], /display\s*:\s*none\s*!important/);

  const mounted = await mount(t, shell({ initialDeepLink: true }));

  await act(async () => {
    mounted.root.root
      .findAll(
        (node) => node.type === "button" && node.props?.className === "btn ir-chat-history-btn",
      )[0]!
      .props.onClick();
  });
  await mounted.settle();

  const drawer = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-agent-history-drawer"] !== undefined,
  )[0];
  assert.ok(drawer, "「◷ 历史记录」must open the history drawer");
  assert.ok(
    !String(drawer!.props.className ?? "").includes("orbit-mobile-only"),
    "the drawer the shell mounts must not carry the mobile-only class (it would be display:none)",
  );
  // 抽屉里的既有能力还在：新对话 + 分组 + 列表。
  assert.ok(
    mounted.root.root.findAll(
      (node) => node.type === "button" && String(node.props?.className ?? "").includes("orbit-agent-new-chat"),
    ).length > 0,
    "the drawer must still expose 新对话",
  );
});

test("a cross-page pending ask lands in the chat and is sent once", async (t) => {
  const mounted = await mount(t, shell(), {
    sessionStorage: {
      "orbit.ask.pending": JSON.stringify({
        context: "田中圭子的联系人页",
        from: "/app/contacts/c1",
        query: "帮我准备和她的下一次沟通",
      }),
    },
  });

  assert.equal(
    mounted.root.root.findAll((node) => node.props?.className === "ir-home").length,
    0,
    "a handoff must land in the chat, not the overview",
  );
  const asks = mounted.calls.filter((call) => call.url.startsWith("/api/ai/conversations?") || call.url === "/api/ai/conversations");
  assert.equal(asks.length, 1, "the pending ask is sent exactly once");
  assert.match(
    String((asks[0]!.body as { message?: string }).message),
    /帮我准备和她的下一次沟通[\s\S]*田中圭子的联系人页/,
    "the context the user saw must travel inside the message",
  );
  assert.equal(mounted.sessionValues.has("orbit.ask.pending"), false, "the handoff is consumed");
});

test("the contacts-analysis prefill surfaces in the composer and keeps its structured origin", async (t) => {
  const origin = {
    entryClient: "web",
    entryPointId: "contacts.analysis",
    initialGroupId: null,
    kind: "structured",
    sourceDataVersion: "a".repeat(64),
    template: { id: "contacts.analysis", version: 1 },
  };
  const mounted = await mount(t, shell(), {
    sessionStorage: {
      "orbit.agent.prefill": JSON.stringify({
        origin,
        query: "分析我的人脉机会",
        returnTo: "/app/contacts/dashboard",
      }),
    },
  });

  const input = byClass(mounted, "ir-composer-input")[0]!;
  assert.equal(
    input.props.value,
    "分析我的人脉机会",
    "the prefilled question must be visible before it is sent, not swallowed",
  );
  assert.equal(
    mounted.calls.filter((call) => call.url.startsWith("/api/ai/conversations?") || call.url === "/api/ai/conversations").length,
    0,
    "the prefill is never sent without the user confirming",
  );

  await act(async () => {
    byClass(mounted, "ir-composer")[0]!.props.onSubmit({ preventDefault() {} });
  });
  await mounted.settle();

  const ask = mounted.calls.find(
    (call) => call.url.startsWith("/api/ai/conversations?") || call.url === "/api/ai/conversations",
  );
  assert.ok(ask, "submitting the prefilled draft must reach the conversations API");
  const body = ask!.body as { message?: string; origin?: typeof origin };
  assert.equal(body.message, "分析我的人脉机会");
  assert.deepEqual(body.origin, origin, "the structured origin must survive the handoff");
});

test("browser back returns to the overview without clearing the thread", async (t) => {
  const mounted = await mount(t, shell({ initialDeepLink: true }), { search: "?q=hello" });

  assert.equal(byClass(mounted, "ir-chat").length, 1);

  mounted.location.search = "";
  await act(async () => {
    mounted.emit("popstate");
  });
  await mounted.settle();

  assert.equal(byClass(mounted, "ir-home").length, 1, "popstate must restore the overview");
});

test("?session= restores the conversation through the shell without asking again", async (t) => {
  const mounted = await mount(t, shell({ initialDeepLink: true }), {
    search: "?session=session%3Arestored",
    sessions: [
      {
        createdAt: "2026-09-20T00:00:00.000Z",
        id: "session:restored",
        messages: [
          { role: "user", text: "上次问过的问题" },
          { items: [], kind: "people", panelTitle: "", role: "assistant", text: "上次的回答" },
        ],
        title: "上次的对话",
        updatedAt: "2026-09-20T01:00:00.000Z",
      },
    ],
  });

  const rendered = JSON.stringify(mounted.root.toJSON());
  assert.ok(rendered.includes("上次问过的问题"));
  assert.ok(rendered.includes("上次的回答"));
  assert.equal(
    mounted.calls.filter((call) => call.url.startsWith("/api/ai/conversations?") || call.url === "/api/ai/conversations").length,
    0,
    "restoring must not re-ask",
  );
});
