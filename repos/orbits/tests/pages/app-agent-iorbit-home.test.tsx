/**
 * iOrbit 任务 2：壳（`iorbit-shell.tsx`）+ 概览屏（`iorbit-home.tsx`）。
 *
 * 断言分四组，和 ops-0918 / auth-0918 两屏同一套口径：
 *   1. 纯函数（`iorbit-model.ts` 新增的日历格子 / 选中日标签 / 相对时间 / 账本进度）
 *   2. SSR 结构：设计文案逐条在位、双层作用域、`data-*` 标记、**设计 mock 字符串一个不许出现**
 *   3. 作用域形态：`IORBIT_STYLES` 每条规则都以作用域前缀开头，`.btn` 基类被整段中和
 *   4. 行为：日期选中驱动当日面板、chips 是导航还是提问、信号 done/snooze 的请求体、
 *      最近会话卡打开会话、提问行进入对话分支
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import {
  iorbitCalendarCells,
  iorbitLedgerProgress,
  iorbitRelativeDayLabel,
  iorbitSelectedDayLabel,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-model";
import {
  IOrbitShell,
  IORBIT_STYLES,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-shell";
import { IOrbitHome } from "../../app/(app)/app/agent/iorbit-0918/iorbit-home";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";

/* ── 1. 纯函数 ─────────────────────────────────────────────────────────── */

test("iorbit calendar cells lead with the weekday offset of the first day", () => {
  // 2026-09-01 是周二；设计（132–139）的周首是「日」，因此前面两格是空格。
  const september = iorbitCalendarCells(2026, 9);
  assert.equal(september.length, 32);
  assert.deepEqual(september.slice(0, 3), [null, null, 1]);
  assert.equal(september.at(-1), 30);

  // 2026-02-01 是周日 → 零空格，28 天。
  const february = iorbitCalendarCells(2026, 2);
  assert.equal(february.length, 28);
  assert.equal(february[0], 1);
});

test("the selected-day label uses the real weekday, not the design's 18th", () => {
  assert.equal(iorbitSelectedDayLabel(2026, 9, 22, "zh"), "9月22日（周二）");
  assert.equal(iorbitSelectedDayLabel(2026, 9, 1, "zh"), "9月1日（周二）");
});

test("relative session labels collapse to today / yesterday / days / weeks", () => {
  const now = new Date("2026-09-22T05:00:00Z");
  assert.equal(iorbitRelativeDayLabel("2026-09-22T01:00:00Z", now, "zh"), "今天");
  assert.equal(iorbitRelativeDayLabel("2026-09-21T01:00:00Z", now, "zh"), "昨天");
  assert.equal(iorbitRelativeDayLabel("2026-09-20T01:00:00Z", now, "zh"), "2 天前");
  assert.equal(iorbitRelativeDayLabel("2026-09-08T01:00:00Z", now, "zh"), "2 周前");
  assert.equal(iorbitRelativeDayLabel("not-a-date", now, "zh"), null);
});

test("ledger progress counts completed against the entries actually in flight", () => {
  assert.equal(iorbitLedgerProgress([]), null);
  assert.equal(iorbitLedgerProgress([{ status: "rejected" }]), null);
  assert.deepEqual(
    iorbitLedgerProgress([
      { status: "completed" },
      { status: "approved" },
      { status: "executing" },
      { status: "rejected" },
    ]),
    { done: 1, percent: 33, total: 3 },
  );
});

/* ── 2. SSR 结构 ───────────────────────────────────────────────────────── */

const VIEW_MODEL = createOrbitAgentStarterViewModel();

const HOME = {
  account: {
    fullName: "QA Tester",
    headline: "Orbit",
    initial: "Q",
    relationshipGoal: "推进日本制造业合作",
  },
  events: [],
  stats: { events: 0, inProgress: 0, people: 0 },
};

function shellMarkup(props: { initialDeepLink?: boolean } = {}): string {
  return renderToStaticMarkup(
    <IOrbitShell
      home={HOME as never}
      registrationAvailabilityByEventId={{}}
      viewModel={VIEW_MODEL}
      {...props}
    />,
  );
}

test("the iOrbit shell renders the design's home frame under a double page scope", () => {
  const html = shellMarkup();

  // 「审阅修订」2：外层保留 agent 作用域（冻结样式表的 44 条规则靠它），内层是新皮肤。
  assert.match(html, /data-orbit-real-page="agent"/);
  assert.match(html, /data-orbit-real-page="iorbit-0918"/);
  assert.ok(
    html.indexOf('data-orbit-real-page="agent"') <
      html.indexOf('data-orbit-real-page="iorbit-0918"'),
    "the agent scope must wrap the iorbit-0918 scope",
  );

  // 「审阅修订」15 / 28：这些标记测试与审计都吃，壳必须一直带着。
  assert.match(html, /data-orbit-ask-clearance="manual"/);
  assert.match(html, /data-orbit-agent-request-state="idle"/);
  assert.match(html, /data-orbit-agent-screen-title/);

  // 设计 43 的 <main> 与 47 的概览外层。
  assert.match(html, /class="ir-main"/);
  assert.match(html, /class="ir-home"/);
});

// 任务 3：对话分支不再委托旧的 `OrbitRealAgent`，由 `iorbit-chat.tsx` 自己渲染。
test("the chat branch renders the Orbit_0918 chat screen, not the old console", () => {
  const html = shellMarkup({ initialDeepLink: true });

  assert.match(html, /class="ir-chat"/);
  assert.match(html, /class="ir-thread"/);
  assert.doesNotMatch(html, /class="orbit-agent-workspace"/);
  assert.doesNotMatch(html, /class="ir-home"/);
});

/**
 * 修订轮 1：`.orbit-agent-workspace` 同时出现在 dashboard 分支上，单看它不足以证明
 * 「打开对话」真的进了对话。这两条断对话独有的线程卡与输入区，并断言旧 dashboard
 * 独有的 `data-orbit-agent-dashboard` **不在**（任务 3：改断新屏的 `ir-*`）。
 */
async function openFromHome(t: TestContext, label: "chat" | "history") {
  const mounted = await mountHome(t, () => (
    <IOrbitShell
      home={HOME as never}
      registrationAvailabilityByEventId={{}}
      viewModel={VIEW_MODEL}
    />
  ));
  const className = label === "chat" ? "btn ir-enter-btn" : "btn ir-history-btn";
  const button = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === className,
  )[0]!;
  await act(async () => {
    button.props.onClick();
  });
  await mounted.settle();
  return mounted;
}

test("「进入对话页 →」opens an actual conversation, not the old dashboard", async (t) => {
  const mounted = await openFromHome(t, "chat");

  assert.equal(mounted.pushedUrls.at(-1), "/app/agent");
  assert.ok(
    mounted.root.root.findAll((node) => node.props?.className === "ir-thread").length > 0,
    "the chat thread card must render",
  );
  assert.ok(
    mounted.root.root.findAll(
      (node) => node.props?.className === "ir-composer",
    ).length > 0,
    "the chat composer must render",
  );
  assert.equal(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-dashboard"] !== undefined,
    ).length,
    0,
    "the old batch-4a dashboard must not be what the primary CTA lands on",
  );
});

test("「◷ 历史记录」opens the conversation with the history drawer", async (t) => {
  const mounted = await openFromHome(t, "history");

  assert.ok(
    mounted.root.root.findAll((node) => node.props?.className === "ir-thread").length > 0,
  );
  assert.equal(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-dashboard"] !== undefined,
    ).length,
    0,
  );
  assert.ok(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-history-drawer"] !== undefined,
    ).length > 0,
    "the history drawer must be open",
  );
});

test("the home screen ships every design block from lines 46–253", () => {
  const html = shellMarkup();

  for (const copy of [
    // 49–55
    ">iOrbit<",
    "今天的重要事项、活动与人脉推进，我已经帮你整理好了。",
    // 57–74
    "今天你想推进什么？",
    "帮我安排今天",
    "推荐适合我的活动",
    "我该先联系谁",
    "帮我制定推进计划",
    "打开对话",
    // 78–110
    "今日日程",
    "查看完整日程 →",
    "今日简报",
    // 109–146
    "日历",
    "进入日程页 →",
    // 148–170
    "已报名活动",
    "查看活动推荐 →",
    // 172–193
    "建议与行动",
    "查看建议与行动 →",
    // 195–212
    "联系人机会",
    "查看联系人建议 →",
    // 214–236
    "本周推进",
    "查看执行计划 →",
    "本周目标",
    "进度",
    // 237–252
    "继续对话",
    "从上次的对话继续，或选择一个主题开始新的讨论。",
    "历史记录",
    "进入对话页 →",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from the home screen: ${copy}`);
  }

  // 跨域链接（「审阅修订」16）。
  assert.match(html, /href="\/app\/events"/);
  assert.match(html, /href="\/app\/contacts"/);
  // 两枚导航 chip 是 <a>，不是发消息的按钮。
  assert.match(html, /<a class="ir-chip" href="\/app\/agent\/strategy\?view=contacts"/);
  assert.match(html, /<a class="ir-chip" href="\/app\/agent\/strategy"/);
});

test("the home screen never renders the design's mock numbers or names", () => {
  const html = shellMarkup();

  for (const mock of [
    "2026年9月18日 · 星期五",
    "3 个日程",
    "14%",
    "1 / 7 项已完成",
    "12 人",
    "田中圭子",
    "山本健一",
    "佐藤直树",
    "东京 AI 创业者交流会",
    "日本–亚洲创业峰会",
    "虎之门之丘",
    "东京国际论坛",
    "Google Meet",
    "准备活动资料",
    "联系 3 个目标联系人",
    "建立 3 个高价值联系人",
    "分析我的人脉机会",
    "推进日本制造业合作，建立",
  ]) {
    assert.ok(!html.includes(mock), `design mock leaked into the home screen: ${mock}`);
  }

  // 真实来源在位：本周目标来自 profile 的 relationshipGoal。
  assert.ok(html.includes("推进日本制造业合作"));
  // 没有账本数据时进度是「—」而不是伪造的百分比。
  assert.match(html, /class="ir-progress-value">—</);
});

test("every home <button> carries the btn ir-* contract", () => {
  // 顶栏（AccountTopNav）不在本屏的样式面里，只看 <main class="ir-main"> 之后的部分。
  const html = shellMarkup().split('<main class="ir-main">')[1] ?? "";
  const buttons = html.match(/<button[^>]*>/g) ?? [];

  assert.ok(buttons.length > 0);
  for (const tag of buttons) {
    assert.match(tag, /class="btn ir-[a-z-]+/, `button without btn ir-* class: ${tag}`);
  }
});

/* ── 3. 作用域形态 ─────────────────────────────────────────────────────── */

const SCOPE = '[data-orbit-real-page="iorbit-0918"]';

test("every IORBIT_STYLES rule is scoped to the iorbit-0918 page", () => {
  const body = IORBIT_STYLES
    // 注释先整体剥掉（里面有设计稿的 `{{ }}` 会干扰按括号切分），再剥 @keyframes / @media。
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

  const selectors = body
    .split("}")
    .map((chunk) => chunk.split("{")[0] ?? "")
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  assert.ok(selectors.length > 40, `expected the full skin, found ${selectors.length} rules`);
  for (const selector of selectors) {
    for (const part of selector.split(",")) {
      assert.ok(
        part.trim().startsWith(SCOPE),
        `unscoped rule in IORBIT_STYLES: ${part.trim()}`,
      );
    }
  }

  // @media 里的规则同样带作用域。
  const media = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").match(/@media[^{]*\{([\s\S]*?)\n\}/);
  assert.ok(media);
  for (const line of media![1]!.split("\n").map((value) => value.trim()).filter(Boolean)) {
    assert.ok(line.startsWith(SCOPE), `unscoped rule inside @media: ${line}`);
  }
});

test("every .btn rule neutralises the shared base class and its :active transform", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  // 基类（`.btn.<prefix>-*` 的落地规则）；`.btn.ir-day-on` 一类修饰类只改设计里变化的声明。
  const BASE_BUTTON_CLASSES = [
    "ir-ask-send",
    "ir-chip",
    "ir-open-chat",
    "ir-cal-nav-btn",
    "ir-day",
    "ir-action",
    "ir-signal-op",
    "ir-history-btn",
    "ir-enter-btn",
    "ir-resume-card",
    "ir-refresh",
  ];

  for (const className of BASE_BUTTON_CLASSES) {
    const match = flat.match(
      new RegExp(`\\.btn\\.${className}(?![-a-z])[^{]*\\{[^}]*\\}`),
    );
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
});

/* ── 4. 行为 ───────────────────────────────────────────────────────────── */

/** 取某个子树里的全部文本（`ReactTestInstance` 没有 `toJSON`）。 */
function textOf(node: { children: readonly unknown[] }): string {
  let out = "";
  for (const child of node.children) {
    if (typeof child === "string") out += child;
    else out += textOf(child as { children: readonly unknown[] });
  }
  return out;
}


interface Mounted {
  calls: Array<{ body: unknown; method: string; url: string }>;
  pushedUrls: string[];
  root: ReactTestRenderer;
  settle: (rounds?: number) => Promise<void>;
}

interface MountOptions {
  ledger?: unknown;
  signalPatchFails?: boolean;
  sessions?: unknown;
  signals?: unknown;
  snapshot?: unknown;
}

async function mountHome(
  t: TestContext,
  element: (options: { loadSnapshot: () => Promise<never> }) => React.ReactElement,
  options: MountOptions = {},
): Promise<Mounted> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const pushedUrls: string[] = [];
  const calls: Array<{ body: unknown; method: string; url: string }> = [];
  const location = {
    href: "https://orbit.test/app/agent",
    origin: "https://orbit.test",
    pathname: "/app/agent",
    search: "",
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
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
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
      removeEventListener() {},
      sessionStorage: {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => undefined,
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
    if (url.startsWith("/api/agent/ledger")) {
      return Response.json({
        data: { entries: options.ledger ?? [] },
        success: true,
      });
    }
    if (url.startsWith("/api/agent/signals/")) {
      if (options.signalPatchFails) {
        return Response.json(
          { error: { code: "STORAGE_UNAVAILABLE", message: "信号暂时写不进去。" } },
          { status: 503 },
        );
      }
      const id = decodeURIComponent(url.slice("/api/agent/signals/".length));
      const current = (options.signals as { signalId: string }[] | undefined) ?? [];
      const signal = current.find((item) => item.signalId === id);
      return Response.json({ data: { signal: { ...signal, status: "dismissed" } } });
    }
    if (url.startsWith("/api/agent/signals")) {
      return Response.json({ data: { signals: options.signals ?? [] } });
    }
    if (url.startsWith("/api/ai/conversations/sessions")) {
      return Response.json({ data: { sessions: options.sessions ?? [] } });
    }
    return Response.json({ success: false }, { status: 404 });
  });

  const loadSnapshot = (async () => options.snapshot ?? "unavailable") as () => Promise<never>;

  let root: ReactTestRenderer | null = null;
  await act(async () => {
    root = create(element({ loadSnapshot }));
  });

  const settle = async (rounds = 4) => {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  await settle();

  return { calls, pushedUrls, root: root!, settle };
}

function homeElement(
  overrides: Partial<React.ComponentProps<typeof IOrbitHome>> = {},
) {
  return ({ loadSnapshot }: { loadSnapshot: () => Promise<never> }) => (
    <IOrbitHome
      home={HOME as never}
      loadSnapshot={loadSnapshot}
      navigate={overrides.navigate ?? (() => undefined)}
      onAsk={overrides.onAsk ?? (() => undefined)}
      onOpenChat={overrides.onOpenChat ?? (() => undefined)}
      onOpenHistory={overrides.onOpenHistory ?? (() => undefined)}
      onOpenSession={overrides.onOpenSession ?? (() => undefined)}
    />
  );
}

const SNAPSHOT = (isoDay: string) => ({
  facts: {
    appointments: {
      items: [
        {
          appointmentId: "appt-1",
          contactId: null,
          durationMinutes: 60,
          endsAtUtc: `${isoDay}T02:30:00Z`,
          href: "/app/schedule",
          key: "appt-1",
          medium: "video",
          needsReconfirmation: false,
          startsAtUtc: `${isoDay}T01:30:00Z`,
          status: "confirmed",
          temporalState: "upcoming",
        },
      ],
      state: "ready",
    },
    followups: {
      current: {
        items: [
          {
            collection: "current",
            contactId: "c1",
            contactName: "Mina Aoki",
            connectionId: null,
            group: "recent",
            id: "f1",
            key: "f1",
            operationHref: "/app/contacts/c1",
            organization: "Acme KK",
            href: "/app/contacts/c1",
            relationshipStage: "active",
            status: "open",
            title: "把会议纪要发过去",
            updatedAt: `${isoDay}T00:00:00Z`,
          },
        ],
      },
      state: "ready",
    },
    personal: { items: [], state: "ready" },
  },
});

test("picking a calendar day drives the day panel", async (t) => {
  // 用东京日历的「今天」造一条约谈，保证它落在当月。
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());
  const today = Number(todayKey.slice(8, 10));
  const other = today === 1 ? 2 : 1;

  const mounted = await mountHome(t, homeElement(), {
    snapshot: SNAPSHOT(todayKey),
  });

  const panel = () =>
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-iorbit-day-panel"] === true,
    )[0]!;

  assert.ok(
    textOf(panel()).includes("已确认约谈"),
    "the selected day starts on today and shows today's appointment",
  );

  const otherDay = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-iorbit-day"] === other,
  )[0]!;
  await act(async () => {
    otherDay.props.onClick();
  });

  assert.ok(!textOf(panel()).includes("已确认约谈"));
  assert.ok(textOf(panel()).includes("这一天没有日程"));
  assert.ok(textOf(panel()).includes("0 个日程"));
});

test("ask chips send a message while the two navigation chips are plain links", async (t) => {
  const asked: string[] = [];
  const mounted = await mountHome(t, homeElement({ onAsk: (query) => asked.push(query) }));

  const chipButtons = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-chip",
  );
  assert.equal(chipButtons.length, 2, "only the two ask chips are buttons");

  await act(async () => {
    chipButtons[0]!.props.onClick();
  });
  assert.deepEqual(asked, ["帮我安排今天"]);

  const chipLinks = mounted.root.root.findAll(
    (node) => node.type === "a" && node.props?.className === "ir-chip",
  );
  assert.deepEqual(
    chipLinks.map((node) => node.props.href),
    ["/app/agent/strategy?view=contacts", "/app/agent/strategy"],
  );
});

test("the suggestion rows keep the signal done / snooze writes and the refresh control", async (t) => {
  const signal = (signalId: string, title: string) => ({
    actions: [{ actionId: "open", href: "/app/contacts/c1", label: "打开联系人" }],
    changes: [],
    confidence: 0.8,
    lastObservedAt: "2026-09-20T00:00:00Z",
    reason: "上次会议后 3 天未跟进",
    severity: "high",
    signalId,
    sources: [],
    status: "new",
    summary: "跟进",
    title,
    type: "followup_due",
  });
  const signals = [signal("signal-1", "会后跟进"), signal("signal-2", "准备资料")];
  const mounted = await mountHome(t, homeElement(), { signals });

  assert.ok(
    mounted.calls.some(
      (call) => call.url === "/api/agent/signals?view=home" && call.method === "POST",
    ),
    "signals are read through the existing POST refresh endpoint",
  );

  const row = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-agent-signal"] === "signal-1",
  )[0]!;
  assert.ok(textOf(row).includes("会后跟进"));

  const opsOf = (signalId: string) =>
    mounted.root.root
      .findAll((node) => node.props?.["data-orbit-agent-signal"] === signalId)[0]!
      .findAll(
        (node) => node.type === "button" && node.props?.className === "btn ir-signal-op",
      );
  assert.equal(opsOf("signal-1").length, 2, "each row keeps both write controls");

  // 「完成」把信号写成 dismissed（行随之从列表里消失），「明天提醒」写 snoozed。
  await act(async () => {
    opsOf("signal-1")[0]!.props.onClick();
  });
  await mounted.settle();
  await act(async () => {
    opsOf("signal-2")[1]!.props.onClick();
  });
  await mounted.settle();

  const patches = mounted.calls.filter((call) => call.method === "PATCH");
  assert.equal(patches.length, 2);
  assert.equal(patches[0]!.url, "/api/agent/signals/signal-1");
  assert.equal((patches[0]!.body as { status: string }).status, "dismissed");
  assert.equal((patches[1]!.body as { status: string }).status, "snoozed");
  assert.match(
    (patches[1]!.body as { snoozedUntil: string }).snoozedUntil,
    /^\d{4}-\d{2}-\d{2}T/,
  );

  const refresh = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-agent-signals-refresh"] === true,
  )[0]!;
  const before = mounted.calls.filter((call) => call.method === "POST").length;
  await act(async () => {
    refresh.props.onClick();
  });
  await mounted.settle();
  assert.equal(
    mounted.calls.filter((call) => call.method === "POST").length,
    before + 1,
  );
});

test("today's agenda sorts on real timestamps, not formatted clock strings", async (t) => {
  // 同一天：全天项 + 上午 10:30 + 下午 18:30。格式化字符串排序会在 en-US 下
  // 把 "06:30 PM" 排到 "10:30 AM" 前面，全天项在两种语言下都无序。
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());
  const snapshot = {
    facts: {
      appointments: {
        items: [
          {
            appointmentId: "late",
            contactId: null,
            durationMinutes: 60,
            endsAtUtc: `${todayKey}T10:30:00Z`,
            href: "/app/schedule",
            key: "late",
            medium: "video",
            needsReconfirmation: false,
            // 18:30 JST
            startsAtUtc: `${todayKey}T09:30:00Z`,
            status: "confirmed",
            temporalState: "upcoming",
          },
        ],
        state: "ready",
      },
      followups: { current: { items: [] }, state: "ready" },
      personal: {
        items: [
          {
            allDay: true,
            id: "allday",
            key: "allday",
            occurrenceDate: todayKey,
            startsAt: `${todayKey}T00:00:00+09:00`,
            state: "confirmed",
            title: "全天项",
          },
          {
            id: "morning",
            key: "morning",
            occurrenceDate: todayKey,
            // 10:30 JST
            startsAt: `${todayKey}T01:30:00Z`,
            state: "confirmed",
            title: "上午项",
          },
        ],
        state: "ready",
      },
    },
  };

  for (const language of ["zh", "en"] as const) {
    const mounted = await mountHome(
      t,
      ({ loadSnapshot }) => (
        <OrbitLanguageProvider initialLanguage={language}>
          <IOrbitHome
            home={HOME as never}
            loadSnapshot={loadSnapshot}
            navigate={() => undefined}
            onAsk={() => undefined}
            onOpenChat={() => undefined}
            onOpenHistory={() => undefined}
            onOpenSession={() => undefined}
          />
        </OrbitLanguageProvider>
      ),
      { snapshot },
    );

    const titles = mounted.root.root
      .findAll((node) => node.props?.className === "ir-agenda-title")
      .map((node) => textOf(node));

    assert.deepEqual(
      titles,
      language === "zh"
        ? ["全天项", "上午项", "已确认约谈"]
        : ["全天项", "上午项", "Confirmed appointment"],
      `agenda order is wrong under ${language}`,
    );
  }
});

test("a failed signal write tells the user instead of failing silently", async (t) => {
  const mounted = await mountHome(t, homeElement(), {
    signalPatchFails: true,
    signals: [
      {
        actions: [{ actionId: "open", href: "/app/contacts/c1", label: "打开联系人" }],
        changes: [],
        confidence: 0.8,
        lastObservedAt: "2026-09-20T00:00:00Z",
        reason: "上次会议后 3 天未跟进",
        severity: "high",
        signalId: "signal-1",
        sources: [],
        status: "new",
        summary: "跟进",
        title: "会后跟进",
        type: "followup_due",
      },
    ],
  });

  const op = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-signal-op",
  )[0]!;
  await act(async () => {
    op.props.onClick();
  });
  await mounted.settle();

  const alert = mounted.root.root.findAll((node) => node.props?.role === "alert")[0];
  assert.ok(alert, "a failed write must surface an alert");
  assert.equal(textOf(alert!), "信号暂时写不进去。");
  // 行还在（没有被乐观地改掉）。
  assert.ok(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-signal"] === "signal-1",
    ).length > 0,
  );
});

test("recent conversation cards open the stored session", async (t) => {
  const opened: string[] = [];
  const mounted = await mountHome(
    t,
    homeElement({ onOpenSession: (id) => opened.push(id) }),
    {
      sessions: [
        {
          createdAt: "2026-09-20T00:00:00Z",
          id: "session:alpha",
          title: "推荐适合我的活动吗",
          updatedAt: "2026-09-20T00:00:00Z",
        },
      ],
    },
  );

  const card = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-iorbit-session"] === "session:alpha",
  )[0]!;
  assert.ok(textOf(card).includes("上次对话 · "));

  await act(async () => {
    card.props.onClick();
  });
  assert.deepEqual(opened, ["session:alpha"]);
});

test("submitting the ask row deep-links into the chat branch", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell
      home={HOME as never}
      registrationAvailabilityByEventId={{}}
      viewModel={VIEW_MODEL}
    />
  ));

  const send = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-ask-send",
  )[0]!;
  const input = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-iorbit-ask-input"] === true,
  )[0]!;

  await act(async () => {
    input.props.onChange({ target: { value: "帮我准备周日的活动" } });
  });
  await act(async () => {
    send.props.onClick();
  });

  // 任务 3：壳自己持有 `use-agent-chat`，提问直接落到 `ask()`（不再写 `?q=` 让
  // 旧组件的 hydration 代劳），URL 因此停在 /app/agent。
  assert.ok(
    mounted.calls.some(
      (call) =>
        call.url.startsWith("/api/ai/conversations") &&
        (call.body as { message?: string } | undefined)?.message === "帮我准备周日的活动",
    ),
    "the ask row must send the question through the conversations API",
  );
  assert.equal(
    mounted.root.root.findAll((node) => node.props?.className === "ir-home").length,
    0,
    "the home branch unmounts once the shell switches to chat",
  );
});
