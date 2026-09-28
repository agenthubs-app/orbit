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
import { PENDING_CARDS_COALESCE_MS } from "../../app/(app)/app/agent/iorbit-0918/use-pending-cards";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

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

// 任务 4：抽屉换成设计版（`iorbit-history-drawer.tsx`）后，从概览打开历史**留在概览**
// ——它是浮在当前屏之上的遮罩（设计 786）。任务 2 修订轮 1 让它顺带进对话，是因为
// 当时抽屉还挂在旧组件里、必须先进对话分支才挂得上。
test("「◷ 历史记录」opens the history drawer over the overview", async (t) => {
  const mounted = await openFromHome(t, "history");

  assert.ok(
    mounted.root.root.findAll((node) => node.props?.className === "ir-home").length > 0,
    "the overview must stay behind the drawer",
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

test("the home screen ships the morning-paper layout", () => {
  const html = shellMarkup();

  for (const copy of [
    // 报头
    ">iOrbit<",
    "正在整理今天的事…",
    // 左宽栏：今日要事 + 追问条
    "今日要事",
    "刷新",
    "还有别的想推进？问 iOrbit",
    "打开对话",
    // 右窄栏：时间
    ">今天<",
    "日程页 →",
    // 栏目区
    "本周推进",
    "执行计划 →",
    "我该先联系谁 →",
    "帮我制定推进计划 →",
    "已报名活动",
    "全部活动 →",
    "最近对话",
    ">历史记录<",
    "进入对话 →",
  ]) {
    assert.ok(html.includes(copy), `copy missing from the home screen: ${copy}`);
  }

  // 旧版七张等权卡片与顶部 chips 已经拿掉（Q7 / Q11）。
  const homeHtml = html.split('class="ir-home"')[1] ?? "";
  for (const gone of ["今日简报", "联系人机会", "帮我安排今天", "推荐适合我的活动", "class=\"ir-card"]) {
    assert.ok(!homeHtml.includes(gone), `old home block leaked back: ${gone}`);
  }

  // 跨域链接。
  assert.match(html, /href="\/app\/events"/);
  assert.match(html, /href="\/app\/agent\/plan"/);
  assert.match(html, /href="\/app\/agent\/strategy\?view=contacts"/);
  assert.match(html, /href="\/app\/agent\/strategy"/);
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
  /** 派发一次 window 事件（W0011：`orbit-card-batches`）。 */
  dispatch: (type: string) => void;
  pushedUrls: string[];
  replacedUrls: string[];
  root: ReactTestRenderer;
  settle: (rounds?: number) => Promise<void>;
}

interface MountOptions {
  /** W0011：本机进行中批次登记表与每批的 GET 详情（null = 404；可在测试中途修改）。 */
  cardBatches?: {
    active: string[];
    details: Record<string, unknown>;
    /** 自定义某批 GET 的应答（慢响应 / 5xx）；返回 undefined 时按 details 应答。 */
    respond?: (batchId: string) => Promise<Response | undefined> | Response | undefined;
  };
  /** W0004：`PATCH /api/guide/state` 的应答（默认 404）。 */
  guidePatch?: (body: unknown) => Promise<Response>;
  /** W0004：地址栏的初始查询串（如 `?q=…`）。 */
  search?: string;
  /** W0004：可读写的 sessionStorage 内容（默认恒为空）。 */
  sessionStore?: Map<string, string>;
  ledger?: unknown;
  /** W0009：`GET /api/agent/plans/current` 的 data（undefined = 接口 404，走账本回退）。 */
  plan?: unknown;
  /** W0012：`GET /api/agent/plans/weekly-summary` 的 data（undefined = 接口 404）。 */
  weeklySummary?: unknown;
  /** W0010：`GET /api/agent/plans/candidates` 的 data（undefined = 接口 404）。 */
  matches?: unknown;
  /** W0010：`POST /api/agent/plans/candidates` 的应答。 */
  matchDecision?: (body: unknown) => Response;
  /** W0009：`PATCH /api/agent/plans/items/:id` 的应答。 */
  planPatch?: (url: string, body: unknown) => Promise<Response> | Response;
  signalPatchFails?: boolean;
  signalsFail?: boolean;
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
    search: options.search ?? "",
  };
  const replacedUrls: string[] = [];
  const sessionStore = options.sessionStore;
  const listeners = new Map<string, Set<() => void>>();

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
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
      },
      clearInterval: () => undefined,
      clearTimeout: () => undefined,
      history: {
        pushState(_state: unknown, _title: string, url: string) {
          pushedUrls.push(url);
        },
        replaceState(_state: unknown, _title: string, url: string) {
          replacedUrls.push(url);
          const parsed = new URL(url, location.origin);
          location.pathname = parsed.pathname;
          location.search = parsed.search;
          location.href = parsed.href;
        },
      },
      localStorage: {
        getItem: (key: string) =>
          key === "orbit.cardBatches.active.v1" && options.cardBatches
            ? JSON.stringify(options.cardBatches.active)
            : null,
        removeItem: () => undefined,
        setItem: () => undefined,
      },
      location,
      matchMedia: () => ({ addEventListener() {}, matches: false, removeEventListener() {} }),
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      sessionStorage: sessionStore
        ? {
            getItem: (key: string) => sessionStore.get(key) ?? null,
            removeItem: (key: string) => void sessionStore.delete(key),
            setItem: (key: string, value: string) => void sessionStore.set(key, value),
          }
        : {
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
    const batchPrefix = "/api/contact-drafts/business-card/batches/v2/";
    if (url.startsWith(batchPrefix) && options.cardBatches) {
      // W0021：今日要事只读 `?view=cards`（分组与状态列）；夹具的完整详情是它的超集。
      const batchId = decodeURIComponent(url.slice(batchPrefix.length).replace(/\?view=cards$/, ""));
      const custom = await options.cardBatches.respond?.(batchId);
      if (custom) return custom;
      const found = options.cardBatches.details[batchId];
      return found ? Response.json({ data: found, success: true }) : Response.json({ success: false }, { status: 404 });
    }
    if (url === "/api/guide/state" && options.guidePatch) {
      return options.guidePatch(init?.body ? JSON.parse(String(init.body)) : undefined);
    }
    // W0021：首页读 `?view=home`（不含进展记录）；联系人详情的关联弹层同样读 home 视图。
    if ((url === "/api/agent/plans/current" || url === "/api/agent/plans/current?view=home") && options.plan !== undefined) {
      return Response.json({ data: options.plan, success: true });
    }
    if (url === "/api/agent/plans/weekly-summary" && options.weeklySummary !== undefined) {
      return Response.json({ data: options.weeklySummary, success: true });
    }
    if (url === "/api/agent/plans/candidates" && (init?.method ?? "GET") === "GET" && options.matches !== undefined) {
      return Response.json({ data: options.matches, success: true });
    }
    if (url === "/api/agent/plans/candidates" && init?.method === "POST" && options.matchDecision) {
      return options.matchDecision(init?.body ? JSON.parse(String(init.body)) : undefined);
    }
    if (url.startsWith("/api/agent/plans/items/") && options.planPatch) {
      return options.planPatch(url, init?.body ? JSON.parse(String(init.body)) : undefined);
    }
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
      if (options.signalsFail) return Response.json({ success: false }, { status: 503 });
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

  const dispatch = (type: string) => {
    for (const listener of listeners.get(type) ?? []) listener();
  };

  return { calls, dispatch, pushedUrls, replacedUrls, root: root!, settle };
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
      clock={overrides.clock}
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

test("today's items merge schedule, signals and follow-ups in priority order", async (t) => {
  // SC-W0001-02：2 小时内开始的日程 → critical/high 信号 → 其余信号 → 跟进补位；
  // 信号里已有 followup_due 时跟进队列不再补位；超过 3 件显示「还有 N 件」并可展开。
  // 时钟固定在东京 12:00，约谈在 12:30 开始。
  const clock = () => new Date("2026-09-28T03:00:00Z");
  const snapshot = SNAPSHOT("2026-09-28");
  const appointment = snapshot.facts.appointments.items[0]!;
  appointment.startsAtUtc = "2026-09-28T03:30:00Z";
  appointment.endsAtUtc = "2026-09-28T04:30:00Z";

  const signal = (signalId: string, title: string, severity: string, type: string) => ({
    actions: [{ actionId: "open", href: "/app/contacts/c9", label: "打开联系人" }],
    changes: [],
    confidence: 0.8,
    lastObservedAt: "2026-09-20T00:00:00Z",
    reason: `${title}的原因`,
    severity,
    signalId,
    sources: [],
    status: "new",
    summary: title,
    title,
    type,
  });

  const titlesOf = (mounted: Mounted) => [
    ...mounted.root.root
      .findAll((node) => node.props?.className === "ir-m-lead-title")
      .map((node) => textOf(node)),
    ...mounted.root.root
      .findAll((node) => node.props?.className === "ir-m-brief-title")
      .map((node) => textOf(node)),
  ];

  const mixed = await mountHome(t, homeElement({ clock }), {
    signals: [
      signal("s-medium", "中等信号", "medium", "relationship_stale"),
      signal("s-high", "紧急信号", "high", "relationship_stale"),
    ],
    snapshot,
  });
  const visible = titlesOf(mixed);
  assert.equal(visible.length, 3, "one lead plus two briefs are shown by default");
  assert.match(visible[0]!, /已确认约谈/, "the appointment starting within 2 hours leads");
  assert.equal(visible[1], "紧急信号");
  assert.equal(visible[2], "中等信号");

  const more = mixed.root.root.findAll(
    (node) => node.type === "button" && node.props?.className === "btn ir-m-more",
  )[0]!;
  assert.match(textOf(more), /还有 1 件/);
  await act(async () => {
    more.props.onClick();
  });
  const expanded = titlesOf(mixed);
  assert.equal(expanded.length, 4);
  assert.equal(expanded[3], "跟进 Mina Aoki", "the follow-up queue fills in last");

  const deduped = await mountHome(t, homeElement({ clock }), {
    signals: [signal("s-follow", "会后跟进", "high", "followup_due")],
    snapshot,
  });
  assert.ok(
    !titlesOf(deduped).some((title) => title.includes("Mina Aoki")),
    "a followup_due signal suppresses the follow-up queue",
  );
});

const EMPTY_SNAPSHOT = {
  facts: {
    appointments: { items: [], state: "ready" },
    followups: { current: { items: [] }, state: "ready" },
    personal: { items: [], state: "ready" },
  },
};

const plainSignal = (signalId: string, title: string, severity: string, status = "new") => ({
  actions: [{ actionId: "open", href: "/app/contacts/c9", label: "打开联系人" }],
  changes: [],
  confidence: 0.8,
  lastObservedAt: "2026-09-20T00:00:00Z",
  reason: `${title}的原因`,
  severity,
  signalId,
  sources: [],
  status,
  summary: title,
  title,
  type: "relationship_stale",
});

test("resolved signals never enter today's items", async (t) => {
  const mounted = await mountHome(t, homeElement(), {
    signals: [plainSignal("s-done", "已解决的事", "critical", "resolved"), plainSignal("s-low", "低优先的事", "low")],
    snapshot: EMPTY_SNAPSHOT,
  });
  const lead = mounted.root.root.findAll((node) => node.props?.className === "ir-m-lead-title");
  assert.equal(lead.length, 1);
  assert.equal(textOf(lead[0]!), "低优先的事");
  assert.equal(
    mounted.root.root.findAll((node) => node.props?.["data-orbit-agent-signal"] === "s-done").length,
    0,
    "a resolved signal gets no row and no write controls",
  );
});

test("a single unavailable source never reads as an all-clear", async (t) => {
  const mounted = await mountHome(t, homeElement(), { signalsFail: true, snapshot: EMPTY_SNAPSHOT });
  const html = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(html.includes("部分数据来源暂时不可用"), "the empty state admits the missing source");
  assert.ok(!html.includes("今天没有必须处理的事"));
  assert.ok(html.includes("今天的部分数据暂时读取不到"), "the lede does not claim a quiet day");
});

test("the now line stays visible after today's items end and on an empty day", async (t) => {
  // 东京 21:00；当天唯一的约谈是 10:30。
  const late = () => new Date("2026-09-28T12:00:00Z");
  const panelText = (mounted: Mounted) =>
    textOf(mounted.root.root.findAll((node) => node.props?.["data-orbit-iorbit-day-panel"] === true)[0]!);

  const ended = await mountHome(t, homeElement({ clock: late }), { snapshot: SNAPSHOT("2026-09-28") });
  const endedText = panelText(ended);
  assert.ok(endedText.includes("现在 21:00"));
  assert.ok(endedText.indexOf("已确认约谈") < endedText.indexOf("现在 21:00"), "the now line follows the finished items");

  const empty = await mountHome(t, homeElement({ clock: late }), { snapshot: EMPTY_SNAPSHOT });
  assert.ok(panelText(empty).includes("现在 21:00"));
});

test("the month toggle opens and closes the compact calendar", async (t) => {
  const mounted = await mountHome(t, homeElement(), { snapshot: EMPTY_SNAPSHOT });
  const cal = () => mounted.root.root.findAll((node) => node.props?.className === "ir-m-cal")[0]!;
  const toggle = () =>
    mounted.root.root.findAll(
      (node) => node.type === "button" && node.props?.className === "btn ir-m-link ir-m-cal-toggle",
    )[0]!;
  assert.equal(cal().props["data-open"], "false");
  await act(async () => {
    toggle().props.onClick();
  });
  assert.equal(cal().props["data-open"], "true");
  await act(async () => {
    toggle().props.onClick();
  });
  assert.equal(cal().props["data-open"], "false");
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

test("the strategy shortcuts are plain links, not message buttons", async (t) => {
  const asked: string[] = [];
  const mounted = await mountHome(t, homeElement({ onAsk: (query) => asked.push(query) }));

  const links = mounted.root.root
    .findAll((node) => node.type === "a" && typeof node.props?.href === "string")
    .map((node) => node.props.href as string)
    .filter((href) => href.startsWith("/app/agent/strategy"));
  assert.deepEqual(links, ["/app/agent/strategy?view=contacts", "/app/agent/strategy"]);
  assert.deepEqual(asked, [], "nothing is sent just by rendering");
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

/* ── 5. 社群行（W0003 SC-03）──────────────────────────────────────────── */

function registeredEvent(id: string, name: string, startsAt: string) {
  return {
    id,
    name,
    place: "Tokyo",
    startsAt,
    stats: { youRsvped: true },
    venue: `${name} 会场`,
    youRsvped: true,
  };
}

const HOME_WITH_EVENTS = {
  ...HOME,
  events: [
    registeredEvent("ev-1", "第一场真实活动", "2099-10-01T09:00:00Z"),
    registeredEvent("ev-2", "第二场真实活动", "2099-10-02T09:00:00Z"),
    registeredEvent("ev-3", "第三场真实活动", "2099-10-03T09:00:00Z"),
  ],
};

function registeredColumn(html: string): string {
  const start = html.indexOf("已报名活动</h3>");
  assert.ok(start >= 0, "the registered-events column must render");
  return html.slice(start, html.indexOf("最近对话</h3>"));
}

function homeMarkup(props: { communityJoined?: boolean; home?: unknown }): string {
  return renderToStaticMarkup(
    <IOrbitHome
      communityJoined={props.communityJoined}
      home={(props.home ?? HOME) as never}
      navigate={() => undefined}
      onAsk={() => undefined}
      onOpenChat={() => undefined}
      onOpenHistory={() => undefined}
      onOpenSession={() => undefined}
    />,
  );
}

test("not joined: the registered-events column opens with a community entry, labelled as a community", () => {
  for (const home of [HOME, HOME_WITH_EVENTS]) {
    const column = registeredColumn(homeMarkup({ communityJoined: false, home }));
    const community = column.indexOf('data-orbit-iorbit-community="invite"');
    assert.ok(community >= 0, "the community entry must be present");
    // 第一条：在任何真实活动和空态之前。
    assert.ok(column.indexOf('class="ir-m-event"') === -1 || community < column.indexOf('class="ir-m-event"'));
    assert.ok(column.indexOf("还没有报名活动") === -1 || community < column.indexOf("还没有报名活动"));
    const entry = column.slice(community, column.indexOf("</a>", community));
    // 标明是社群，不伪装成活动（没有日期、写着「社群」），入口指向活动页的社群卡片。
    assert.match(entry, /社群/);
    assert.match(entry, /加入 iOrbit 用户社群/);
    assert.match(column, /href="\/app\/events#iorbit-community"[^>]*data-orbit-iorbit-community="invite"|data-orbit-iorbit-community="invite"[^>]*href="\/app\/events#iorbit-community"/);
    assert.doesNotMatch(entry, /已加入社群/);
  }
  // 没有报名活动时空态仍在（社群不冒充报名）。
  assert.match(registeredColumn(homeMarkup({ communityJoined: false })), /还没有报名活动/);
});

test("joined: the first line reads 已加入社群 and real events still show up to two", () => {
  const column = registeredColumn(homeMarkup({ communityJoined: true, home: HOME_WITH_EVENTS }));
  const joined = column.indexOf('data-orbit-iorbit-community="joined"');
  assert.ok(joined >= 0);
  assert.ok(joined < column.indexOf("第一场真实活动"), "已加入社群 must be the first line");
  assert.match(column, /已加入社群/);
  assert.doesNotMatch(column, /data-orbit-iorbit-community="invite"/);
  // 社群行不占真实活动的两个名额。
  assert.match(column, /第一场真实活动/);
  assert.match(column, /第二场真实活动/);
  assert.doesNotMatch(column, /第三场真实活动/);
});

test("the shell hands the server-read community state down to the home column", () => {
  const joined = renderToStaticMarkup(
    <IOrbitShell communityJoined home={HOME as never} viewModel={VIEW_MODEL} />,
  );
  assert.match(joined, /data-orbit-iorbit-community="joined"/);
  const invite = renderToStaticMarkup(<IOrbitShell home={HOME as never} viewModel={VIEW_MODEL} />);
  assert.match(invite, /data-orbit-iorbit-community="invite"/);
});

/* ── 6. 引导期示例模式（W0004）───────────────────────────────────────── */

const GUIDE_NEW = {
  bannerCollapsed: false,
  completed: 0,
  confirmedContacts: 0,
  nextStep: "contacts" as const,
  steps: { contacts: false, goal: false, plan: false },
};

const GUIDE_STEP_TWO = {
  bannerCollapsed: false,
  completed: 1,
  confirmedContacts: 3,
  nextStep: "goal" as const,
  steps: { contacts: true, goal: false, plan: false },
};

/** 示例模式下不许出现的读取／写入：逐个接口列出（SC-W0004-04）。 */
const FORBIDDEN_IN_DEMO = [
  "/api/agent/signals",
  "/api/agent/ledger",
  "/api/agent/plans",
  "/api/ai/conversations",
] as const;

function assertNoDemoRequests(calls: Mounted["calls"], when: string) {
  for (const endpoint of FORBIDDEN_IN_DEMO) {
    const hits = calls.filter((call) => call.url.startsWith(endpoint));
    assert.deepEqual(hits, [], `${when}: demo mode must not call ${endpoint}`);
  }
}

function demoShellMarkup(guide: typeof GUIDE_NEW | typeof GUIDE_STEP_TWO | null): string {
  return renderToStaticMarkup(
    <IOrbitShell guide={guide} home={HOME as never} viewModel={VIEW_MODEL} />,
  );
}

test("flag off / not in the guide: no demo banner, tag or persona reaches the real home", () => {
  const html = demoShellMarkup(null);
  for (const leak of ["示例预览", "data-orbit-guide-demo", "王砚", "佐藤美咲", "JETRO", "/app/start"]) {
    assert.ok(!html.includes(leak), `demo content leaked into the real home: ${leak}`);
  }
  // 真实首页照旧：进页先是读取中的导语。
  assert.ok(html.includes("正在整理今天的事…"));
});

test("demo mode renders the persona's day through the real home layout", () => {
  const html = demoShellMarkup(GUIDE_NEW);

  // 顶部横条：说明、零进度文案、三枚进度格、开始引导链接、收起。
  assert.match(html, /data-orbit-guide-demo-banner/);
  assert.ok(html.includes("示例预览"));
  assert.ok(html.includes("完成引导后，这里会是你自己的今日要事和计划。"));
  assert.ok(html.includes("3 步就能换成你的数据"));
  assert.equal((html.match(/class="ir-demo-pip"/g) ?? []).length, 3);
  assert.match(html, /href="\/app\/start"[^>]*>开始引导 →</);
  assert.ok(html.includes(">收起<"));

  // 今日要事：主稿（带依据）+ 短讯 + 「还有 1 件」。
  assert.ok(html.includes("14:00 和王砚见面，请他介绍 IT 部门的铃木"));
  assert.ok(html.includes("王砚是采购部长，上次通话时提到铃木才是系统采购的决策人。"));
  assert.ok(html.includes("2 位新联系人可能对应你计划里的人脉需求"));
  assert.ok(html.includes("约佐藤美咲见面"));
  assert.ok(html.includes("还有 1 件"));
  assert.ok(html.includes("今天有 <strong>4 件事</strong>"));
  // 时间线（示例时钟 11:40，14:00 与 18:30 两项、「现在」线在前）。
  assert.ok(html.includes("现在 11:40"));
  assert.ok(html.includes("和王砚见面 · 北辰精工（丸之内）"));
  assert.ok(html.includes("JETRO 东京创业者交流会"));
  // 本周推进、已报名活动、最近对话。
  assert.ok(html.includes("本季度找到 5 家日本中小企业试用我们的 AI 会议纪要，先从东京开始。"));
  assert.match(html, /class="ir-progress-value">2\/9</);
  assert.ok(html.includes("在 JETRO 交流会认识 2 位 IT 负责人"));
  assert.ok(html.includes("JETRO 外资企业商务交流会"));
  assert.match(html, /data-orbit-iorbit-community="joined"/);
  assert.ok(html.includes("王砚提到的铃木，怎么请他引荐？"));
  // 示例人名旁的「示例」角标：主稿、两条短讯、两条时间线。
  assert.ok((html.match(/data-orbit-guide-demo-tag/g) ?? []).length >= 5);
  // 四个来源都已就绪（不是读取中）。
  assert.match(html, /data-orbit-iorbit-ready="true"/);
  // 横条展开时导航药丸不出现。
  assert.doesNotMatch(html, /data-orbit-guide-demo-pill/);
});

test("the banner shows progress and the next step once part of the guide is done", () => {
  const html = demoShellMarkup(GUIDE_STEP_TWO);
  assert.ok(html.includes("进度 1 / 3 · 下一步：设定目标"));
  assert.equal((html.match(/class="ir-demo-pip ir-demo-pip-on"/g) ?? []).length, 1);
  assert.match(html, />继续引导 →</);
  const confirm = demoShellMarkup({ ...GUIDE_NEW, completed: 1, confirmedContacts: 1, steps: { contacts: false, goal: true, plan: false } });
  assert.ok(confirm.includes("进度 1 / 3 · 下一步：确认名片，凑够 3 位"));
});

test("a collapsed banner (stored in the guide record) renders as the nav pill on first paint", () => {
  const html = demoShellMarkup({ ...GUIDE_STEP_TWO, bannerCollapsed: true });
  assert.doesNotMatch(html, /data-orbit-guide-demo-banner/);
  assert.match(html, /data-orbit-guide-demo-pill/);
  assert.ok(html.includes("示例 · 继续引导"));
});

test("demo mode sends no signals / ledger / conversation requests on mount", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  assertNoDemoRequests(mounted.calls, "mount");
  // 示例壳不挂对话 hook：连历史分组也不会读。
  assert.equal(mounted.calls.filter((call) => call.url.includes("/api/ai/")).length, 0);
});

test("demo mode never loads the dashboard snapshot either", async (t) => {
  let snapshotLoads = 0;
  const { DemoModeProvider } = await import("../../app/(app)/app/_demo/demo-mode-context");
  const mounted = await mountHome(t, () => (
    <DemoModeProvider view={GUIDE_NEW}>
      <IOrbitHome
        home={HOME as never}
        loadSnapshot={async () => {
          snapshotLoads += 1;
          return "unavailable";
        }}
        navigate={() => undefined}
        onAsk={() => undefined}
        onOpenChat={() => undefined}
        onOpenHistory={() => undefined}
        onOpenSession={() => undefined}
      />
    </DemoModeProvider>
  ));
  assert.equal(snapshotLoads, 0);
  assertNoDemoRequests(mounted.calls, "mount");
});

test("every write in demo mode opens the 「这是示例」 guard instead of calling an API", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell guide={GUIDE_STEP_TWO} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  const root = mounted.root.root;
  const byClass = (className: string) =>
    root.findAll((node) => node.type === "button" && node.props?.className === className);

  const guard = () =>
    root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined)[0] ?? null;
  const expectGuard = async (label: string, click: () => void) => {
    await act(async () => {
      click();
    });
    await mounted.settle();
    const layer = guard();
    assert.ok(layer, `${label}: the demo guard must open`);
    const text = textOf(layer!);
    assert.ok(text.includes("这是示例"), `${label}: guard title`);
    assert.ok(text.includes("现在进度 1 / 3"), `${label}: guard progress`);
    assert.ok(text.includes("知道了"));
    assert.ok(text.includes("继续引导 →"));
    const cta = layer!.findAll((node) => node.type === "a")[0]!;
    assert.equal(cta.props.href, "/app/start");
    const dismiss = layer!.findAll(
      (node) => node.type === "button" && node.props?.["data-orbit-guide-demo-dismiss"] === true,
    )[0]!;
    await act(async () => {
      dismiss.props.onClick();
    });
    assert.equal(guard(), null, `${label}: 知道了 closes the guard`);
    return text;
  };

  // 完成 / 明天提醒
  const ops = byClass("btn ir-signal-op");
  assert.ok(ops.length >= 2);
  assert.ok((await expectGuard("done", () => ops[0]!.props.onClick())).includes("你自己的今日要事"));
  await expectGuard("snooze", () => ops[1]!.props.onClick());
  // 刷新
  const refresh = root.findAll((node) => node.props?.["data-orbit-agent-signals-refresh"] === true)[0]!;
  await expectGuard("refresh", () => refresh.props.onClick());
  // 主稿的「交给 iOrbit」
  const signalAsk = root.findAll((node) => node.props?.["data-orbit-agent-signal-ask"] !== undefined)[0]!;
  assert.ok((await expectGuard("signal ask", () => signalAsk.props.onClick())).includes("你自己的对话"));
  // 主稿跳转（看会面准备）与短讯跳转
  assert.ok(
    (await expectGuard("lead primary", () => byClass("btn ir-m-primary")[0]!.props.onClick())).includes("会面准备"),
  );
  assert.ok((await expectGuard("brief go", () => byClass("btn ir-m-go")[0]!.props.onClick())).includes("人脉匹配"));
  // 追问发送
  const input = root.findAll((node) => node.props?.["data-orbit-iorbit-ask-input"] === true)[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "帮我准备周日的活动" } });
  });
  await expectGuard("ask send", () => byClass("btn ir-ask-send")[0]!.props.onClick());
  await expectGuard("ask enter", () =>
    input.props.onKeyDown({ key: "Enter", preventDefault: () => undefined }),
  );
  // 打开对话、历史、最近会话
  await expectGuard("open chat icon", () => byClass("btn ir-m-chat")[0]!.props.onClick());
  await expectGuard("enter chat", () => byClass("btn ir-enter-btn")[0]!.props.onClick());
  assert.ok((await expectGuard("history", () => byClass("btn ir-history-btn")[0]!.props.onClick())).includes("对话记录"));
  await expectGuard("session", () => byClass("btn ir-m-session")[0]!.props.onClick());
  // 示例活动链接：拦下而不是跳到不存在的活动页
  const eventLink = root.findAll(
    (node) => node.type === "a" && node.props?.className === "ir-m-event",
  )[0]!;
  let prevented = false;
  await expectGuard("event link", () =>
    eventLink.props.onClick({ preventDefault: () => {
      prevented = true;
    } }),
  );
  assert.equal(prevented, true);

  assertNoDemoRequests(mounted.calls, "after every write control");
  assert.equal(mounted.pushedUrls.length, 0, "demo mode never navigates into the chat branch");
  assert.ok(root.findAll((node) => node.props?.className === "ir-home").length > 0, "still on the overview");
});

/* ── W0014：示例问答以只读对话打开 ─────────────────────────────────────── */

test("W0014: the demo plan Q&A opens as a read-only chat with the W0008 plan card built from demo data", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell guide={GUIDE_STEP_TWO} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  const root = mounted.root.root;
  const session = root.findAll(
    (node) => node.type === "button" && node.props?.["data-orbit-iorbit-session"] === "demo-session-plan",
  )[0]!;
  assert.ok(session, "the demo plan Q&A is one of the recent chats");
  await act(async () => {
    session.props.onClick();
  });
  await mounted.settle();

  // 切到对话分支：同一个 IOrbitChat，线程 = 示例问题 + 计划卡片（已完成态）。
  assert.equal(root.findAll((node) => node.props?.className === "ir-home").length, 0, "left the overview");
  assert.equal(root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined).length, 0);
  const thread = root.findAll((node) => node.props?.["data-orbit-iorbit-thread"] !== undefined)[0]!;
  const text = textOf(thread);
  assert.ok(text.includes("根据我的目标和人脉信息，我该如何实现目标？"), "the demo question bubble");
  const card = root.findAll((node) => node.type === "div" && node.props?.["data-orbit-plan-card"] !== undefined)[0]!;
  assert.equal(card.props["data-plan-card-state"], "done");
  const cardText = textOf(card);
  for (const copy of ["王砚和中村惠", "摸清需求", "集中接触", "推进落地", "已保存为你的计划 v1"]) {
    assert.ok(cardText.includes(copy), `demo plan card: ${copy}`);
  }
  assert.equal(
    root.findAll((node) => node.type === "div" && node.props?.["data-plan-card-phase"] !== undefined).length,
    3,
  );
  // 横条仍在；右栏上下文用示例人物的资料，不显示真实账号的。
  assert.equal(root.findAll((node) => node.props?.["data-orbit-guide-demo-banner"] !== undefined).length, 1);
  assert.ok(textOf(root.findAll((node) => node.props?.["data-orbit-guide-demo-chat"] !== undefined)[0]!).includes("中小企业 IT 负责人"));
  assertNoDemoRequests(mounted.calls, "after opening the demo Q&A");
  assert.equal(mounted.calls.filter((call) => call.url.includes("/api/ai/")).length, 0);
  assert.equal(mounted.pushedUrls.length, 0, "the read-only chat does not touch the address bar");
  assert.equal(mounted.replacedUrls.length, 0);
});

test("W0014: in the demo Q&A every follow-up, send, suggestion and history control opens the guard", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell guide={GUIDE_STEP_TWO} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  const root = mounted.root.root;
  await act(async () => {
    root
      .findAll((node) => node.type === "button" && node.props?.["data-orbit-iorbit-session"] === "demo-session-plan")[0]!
      .props.onClick();
  });
  await mounted.settle();
  const byClass = (className: string) =>
    root.findAll((node) => node.type === "button" && node.props?.className === className);
  const guard = () => root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined)[0] ?? null;
  const expectGuard = async (label: string, click: () => void) => {
    await act(async () => {
      click();
    });
    await mounted.settle();
    const layer = guard();
    assert.ok(layer, `${label}: the demo guard must open`);
    const text = textOf(layer!);
    assert.ok(text.includes("这是示例"), `${label}: guard title`);
    await act(async () => {
      layer!
        .findAll((node) => node.type === "button" && node.props?.["data-orbit-guide-demo-dismiss"] === true)[0]!
        .props.onClick();
    });
    assert.equal(guard(), null);
    return text;
  };

  // 追问输入：可以打字，发送被拦下。
  const input = root.findAll((node) => node.type === "input" && node.props?.["data-orbit-agent-chat-input"] !== undefined)[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "那第 2 阶段我该先找谁？" } });
  });
  const form = root.findAll((node) => node.type === "form" && node.props?.["data-orbit-agent-chat-composer"] !== undefined)[0]!;
  let prevented = false;
  assert.ok(
    (await expectGuard("composer send", () => form.props.onSubmit({ preventDefault: () => (prevented = true) }))).includes("你自己的对话"),
  );
  assert.equal(prevented, true);
  await expectGuard("follow-up chip", () => byClass("btn ir-followup")[0]!.props.onClick());
  const tryChips = byClass("btn ir-try-chip");
  if (tryChips.length > 0) await expectGuard("try chip", () => tryChips[0]!.props.onClick());
  assert.ok((await expectGuard("history", () => byClass("btn ir-chat-history-btn")[0]!.props.onClick())).includes("对话记录"));

  assertNoDemoRequests(mounted.calls, "after every chat control");
  assert.equal(mounted.calls.filter((call) => call.url.includes("/api/ai/")).length, 0);

  // 「← 返回概览」回到示例概览。
  await act(async () => {
    byClass("btn ir-back-btn")[0]!.props.onClick();
  });
  assert.ok(root.findAll((node) => node.props?.className === "ir-home").length > 0, "back on the overview");
});

test("W0014: a polluted real viewModel / home never reaches the demo overview, the demo Q&A thread or its aside", async (t) => {
  const REAL = "甲斐真由美";
  const pollutedViewModel = {
    ...VIEW_MODEL,
    suggests: [
      { icon: "users", label: `约${REAL}聊聊`, q: `给${REAL}（真实公司）写草稿` },
      ...VIEW_MODEL.suggests,
    ],
  };
  const pollutedHome = {
    ...HOME,
    account: { ...HOME.account, fullName: REAL, targetRelationshipTypes: [`${REAL}的同事`], topics: [`${REAL}的话题`] },
  };
  const element = () => (
    <IOrbitShell guide={GUIDE_STEP_TWO} home={pollutedHome as never} viewModel={pollutedViewModel as never} />
  );
  // 概览首帧（SSR）。
  assert.ok(!renderToStaticMarkup(element()).includes(REAL), "demo overview SSR");
  const mounted = await mountHome(t, element);
  const root = mounted.root.root;
  const allText = () => JSON.stringify(mounted.root.toJSON());
  assert.ok(!allText().includes(REAL), "demo overview");
  await act(async () => {
    root
      .findAll((node) => node.type === "button" && node.props?.["data-orbit-iorbit-session"] === "demo-session-plan")[0]!
      .props.onClick();
  });
  await mounted.settle();
  assert.ok(root.findAll((node) => node.props?.["data-orbit-guide-demo-chat"] !== undefined).length > 0, "in the demo Q&A");
  assert.ok(!allText().includes(REAL), "demo Q&A thread and aside");
  // 「试试这些问题」与右栏提问是示例人物的问题。
  assert.ok(allText().includes("我的人脉里谁能引荐中小企业 IT 负责人？"));
});

test("W0014: flag off, no demo chat branch or demo plan content reaches the real shell", () => {
  const html = demoShellMarkup(null);
  for (const leak of ["data-orbit-guide-demo-chat", "demo-session-plan", "王砚和中村惠"]) {
    assert.ok(!html.includes(leak), `demo chat content leaked into the real shell: ${leak}`);
  }
});

const GUIDE_OK = async (body: unknown) => Response.json({ data: { ...(body as object), grandfathered: false, version: 1 }, success: true });

test("收起 folds the banner into the nav pill and stores it in the guide record; the pill expands it back", async (t) => {
  const mounted = await mountHome(
    t,
    () => <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />,
    { guidePatch: GUIDE_OK },
  );
  const root = mounted.root.root;
  const find = (marker: string) => root.findAll((node) => node.props?.[marker] === true);

  await act(async () => {
    find("data-orbit-guide-demo-collapse")[0]!.props.onClick();
  });
  await mounted.settle();
  assert.equal(find("data-orbit-guide-demo-banner").length, 0);
  const pills = find("data-orbit-guide-demo-pill");
  assert.ok(pills.length > 0, "the nav pill appears");
  assert.ok(textOf(pills[0]!).includes("示例 · 开始引导"));

  const collapseCall = mounted.calls.filter((call) => call.url === "/api/guide/state");
  assert.deepEqual(collapseCall.map((call) => [call.method, call.body]), [["PATCH", { bannerCollapsed: true }]]);

  await act(async () => {
    pills[0]!.props.onClick();
  });
  await mounted.settle();
  assert.equal(find("data-orbit-guide-demo-banner").length, 1);
  assert.equal(find("data-orbit-guide-demo-pill").length, 0);
  assert.deepEqual(
    mounted.calls.filter((call) => call.url === "/api/guide/state").map((call) => call.body),
    [{ bannerCollapsed: true }, { bannerCollapsed: false }],
  );
  assertNoDemoRequests(mounted.calls, "collapse / expand");
});

test("demo banner buttons keep the btn ir-* contract and IORBIT_STYLES neutralises them", () => {
  const html = demoShellMarkup(GUIDE_NEW).split('<main class="ir-main">')[1] ?? "";
  for (const tag of html.match(/<button[^>]*>/g) ?? []) {
    assert.match(tag, /class="btn ir-[a-z-]+/, `button without btn ir-* class: ${tag}`);
  }
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
  for (const className of ["ir-demo-collapse", "ir-demo-pill", "ir-demo-dismiss"]) {
    assert.match(flat, new RegExp(`\\.btn\\.${className}(?![-a-z])[^{]*\\{[^}]*height: auto`));
    assert.match(flat, new RegExp(`\\.btn\\.${className}(?![-a-z]):active[^{]*\\{[^}]*transform: none`));
  }
});

test("a failed collapse write keeps this page's state only: nothing in local storage to replay onto another account", async (t) => {
  const mounted = await mountHome(
    t,
    () => <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />,
    { guidePatch: async () => Response.json({ success: false }, { status: 503 }) },
  );
  const storageWrites: string[] = [];
  const spyStorage = {
    getItem: (key: string) => {
      storageWrites.push(`get:${key}`);
      return "true";
    },
    removeItem: (key: string) => void storageWrites.push(`remove:${key}`),
    setItem: (key: string) => void storageWrites.push(`set:${key}`),
  };
  (globalThis as unknown as { window: { localStorage: unknown } }).window.localStorage = spyStorage;
  const find = (marker: string) => mounted.root.root.findAll((node) => node.props?.[marker] === true);

  await act(async () => {
    find("data-orbit-guide-demo-collapse")[0]!.props.onClick();
  });
  await mounted.settle();
  // 本次页面里照样收起（不报错、不回弹）。
  assert.equal(find("data-orbit-guide-demo-banner").length, 0);
  assert.ok(find("data-orbit-guide-demo-pill").length > 0);
  assert.deepEqual(storageWrites, [], "no local storage read or write for the collapse state");

  // 同一浏览器换成另一个账号（服务端记录是展开）：挂载时不补写任何东西、横条照常展开。
  const before = mounted.calls.filter((call) => call.url === "/api/guide/state").length;
  await act(async () => {
    mounted.root.update(
      <IOrbitShell guide={{ ...GUIDE_STEP_TWO }} home={HOME as never} key="bob" viewModel={VIEW_MODEL} />,
    );
  });
  await mounted.settle();
  assert.equal(mounted.calls.filter((call) => call.url === "/api/guide/state").length, before);
  assert.equal(find("data-orbit-guide-demo-banner").length, 1);
  assert.deepEqual(storageWrites, []);
});

test("rapid collapse / expand clicks leave the server holding the last choice, whatever the response order", async (t) => {
  let server: boolean | null = null;
  const pending: Array<{ body: { bannerCollapsed: boolean }; resolve: () => void }> = [];
  const mounted = await mountHome(
    t,
    () => <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />,
    {
      guidePatch: (body) =>
        new Promise<Response>((resolve) => {
          const typed = body as { bannerCollapsed: boolean };
          pending.push({
            body: typed,
            // 服务端在「处理」请求时生效：按我们决定的应答顺序落库。
            resolve: () => {
              server = typed.bannerCollapsed;
              resolve(Response.json({ data: { ...typed, grandfathered: false, version: 1 }, success: true }));
            },
          });
        }),
    },
  );
  const root = mounted.root.root;
  const find = (marker: string) => root.findAll((node) => node.props?.[marker] === true);
  const click = async (marker: string) => {
    await act(async () => {
      find(marker)[0]!.props.onClick();
    });
  };

  // 收起 → 展开 → 收起 → 展开，全部在第一个应答回来之前点完。
  await click("data-orbit-guide-demo-collapse");
  await click("data-orbit-guide-demo-pill");
  await click("data-orbit-guide-demo-collapse");
  await click("data-orbit-guide-demo-pill");
  assert.equal(pending.length, 1, "only one write is in flight at a time");

  // 总是先应答最新发出的那个（倒序），直到没有在路上的请求。
  let rounds = 0;
  while (pending.length > 0 && rounds < 10) {
    rounds += 1;
    const latest = pending.pop()!;
    latest.resolve();
    await mounted.settle();
    assert.ok(pending.length <= 1, "still at most one write in flight");
  }
  assert.equal(pending.length, 0);
  // 最后一次点击是「展开」：服务端最终必须是 false。
  assert.equal(server, false);
  assert.equal(find("data-orbit-guide-demo-banner").length, 1);
  const bodies = mounted.calls.filter((call) => call.url === "/api/guide/state").map((call) => call.body);
  assert.deepEqual(bodies.at(-1), { bannerCollapsed: false });
});

test("a pending global ask and ?q= are consumed by the demo shell and never auto-send in the real shell later", async (t) => {
  const sessionStore = new Map<string, string>([
    ["orbit.ask.pending", JSON.stringify({ context: null, from: "/app/events", query: "帮我约王砚" })],
  ]);
  const mounted = await mountHome(
    t,
    () => <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />,
    { search: "?q=%E5%B8%AE%E6%88%91%E5%87%86%E5%A4%87&lang=zh", sessionStore },
  );
  const root = mounted.root.root;

  // 示例壳：两样都被取走、清掉，改弹拦截层。
  assert.equal(sessionStore.has("orbit.ask.pending"), false);
  assert.deepEqual(mounted.replacedUrls, ["/app/agent?lang=zh"]);
  const layer = root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined)[0];
  assert.ok(layer, "the demo guard opens for the consumed ask");
  assert.ok(textOf(layer!).includes("你自己的对话"));
  assertNoDemoRequests(mounted.calls, "demo mount with a pending ask");

  // 之后（引导完成）同一标签页挂真实壳：没有任何提问被自动发出。
  await act(async () => {
    mounted.root.update(<IOrbitShell guide={null} home={HOME as never} viewModel={VIEW_MODEL} />);
  });
  await mounted.settle(8);
  const asks = mounted.calls.filter(
    (call) =>
      call.url.startsWith("/api/ai/conversations") &&
      (call.method === "POST" || (call.body as { message?: unknown } | undefined)?.message !== undefined),
  );
  assert.deepEqual(asks, [], "no question may be sent by the real shell after the demo");
  assert.ok(root.findAll((node) => node.props?.className === "ir-home").length > 0, "the real shell stays on the overview");
});

/* ── W0009 SC-04：本周推进读计划 ───────────────────────────────────────── */

function weekColumn(mounted: Mounted) {
  return mounted.root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-week"] === "plan",
  );
}

function planBox(mounted: Mounted, itemId: string) {
  return mounted.root.root.findAll(
    (node) =>
      node.type === "button" &&
      node.props.role === "checkbox" &&
      node.props["aria-label"] !== undefined &&
      node.parent?.props?.["data-orbit-iorbit-plan-action"] === itemId,
  )[0]!;
}

test("with an active plan, 本周推进 shows the phase, week n of N, three checkable actions and the counts", async (t) => {
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });

  const [column] = weekColumn(mounted);
  assert.ok(column, "the plan-backed column must render");
  const text = textOf(column);
  assert.ok(text.includes("本周推进"));
  assert.ok(text.includes("第 3 周 / 共 12 周"));
  assert.ok(text.includes("第 1 阶段 · 摸清需求"));
  const actions = column!.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-plan-action"] !== undefined,
  );
  // 3 个名额只给未完成的：本周刚完成的那件不占位，逾期 2 周的那件因此不会被挤掉。
  assert.deepEqual(
    actions.map((node) => node.props["data-orbit-iorbit-plan-action"]),
    ["a-this-week", "a-overdue-1", "a-overdue-2"],
  );
  assert.ok(actions.every((node) => !node.props.className.includes("ir-m-plan-act-done")));
  assert.ok(text.includes("已延后 1 周"));
  assert.ok(text.includes("已延后 2 周"));
  assert.ok(text.includes("行动 2/6"));
  assert.ok(text.includes("已建立联系 1 位"));
  const link = column!.findAll((node) => node.type === "a" && node.props.href === "/app/agent/plan")[0]!;
  assert.equal(textOf(link), "查看完整计划 →");
  // 账本版的进度条与「执行计划 →」不再出现。
  assert.equal(column!.findAll((node) => node.props?.className === "ir-m-bar").length, 0);
  assert.ok(!text.includes("执行计划 →"));
  // 计划也算就绪来源之一。W0021：首页只读一次 `?view=home`（不含进展记录），不读完整快照。
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/current?view=home").length, 1);
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/current").length, 0);
});

test("ticking a plan action on the home PATCHes W0007 optimistically and rolls back on failure", async (t) => {
  let fail = false;
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: planSnapshotFixture(),
    planPatch: (url, body) => {
      if (fail) {
        return Response.json({ error: { code: "CONFLICT", message: "请刷新后再试" }, success: false }, { status: 409 });
      }
      const itemId = decodeURIComponent(url.slice("/api/agent/plans/items/".length));
      const item = planSnapshotFixture().items.find((entry) => entry.id === itemId)!;
      const status = (body as { change: { status: string } }).change.status;
      return Response.json({
        data: { item: { ...item, completedAt: status === "done" ? PLAN_NOW.toISOString() : null, status }, log: null, replayed: false },
        success: true,
      });
    },
    snapshot: EMPTY_SNAPSHOT,
  });

  await act(async () => {
    planBox(mounted, "a-this-week").props.onClick();
  });
  await mounted.settle();
  const patch = mounted.calls.find((call) => call.method === "PATCH")!;
  assert.equal(patch.url, "/api/agent/plans/items/a-this-week");
  assert.deepEqual((patch.body as { change: unknown }).change, { op: "set_status", status: "done" });
  // 刚勾掉的那行暂留（可撤销），另外 2 件未完成的照常显示。
  assert.equal(planBox(mounted, "a-this-week").props["aria-checked"], true);
  assert.deepEqual(
    weekColumn(mounted)[0]!
      .findAll((node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-plan-action"] !== undefined)
      .map((node) => node.props["data-orbit-iorbit-plan-action"]),
    ["a-this-week", "a-overdue-1", "a-overdue-2"],
  );
  assert.ok(textOf(weekColumn(mounted)[0]!).includes("行动 3/6"));

  fail = true;
  await act(async () => {
    planBox(mounted, "a-overdue-1").props.onClick();
  });
  await mounted.settle();
  assert.equal(planBox(mounted, "a-overdue-1").props["aria-checked"], false);
  const alert = weekColumn(mounted)[0]!.findAll((node) => node.props?.role === "alert")[0]!;
  assert.ok(textOf(alert).includes("没能保存，已恢复原状"));
  assert.ok(textOf(alert).includes("请刷新后再试"));
  assert.ok(textOf(weekColumn(mounted)[0]!).includes("行动 3/6"));
});

test("without a plan, 本周推进 keeps the W0001 ledger display", async (t) => {
  const mounted = await mountHome(t, homeElement(), {
    ledger: [{ entryId: "e1", status: "approved", title: "账本里的任务" }],
    plan: null,
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.equal(weekColumn(mounted).length, 0);
  const html = JSON.stringify(mounted.root.toJSON());
  assert.ok(html.includes("执行计划 →"));
  assert.ok(html.includes("账本里的任务"));
  assert.ok(mounted.root.root.findAll((node) => node.props?.className === "ir-m-bar").length > 0);
  assert.ok(!html.includes("查看完整计划"));
});

/* ── W0010：今日要事里的计划匹配 ────────────────────────────────────────── */

const MATCH_LIST = {
  candidates: [
    {
      aiReason: null,
      contactId: "contact:sato",
      contactName: "佐藤 健",
      contactSubtitle: "Cloudline KK · 事业部长",
      id: "cand-1",
      industry: { en: "Industry Associations", zh: "行业协会" },
      needId: "n-connector",
      needTitle: "能帮你引荐的行业前辈",
      strength: "strong",
      tier: "rule",
    },
    {
      aiReason: "做中小企业 IT 采购",
      contactId: "contact:ito",
      contactName: "伊藤 翔",
      contactSubtitle: null,
      id: "cand-2",
      industry: null,
      needId: "n-target",
      needTitle: "中小企业的 IT 负责人",
      strength: "candidate",
      tier: "ai",
    },
  ],
  contactCount: 2,
  pendingByNeed: { "n-connector": 1, "n-target": 1 },
};

test("W0010: plan matches become one today item ranked after critical/high signals and open the shared sheet", async (t) => {
  const navigated: string[] = [];
  const decisions: unknown[] = [];
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW, navigate: (href) => navigated.push(href) }), {
    matchDecision: (body) => {
      decisions.push(body);
      return Response.json({
        data: {
          candidateId: "cand-1",
          link: { action: { id: "a-new", meta: { contactId: "contact:sato", needItemId: "n-connector" }, title: "约 佐藤 健" }, need: { id: "n-connector" } },
          status: "accepted",
        },
        success: true,
      });
    },
    matches: MATCH_LIST,
    plan: planSnapshotFixture(),
    signals: [plainSignal("s-low", "低优先的事", "low"), plainSignal("s-high", "紧急的事", "high")],
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  assert.ok(mounted.calls.some((call) => call.url === "/api/agent/plans/candidates" && call.method === "GET"));
  const titles = mounted.root.root
    .findAll((node) => node.props?.className === "ir-m-lead-title" || node.props?.className === "ir-m-brief-title")
    .map((node) => textOf(node));
  assert.deepEqual(titles.slice(0, 3), ["紧急的事", "2 位新联系人可能对应你的计划", "低优先的事"]);

  // 主按钮在本页打开共用的确认弹层，不导航。
  const go = mounted.root.root.findAll((node) => node.props?.className === "btn ir-m-go")[0]!;
  await act(async () => {
    go.props.onClick();
  });
  assert.deepEqual(navigated, []);
  const dialog = mounted.root.root.findAll((node) => node.props?.["data-plan-match-dialog"] === true);
  assert.equal(dialog.length, 1);
  assert.equal(mounted.root.root.findAll((node) => node.props?.["data-plan-match-candidate"] !== undefined && node.type === "li").length, 2);
  const sheetText = textOf(dialog[0]!);
  assert.ok(sheetText.includes("可能对应「能帮你引荐的行业前辈」"));
  assert.ok(sheetText.includes("同属二级行业：行业协会"));
  assert.ok(sheetText.includes("按公司与职位：做中小企业 IT 采购"));

  // 「是」：关联并在弹层里显示本周的「约 TA」行动卡；今日要事的计数随之减少。
  const yes = mounted.root.root.findAll((node) => node.props?.["data-plan-match-yes"] === true && node.type === "button")[0]!;
  await act(async () => {
    yes.props.onClick();
  });
  await mounted.settle(4);
  assert.deepEqual(decisions, [{ candidateId: "cand-1", decision: "accept" }]);
  const afterText = textOf(mounted.root.root.findAll((node) => node.props?.["data-plan-match-dialog"] === true)[0]!);
  assert.ok(afterText.includes("已加入本周：约 佐藤 健"));
  assert.ok(afterText.includes("定时间") && afterText.includes("起草邮件") && afterText.includes("记一次互动"));
  const titlesAfter = mounted.root.root
    .findAll((node) => node.props?.className === "ir-m-lead-title" || node.props?.className === "ir-m-brief-title")
    .map((node) => textOf(node));
  assert.ok(titlesAfter.includes("1 位新联系人可能对应你的计划"));
  // 确认后重新读计划（本周推进跟着更新）：冷启动一次 + 写后一次；候选列表不重读（本地移除这一条）。
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/current?view=home").length, 2);
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/candidates" && call.method === "GET").length, 1);
});

test("W0010: without a plan the home page never asks for plan matches", async (t) => {
  const mounted = await mountHome(t, homeElement(), { matches: MATCH_LIST, plan: null, snapshot: EMPTY_SNAPSHOT });
  await mounted.settle(4);
  assert.ok(!mounted.calls.some((call) => call.url === "/api/agent/plans/candidates"));
  const html = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!html.includes("可能对应你的计划"));
});

/* ── W0011：名片待确认并入今日要事 ─────────────────────────────────────── */

const CARD_BATCH_ID = "batch-w0011";

function pendingCardItem(cardId: string, seq: number, status = "extracted", confirmedContactId: string | null = null) {
  return {
    attemptCount: 1, batchId: CARD_BATCH_ID, cardId, clientDigest: `sha256:${cardId}`, confirmedContactId, createdAt: "",
    derivativeObjectKey: "k", derivativeSize: 1, errorCode: null, errorStage: null,
    extraction: { addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: ["ja"], emails: [], fullName: "山本 健一", nativeFullName: "山本 健一", organization: "ソニック", romanizedFullName: null, title: "部長", website: null },
    extractionSchemaVersion: 1, id: `item-${cardId}`, imageDigest: "sha256:y", leaseExpiresAt: null, nextRetryAt: null,
    rawMimeType: "image/png", rawSize: 1, reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization", message: "" }], seq, side: "front",
    sourceFileName: `IMG_${seq}.png`, status, updatedAt: "", usage: null, version: 1,
  };
}

function cardBatchDetail(items: unknown[]) {
  return {
    batch: {
      actorId: "a", createdAt: "2026-09-28T01:05:00.000Z", expectedItems: items.length, expiresAt: "2026-10-28T00:00:00.000Z",
      finalizedAt: "2026-09-28T01:06:00.000Z", id: CARD_BATCH_ID, idempotencyKey: "k", manifestFingerprint: "f", reviewGeneration: 1,
      status: "ready_for_review", statusReason: null, updatedAt: "2026-09-28T01:10:00.000Z", version: 3,
    },
    items,
  };
}

const todayTitles = (mounted: Mounted) =>
  mounted.root.root
    .findAll((node) => node.props?.className === "ir-m-lead-title" || node.props?.className === "ir-m-brief-title")
    .map((node) => textOf(node));

test("W0011: pending cards become 「确认 N 张新名片」 after critical/high signals, before plan matches and other signals", async (t) => {
  const navigated: string[] = [];
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW, navigate: (href) => navigated.push(href) }), {
    cardBatches: {
      active: [CARD_BATCH_ID],
      details: {
        [CARD_BATCH_ID]: cardBatchDetail([
          pendingCardItem("card-1", 1),
          pendingCardItem("card-2", 2),
          pendingCardItem("card-3", 3, "confirmed", "contact:done"),
        ]),
      },
    },
    matches: MATCH_LIST,
    plan: planSnapshotFixture(),
    signals: [plainSignal("s-low", "低优先的事", "low"), plainSignal("s-high", "紧急的事", "high")],
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted).slice(0, 3), ["紧急的事", "确认 2 张新名片", "2 位新联系人可能对应你的计划"]);
  const batchCalls = mounted.calls.filter((call) => call.url.includes("/business-card/batches/"));
  assert.ok(batchCalls.length > 0 && batchCalls.every((call) => call.method === "GET"), "the home page only reads batches");

  // 展开后其余信号排在匹配之后。
  const more = mounted.root.root.findAll((node) => node.type === "button" && node.props?.className === "btn ir-m-more")[0]!;
  await act(async () => {
    more.props.onClick();
  });
  assert.equal(todayTitles(mounted)[3], "低优先的事");

  // 依据行写批次创建时间（东京 9/28 10:05）；按钮进入该批次审阅。
  const cardBrief = mounted.root.root.findAll(
    (node) => node.props?.className === "ir-m-brief-title" && textOf(node) === "确认 2 张新名片",
  )[0]!;
  const briefRow = cardBrief.parent!.parent!;
  assert.match(textOf(briefRow), /9\/28 10:05 上传/);
  const go = briefRow.findAll((node) => node.type === "button" && textOf(node) === "去确认 →")[0];
  assert.ok(go, "the card item has its own 去确认 action");
  await act(async () => {
    go.props.onClick();
  });
  assert.deepEqual(navigated, [`/app/contacts/new?job=${CARD_BATCH_ID}`]);
});

test("W0011: the card item disappears once the batch is fully confirmed and orbit-card-batches fires", async (t) => {
  const cardBatches = {
    active: [CARD_BATCH_ID],
    details: { [CARD_BATCH_ID]: cardBatchDetail([pendingCardItem("card-1", 1)]) } as Record<string, unknown>,
  };
  const mounted = await mountHome(t, homeElement(), { cardBatches, snapshot: EMPTY_SNAPSHOT });
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted), ["确认 1 张新名片"]);

  cardBatches.details[CARD_BATCH_ID] = cardBatchDetail([pendingCardItem("card-1", 1, "confirmed", "contact:new")]);
  await act(async () => {
    mounted.dispatch("orbit-card-batches");
  });
  // W0021：连续事件合并后再读（PENDING_CARDS_COALESCE_MS）。
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PENDING_CARDS_COALESCE_MS + 20));
  });
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted), []);
});

test("W0011: demo mode never reads the local card batches", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ), {
    cardBatches: { active: [CARD_BATCH_ID], details: { [CARD_BATCH_ID]: cardBatchDetail([pendingCardItem("card-1", 1)]) } },
  });
  await mounted.settle(6);
  assert.deepEqual(mounted.calls.filter((call) => call.url.includes("/business-card/batches/")), []);
  const html = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!html.includes("张新名片"));
});

test("W0011: while card batches are still loading the home never reads as an all-clear", async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const mounted = await mountHome(t, homeElement(), {
    cardBatches: {
      active: [CARD_BATCH_ID],
      details: { [CARD_BATCH_ID]: cardBatchDetail([pendingCardItem("card-1", 1)]) },
      respond: async () => {
        await gate;
        return undefined;
      },
    },
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  const loading = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!loading.includes("今天没有要紧的事"), "no all-clear while the card batch is still loading");
  assert.ok(loading.includes("正在整理今天的事…"));
  assert.equal(mounted.root.root.findAll((node) => node.props?.["data-orbit-iorbit-ready"] === "true").length, 0);

  release();
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted), ["确认 1 张新名片"]);
});

test("W0011: a failed card-batch read (5xx) marks the day as partial, never as an all-clear", async (t) => {
  const mounted = await mountHome(t, homeElement(), {
    cardBatches: {
      active: [CARD_BATCH_ID],
      details: {},
      respond: () => Response.json({ success: false }, { status: 503 }),
    },
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  const html = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!html.includes("今天没有要紧的事"));
  assert.ok(html.includes("今天的部分数据暂时读取不到。"));
});

/* ── W0012 SC-02：周一导语换成上周小结 ─────────────────────────────────── */

const WEEKLY_SUMMARY = {
  counts: {
    actionsCompleted: 3,
    contactsEstablished: 2,
    contactsLinked: 0,
    eventsAttended: 1,
    eventsRegistered: 0,
    notes: 1,
    phasesEntered: [],
  },
  window: { end: "2026-09-27", fromIso: "2026-09-20T15:00:00.000Z", start: "2026-09-21", toIso: "2026-09-27T15:00:00.000Z" },
};

function ledeOf(mounted: Mounted) {
  return mounted.root.root.findAll((node) => node.type === "p" && node.props?.className === "ir-m-lede")[0]!;
}

test("W0012: on a Tokyo Monday the lede is last week's rule-built summary", async (t) => {
  // 周一 00:00 JST（UTC 仍是周日）。
  const mounted = await mountHome(t, homeElement({ clock: () => new Date("2026-09-27T15:00:00.000Z") }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
    weeklySummary: WEEKLY_SUMMARY,
  });
  const lede = ledeOf(mounted);
  assert.equal(lede.props["data-orbit-home-lede"], "weekly");
  assert.equal(textOf(lede), "上周（9/21–9/27）你完成 3 件行动、新建立联系 2 位、参加 1 场活动、记了 1 笔进展。");
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/weekly-summary").length, 1);
});

test("W0012: on other days (Sunday 23:59 JST) the today lede stays and the summary is not read", async (t) => {
  const mounted = await mountHome(t, homeElement({ clock: () => new Date("2026-09-27T14:59:00.000Z") }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
    weeklySummary: WEEKLY_SUMMARY,
  });
  const lede = ledeOf(mounted);
  assert.equal(lede.props["data-orbit-home-lede"], "today");
  assert.ok(!textOf(lede).includes("上周"));
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/weekly-summary").length, 0);
});

test("W0012: a Monday without a plan, or with an unreadable summary, keeps the today lede", async (t) => {
  const monday = () => new Date("2026-09-28T03:00:00.000Z");
  const noPlan = await mountHome(t, homeElement({ clock: monday }), { plan: null, snapshot: EMPTY_SNAPSHOT, weeklySummary: WEEKLY_SUMMARY });
  assert.equal(ledeOf(noPlan).props["data-orbit-home-lede"], "today");
  assert.equal(noPlan.calls.filter((call) => call.url === "/api/agent/plans/weekly-summary").length, 0);
  // 小结接口 404：读过一次，导语保持今日导语。
  const unreadable = await mountHome(t, homeElement({ clock: monday }), { plan: planSnapshotFixture(), snapshot: EMPTY_SNAPSHOT });
  assert.equal(unreadable.calls.filter((call) => call.url === "/api/agent/plans/weekly-summary").length, 1);
  assert.equal(ledeOf(unreadable).props["data-orbit-home-lede"], "today");
});

/* ── W0021 SC-W0021-03：首页冷启动的请求上限与连续批次事件合并 ─────────────── */

test("W0021: a cold home start reads plans/current (home view), candidates and each active batch exactly once", async (t) => {
  const second = "batch-w0021-2";
  const mounted = await mountHome(t, homeElement(), {
    cardBatches: {
      active: [CARD_BATCH_ID, second],
      details: {
        [CARD_BATCH_ID]: cardBatchDetail([pendingCardItem("card-1", 1)]),
        [second]: cardBatchDetail([pendingCardItem("card-9", 1)]),
      },
    },
    matches: MATCH_LIST,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  const count = (predicate: (call: { method: string; url: string }) => boolean) => mounted.calls.filter(predicate).length;
  assert.equal(count((call) => call.url === "/api/agent/plans/current?view=home"), 1);
  assert.equal(count((call) => call.url.startsWith("/api/agent/plans/current")), 1, "never the full snapshot on the home");
  assert.equal(count((call) => call.url === "/api/agent/plans/candidates" && call.method === "GET"), 1);
  assert.equal(count((call) => call.url.endsWith(`/${CARD_BATCH_ID}?view=cards`)), 1);
  assert.equal(count((call) => call.url.endsWith(`/${second}?view=cards`)), 1);
  assert.equal(count((call) => call.url.includes("/business-card/batches/") && !call.url.endsWith("?view=cards")), 0, "the full batch detail is not read");

  // 连续三个登记表事件合并成一次重读（每批一次）。
  await act(async () => {
    mounted.dispatch("orbit-card-batches");
    mounted.dispatch("storage");
    mounted.dispatch("orbit-card-batches");
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PENDING_CARDS_COALESCE_MS + 20));
  });
  await mounted.settle(6);
  assert.equal(count((call) => call.url.endsWith(`/${CARD_BATCH_ID}?view=cards`)), 2);
  assert.equal(count((call) => call.url.endsWith(`/${second}?view=cards`)), 2);
  // 计划与候选不因批次事件重读。
  assert.equal(count((call) => call.url.startsWith("/api/agent/plans/current")), 1);
  assert.equal(count((call) => call.url === "/api/agent/plans/candidates" && call.method === "GET"), 1);
});

test("W0021: a failed batch read is retried by the next event, not cached", async (t) => {
  let fail = true;
  const mounted = await mountHome(t, homeElement(), {
    cardBatches: {
      active: [CARD_BATCH_ID],
      details: { [CARD_BATCH_ID]: cardBatchDetail([pendingCardItem("card-1", 1)]) },
      respond: async () => (fail ? Response.json({ success: false }, { status: 503 }) : undefined),
    },
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted).includes("确认 1 张新名片"), false);
  fail = false;
  await act(async () => {
    mounted.dispatch("orbit-card-batches");
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, PENDING_CARDS_COALESCE_MS + 20));
  });
  await mounted.settle(6);
  assert.deepEqual(todayTitles(mounted), ["确认 1 张新名片"]);
  assert.equal(mounted.calls.filter((call) => call.url.endsWith(`/${CARD_BATCH_ID}?view=cards`)).length, 2);
});
