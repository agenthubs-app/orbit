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
  iorbitCalendarDayLabel,
  iorbitCalendarMarks,
  iorbitLedgerProgress,
  iorbitMonthRecommendations,
  iorbitNextEvent,
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
import { VALUE_CONTACT_ID, VALUE_LINE_EXPECTED, valueLineItem } from "../support/value-line-fixture";
import { setSharedReadAccount } from "../../app/(app)/app/orbit-shared-read";
import { SessionContext } from "next-auth/react";
import { readFileSync } from "node:fs";
import { localizeHomeEventPool } from "../../app/(app)/app/agent/iorbit-0918/iorbit-home";
import {
  countHomeEventsThisTokyoWeek,
  formatHomeEventReason,
  IOrbitTodayEvents,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-today-events";
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
  // W0036：≥10 位已确认联系人时不出补人脉提示；补人脉自己的用例另给人数。
  stats: { events: 0, inProgress: 0, people: 10 },
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
  /** W0036：可读写的 localStorage（`orbit.today.*` 等；名片登记表仍走 `cardBatches`）。 */
  localStore?: Map<string, string>;
  /** W0036：`orbit.today.*` 的 getItem／setItem 一律抛错。 */
  localStorageThrows?: boolean;
  /** W0036：记录每次对 `orbit.today.*` 的存储访问（方法 + key）。 */
  storageLog?: Array<[string, string]>;
  /** W0036：计划读取在这个 Promise 完成后才应答（用来观察计划 pending 期间的导语）。 */
  planGate?: Promise<unknown>;
  /** W0037：`PUT /api/community/membership` 的应答（默认 404）；抛错即网络错误。 */
  communityPut?: () => Promise<Response> | Response;
  /** W0038：拿到首页的每分钟时钟回调（用来模拟跨东京午夜）。 */
  onInterval?: (handler: () => void) => void;
  /** W0061：`GET /api/contacts/value-lines` 的 lines（按请求的 ids 与 lang 给；undefined = 接口 404）。 */
  valueLines?: (ids: string[], lang: string) => unknown[];
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
        getItem: (key: string) => {
          if (key.startsWith("orbit.today.")) {
            options.storageLog?.push(["getItem", key]);
            if (options.localStorageThrows) throw new Error("storage blocked");
          }
          if (key === "orbit.cardBatches.active.v1" && options.cardBatches) {
            return JSON.stringify(options.cardBatches.active);
          }
          return options.localStore?.get(key) ?? null;
        },
        key: (index: number) => [...(options.localStore?.keys() ?? [])][index] ?? null,
        get length() {
          return options.localStore?.size ?? 0;
        },
        removeItem: (key: string) => {
          if (key.startsWith("orbit.today.")) options.storageLog?.push(["removeItem", key]);
          options.localStore?.delete(key);
        },
        setItem: (key: string, value: string) => {
          if (key.startsWith("orbit.today.")) {
            options.storageLog?.push(["setItem", key]);
            if (options.localStorageThrows) throw new Error("storage blocked");
          }
          options.localStore?.set(key, value);
        },
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
      setInterval: (handler: () => void) => {
        options.onInterval?.(handler);
        return 0;
      },
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
    if (url.startsWith("/api/contacts/value-lines?") && options.valueLines) {
      const params = new URL(url, "https://orbit.test").searchParams;
      return Response.json({ data: { lines: options.valueLines((params.get("ids") ?? "").split(","), params.get("lang") ?? "") }, success: true });
    }
    if (url === "/api/community/membership" && options.communityPut) {
      return options.communityPut();
    }
    if (url === "/api/guide/state" && options.guidePatch) {
      return options.guidePatch(init?.body ? JSON.parse(String(init.body)) : undefined);
    }
    // W0021：首页读 `?view=home`（不含进展记录）；联系人详情的关联弹层同样读 home 视图。
    if ((url === "/api/agent/plans/current" || url === "/api/agent/plans/current?view=home") && options.plan !== undefined) {
      if (options.planGate) await options.planGate;
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
      communityJoined={overrides.communityJoined}
      demoEventCandidates={overrides.demoEventCandidates}
      resolvePlanEvents={overrides.resolvePlanEvents}
      guideEnabled={overrides.guideEnabled}
      {...("home" in overrides ? { home: overrides.home } : {})}
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

test("an unavailable follow-up source never reads as an all-clear (SC-W0025-03)", async (t) => {
  const followupsDown = {
    facts: { ...EMPTY_SNAPSHOT.facts, followups: { current: { count: null, items: [] }, state: "unavailable" } },
  };
  const empty = await mountHome(t, homeElement(), { snapshot: followupsDown });
  const emptyText = textOf(empty.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!emptyText.includes("今天没有必须处理的事"), "no all-clear while follow-ups are unreadable");
  assert.ok(emptyText.includes("部分数据来源暂时不可用"), "the empty state admits the missing source");
  assert.ok(emptyText.includes("今天的部分数据暂时读取不到"), "the lede does not claim a quiet day");

  const withLead = await mountHome(t, homeElement(), {
    signals: [plainSignal("s-1", "一件事", "high")],
    snapshot: followupsDown,
  });
  const note = withLead.root.root.findAll((node) => node.props?.className === "ir-m-partial");
  assert.equal(note.length, 1, "the list is marked as possibly incomplete");
  assert.match(textOf(note[0]!), /跟进暂时读取不到/, "the note names the follow-up source, not signals");

  const quiet = await mountHome(t, homeElement(), { snapshot: EMPTY_SNAPSHOT });
  const quietText = textOf(quiet.root.root as unknown as { children: readonly unknown[] });
  assert.ok(quietText.includes("今天没有必须处理的事"), "a readable empty follow-up source keeps the all-clear");
  assert.ok(!quietText.includes("部分数据来源暂时不可用"));
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

test("W0037 SC-05: the registered-events column lists only registrations — no community row, no 看看推荐 →", () => {
  for (const communityJoined of [false, true]) {
    const empty = registeredColumn(homeMarkup({ communityJoined }));
    assert.match(empty, /还没有报名活动。/);
    assert.doesNotMatch(empty, /data-orbit-iorbit-community/);
    assert.doesNotMatch(empty, /data-orbit-iorbit-guide-step4/);
    assert.doesNotMatch(empty, /看看推荐/);
    assert.doesNotMatch(empty, /社群/);
    // 有报名时只列前 2 场真实报名。
    const column = registeredColumn(homeMarkup({ communityJoined, home: HOME_WITH_EVENTS }));
    assert.match(column, /第一场真实活动/);
    assert.match(column, /第二场真实活动/);
    assert.doesNotMatch(column, /第三场真实活动/);
    assert.doesNotMatch(column, /data-orbit-iorbit-community|看看推荐|还没有报名活动/);
  }
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
  // W0037：示例社群状态读真实值（这里未传 = 未加入），小模组固定展开，社群卡在今日要事区。
  assert.doesNotMatch(html, /data-orbit-iorbit-community/);
  assert.match(html, /data-orbit-today-events="expanded"/);
  assert.match(html, /data-orbit-today-community/);
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
  // W0061：候选卡「对应 {需求}」+ 依据签（规则层「行业规则匹配 · 行业」、AI 层「名片职位」，模型原文在提示里）。
  assert.ok(sheetText.includes("对应能帮你引荐的行业前辈"));
  assert.ok(sheetText.includes("依据 · 行业规则匹配 · 行业协会"));
  assert.ok(sheetText.includes("依据 · 名片职位"));
  assert.ok(mounted.root.root.findAll((node) => node.props?.title === "做中小企业 IT 采购").length > 0);

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

test("W0023: on an ended plan 是 on Today's sheet shows the next-plan note, no 约 TA card", async (t) => {
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    matchDecision: () =>
      Response.json({
        data: { candidateId: "cand-1", link: { action: null, log: null, need: { id: "n-connector" }, replayed: false }, replayed: false, status: "accepted" },
        success: true,
      }),
    matches: MATCH_LIST,
    plan: planSnapshotFixture(),
    signals: [plainSignal("s-high", "紧急的事", "high")],
    snapshot: EMPTY_SNAPSHOT,
  });
  await mounted.settle(6);
  const go = mounted.root.root.findAll((node) => node.props?.className === "btn ir-m-go")[0]!;
  await act(async () => {
    go.props.onClick();
  });
  const yes = mounted.root.root.findAll((node) => node.props?.["data-plan-match-yes"] === true && node.type === "button")[0]!;
  await act(async () => {
    yes.props.onClick();
  });
  await mounted.settle(4);
  const sheet = textOf(mounted.root.root.findAll((node) => node.props?.["data-plan-match-dialog"] === true)[0]!);
  assert.ok(sheet.includes("已关联到「能帮你引荐的行业前辈」；计划已到期，制定下一份计划时会安排「约 TA」"), sheet);
  assert.ok(!sheet.includes("已加入本周"));
  assert.ok(!sheet.includes("记一次互动"));
  const titlesAfter = mounted.root.root
    .findAll((node) => node.props?.className === "ir-m-lead-title" || node.props?.className === "ir-m-brief-title")
    .map((node) => textOf(node));
  assert.ok(titlesAfter.includes("1 位新联系人可能对应你的计划"));
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

/* ── W0022：老用户首页的引导入口（第 3 步）；W0035：第 4 步提醒已删除 ─────────────────── */

const hrefsOf = (mounted: Mounted) =>
  mounted.root.root
    .findAll((node) => node.type === "a" && typeof node.props?.href === "string")
    .map((node) => node.props.href as string);
const step4Reminders = (mounted: Mounted) =>
  mounted.root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-guide-step4"] !== undefined,
  );
const assertNoStep4Reminder = (mounted: Mounted) => {
  assert.equal(step4Reminders(mounted).length, 0);
  assert.ok(!hrefsOf(mounted).includes("/app/start?step=4"));
  assert.ok(!textOf(mounted.root.root).includes("第 4 步"));
};

test("W0022: with the guide switch on and no plan, 帮我制定推进计划 → goes to /app/start?step=3; 我该先联系谁 → is unchanged", async (t) => {
  const mounted = await mountHome(t, homeElement({ guideEnabled: true }), {
    plan: null,
    snapshot: EMPTY_SNAPSHOT,
  });
  const hrefs = hrefsOf(mounted);
  assert.ok(hrefs.includes("/app/agent/strategy?view=contacts"));
  assert.ok(hrefs.includes("/app/start?step=3"));
  assert.ok(!hrefs.includes("/app/agent/strategy"), "the old plan link is replaced, not duplicated");
  const link = mounted.root.root.findAll((node) => node.type === "a" && node.props.href === "/app/start?step=3")[0]!;
  assert.equal(textOf(link), "帮我制定推进计划 →");
  assertNoStep4Reminder(mounted);
});

test("W0022: with the switch off the plan link stays /app/agent/strategy and no reminder is rendered", async (t) => {
  const off = await mountHome(t, homeElement({ guideEnabled: false }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  assertNoStep4Reminder(off);
  assert.ok(!hrefsOf(off).some((href) => href.startsWith("/app/start")));
  const noPlan = await mountHome(t, homeElement({ guideEnabled: false }), { plan: null, snapshot: EMPTY_SNAPSHOT });
  assert.deepEqual(
    hrefsOf(noPlan).filter((href) => href.startsWith("/app/agent/strategy") || href.startsWith("/app/start")),
    ["/app/agent/strategy?view=contacts", "/app/agent/strategy"],
  );
});

test("W0035: with an active plan and the switch on there is no step-4 reminder (W0037: no community row or 看看推荐 → either)", async (t) => {
  for (const communityJoined of [false, true]) {
    const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW, communityJoined, guideEnabled: true }), {
      plan: planSnapshotFixture(),
      snapshot: EMPTY_SNAPSHOT,
    });
    assertNoStep4Reminder(mounted);
    const community = mounted.root.root.findAll(
      (node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-community"] !== undefined,
    );
    assert.equal(community.length, 0);
    assert.equal(mounted.root.root.findAll((node) => node.type === "a" && textOf(node) === "看看推荐 →").length, 0);
    // 有计划时第 3 步入口不出现。
    assert.ok(!hrefsOf(mounted).includes("/app/start?step=3"));
  }
});

test("W0022: the demo shell ignores the guide props — no reminder, no /app/start?step link", () => {
  const html = renderToStaticMarkup(
    <IOrbitShell guide={GUIDE_NEW} guideEnabled home={HOME as never} viewModel={VIEW_MODEL} />,
  );
  assert.ok(!html.includes("data-orbit-iorbit-guide-step4"));
  assert.ok(!html.includes("/app/start?step="));
});

test("W0022: the live shell hands guideEnabled down to the home", () => {
  const html = renderToStaticMarkup(
    <IOrbitShell guideEnabled home={HOME as never} viewModel={VIEW_MODEL} />,
  );
  // SSR 首帧计划还在读取中：入口已按开关指向第 3 步，没有第 4 步提醒。
  assert.ok(html.includes('href="/app/start?step=3"'));
  assert.ok(!html.includes("data-orbit-iorbit-guide-step4"));
  assert.ok(!html.includes("/app/start?step=4"));
});


/* ── W0036：今日要事吸收本周计划行动与补人脉；首页活动池 ─────────────────────── */

const PLAN_DAY = "2026-09-28";
const NEXT_DAY_CLOCK = () => new Date("2026-09-29T03:00:00.000Z");

function w36Titles(mounted: Mounted): string[] {
  return mounted.root.root
    .findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.props?.className === "ir-m-lead-title" || node.props?.className === "ir-m-brief-title"),
    )
    .map((node) => textOf(node));
}

function w36Lede(mounted: Mounted): string {
  return textOf(mounted.root.root.findAll((node) => node.props?.className === "ir-m-lede")[0]!);
}

function todayButton(mounted: Mounted, attribute: string, itemId?: string) {
  return mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.[attribute] !== undefined && (itemId === undefined || node.props[attribute] === itemId),
  )[0];
}

function withSession(account: string | null, element: React.ReactElement) {
  const value =
    account === null
      ? { data: null, status: "unauthenticated", update: async () => null }
      : { data: { expires: "2099-01-01T00:00:00.000Z", user: { id: account } }, status: "authenticated", update: async () => null };
  return <SessionContext.Provider value={value as never}>{element}</SessionContext.Provider>;
}

const writes = (mounted: Mounted) => mounted.calls.filter((call) => call.method !== "GET" && !call.url.startsWith("/api/agent/signals?"));

test("W0036 SC-01: overdue plan actions fill today's empty slots with phase and carried-over pills; lede says one step", async (t) => {
  const navigated: string[] = [];
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW, navigate: (href) => navigated.push(href) }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  // 拖期优先：逾期 2 周的、逾期 1 周的；本周的 a-this-week 不进（名额 2）。
  assert.deepEqual(w36Titles(mounted), ["整理 10 家目标企业名单", "把了解到的决策方式记下来"]);
  const text = textOf(mounted.root.root as unknown as { children: readonly unknown[] });
  assert.ok(text.includes("本周计划 · 第 1 阶段 摸清需求"));
  assert.ok(text.includes("已顺延 2 周"));
  assert.ok(text.includes("已顺延 1 周"));
  assert.equal(w36Lede(mounted), "今天可以推进一步：整理 10 家目标企业名单。");
  // 「已顺延」是普通药丸，不用暖色。
  const hotPills = mounted.root.root.findAll((node) => node.props?.className === "ir-m-pill ir-m-pill-hot");
  assert.equal(hotPills.length, 0);
  // 点标题去计划页对应行（没有联系人、没有活动）。
  const title = mounted.root.root.findAll((node) => node.type === "a" && node.props?.["data-orbit-today-plan-title"] === "a-overdue-2")[0]!;
  assert.equal(title.props.href, "/app/agent/plan#plan-action-a-overdue-2");
  await act(async () => {
    title.props.onClick({ preventDefault() {} });
  });
  assert.deepEqual(navigated, ["/app/agent/plan#plan-action-a-overdue-2"]);
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/current?view=home").length, 1);
});

test("W0036 SC-01: only the new items are capped — 0／1／2／≥3 original items leave 2／2／1／0 plan actions, original order and 还有 N 件 unchanged", async (t) => {
  const signals = [
    plainSignal("s-1", "第一件", "high"),
    plainSignal("s-2", "第二件", "high"),
    plainSignal("s-3", "第三件", "low"),
    plainSignal("s-4", "第四件", "low"),
  ];
  const cases: Array<[number, string[]]> = [
    [1, ["第一件", "整理 10 家目标企业名单", "把了解到的决策方式记下来"]],
    [2, ["第一件", "第二件", "整理 10 家目标企业名单"]],
    [3, ["第一件", "第二件", "第三件"]],
  ];
  for (const [count, expected] of cases) {
    const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
      plan: planSnapshotFixture(),
      signals: signals.slice(0, count),
      snapshot: EMPTY_SNAPSHOT,
    });
    assert.deepEqual(w36Titles(mounted), expected, `${count} original item(s)`);
  }
  const four = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: planSnapshotFixture(),
    signals,
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.deepEqual(w36Titles(four), ["第一件", "第二件", "第三件"]);
  const text = textOf(four.root.root as unknown as { children: readonly unknown[] });
  assert.ok(text.includes("还有 1 件"));
  assert.ok(!text.includes("本周计划 ·"));
  // 原有来源占满时导语照旧。
  assert.ok(w36Lede(four).startsWith("今天有 4 件事"));
});

test("W0036 SC-01: an unreadable plan adds nothing and keeps the old copy; while the plan is pending the lede stays 正在整理", async (t) => {
  const unreadable = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), { snapshot: EMPTY_SNAPSHOT });
  assert.deepEqual(w36Titles(unreadable), []);
  assert.equal(w36Lede(unreadable), "今天没有要紧的事。");

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: planSnapshotFixture(),
    planGate: gate,
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.equal(w36Lede(pending), "正在整理今天的事…");
  release();
  await pending.settle();
  assert.equal(w36Lede(pending), "今天可以推进一步：整理 10 家目标企业名单。");
});

test("W0036 SC-01: the plan page's this-week rows carry the anchor id and a scroll margin", () => {
  const source = readFileSync("app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx", "utf8");
  assert.match(source, /id=\{`plan-action-\$\{action\.id\}`\}/);
  const styles = readFileSync("app/(app)/app/agent/iorbit-0918/iorbit-my-plan-styles.ts", "utf8");
  assert.match(styles, /\.ir-p-act \{[^}]*scroll-margin-top:/);
});

test("W0036 SC-01: the demo home gets no plan actions and keeps its lede", () => {
  const html = demoShellMarkup(GUIDE_NEW);
  assert.ok(html.includes("今天有 <strong>4 件事</strong>"));
  assert.ok(!html.includes("今天可以推进一步"));
  assert.ok(!html.includes("本周计划 ·"));
  assert.ok(!html.includes("data-orbit-today-plan"));
  assert.ok(!html.includes("data-orbit-today-nudge"));
});

test("W0036 SC-02: 完成 PATCHes the shared toggle; the row leaves Today and is ticked in 本周推进; one request in flight at a time; failure restores both with a note", async (t) => {
  let fail = false;
  let hold: Promise<void> | null = null;
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: planSnapshotFixture(),
    planPatch: async (url, body) => {
      if (hold) await hold;
      if (fail) return Response.json({ error: { code: "CONFLICT", message: "请刷新后再试" }, success: false }, { status: 409 });
      const itemId = decodeURIComponent(url.slice("/api/agent/plans/items/".length));
      const item = planSnapshotFixture().items.find((entry) => entry.id === itemId)!;
      const status = (body as { change: { status: string } }).change.status;
      return Response.json({
        data: { item: { ...item, completedAt: PLAN_NOW.toISOString(), status }, log: null, replayed: false },
        success: true,
      });
    },
    snapshot: EMPTY_SNAPSHOT,
  });

  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-done", "a-overdue-2")!.props.onClick();
  });
  await mounted.settle();
  const patches = mounted.calls.filter((call) => call.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.url, "/api/agent/plans/items/a-overdue-2");
  assert.deepEqual((patches[0]!.body as { change: unknown }).change, { op: "set_status", status: "done" });
  assert.ok(!w36Titles(mounted).includes("整理 10 家目标企业名单"));
  assert.equal(planBox(mounted, "a-overdue-2").props["aria-checked"], true);

  // 请求进行中：再点另一条的「完成」无效（同一个 planBusyId）。
  let releaseHold!: () => void;
  hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-done", "a-overdue-1")!.props.onClick();
  });
  const next = todayButton(mounted, "data-orbit-today-plan-done", "a-this-week");
  assert.ok(next, "a-this-week moved up after a-overdue-2 was done");
  assert.equal(next!.props.disabled, true);
  await act(async () => {
    next!.props.onClick();
  });
  assert.equal(mounted.calls.filter((call) => call.method === "PATCH").length, 2);
  releaseHold();
  hold = null;
  await mounted.settle();

  // 失败：两处都恢复，今日要事处有提示。
  fail = true;
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-done", "a-this-week")!.props.onClick();
  });
  await mounted.settle();
  assert.ok(w36Titles(mounted).includes("约一位老客户聊 20 分钟"));
  assert.equal(planBox(mounted, "a-this-week").props["aria-checked"], false);
  const note = mounted.root.root.findAll((node) => node.props?.["data-orbit-today-plan-error"] !== undefined)[0]!;
  assert.ok(textOf(note).includes("没能保存，已恢复原状"));
  assert.equal(mounted.calls.filter((call) => call.url === "/api/agent/plans/current?view=home").length, 1);
});

test("W0036 SC-02: 今天先不做 hides the row for this account and Tokyo day only — no write, no backfill, back tomorrow", async (t) => {
  const store = new Map<string, string>([["orbit.today.skip.v1:user-a:2026-09-20", "[\"old\"]"]]);
  const element = homeElement({ clock: () => PLAN_NOW });
  const mounted = await mountHome(t, (options) => withSession("user-a", element(options)), {
    localStore: store,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-skip", "a-overdue-2")!.props.onClick();
  });
  await mounted.settle();
  // 不补位：a-this-week 不上来；0 个写请求。
  assert.deepEqual(w36Titles(mounted), ["把了解到的决策方式记下来"]);
  assert.deepEqual(writes(mounted), []);
  assert.equal(store.get(`orbit.today.skip.v1:user-a:${PLAN_DAY}`), JSON.stringify(["a-overdue-2"]));
  assert.ok(!store.has("orbit.today.skip.v1:user-a:2026-09-20"), "older days of the same account are pruned");
  // 本周推进不受影响（不改计划、不算顺延）。
  assert.equal(planBox(mounted, "a-overdue-2").props["aria-checked"], false);

  const again = await mountHome(t, (options) => withSession("user-a", homeElement({ clock: () => PLAN_NOW })(options)), {
    localStore: store,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.deepEqual(w36Titles(again), ["把了解到的决策方式记下来"]);

  const tomorrow = await mountHome(t, (options) => withSession("user-a", homeElement({ clock: NEXT_DAY_CLOCK })(options)), {
    localStore: store,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.ok(w36Titles(tomorrow).includes("整理 10 家目标企业名单"));
});

test("W0036 SC-02: account A → B → A: B sees the row and only B's key is touched; A still has it hidden", async (t) => {
  const store = new Map<string, string>();
  const log: Array<[string, string]> = [];
  let captured!: { loadSnapshot: () => Promise<never> };
  const element = homeElement({ clock: () => PLAN_NOW });
  const mounted = await mountHome(
    t,
    (options) => {
      captured = options;
      return withSession("user-a", element(options));
    },
    { localStore: store, plan: planSnapshotFixture(), snapshot: EMPTY_SNAPSHOT, storageLog: log },
  );
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-skip", "a-overdue-2")!.props.onClick();
  });
  await mounted.settle();
  assert.ok(!w36Titles(mounted).includes("整理 10 家目标企业名单"));

  log.length = 0;
  await act(async () => {
    mounted.root.update(withSession("user-b", element(captured)));
  });
  await mounted.settle();
  assert.ok(w36Titles(mounted).includes("整理 10 家目标企业名单"), "B is not affected by A's hidden item");
  assert.ok(log.every(([, key]) => !key.includes("user-a")), `only B's keys are read: ${JSON.stringify(log)}`);
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-skip", "a-overdue-1")!.props.onClick();
  });
  assert.equal(store.get(`orbit.today.skip.v1:user-b:${PLAN_DAY}`), JSON.stringify(["a-overdue-1"]));
  assert.equal(store.get(`orbit.today.skip.v1:user-a:${PLAN_DAY}`), JSON.stringify(["a-overdue-2"]));

  await act(async () => {
    mounted.root.update(withSession("user-a", element(captured)));
  });
  await mounted.settle();
  assert.deepEqual(w36Titles(mounted), ["把了解到的决策方式记下来"]);
});

test("W0036 SC-02: storage that throws, or an unknown account, still hides on this page without errors or storage access", async (t) => {
  const throwing = await mountHome(t, (options) => withSession("user-a", homeElement({ clock: () => PLAN_NOW })(options)), {
    localStorageThrows: true,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  await act(async () => {
    todayButton(throwing, "data-orbit-today-plan-skip", "a-overdue-2")!.props.onClick();
  });
  await throwing.settle();
  assert.deepEqual(w36Titles(throwing), ["把了解到的决策方式记下来"]);

  const log: Array<[string, string]> = [];
  const store = new Map<string, string>();
  const anonymous = await mountHome(t, (options) => withSession(null, homeElement({ clock: () => PLAN_NOW })(options)), {
    localStore: store,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
    storageLog: log,
  });
  await act(async () => {
    todayButton(anonymous, "data-orbit-today-plan-skip", "a-overdue-2")!.props.onClick();
  });
  await anonymous.settle();
  assert.deepEqual(w36Titles(anonymous), ["把了解到的决策方式记下来"]);
  assert.deepEqual(log, []);
  assert.equal(store.size, 0);
});

test("W0036 SC-02: without a SessionProvider the hook's singleton account is the key — never another account or 'anonymous'", async (t) => {
  setSharedReadAccount("singleton-a");
  t.after(() => setSharedReadAccount(null));
  const store = new Map<string, string>();
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    localStore: store,
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  await act(async () => {
    todayButton(mounted, "data-orbit-today-plan-skip", "a-overdue-2")!.props.onClick();
  });
  assert.deepEqual([...store.keys()], [`orbit.today.skip.v1:singleton-a:${PLAN_DAY}`]);
});

test("W0036 SC-02: server rendering never touches localStorage", () => {
  const touched: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage() {
        touched.push("localStorage");
        return null;
      },
    },
  });
  try {
    renderToStaticMarkup(withSession("user-a", <IOrbitHome home={HOME as never} navigate={() => undefined} onAsk={() => undefined} onOpenChat={() => undefined} onOpenHistory={() => undefined} onOpenSession={() => undefined} />));
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete (globalThis as { window?: unknown }).window;
  }
  assert.deepEqual(touched, []);
});

const FEW_PEOPLE_HOME = { ...HOME, stats: { ...HOME.stats, people: 9 } };

test("W0036 SC-03: fewer than 10 contacts and a free slot → one nudge; with a plan it names the phase; the button only navigates", async (t) => {
  const navigated: string[] = [];
  const noPlan = await mountHome(
    t,
    homeElement({ clock: () => PLAN_NOW, home: FEW_PEOPLE_HOME as never, navigate: (href) => navigated.push(href) }),
    { plan: null, snapshot: EMPTY_SNAPSHOT },
  );
  assert.deepEqual(w36Titles(noPlan), ["已确认的联系人只有 9 位，补几张名片"]);
  assert.equal(w36Lede(noPlan), "今天可以推进一步：已确认的联系人只有 9 位，补几张名片。");
  const noPlanText = textOf(noPlan.root.root as unknown as { children: readonly unknown[] });
  assert.ok(!noPlanText.includes("阶段"), "no phase without a plan (W36-4)");
  const primary = noPlan.root.root.findAll((node) => node.type === "button" && node.props?.className === "btn ir-m-primary")[0]!;
  assert.equal(textOf(primary), "去扫名片");
  await act(async () => {
    primary.props.onClick();
  });
  assert.deepEqual(navigated, ["/app/contacts/new?method=scan"]);
  assert.deepEqual(writes(noPlan), []);

  const withPlan = await mountHome(t, homeElement({ clock: () => PLAN_NOW, home: FEW_PEOPLE_HOME as never }), {
    plan: planSnapshotFixture(),
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.deepEqual(w36Titles(withPlan), [
    "整理 10 家目标企业名单",
    "把了解到的决策方式记下来",
    "已确认的联系人只有 9 位，补几张名片",
  ]);
  assert.ok(textOf(withPlan.root.root as unknown as { children: readonly unknown[] }).includes("补人脉 · 第 1 阶段 摸清需求"));
  // 主稿位置的补人脉另有一句依据，同样引用阶段名。
  const leadNudge = await mountHome(t, homeElement({ clock: () => PLAN_NOW, home: FEW_PEOPLE_HOME as never }), {
    plan: { ...planSnapshotFixture(), items: [] },
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.deepEqual(w36Titles(leadNudge), ["已确认的联系人只有 9 位，补几张名片"]);
  assert.ok(textOf(leadNudge.root.root as unknown as { children: readonly unknown[] }).includes("计划第 1 阶段「摸清需求」需要更多可以联系的人。"));
});

test("W0036 SC-03: no nudge at 10 contacts, without home data, or when original + plan items fill the 3 slots", async (t) => {
  const ten = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), { plan: null, snapshot: EMPTY_SNAPSHOT });
  assert.deepEqual(w36Titles(ten), []);
  const noHome = await mountHome(t, homeElement({ clock: () => PLAN_NOW, home: null }), { plan: null, snapshot: EMPTY_SNAPSHOT });
  assert.deepEqual(w36Titles(noHome), []);
  const full = await mountHome(t, homeElement({ clock: () => PLAN_NOW, home: FEW_PEOPLE_HOME as never }), {
    plan: planSnapshotFixture(),
    signals: [plainSignal("s-1", "第一件", "high")],
    snapshot: EMPTY_SNAPSHOT,
  });
  assert.deepEqual(w36Titles(full), ["第一件", "整理 10 家目标企业名单", "把了解到的决策方式记下来"]);
});

test("W0036 SC-03: 7 天内不再提示 is stored per account; quiet through day 7, back on day 8", async (t) => {
  const store = new Map<string, string>();
  const mount = (iso: string) =>
    mountHome(t, (options) => withSession("user-a", homeElement({ clock: () => new Date(iso), home: FEW_PEOPLE_HOME as never })(options)), {
      localStore: store,
      plan: null,
      snapshot: EMPTY_SNAPSHOT,
    });
  const first = await mount("2026-10-01T03:00:00.000Z");
  await act(async () => {
    todayButton(first, "data-orbit-today-nudge-dismiss")!.props.onClick();
  });
  assert.deepEqual(w36Titles(first), []);
  assert.equal(store.get("orbit.today.networkNudge.v1:user-a"), JSON.stringify("2026-10-01"));
  assert.deepEqual(writes(first), []);
  assert.deepEqual(w36Titles(await mount("2026-10-07T14:59:00.000Z")), []);
  assert.deepEqual(w36Titles(await mount("2026-10-07T15:00:00.000Z")), ["已确认的联系人只有 9 位，补几张名片"]);
});

test("W0036 SC-03: the home never mounts the card-batch state machine", () => {
  const source = readFileSync("app/(app)/app/agent/iorbit-0918/iorbit-home.tsx", "utf8");
  assert.doesNotMatch(source, /useCardBatch\b|CardBatchImport/);
});

const POOL_SNAPSHOT = (upcoming: unknown[], state = "needs_goal", items: unknown[] = []) => ({
  ...EMPTY_SNAPSHOT,
  recommendations: { items, state, upcoming },
});
const KNOWN_EVENT = {
  endsAt: "2026-10-05T12:00:00.000Z",
  eventId: "event_01",
  publicCode: "TOKYO-01",
  startsAt: "2026-10-05T09:00:00.000Z",
  title: "原始标题",
  venue: "渋谷ストリーム",
};

test("W0036 SC-04: a quiet day without a goal leads with the pool's first recent event, titled in the page language", async (t) => {
  for (const [language, expected] of [
    ["zh", "今天没有安排，10/5 有一场适合你的活动：东京餐饮入境客增长会。"],
    ["en", "Nothing on today. On 10/5 there's an event that may suit you: Tokyo Inbound Restaurant Growth Forum."],
    ["ja", "Nothing on today. On 10/5 there's an event that may suit you: Tokyo Inbound Restaurant Growth Forum."],
  ] as const) {
    const mounted = await mountHome(
      t,
      (options) => <OrbitLanguageProvider initialLanguage={language}>{homeElement({ clock: () => PLAN_NOW })(options)}</OrbitLanguageProvider>,
      { plan: null, snapshot: POOL_SNAPSHOT([KNOWN_EVENT]) },
    );
    assert.equal(w36Lede(mounted), expected, language);
    assert.equal(mounted.calls.filter((call) => call.url.includes("events")).length, 0, "no extra client request");
  }
  const unknown = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: null,
    snapshot: POOL_SNAPSHOT([{ ...KNOWN_EVENT, eventId: "event:unknown", publicCode: "X-1" }]),
  });
  assert.equal(w36Lede(unknown), "今天没有安排，10/5 有一场适合你的活动：原始标题。");
  // 目录为空时照旧。
  const empty = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), { plan: null, snapshot: POOL_SNAPSHOT([]) });
  assert.equal(w36Lede(empty), "今天没有要紧的事。");
});

test("W0036 SC-04: titles are localized by id (ja → en), unknown ids keep the source title, places stay as the source wrote them", () => {
  const pool = [
    { eventId: "event_01", place: "渋谷ストリーム", publicCode: "TOKYO-01", reason: { kind: "recent" as const }, startsAt: KNOWN_EVENT.startsAt, title: "原始标题" },
    { eventId: "event:x", place: "丸之内", publicCode: "event_01", reason: { kind: "recent" as const }, startsAt: KNOWN_EVENT.startsAt, title: "按 code 命中" },
    { eventId: "event:y", place: "Shibuya", publicCode: "Y", reason: { kind: "recent" as const }, startsAt: KNOWN_EVENT.startsAt, title: "未知" },
  ];
  assert.deepEqual(localizeHomeEventPool(pool, "zh").map((item) => [item.title, item.place]), [
    ["东京餐饮入境客增长会", "渋谷ストリーム"],
    ["东京餐饮入境客增长会", "丸之内"],
    ["未知", "Shibuya"],
  ]);
  assert.deepEqual(localizeHomeEventPool(pool, "en").map((item) => [item.title, item.place]), [
    ["Tokyo Inbound Restaurant Growth Forum", "渋谷ストリーム"],
    ["Tokyo Inbound Restaurant Growth Forum", "丸之内"],
    ["未知", "Shibuya"],
  ]);
});

test("W0036 SC-04: the demo shell's real recent events reach the demo home without any client request", async (t) => {
  const mounted = await mountHome(t, () => (
    <IOrbitShell demoEventCandidates={[KNOWN_EVENT]} guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  // 顶栏既有的 `/api/account/me` 之外，示例首页不发任何请求（活动由服务端读好交下来）。
  assert.deepEqual(mounted.calls.filter((call) => call.url !== "/api/account/me"), []);
  assert.deepEqual(mounted.root.root.findByType(IOrbitHome).props.demoEventCandidates, [KNOWN_EVENT]);
  // 示例今日要事不变（有 4 件事，不出空日导语）；池本身由首页内算出，W0037 才渲染。
  assert.ok(w36Lede(mounted).startsWith("今天有 4 件事"));
});


/* ── W0036 SC-07 备选约束：snapshot 只带前 12 场时，计划点名的第 13 场补查一次后排在池首 ─────── */

const TWELVE_UPCOMING = Array.from({ length: 12 }, (_, index) => ({
  ...KNOWN_EVENT,
  eventId: `event:early-${String(index + 1).padStart(2, "0")}`,
  publicCode: `EARLY-${index + 1}`,
  startsAt: `2026-10-${String(index + 5).padStart(2, "0")}T09:00:00.000Z`,
  title: `早场 ${index + 1}`,
}));
const THIRTEENTH = {
  ...KNOWN_EVENT,
  eventId: "event:thirteenth",
  publicCode: "LATE-13",
  startsAt: "2026-10-20T09:00:00.000Z",
  title: "第 13 场",
};

function planNamingEvent(eventId: string) {
  const fixture = planSnapshotFixture();
  const event = fixture.items.find((item) => item.id === "e-p2")!;
  return { ...fixture, items: [{ ...event, linkedEventId: eventId, status: "recommended" as const }] };
}

const truncatedSnapshot = (truncated: boolean) => ({
  ...EMPTY_SNAPSHOT,
  recommendations: { items: [], state: "needs_goal", upcoming: TWELVE_UPCOMING, upcomingTruncated: truncated },
});

test("W0036 SC-07: with a truncated snapshot the plan's 13th event is resolved exactly once and heads the pool", async (t) => {
  const asked: Array<readonly string[]> = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mounted = await mountHome(
    t,
    homeElement({
      clock: () => PLAN_NOW,
      resolvePlanEvents: async (ids) => {
        asked.push(ids);
        await gate;
        return [THIRTEENTH];
      },
    }),
    { plan: planNamingEvent("event:thirteenth"), snapshot: truncatedSnapshot(true) },
  );
  // 补查进行中：导语不先下「没有要紧的事」。
  assert.equal(w36Lede(mounted), "正在整理今天的事…");
  release();
  await mounted.settle();
  assert.equal(w36Lede(mounted), "今天没有安排，10/20 有一场适合你的活动：第 13 场。");
  await mounted.settle();
  assert.deepEqual(asked, [["event:thirteenth"]]);
  // 补查只走注入的窄接口，客户端没有别的新增请求。
  assert.equal(mounted.calls.filter((call) => call.url.includes("event")).length, 0);
});

test("W0036 SC-07: no resolution when the snapshot is not truncated or the plan event is already known; a failed resolution falls back quietly", async (t) => {
  const asked: Array<readonly string[]> = [];
  const resolvePlanEvents = async (ids: readonly string[]) => {
    asked.push(ids);
    return [THIRTEENTH];
  };
  const notTruncated = await mountHome(t, homeElement({ clock: () => PLAN_NOW, resolvePlanEvents }), {
    plan: planNamingEvent("event:thirteenth"),
    snapshot: truncatedSnapshot(false),
  });
  assert.equal(w36Lede(notTruncated), "今天没有安排，10/5 有一场适合你的活动：早场 1。");
  const known = await mountHome(t, homeElement({ clock: () => PLAN_NOW, resolvePlanEvents }), {
    plan: planNamingEvent("event:early-07"),
    snapshot: truncatedSnapshot(true),
  });
  assert.equal(w36Lede(known), "今天没有安排，10/11 有一场适合你的活动：早场 7。");
  assert.deepEqual(asked, []);

  const failed = await mountHome(
    t,
    homeElement({ clock: () => PLAN_NOW, resolvePlanEvents: async () => Promise.reject(new Error("down")) }),
    { plan: planNamingEvent("event:thirteenth"), snapshot: truncatedSnapshot(true) },
  );
  assert.equal(w36Lede(failed), "今天没有安排，10/5 有一场适合你的活动：早场 1。");
});

test("W0036 review P2: when the missing plan-event set changes, the lookup runs again for the new key and stale results are dropped", async (t) => {
  const asked: Array<readonly string[]> = [];
  const FOURTEENTH = { ...THIRTEENTH, eventId: "event:fourteenth", publicCode: "LATE-14", startsAt: "2026-10-21T09:00:00.000Z", title: "第 14 场" };
  const resolvePlanEvents = async (ids: readonly string[]) => {
    asked.push(ids);
    return [THIRTEENTH, FOURTEENTH].filter((item) => ids.includes(item.eventId));
  };
  const fixture = planSnapshotFixture();
  const event = fixture.items.find((item) => item.id === "e-p2")!;
  const plan = {
    ...fixture,
    items: [
      { ...event, id: "e-13", linkedEventId: "event:thirteenth", status: "recommended" as const },
      { ...event, id: "e-14", linkedEventId: "event:fourteenth", status: "recommended" as const },
    ],
  };
  const element = (snapshot: unknown) => (
    <IOrbitHome
      clock={() => PLAN_NOW}
      home={HOME as never}
      loadSnapshot={async () => snapshot as never}
      navigate={() => undefined}
      onAsk={() => undefined}
      onOpenChat={() => undefined}
      onOpenHistory={() => undefined}
      onOpenSession={() => undefined}
      resolvePlanEvents={resolvePlanEvents}
    />
  );
  const mounted = await mountHome(t, () => element(truncatedSnapshot(true)), { plan });
  assert.deepEqual(asked, [["event:thirteenth", "event:fourteenth"]]);
  assert.equal(w36Lede(mounted), "今天没有安排，10/20 有一场适合你的活动：第 13 场。");

  // 新 snapshot 里已有第 13 场：缺的只剩第 14 场 → 按新 key 再查一次。
  const withThirteenth = {
    ...EMPTY_SNAPSHOT,
    recommendations: { items: [], state: "needs_goal", upcoming: [...TWELVE_UPCOMING.slice(0, 11), THIRTEENTH], upcomingTruncated: true },
  };
  await act(async () => {
    mounted.root.update(element(withThirteenth));
  });
  await mounted.settle();
  assert.deepEqual(asked, [["event:thirteenth", "event:fourteenth"], ["event:fourteenth"]]);
  assert.equal(w36Lede(mounted), "今天没有安排，10/20 有一场适合你的活动：第 13 场。");
});


/* ── W0037：今日要事下方的活动小模组（RH-03）与紧凑社群卡 ─────────────────────── */

// PLAN_NOW = 东京 2026-09-28（周一）12:00；本周到东京 10-04（周日）24:00 = 2026-10-04T15:00Z 为止。
const W37_POOL = [
  { id: "event_01", code: "TOKYO-01", startsAt: "2026-10-01T10:00:00.000Z", title: "原始标题", venue: "渋谷ストリーム" },
  { id: "event:w37-b", code: "W37-B", startsAt: "2026-10-02T10:00:00.000Z", title: "第二场", venue: "丸の内" },
  { id: "event:w37-c", code: "W37-C", startsAt: "2026-10-03T10:00:00.000Z", title: "第三场" },
  { id: "event:w37-d", code: "W37-D", startsAt: "2026-10-06T10:00:00.000Z", title: "第四场", venue: "新宿" },
  { id: "event:w37-e", code: "W37-E", startsAt: "2026-10-08T10:00:00.000Z", title: "第五场", venue: "品川" },
].map((row) => ({
  endsAt: new Date(Date.parse(row.startsAt) + 2 * 3600_000).toISOString(),
  eventId: row.id,
  publicCode: row.code,
  startsAt: row.startsAt,
  title: row.title,
  ...(row.venue ? { venue: row.venue } : {}),
}));

const w37Module = (mounted: Mounted) =>
  mounted.root.root.findAll((node) => typeof node.type === "string" && node.props?.["data-orbit-today-events"] !== undefined);
const w37Cards = (mounted: Mounted) =>
  mounted.root.root.findAll((node) => node.type === "a" && node.props?.["data-orbit-today-event"] !== undefined);
const w37Community = (mounted: Mounted) =>
  mounted.root.root.findAll((node) => typeof node.type === "string" && node.props?.["data-orbit-today-community"] !== undefined);
const w37Status = (mounted: Mounted) =>
  textOf(mounted.root.root.findAll((node) => node.props?.["data-orbit-today-events-status"] !== undefined)[0]!);

async function w37Mount(
  t: TestContext,
  props: { communityJoined?: boolean; pool?: typeof W37_POOL; language?: "zh" | "en" | "ja" } = {},
  options: MountOptions = {},
) {
  const element = homeElement({ clock: () => PLAN_NOW, communityJoined: props.communityJoined });
  return mountHome(
    t,
    (mountOptions) => (
      <OrbitLanguageProvider initialLanguage={props.language ?? "zh"}>{element(mountOptions)}</OrbitLanguageProvider>
    ),
    { plan: null, snapshot: POOL_SNAPSHOT(props.pool ?? W37_POOL), ...options },
  );
}

test("W0037 SC-02: formatHomeEventReason has the three real reasons in zh and en; goal takes the first two tokens", () => {
  assert.equal(formatHomeEventReason({ kind: "plan" }, "zh"), "计划里提到");
  assert.equal(formatHomeEventReason({ kind: "plan" }, "en"), "In your plan");
  assert.equal(formatHomeEventReason({ kind: "recent" }, "zh"), "近期活动");
  assert.equal(formatHomeEventReason({ kind: "recent" }, "en"), "Coming up soon");
  assert.equal(formatHomeEventReason({ kind: "goal", tokens: ["制造业", "AI", "东京"] }, "zh"), "匹配你目标里的『制造业、AI』");
  assert.equal(formatHomeEventReason({ kind: "goal", tokens: ["制造业"] }, "en"), "Matches “制造业” in your goal");
  assert.equal(formatHomeEventReason({ kind: "goal", tokens: ["sales", "AI", "x"] }, "en"), "Matches “sales、AI” in your goal");
});

test("W0037 SC-01: countHomeEventsThisTokyoWeek counts pool events from now to Sunday 24:00 Tokyo (Mon–Sun)", () => {
  const item = (startsAt: string) => ({ eventId: startsAt, publicCode: startsAt, reason: { kind: "recent" as const }, startsAt, title: startsAt });
  // 东京 10-04（周日）23:30：只剩 23:50 这一场还在本周；周一 00:10 的属于下周。
  const sundayNight = new Date("2026-10-04T14:30:00.000Z");
  const pool = [
    item("2026-10-04T14:00:00.000Z"), // 已开始（周日 23:00）
    item("2026-10-04T14:50:00.000Z"), // 周日 23:50
    item("2026-10-04T15:00:00.000Z"), // 周一 00:00
    item("2026-10-04T15:10:00.000Z"), // 周一 00:10
  ];
  assert.equal(countHomeEventsThisTokyoWeek(pool, sundayNight), 1);
  // 东京 10-05（周一）00:10：新的一周到 10-11（周日）24:00。
  const mondayEarly = new Date("2026-10-04T15:10:00.000Z");
  const next = [
    item("2026-10-04T15:20:00.000Z"), // 周一 00:20
    item("2026-10-11T14:59:00.000Z"), // 周日 23:59
    item("2026-10-11T15:00:00.000Z"), // 下周一 00:00
  ];
  assert.equal(countHomeEventsThisTokyoWeek(next, mondayEarly), 2);
  assert.equal(countHomeEventsThisTokyoWeek([], mondayEarly), 0);
});

test("W0037 SC-01: an empty day expands between 还有 N 件 and the ask row — community card + 2 events, or 3 once joined", async (t) => {
  const invite = await w37Mount(t);
  const module = w37Module(invite);
  assert.equal(module.length, 1);
  assert.equal(module[0]!.props["data-orbit-today-events"], "expanded");
  assert.equal(w37Community(invite).length, 1);
  assert.deepEqual(w37Cards(invite).map((card) => card.props.href), ["/app/events/TOKYO-01", "/app/events/W37-B"]);
  // 位置：今日要事区里，追问条之前。
  const main = invite.root.root.findAll((node) => node.props?.className === "ir-m-main")[0]!;
  const kids = main.children.filter((child): child is typeof main => typeof child !== "string");
  const moduleIndex = kids.findIndex((child) => child.type === IOrbitTodayEvents);
  const askIndex = kids.findIndex((child) => child.props?.className === "ir-m-ask");
  assert.ok(moduleIndex >= 0 && askIndex === moduleIndex + 1, "the module sits right before the ask row");

  const joined = await w37Mount(t, { communityJoined: true });
  assert.equal(w37Community(joined).length, 0);
  assert.deepEqual(w37Cards(joined).map((card) => card.props.href), ["/app/events/TOKYO-01", "/app/events/W37-B", "/app/events/W37-C"]);
  // 这两种都不发任何额外请求（活动池来自 snapshot，社群状态来自服务端）。
  for (const mounted of [invite, joined]) {
    assert.equal(mounted.calls.filter((call) => call.url.includes("events") || call.url.includes("community")).length, 0);
  }
});

test("W0037 SC-01: fewer events than slots show only what exists; an empty pool shows no event card", async (t) => {
  const one = await w37Mount(t, { pool: W37_POOL.slice(0, 1) });
  assert.equal(w37Community(one).length, 1);
  assert.equal(w37Cards(one).length, 1);
  const oneJoined = await w37Mount(t, { communityJoined: true, pool: W37_POOL.slice(0, 1) });
  assert.equal(w37Cards(oneJoined).length, 1);
  const none = await w37Mount(t, { pool: [] });
  assert.equal(w37Community(none).length, 1, "not joined + empty pool: the community card alone");
  assert.equal(w37Cards(none).length, 0);
  const noneJoined = await w37Mount(t, { communityJoined: true, pool: [] });
  assert.equal(w37Module(noneJoined).length, 0, "joined + empty pool: no module at all");
});

test("W0037 SC-01: with items today the module is one line — 本周还有 N 场 (Tokyo Mon–Sun) — and disappears at N=0", async (t) => {
  const busy = await w37Mount(t, {}, { signals: [plainSignal("s1", "回复佐藤", "high")] });
  assert.equal(w37Module(busy)[0]!.props["data-orbit-today-events"], "collapsed");
  assert.equal(w37Cards(busy).length, 0);
  assert.equal(w37Community(busy).length, 0);
  const line = busy.root.root.findAll((node) => node.type === "a" && node.props?.["data-orbit-today-events-week"] !== undefined);
  assert.equal(line.length, 1);
  assert.equal(line[0]!.props.href, "/app/events");
  assert.equal(textOf(line[0]!), "本周还有 3 场适合你的活动 →");
  const en = await w37Mount(t, { language: "en" }, { signals: [plainSignal("s1", "Reply", "high")] });
  assert.equal(textOf(en.root.root.findAll((node) => node.props?.["data-orbit-today-events-week"] !== undefined)[0]!), "3 more events for you this week →");
  // 池里只有下周的：N=0，整行不显示。
  const later = await w37Mount(t, { pool: W37_POOL.slice(3) }, { signals: [plainSignal("s1", "回复佐藤", "high")] });
  assert.equal(w37Module(later).length, 0);
});

test("W0037 SC-01: not rendered until today's items and the pool are settled; partial with no items still expands", async (t) => {
  let release: (value: unknown) => void = () => undefined;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = await w37Mount(t, {}, { planGate: gate, plan: null });
  assert.equal(w37Module(pending).length, 0, "plan still pending");
  release(null);
  await pending.settle();
  assert.equal(w37Module(pending).length, 1);

  const never = await mountHome(
    t,
    () => (
      <IOrbitHome
        clock={() => PLAN_NOW}
        home={HOME as never}
        loadSnapshot={() => new Promise(() => undefined)}
        navigate={() => undefined}
        onAsk={() => undefined}
        onOpenChat={() => undefined}
        onOpenHistory={() => undefined}
        onOpenSession={() => undefined}
      />
    ),
    { plan: null },
  );
  assert.equal(w37Module(never).length, 0, "snapshot still pending");

  const partial = await w37Mount(t, {}, { signalsFail: true });
  assert.ok(textOf(partial.root.root).includes("部分数据来源暂时不可用"));
  assert.equal(w37Module(partial)[0]!.props["data-orbit-today-events"], "expanded");
  assert.equal(w37Cards(partial).length, 2);
});

test("W0037 SC-02: each card is one detail link — date, weekday + time, title, place, reason; no register button, no fee", async (t) => {
  const zh = await w37Mount(t, { communityJoined: true });
  const cards = w37Cards(zh);
  for (const card of cards) {
    assert.equal(card.findAll((node) => node.type === "button").length, 0, "no button inside a card");
    assert.doesNotMatch(textOf(card), /报名|费用|免费|¥|円/);
  }
  assert.equal(textOf(cards[0]!), "10/1周四 19:00东京餐饮入境客增长会渋谷ストリーム近期活动");
  // 缺地点：没有地点行。
  assert.equal(textOf(cards[2]!), "10/3周六 19:00第三场近期活动");
  assert.equal(cards[0]!.props.onClick, undefined);

  const en = await w37Mount(t, { communityJoined: true, language: "en" });
  assert.equal(textOf(w37Cards(en)[0]!), "10/1Thu 07:00 PMTokyo Inbound Restaurant Growth Forum渋谷ストリームComing up soon");
  // 未知 id 显示原标题；地点在三种语言下都是来源原文。
  assert.equal(textOf(w37Cards(en)[1]!), "10/2Fri 07:00 PM第二场丸の内Coming up soon");
  const ja = await w37Mount(t, { communityJoined: true, language: "ja" });
  assert.equal(textOf(w37Cards(ja)[0]!), textOf(w37Cards(en)[0]!));
  assert.equal(textOf(w37Cards(ja)[1]!), "10/2Fri 07:00 PM第二场丸の内Coming up soon");
});

test("W0037 SC-02: plan and goal reasons from the pool reach the cards", async (t) => {
  const mounted = await w37Mount(t, { communityJoined: true }, {
    snapshot: POOL_SNAPSHOT(W37_POOL, "success", [{ eventId: "event:w37-b", matchedTokens: ["餐饮", "入境", "东京"] }]),
  });
  const reasons = w37Cards(mounted).map((card) =>
    textOf(card.findAll((node) => node.props?.className === "ir-te-reason")[0]!),
  );
  assert.deepEqual(reasons, ["匹配你目标里的『餐饮、入境』", "近期活动", "近期活动"]);
});

test("W0037 SC-03: the compact community card — name, WeChat ID with 占位, copy, QR toggle with a 占位 box", async (t) => {
  const mounted = await w37Mount(t);
  const card = w37Community(mounted)[0]!;
  const text = textOf(card);
  assert.ok(text.includes("加入 iOrbit 用户社群"));
  assert.ok(text.includes("orbit_helper"));
  assert.ok(card.findAll((node) => node.props?.["data-community-placeholder"] === "wechat").length === 1);
  for (const button of card.findAll((node) => node.type === "button")) {
    assert.match(button.props.className, /^btn ir-te-/);
  }
  const qr = card.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-qr"] !== undefined)[0]!;
  assert.equal(qr.props["aria-expanded"], false);
  assert.equal(card.findAll((node) => node.props?.["data-community-placeholder"] === "qr").length, 0);
  await act(async () => qr.props.onClick());
  const reopened = w37Community(mounted)[0]!;
  assert.equal(reopened.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-qr"] !== undefined)[0]!.props["aria-expanded"], true);
  const box = reopened.findAll((node) => node.props?.["data-community-placeholder"] === "qr");
  assert.equal(box.length, 1);
  assert.ok(textOf(box[0]!).includes("占位"));

  // 复制：剪贴板可用 → 已复制；不可用 → 提示选中后自己复制。
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
  });
  const written: string[] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: async (value: string) => void written.push(value) } } });
  const copy = () => w37Community(mounted)[0]!.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-copy"] !== undefined)[0]!;
  await act(async () => copy().props.onClick());
  assert.deepEqual(written, ["orbit_helper"]);
  assert.equal(w37Status(mounted), "微信号已复制。");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  await act(async () => copy().props.onClick());
  assert.equal(w37Status(mounted), "已选中微信号，按 ⌘C / Ctrl+C 复制。");
  assert.equal(mounted.calls.filter((call) => call.url === "/api/community/membership").length, 0);
});

test("W0037 SC-03: 我已加入 is optimistic — one PUT, the card leaves and a third event shows; double clicks send one request", async (t) => {
  let resolve: (response: Response) => void = () => undefined;
  const mounted = await w37Mount(t, {}, {
    communityPut: () => new Promise<Response>((done) => {
      resolve = done;
    }),
  });
  const join = w37Community(mounted)[0]!.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-join"] !== undefined)[0]!;
  const click = join.props.onClick as () => void;
  await act(async () => {
    click();
    click();
  });
  assert.equal(w37Community(mounted).length, 0, "the card leaves at once");
  assert.equal(w37Cards(mounted).length, 3, "the third event shows at once");
  await act(async () => {
    resolve(Response.json({ data: { joined: true }, success: true }));
  });
  await mounted.settle();
  const puts = mounted.calls.filter((call) => call.url === "/api/community/membership");
  assert.deepEqual(puts.map((call) => call.method), ["PUT"]);
  assert.equal(w37Community(mounted).length, 0);
  assert.equal(w37Cards(mounted).length, 3);
  assert.equal(w37Status(mounted), "已加入 iOrbit 用户社群。");
});

test("W0037 SC-03: a failed join rolls back — card returns, third event leaves, role=status explains (401 has its own copy)", async (t) => {
  const cases: Array<[string, () => Promise<Response> | Response, string]> = [
    ["5xx", () => Response.json({ success: false }, { status: 503 }), "没有保存成功，请再试一次。"],
    ["joined false", () => Response.json({ data: { joined: false }, success: true }), "没有保存成功，请再试一次。"],
    ["throws", () => Promise.reject(new Error("offline")), "没有保存成功，请再试一次。"],
    ["401", () => Response.json({ success: false }, { status: 401 }), "请先登录，再标记已加入。"],
  ];
  for (const [label, respond, copy] of cases) {
    const mounted = await w37Mount(t, {}, { communityPut: respond });
    const join = w37Community(mounted)[0]!.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-join"] !== undefined)[0]!;
    await act(async () => join.props.onClick());
    await mounted.settle();
    assert.equal(w37Community(mounted).length, 1, `${label}: the card comes back`);
    assert.equal(w37Cards(mounted).length, 2, `${label}: the third event is withdrawn`);
    const status = mounted.root.root.findAll((node) => node.props?.["data-orbit-today-events-status"] !== undefined)[0]!;
    assert.equal(status.props.role, "status");
    assert.equal(textOf(status), copy, label);
    assert.equal(mounted.calls.filter((call) => call.url === "/api/community/membership").length, 1, label);
  }
});

test("W0037 SC-03/05: module buttons carry btn ir-te-* and IORBIT_STYLES neutralises them", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
  for (const className of ["ir-te-copy", "ir-te-qr", "ir-te-join"]) {
    const match = flat.match(new RegExp(`\\.btn\\.${className}(?![-a-z])[^{]*\\{[^}]*\\}`));
    assert.ok(match && match[0].includes("height:") && match[0].includes("transition:"), className);
    const active = flat.match(new RegExp(`\\.btn\\.${className}(?![-a-z]):active[^{]*\\{[^}]*\\}`));
    assert.ok(active && active[0].includes("transform: none"), `${className}:active`);
  }
  const source = readFileSync("app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx", "utf8");
  assert.doesNotMatch(source, /style=\{/, "no inline styles");
});

test("W0037 SC-04: the demo home always expands with real events and the real community state; links are plain, 我已加入 really PUTs", async (t) => {
  // 示例壳用真实时钟（demo clock 缺省为 new Date()）；固定到 PLAN_NOW，否则 W37_POOL 的写死日期过期后会被当成已开始。
  t.mock.timers.enable({ apis: ["Date"], now: PLAN_NOW });
  const candidates = W37_POOL.slice(0, 4);
  const invite = await mountHome(t, () => (
    <IOrbitShell demoEventCandidates={candidates} guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ), { communityPut: () => Response.json({ data: { joined: true }, success: true }) });
  // 示例今日要事不为空（4 件），小模组仍固定展开；示例内容不变。
  assert.ok(w36Lede(invite).startsWith("今天有 4 件事"));
  assert.equal(w37Module(invite)[0]!.props["data-orbit-today-events"], "expanded");
  assert.equal(w37Community(invite).length, 1);
  assert.deepEqual(w37Cards(invite).map((card) => card.props.href), ["/app/events/TOKYO-01", "/app/events/W37-B"]);
  for (const card of w37Cards(invite)) assert.equal(card.props.onClick, undefined, "no 这是示例 guard on real event cards");
  // 挂载时除顶栏 `/api/account/me` 外 0 请求。
  assert.deepEqual(invite.calls.filter((call) => call.url !== "/api/account/me"), []);
  const join = w37Community(invite)[0]!.findAll((node) => node.type === "button" && node.props?.["data-orbit-today-community-join"] !== undefined)[0]!;
  await act(async () => join.props.onClick());
  await invite.settle();
  assert.deepEqual(
    invite.calls.filter((call) => call.url !== "/api/account/me").map((call) => `${call.method} ${call.url}`),
    ["PUT /api/community/membership"],
  );
  assert.equal(w37Cards(invite).length, 3);
  assert.equal(invite.root.root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined).length, 0);

  const joined = await mountHome(t, () => (
    <IOrbitShell communityJoined demoEventCandidates={candidates} guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  assert.equal(joined.root.root.findByType(IOrbitHome).props.communityJoined, true);
  assert.equal(w37Community(joined).length, 0);
  assert.equal(w37Cards(joined).length, 3);

  const empty = await mountHome(t, () => (
    <IOrbitShell demoEventCandidates={[]} guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  assert.equal(w37Cards(empty).length, 0);
  assert.equal(w37Community(empty).length, 1);
});

test("W0037: the live shell hands the server-read community state down to the home", () => {
  const html = renderToStaticMarkup(<IOrbitShell communityJoined home={HOME as never} viewModel={VIEW_MODEL} />);
  // SSR 首帧还在读取：小模组不渲染（不先闪出卡片）。
  assert.doesNotMatch(html, /data-orbit-today-events/);
});


/* ── W0038：月历两色圆点、时间线条目路由、「下一场活动」 ─────────────────────────── */

const w38Candidate = (code: string, startsAt: string, title = code, venue?: string) => ({
  eventId: `event:${code}`,
  publicCode: code,
  startsAt,
  title,
  ...(venue ? { venue } : {}),
});
const w38PoolItem = (code: string, startsAt: string) => ({
  eventId: `event:${code}`,
  publicCode: code,
  reason: { kind: "recent" as const },
  startsAt,
  title: code,
});
const w38Snapshot = (upcoming: unknown[], personal: unknown[] = [], base: object = EMPTY_SNAPSHOT) => {
  const facts = (base as typeof EMPTY_SNAPSHOT).facts;
  return {
    ...base,
    facts: { ...facts, personal: { items: personal, state: "ready" } },
    recommendations: { items: [], state: "needs_goal", upcoming },
  };
};
const w38Personal = (key: string, startsAt: string, title: string) => ({ id: key, key, startsAt, state: "active", title });
const w38DayButton = (mounted: Mounted, day: number) =>
  mounted.root.root.findAll((node) => node.type === "button" && node.props?.["data-orbit-iorbit-day"] === day)[0]!;
const w38DotClasses = (mounted: Mounted, day: number) =>
  w38DayButton(mounted, day)
    .findAll((node) => typeof node.type === "string" && /\bir-day-dot\b/.test(String(node.props?.className ?? "")))
    .map((node) => String(node.props.className));
const w38Legend = (mounted: Mounted) =>
  mounted.root.root.findAll((node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-cal-legend"] !== undefined);
const w38Panel = (mounted: Mounted) =>
  mounted.root.root.findAll((node) => node.props?.["data-orbit-iorbit-day-panel"] === true)[0]!;
const w38Timeline = (mounted: Mounted) =>
  w38Panel(mounted)
    .findAll((node) => node.type === "a" && node.props?.["data-orbit-iorbit-tl-item"] !== undefined)
    .map((node) => ({ href: String(node.props.href), kind: String(node.props["data-orbit-iorbit-tl-item"]), node, text: textOf(node) }));
const w38Empty = (mounted: Mounted) =>
  textOf(w38Panel(mounted).findAll((node) => node.props?.className === "ir-m-tl-empty")[0]!);
const w38Next = (mounted: Mounted) =>
  w38Panel(mounted).findAll((node) => node.type === "a" && node.props?.["data-orbit-iorbit-next-event"] !== undefined);
const w38Mount = (
  t: TestContext,
  options: MountOptions,
  props: { clock?: () => Date; home?: unknown; language?: "zh" | "en" } = {},
) => {
  const element = homeElement({ clock: props.clock ?? (() => PLAN_NOW), ...(props.home ? { home: props.home as never } : {}) });
  return mountHome(
    t,
    (mountOptions) => (
      <OrbitLanguageProvider initialLanguage={props.language ?? "zh"}>{element(mountOptions)}</OrbitLanguageProvider>
    ),
    { plan: null, ...options },
  );
};

test("W0038 SC-01: calendar marks take the pool's first five in-month events in pool order, cut by Tokyo date", () => {
  // 东京 10/31 23:30 算 10 月；11/1 00:30 不算；9/30 15:30Z 是东京 10/1 00:30，算 10 月；9/30 23:30 不算。
  const pool = [
    w38PoolItem("NOV-1", "2026-10-31T15:30:00Z"),
    w38PoolItem("OCT-31", "2026-10-31T14:30:00Z"),
    w38PoolItem("SEP-30", "2026-09-30T14:30:00Z"),
    w38PoolItem("OCT-1", "2026-09-30T15:30:00Z"),
    w38PoolItem("OCT-20", "2026-10-20T01:00:00Z"),
    w38PoolItem("OCT-20B", "2026-10-20T05:00:00Z"),
    w38PoolItem("OCT-25", "2026-10-25T01:00:00Z"),
    // 第 6 场当月活动：日期最早，但在池里排在第 5 场之后，不画。
    w38PoolItem("OCT-2", "2026-10-02T01:00:00Z"),
  ];
  assert.deepEqual(
    iorbitMonthRecommendations(pool, "2026-10").map((entry) => [entry.item.publicCode, entry.dayKey]),
    [
      ["OCT-31", "2026-10-31"],
      ["OCT-1", "2026-10-01"],
      ["OCT-20", "2026-10-20"],
      ["OCT-20B", "2026-10-20"],
      ["OCT-25", "2026-10-25"],
    ],
  );

  const schedule = [{ dayKey: "2026-10-20" }, { dayKey: "2026-10-20" }, { dayKey: "2026-10-03" }, { dayKey: "2026-11-01" }];
  const marks = iorbitCalendarMarks(schedule, pool, "2026-10");
  assert.deepEqual([...marks.entries()].sort((a, b) => a[0] - b[0]), [
    [1, { recommended: 1, schedule: 0 }],
    [3, { recommended: 0, schedule: 1 }],
    [20, { recommended: 2, schedule: 2 }],
    [25, { recommended: 1, schedule: 0 }],
    [31, { recommended: 1, schedule: 0 }],
  ]);
  assert.equal(marks.has(2), false, "only five recommended events are drawn");

  // 空池只剩实心点。
  assert.deepEqual([...iorbitCalendarMarks(schedule, [], "2026-10").entries()].sort((a, b) => a[0] - b[0]), [
    [3, { recommended: 0, schedule: 1 }],
    [20, { recommended: 0, schedule: 2 }],
  ]);
});

test("W0038 SC-03: the next event is the earliest unstarted registration, else the pool's earliest start — not pool[0]", () => {
  const nowMs = Date.parse("2026-09-28T03:00:00Z");
  const registered = [
    { id: "late", startsAt: "2026-10-03T09:00:00Z" },
    { id: "past", startsAt: "2026-09-20T09:00:00Z" },
    { id: "early", startsAt: "2026-10-02T09:00:00Z" },
  ];
  const pool = [w38PoolItem("LATE", "2026-09-30T01:00:00Z"), w38PoolItem("EARLY", "2026-09-29T01:00:00Z")];
  assert.deepEqual(iorbitNextEvent(registered, pool, nowMs), { event: registered[2], kind: "registered" });
  assert.deepEqual(iorbitNextEvent([registered[1]!], pool, nowMs), { item: pool[1], kind: "recommended" });
  assert.equal(iorbitNextEvent([registered[1]!], null, nowMs), null, "an unready pool is not consulted");
  assert.equal(iorbitNextEvent([], [], nowMs), null);
});

test("W0038 SC-04: the day button label adds the counts and drops zero counts", () => {
  assert.equal(iorbitCalendarDayLabel(2026, 9, 29, { recommended: 1, schedule: 2 }, "zh"), "9月29日（周二），2 项日程，1 场推荐活动");
  assert.equal(iorbitCalendarDayLabel(2026, 9, 29, { recommended: 0, schedule: 1 }, "zh"), "9月29日（周二），1 项日程");
  assert.equal(iorbitCalendarDayLabel(2026, 9, 29, { recommended: 2, schedule: 0 }, "zh"), "9月29日（周二），2 场推荐活动");
  assert.equal(iorbitCalendarDayLabel(2026, 9, 29, undefined, "zh"), "9月29日（周二）");
  assert.equal(
    iorbitCalendarDayLabel(2026, 9, 29, { recommended: 1, schedule: 2 }, "en"),
    "Tue, September 29, 2 scheduled, 1 recommended event",
  );
  assert.equal(iorbitCalendarDayLabel(2026, 9, 29, { recommended: 2, schedule: 0 }, "en"), "Tue, September 29, 2 recommended events");
});

test("W0038 SC-01: a pool event an hour away gets a hollow ring but never becomes a 2-hour item or a schedule count", async (t) => {
  // 东京 12:00；推荐活动 13:00 开始。
  const soon = w38Candidate("REC-SOON", "2026-09-28T04:00:00Z", "一小时后的推荐活动");
  const mounted = await w38Mount(t, { snapshot: w38Snapshot([soon]) });

  assert.deepEqual(w38DotClasses(mounted, 28), ["ir-day-dot ir-day-dot-r"]);
  assert.equal(w38DayButton(mounted, 28).props["aria-label"], "9月28日（周一），1 场推荐活动");
  // 今日要事里没有这场，也没有「还有 1 小时」的暖色项；右栏计数仍是 0 个日程。
  assert.ok(!w36Titles(mounted).some((title) => title.includes("一小时后的推荐活动")));
  assert.ok(!textOf(mounted.root.root).includes("还有 1 小时"));
  assert.ok(!mounted.root.root.findAll((node) => node.props?.className === "ir-m-lead ir-m-lead-hot").length);
  assert.ok(textOf(w38Panel(mounted)).includes("0 个日程"));
  // 时间线列出这场推荐活动（带「推荐」与理由），其余标记只有图例里的推荐项。
  assert.deepEqual(w38Timeline(mounted).map((row) => [row.kind, row.href]), [["recommended", "/app/events/REC-SOON"]]);
  assert.equal(w38Legend(mounted).length, 1);
  const legend = textOf(w38Legend(mounted)[0]!);
  assert.ok(legend.includes("推荐活动"));
  assert.ok(!legend.includes("日程与已报名"));
});

test("W0038 SC-01: schedule and recommended on the same day sit side by side; dots are aria-hidden; no marks → no legend", async (t) => {
  const snapshot = w38Snapshot(
    [w38Candidate("REC-29", "2026-09-29T05:00:00Z")],
    [w38Personal("p29", "2026-09-29T01:00:00Z", "牙医复诊")],
  );
  const mounted = await w38Mount(t, { snapshot });
  assert.deepEqual(w38DotClasses(mounted, 29), ["ir-day-dot ir-day-dot-a", "ir-day-dot ir-day-dot-r"]);
  const dots = w38DayButton(mounted, 29).findAll((node) => node.props?.className === "ir-day-dots")[0]!;
  assert.equal(dots.props["aria-hidden"], true);
  assert.equal(w38DayButton(mounted, 29).props["aria-label"], "9月29日（周二），1 项日程，1 场推荐活动");
  assert.deepEqual(w38DotClasses(mounted, 27), []);
  assert.equal(w38DayButton(mounted, 27).props["aria-label"], "9月27日（周日）");
  const legend = textOf(w38Legend(mounted)[0]!);
  assert.ok(legend.includes("日程与已报名") && legend.includes("推荐活动"));
  // 没有任何标记的月份：不渲染图例。
  const bare = await w38Mount(t, { snapshot: w38Snapshot([]) });
  assert.equal(w38Legend(bare).length, 0);
  // 空池但有日程：图例只有实心项。
  const scheduleOnly = await w38Mount(t, { snapshot: w38Snapshot([], [w38Personal("p29", "2026-09-29T01:00:00Z", "牙医复诊")]) });
  assert.deepEqual(w38DotClasses(scheduleOnly, 29), ["ir-day-dot ir-day-dot-a"]);
  assert.ok(!textOf(w38Legend(scheduleOnly)[0]!).includes("推荐活动"));
});

test("W0038 SC-02: the day timeline lists all four kinds in time order, each as a link to its own page, with the now line", async (t) => {
  // 约谈 10:30（已过）→ 现在 12:00 → 推荐 13:00 → 个人日程 15:00 → 已报名 18:00。
  const snapshot = w38Snapshot(
    [w38Candidate("REC-1", "2026-09-28T04:00:00Z", "推荐的午后场", "渋谷")],
    [w38Personal("p1", "2026-09-28T06:00:00Z", "牙医复诊")],
    SNAPSHOT("2026-09-28"),
  );
  const home = { ...HOME, events: [registeredEvent("ev-reg", "已报名的晚场", "2026-09-28T09:00:00Z")] };
  const mounted = await w38Mount(t, { snapshot }, { home });

  assert.deepEqual(
    w38Timeline(mounted).map((row) => [row.kind, row.href]),
    [
      ["appointment", "/app/schedule"],
      ["recommended", "/app/events/REC-1"],
      ["personal", "/app/tasks/personal"],
      ["registered", "/app/events/ev-reg"],
    ],
  );
  const rec = w38Timeline(mounted)[1]!;
  assert.ok(rec.text.includes("推荐的午后场"));
  assert.ok(rec.text.includes("推荐"));
  assert.ok(rec.text.includes(formatHomeEventReason({ kind: "recent" }, "zh")));
  assert.ok(rec.text.includes("渋谷"));
  // 「现在」线在第一条未开始的条目（推荐活动）之前。
  const panel = textOf(w38Panel(mounted));
  assert.ok(panel.indexOf("已确认约谈") < panel.indexOf("现在 12:00"));
  assert.ok(panel.indexOf("现在 12:00") < panel.indexOf("推荐的午后场"));
  // 计数只算日程（3 项），推荐活动不计入。
  assert.ok(panel.includes("3 个日程"));
  // 真实期条目都是普通链接，不拦截。
  for (const row of w38Timeline(mounted)) assert.equal(row.node.props.onClick, undefined);
  // 点日期只选中那一天。
  await act(async () => w38DayButton(mounted, 29).props.onClick());
  assert.equal(w38DayButton(mounted, 29).props["aria-pressed"], true);
  assert.deepEqual(w38Timeline(mounted), []);
  assert.ok(w38Empty(mounted).includes("这一天没有日程。"));
});

test("W0038 SC-03: today empty → the next event line; registered first, else the pool's earliest, else the old copy", async (t) => {
  const pool = [
    w38Candidate("LATE", "2026-09-30T01:00:00Z", "晚一场"),
    w38Candidate("EARLY", "2026-09-29T01:00:00Z", "早一场"),
  ];
  const home = {
    ...HOME,
    events: [
      registeredEvent("ev-late", "报名的后一场", "2026-10-03T09:00:00Z"),
      registeredEvent("ev-past", "报名的已结束", "2026-09-20T09:00:00Z"),
      registeredEvent("ev-early", "报名的前一场", "2026-10-02T09:00:00Z"),
    ],
  };
  const registered = await w38Mount(t, { snapshot: w38Snapshot(pool) }, { home });
  assert.equal(w38Empty(registered), "下一场活动：10/2 周五 报名的前一场");
  assert.deepEqual(w38Next(registered).map((node) => [node.props["data-orbit-iorbit-next-event"], node.props.href]), [
    ["registered", "/app/events/ev-early"],
  ]);

  const fromPool = await w38Mount(t, { snapshot: w38Snapshot(pool) });
  assert.equal(w38Empty(fromPool), "下一场活动：9/29 周二 早一场", "the earliest start, not pool[0]");
  assert.deepEqual(w38Next(fromPool).map((node) => node.props.href), ["/app/events/EARLY"]);
  const english = await w38Mount(t, { snapshot: w38Snapshot(pool) }, { language: "en" });
  assert.equal(w38Empty(english), "Next event: 9/29 Tue 早一场");

  const nothing = await w38Mount(t, { snapshot: w38Snapshot([]) });
  assert.equal(w38Empty(nothing), "今天没有已确认的日程。");
  assert.equal(w38Next(nothing).length, 0);
  // 「现在」线照常在空态前。
  assert.ok(textOf(w38Panel(fromPool)).includes("现在 12:00"));
});

test("W0038 SC-03: pending, unavailable and other days keep the old copy; an unready pool draws no rings and only registrations count", async (t) => {
  const pool = [w38Candidate("EARLY", "2026-09-29T01:00:00Z", "早一场")];
  const home = { ...HOME, events: [registeredEvent("ev-early", "报名的前一场", "2026-10-02T09:00:00Z")] };

  const pendingElement = homeElement({ clock: () => PLAN_NOW, home: home as never });
  const pending = await mountHome(t, () => pendingElement({ loadSnapshot: (() => new Promise(() => undefined)) as never }), {
    plan: null,
  });
  assert.equal(w38Empty(pending), "正在读取日程…");
  assert.equal(w38Next(pending).length, 0);

  const unavailable = await w38Mount(t, {}, { home });
  assert.equal(w38Empty(unavailable), "日程来源暂时不可用。");
  assert.equal(w38Next(unavailable).length, 0);

  const otherDay = await w38Mount(t, { snapshot: w38Snapshot(pool) }, { home });
  await act(async () => w38DayButton(otherDay, 27).props.onClick());
  assert.equal(w38Empty(otherDay), "这一天没有日程。");
  assert.equal(w38Next(otherDay).length, 0);

  // 计划还在读 → 活动池未就绪：不画空心圈，「下一场活动」只看已报名。
  let releasePlan: (value: unknown) => void = () => undefined;
  const planGate = new Promise((resolve) => {
    releasePlan = resolve;
  });
  const unready = await w38Mount(t, { planGate, snapshot: w38Snapshot(pool) });
  assert.deepEqual(w38DotClasses(unready, 29), []);
  assert.equal(w38Empty(unready), "今天没有已确认的日程。");
  const unreadyRegistered = await w38Mount(t, { planGate, snapshot: w38Snapshot(pool) }, { home });
  assert.equal(w38Empty(unreadyRegistered), "下一场活动：10/2 周五 报名的前一场");
  assert.deepEqual(w38DotClasses(unreadyRegistered, 29), []);
  releasePlan(null);
  await unready.settle();
  assert.deepEqual(w38DotClasses(unready, 29), ["ir-day-dot ir-day-dot-r"]);
  assert.equal(w38Empty(unready), "下一场活动：9/29 周二 早一场");
});

test("W0038 SC-01: crossing Tokyo midnight into a new month moves the selection and the rings with todayKey", async (t) => {
  let current = new Date("2026-09-30T14:59:00Z"); // 东京 9/30 23:59
  const handlers: Array<() => void> = [];
  const pool = [w38Candidate("OCT-1", "2026-09-30T15:30:00Z", "十月一日凌晨场")]; // 东京 10/1 00:30
  const mounted = await w38Mount(t, { onInterval: (handler) => handlers.push(handler), snapshot: w38Snapshot(pool) }, {
    clock: () => current,
  });
  assert.equal(w38DayButton(mounted, 30).props["aria-pressed"], true);
  assert.deepEqual(w38DotClasses(mounted, 1), [], "a 10/1 00:30 event is not drawn on September 1");
  assert.equal(w38Legend(mounted).length, 0);

  current = new Date("2026-09-30T15:00:30Z"); // 东京 10/1 00:00
  await act(async () => handlers.at(-1)!());
  await mounted.settle();
  assert.equal(w38DayButton(mounted, 1).props["aria-pressed"], true);
  assert.deepEqual(w38DotClasses(mounted, 1), ["ir-day-dot ir-day-dot-r"]);
  assert.deepEqual(w38Timeline(mounted).map((row) => row.href), ["/app/events/OCT-1"]);
});

test("W0038 SC-04: new calendar / timeline rules stay off the warm colour, carry no inline style, and the narrow week row keeps its dots", async (t) => {
  const newRules = IORBIT_STYLES.split("\n").filter((line) =>
    /ir-day-dots|ir-day-dot-r|ir-m-cal-legend|ir-m-tl-rec|ir-m-tl-next|a\.ir-m-tl-item/.test(line),
  );
  assert.ok(newRules.length >= 6, `expected the W0038 rules, found ${newRules.length}`);
  for (const rule of newRules) assert.ok(!/C4461B/i.test(rule), `warm colour in ${rule}`);
  // 选中日上：实心点变白，空心圈换浅色描边。
  assert.ok(newRules.some((rule) => rule.includes(".ir-day-on .ir-day-dot-r")));
  assert.match(IORBIT_STYLES, /\.ir-day-on \.ir-day-dot-a \{ background: #FFFFFF; \}/);
  // 窄屏收起时只隐藏非本周的格子，圆点跟着本周格子显示（没有隐藏圆点的规则）。
  assert.ok(!/ir-m-cal:not\(\[data-open="true"\]\)[^{]*ir-day-dot/.test(IORBIT_STYLES));

  const snapshot = w38Snapshot(
    [w38Candidate("REC-29", "2026-09-29T05:00:00Z")],
    [w38Personal("p28", "2026-09-28T06:00:00Z", "牙医复诊")],
  );
  const mounted = await w38Mount(t, { snapshot });
  const cal = mounted.root.root.findAll((node) => node.props?.className === "ir-m-cal")[0]!;
  const styled = [...cal.findAll((node) => typeof node.type === "string" && node.props?.style !== undefined),
    ...w38Panel(mounted).findAll((node) => typeof node.type === "string" && node.props?.style !== undefined)];
  assert.deepEqual(styled.map((node) => node.type), []);
  // 本周（9/27–10/3）那一行的格子没有 data-off-week，圆点在格子里。
  assert.equal(w38DayButton(mounted, 29).props["data-off-week"], undefined);
  assert.equal(w38DotClasses(mounted, 29).length, 1);
});

test("W0038 SC-02 (demo body): demo rows open the 这是示例 guard; the real recommended event is a plain link", async (t) => {
  const todayKey = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date());
  const candidate = w38Candidate("DEMO-REC", `${todayKey}T15:00:00+09:00`, "示例期的真实推荐");
  const mounted = await mountHome(t, () => (
    <IOrbitShell demoEventCandidates={[candidate]} guide={GUIDE_STEP_TWO} home={HOME as never} viewModel={VIEW_MODEL} />
  ));
  const rows = w38Timeline(mounted);
  const rec = rows.find((row) => row.kind === "recommended")!;
  assert.ok(rec, "the real recommended event is on the demo timeline");
  assert.equal(rec.href, "/app/events/DEMO-REC");
  assert.equal(rec.node.props.onClick, undefined);
  assert.ok(!rec.node.findAll((node) => node.props?.["data-orbit-guide-demo-tag"] !== undefined).length);
  const day = Number(todayKey.slice(8, 10));
  assert.ok(w38DotClasses(mounted, day).includes("ir-day-dot ir-day-dot-r"));
  assert.ok(w38DotClasses(mounted, day).includes("ir-day-dot ir-day-dot-a"));

  const demoRow = rows.find((row) => row.kind !== "recommended")!;
  let prevented = false;
  await act(async () => demoRow.node.props.onClick({ preventDefault: () => (prevented = true) }));
  await mounted.settle();
  assert.ok(prevented);
  const guard = mounted.root.root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined);
  assert.equal(guard.length > 0, true);
  assert.ok(textOf(guard[0]!).includes("这是示例"));
  assert.deepEqual(mounted.calls.filter((call) => call.url !== "/api/account/me"), [], "no client request");
});

test("W0038 SC-01 (live shell): registrations from the live home draw solid dots and label the day", () => {
  const todayKey = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date());
  const [year, month] = todayKey.split("-").map(Number) as [number, number];
  const home = { ...HOME, events: [registeredEvent("ev-live", "月初的报名", `${todayKey.slice(0, 7)}-01T10:00:00+09:00`)] };
  const html = renderToStaticMarkup(<IOrbitShell home={home as never} viewModel={VIEW_MODEL} />);
  assert.ok(html.includes(`aria-label="${iorbitSelectedDayLabel(year, month, 1, "zh")}，1 项日程"`));
  assert.match(html, /class="ir-day-dot ir-day-dot-a"/);
  assert.match(html, /data-orbit-iorbit-cal-legend/);
});


/* ── W0061：「TA 能帮你」一句话 ─────────────────────────────────────── */

/** 两条拖期行动：a-overdue-2 恰好指向夹具联系人且自带理由；a-overdue-1 只有 meta.contactId、没有理由。 */
function w61Plan() {
  const plan = planSnapshotFixture();
  plan.items = plan.items.map((item) =>
    item.id === "a-overdue-2"
      ? { ...item, detail: "「拿到 3 个引荐」还差 2 个", linkedContactIds: [VALUE_CONTACT_ID] }
      : item.id === "a-overdue-1"
        ? { ...item, detail: null, meta: { contactId: "c-other" } }
        : item,
  );
  return plan;
}

function w61Lines(otherState: "ready" | "pending") {
  return (ids: string[], lang: string) => {
    const language = lang === "en" ? "en" : "zh";
    const other =
      otherState === "ready"
        ? { contactId: "c-other", evidence: [], name: "伊藤 翔", nextStep: language === "zh" ? "先约一杯咖啡。" : "Start with a coffee.", relation: language === "zh" ? "伊藤在做渠道合作。" : "Ito runs channel partnerships.", state: "ready", subtitle: "Ito KK · 部长" }
        : { contactId: "c-other", evidence: [], name: "伊藤 翔", nextStep: null, relation: null, state: "pending", subtitle: "Ito KK · 部长" };
    return [valueLineItem(language), other].filter((line) => ids.includes(line.contactId));
  };
}

function valueLineNode(mounted: Mounted, key: string) {
  return mounted.root.root.findAll((node) => node.props?.["data-orbit-today-value-line"] === key)[0] ?? null;
}

for (const lang of ["zh", "en"] as const) {
  test(`SC-W0061-01／03 (${lang}): a plan action pointing at one contact shows 「TA 能帮你」 + evidence (same text as the candidate card and detail) and 为什么现在 from the plan item`, async (t) => {
    const mounted = await mountHome(
      t,
      ({ loadSnapshot }) => (
        <OrbitLanguageProvider initialLanguage={lang}>
          {homeElement({ clock: () => PLAN_NOW })({ loadSnapshot })}
        </OrbitLanguageProvider>
      ),
      { plan: w61Plan(), snapshot: EMPTY_SNAPSHOT, valueLines: w61Lines("ready") },
    );
    await mounted.settle(6);
    const requests = mounted.calls.filter((call) => call.url.startsWith("/api/contacts/value-lines"));
    assert.equal(requests.length, 1, "one batched read");
    assert.equal(requests[0]!.url, `/api/contacts/value-lines?ids=${VALUE_CONTACT_ID},c-other&lang=${lang}`);
    const lead = valueLineNode(mounted, "plan:a-overdue-2");
    assert.ok(lead, "the lead plan action carries the value line");
    const relation = lead!.find((node) => node.props?.["data-value-line-relation"] !== undefined);
    assert.equal(textOf(relation as unknown as { children: readonly unknown[] }), VALUE_LINE_EXPECTED[lang].relation);
    const evidence = lead!.find((node) => node.props?.["data-value-line-evidence"] !== undefined);
    assert.equal(textOf(evidence as unknown as { children: readonly unknown[] }), VALUE_LINE_EXPECTED[lang].evidence);
    const whyNow = lead!.find((node) => node.props?.["data-value-line-why-now"] !== undefined);
    assert.equal(
      textOf(whyNow as unknown as { children: readonly unknown[] }),
      lang === "zh" ? "为什么现在：阶段 1 · 摸清需求：「拿到 3 个引荐」还差 2 个" : "Why now: Phase 1 · 摸清需求: 「拿到 3 个引荐」还差 2 个",
    );
    // 第二条没有自身理由 → 用 ready 洞察的下一步。
    const brief = valueLineNode(mounted, "plan:a-overdue-1")!;
    const briefWhy = brief.find((node) => node.props?.["data-value-line-why-now"] !== undefined);
    assert.equal(textOf(briefWhy as unknown as { children: readonly unknown[] }), lang === "zh" ? "为什么现在：先约一杯咖啡。" : "Why now: Start with a coffee.");
    // 一句话替代了原来的理由行（不重复显示）。
    assert.equal(mounted.root.root.findAll((node) => node.props?.className === "ir-m-why").length, 0);
  });
}

test("SC-W0061-02／03: without a plan reason and without a ready insight there is no 为什么现在; the card falls back to company · title + matched need + 生成中", async (t) => {
  const mounted = await mountHome(t, homeElement({ clock: () => PLAN_NOW }), {
    plan: w61Plan(),
    snapshot: EMPTY_SNAPSHOT,
    valueLines: w61Lines("pending"),
  });
  await mounted.settle(6);
  const brief = valueLineNode(mounted, "plan:a-overdue-1")!;
  assert.equal(brief.findAll((node) => node.props?.["data-value-line-why-now"] !== undefined).length, 0);
  const text = textOf(brief as unknown as { children: readonly unknown[] });
  assert.ok(text.includes("Ito KK · 部长"));
  assert.ok(text.includes("「TA 能帮你」生成中，通常 1 分钟内出现"));
  assert.equal(brief.findAll((node) => node.props?.["data-contact-value-line"] === "pending").length, 1);
});

test("SC-W0061-03: a follow-up item gets 「TA 能帮你」 but never 为什么现在; an unreadable value-lines endpoint leaves items unchanged", async (t) => {
  const clock = () => new Date("2026-09-28T03:00:00Z");
  const mounted = await mountHome(t, homeElement({ clock }), {
    snapshot: SNAPSHOT("2026-09-28"),
    valueLines: (ids) => (ids.includes("c1") ? [{ ...valueLineItem("zh"), contactId: "c1" }] : []),
  });
  await mounted.settle(6);
  const node = valueLineNode(mounted, "followup:f1");
  assert.ok(node, "the follow-up carries the value line");
  assert.equal(node!.findAll((entry) => entry.props?.["data-value-line-why-now"] !== undefined).length, 0);
  assert.equal(mounted.calls.filter((call) => call.url.startsWith("/api/contacts/value-lines")).length, 1);
  const broken = await mountHome(t, homeElement({ clock }), { snapshot: SNAPSHOT("2026-09-28") });
  await broken.settle(6);
  assert.equal(valueLineNode(broken, "followup:f1"), null);
  assert.ok(textOf(broken.root.root as unknown as { children: readonly unknown[] }).includes("跟进 Mina Aoki"));
});

test("SC-W0061-04: the demo home never reads value-lines", async (t) => {
  const mounted = await mountHome(t, () => <IOrbitShell guide={GUIDE_NEW} home={HOME as never} viewModel={VIEW_MODEL} />, {
    valueLines: () => {
      throw new Error("demo must not read value-lines");
    },
  });
  await mounted.settle(6);
  assert.deepEqual(mounted.calls.filter((call) => call.url.includes("/api/contacts/value-lines")), []);
});
