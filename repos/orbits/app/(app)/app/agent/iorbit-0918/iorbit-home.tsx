/**
 * iOrbit 概览屏：报刊式改版（2026-09-27 定稿，原型 claude.ai/artifact/14nY6w6GDbW7cjpLNLgC6k）。
 *
 * 版式取代 docs/designs/Orbit_0918/iOrbit.dc.html 46–253 的七张等权卡片：
 *   报头     iOrbit + 日期 + 一句导语（由真实计数拼成，不调模型）
 *   左宽栏   今日要事：第 1 件是主稿，第 2、3 件是短讯，其余「还有 N 件」原地展开；
 *            下面是追问条（原顶部大输入框 + 四枚 chip + 「打开对话」合并而来）
 *   右窄栏   时间：选中日的时间线（今天带「现在」线）+ 紧凑月历
 *   栏目区   本周推进 | 已报名活动 | 最近对话，无卡片边框、细线分栏
 *
 * 今日要事的来源与排序：2 小时内开始的日程 → critical/high 信号 →
 * 「N 位新联系人可能对应你的计划」（W0010，有生效计划且有待确认的匹配时，点开共用确认弹层）→
 * 其余信号 → 跟进队列（仅在信号里没有 followup_due 时补位，避免同一件事出现两次）。
 * 排序只看 severity 与真实时间戳，不用跟进队列的到期字段（到期时间被夹成「今天」的旧 bug）。
 * W0036（RH-02）：原有来源之后补入本周计划行动（≤2，拖期优先）与补人脉提示，**只补到前 3 个
 * 位置**（`today-plan-items.ts`）；计划行动可勾掉（同一个 `togglePlanAction`，本周推进同步）、
 * 「今天先不做」（只存本机、按账号与东京日分 key，不补位）、点标题跳转。首页内另算共享的
 * 推荐活动池 `eventPool`／`eventPoolReady`（W0037／W0038 消费），本 Sprint 只给空日导语用。
 *
 * 数据全部真实，写操作一个不丢：
 *   - 已报名活动 / 目标：服务端注入的 home route view model
 *   - 社群加入状态（W0003）：服务端读取后注入的 `communityJoined`。社群不是活动（D6）：
 *     未加入时栏首是指向活动页社群卡片的入口，已加入时栏首是「已加入社群」，都标「社群」，
 *     不占真实报名活动的两个名额
 *   - 日程 / 月历 / 跟进：`refreshHomeDashboardAction()` 的 D25 facts
 *   - 信号：`POST /api/agent/signals?view=home`，完成 / 明天提醒走 `PATCH /api/agent/signals/{id}`
 *   - 本周推进（W0009）：有生效计划时读 `GET /api/agent/plans/current`，显示当前阶段、
 *     「第 n 周 / 共 N 周」、本周最多 3 件可打勾的行动（`PATCH /api/agent/plans/items/{id}`，
 *     乐观更新、失败回滚并提示）、行动完成数与已建立联系人数；没有计划（或读不到）时保持
 *     原来的账本进度显示（`GET /api/agent/ledger`）
 *   - 最近对话：`GET /api/ai/conversations/sessions?limit=3`
 *   - 周一小结（W0012）：东京时间周一且有生效计划时读 `GET /api/agent/plans/weekly-summary`，
 *     报头导语换成规则拼出的上周小结（不调 AI）；其他日子、读取中或读不到时保持今日导语
 * 无数据一律走空态文案，不伪造数字。
 *
 * 示例模式（W0004）：壳挂了 `DemoModeProvider` 时，上面每个来源都换成
 * `_demo/demo-persona.ts` 的同形状示例数据，走的仍是下面同一套渲染代码；四个读取
 * 请求一个都不发，完成／明天提醒、刷新、追问、打开对话／历史／会话、条目跳转全部改成
 * `guardWrite(...)` 的「这是示例」拦截层。示例人名旁带「示例」角标。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { PlanViewSnapshot } from "../../../../../features/plans/contract";
import { COMMUNITY_CONFIG } from "../../../../../features/community/config";
import {
  buildHomeEventPool,
  type HomeEventPoolCandidate,
  type HomeEventPoolItem,
} from "../../../../../features/agent/home-event-pool";
import { eventTitleForId } from "../../orbit-event-presentation";
import { buildDemoHomeData } from "../../_demo/demo-persona";
import { DemoTag, useDemoMode } from "../../_demo/demo-mode-context";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import type { HomeDashboardSnapshot } from "../home-dashboard-route-service";
import type {
  HomeFactsAppointmentItem,
  HomeFactsFollowupItem,
  HomeFactsPersonalItem,
} from "../home-facts-route-service";
import type { HomeFactsViewItem } from "../home-facts-view-model";
import {
  buildPlanWeekSummary,
  isTokyoMonday,
  weeklySummaryLede,
  type PlanWeeklySummary,
} from "../plan/plan-route-view-model";
import {
  agentSignalsToNextActionRows,
  type AgentTodaySignalView,
} from "../orbit-agent-next-actions";
import {
  iorbitCalendarCells,
  iorbitDayKey,
  iorbitLedgerProgress,
  iorbitRegisteredEvents,
  iorbitRelativeDayLabel,
  iorbitSelectedDayLabel,
} from "./iorbit-model";
import {
  fetchCurrentPlan,
  fetchWeeklySummary,
  patchPlanActionDone,
  withActionDone,
  withServerItem,
} from "./iorbit-plan-client";
import { fetchPlanMatches, withoutCandidate, type PlanMatchCandidate, type PlanMatchList } from "./plan-match-client";
import { PlanMatchDialog, PlanMatchSheet } from "./plan-match-sheet";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { usePendingCards } from "./use-pending-cards";
import {
  currentPlanPhase,
  NETWORK_NUDGE_HREF,
  NETWORK_NUDGE_THRESHOLD,
  networkNudgeQuiet,
  networkNudgeStorageKey,
  planPoolEventIds,
  selectTodayPlanActions,
  TODAY_SKIP_KEY_PREFIX,
  todaySkipStorageKey,
} from "./today-plan-items";

const TZ = "Asia/Tokyo";
/** 日程在多久之内开始才进今日要事（Q6：2 小时）。 */
const SOON_MS = 2 * 60 * 60 * 1000;
/** 默认露出的要事条数：1 条主稿 + 2 条短讯。 */
const VISIBLE_ITEMS = 3;

type Loadable<T> = T | "pending" | "unavailable";

export interface IOrbitHomeSession {
  createdAt: string;
  id: string;
  title: string;
}

export interface IOrbitHomeProps {
  /** 本人是否已加入 iOrbit 用户社群（服务端读取，W0003）。 */
  communityJoined?: boolean;
  /**
   * W0022：服务端开关 `ORBIT_GUIDE_DEMO` 是否打开。打开时无计划分支的「帮我制定推进计划 →」
   * 去 `/app/start?step=3`；默认 false（链接保持 `/app/agent/strategy`）。示例期不生效。
   */
  guideEnabled?: boolean;
  home: OrbitHomeViewModel | null;
  /** 覆盖点，仅测试使用：默认动态 import `home-dashboard-actions`（server action）。 */
  loadSnapshot?: () => Promise<Loadable<HomeDashboardSnapshot>>;
  navigate: (href: string) => void;
  /** 发起提问（壳负责写 `?q=` 并切到对话分支）。 */
  onAsk: (query: string) => void;
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onOpenSession: (sessionId: string) => void;
  /** 覆盖点，仅测试使用：可注入的时钟（默认 `new Date()`，每分钟刷新）。 */
  clock?: () => Date;
  /**
   * W0036：示例期服务端读到的「近期可报名」真实活动（RH-03「活动始终真实」）。只在示例期用来组
   * 活动池；真实期活动池由 snapshot + 计划算出。缺省等于空池。
   */
  demoEventCandidates?: readonly HomeEventPoolCandidate[];
  /**
   * 覆盖点，仅测试使用：SC-07 备选约束下补查计划点名活动（默认动态 import `home-plan-events-actions`）。
   * 读不到时 reject。
   */
  resolvePlanEvents?: (eventIds: readonly string[]) => Promise<readonly HomeEventPoolCandidate[]>;
}

const isPersonalFact = (item: HomeFactsViewItem): item is HomeFactsPersonalItem =>
  "startsAt" in item;
const isAppointmentFact = (item: HomeFactsViewItem): item is HomeFactsAppointmentItem =>
  "startsAtUtc" in item;
const isFollowupFact = (
  item: HomeFactsViewItem,
): item is HomeFactsFollowupItem & { href: string | null } => "contactName" in item;

interface ScheduleRow {
  /** 全天项（或时间无法解析）：`time` 不是钟点。 */
  allDay: boolean;
  dayKey: string;
  id: string;
  meta: string;
  /** 排序键：真实时间戳。全天项取当日 00:00（JST），因此排在当天最前。 */
  startMs: number;
  time: string;
  title: string;
}

/** 今日要事的一条：主稿与短讯共用。 */
interface TodayItem {
  key: string;
  /** 有时间压力（暖色只给它）。 */
  hot: boolean;
  title: string;
  why: string | null;
  proof: ReadonlyArray<readonly [string, string]>;
  pills: ReadonlyArray<{ hot?: boolean; text: string }>;
  primary: { href: string; label: string } | null;
  ask: { label: string; prompt: string } | null;
  /** 信号项才有：完成 / 明天提醒写回。 */
  signalId: string | null;
  /** 在本页打开（W0010 匹配确认弹层）而不是导航；示例模式下同样被拦下。 */
  open?: () => void;
  /** W0036：计划行动（可勾掉、今天先不做、标题可点）或补人脉提示。 */
  kind?: "plan" | "nudge";
  /** 计划行动的条目 id。 */
  planItemId?: string;
}

/** W0036：本机存储读写一律包 try/catch；读不到、写不进都只影响这一页的记忆。 */
function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // 写不进（隐私模式、配额、被禁用）：本页内存里照样生效。
  }
}

/** 写入「今天先不做」时顺手删掉同一账号其他日期的 key（只留今天）。 */
function pruneSkipKeys(account: string, keep: string): void {
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.key !== "function") return;
    const prefix = `${TODAY_SKIP_KEY_PREFIX}${account}:`;
    const stale: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(prefix) && key !== keep) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
  } catch {
    // 清理失败不影响今天的隐藏。
  }
}

const SEVERITY_RANK: Record<AgentTodaySignalView["severity"], number> = {
  critical: 0,
  high: 1,
  low: 3,
  medium: 2,
};

function parseHomeSessions(value: unknown): IOrbitHomeSession[] {
  if (typeof value !== "object" || value === null) return [];
  const items = (value as { sessions?: unknown; items?: unknown }).sessions ??
    (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: IOrbitHomeSession[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    const createdAt =
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : typeof record.createdAt === "string"
          ? record.createdAt
          : "";
    const organization = record.organization as { customTitle?: unknown } | undefined;
    const custom =
      typeof organization?.customTitle === "string" ? organization.customTitle.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    out.push({ createdAt, id: record.id, title: custom || title });
  }
  return out;
}

function isLedgerEntries(value: unknown): value is { entries: readonly AgentLedgerEntry[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

/** 服务端错误体 `{error:{message}}`（沿用 `orbit-agent-today-workspace.tsx:29-40`）。 */
function signalErrorMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object" &&
    (value as { error: unknown }).error !== null &&
    "message" in (value as { error: Record<string, unknown> }).error &&
    typeof (value as { error: { message?: unknown } }).error.message === "string"
  ) {
    return (value as { error: { message: string } }).error.message;
  }
  return null;
}

function snoozeUntilTomorrow(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

/**
 * W0036：活动池的标题换成按稳定 id 审阅过的三语标题（先 eventId 再 publicCode，未知 id 回退原标题）。
 * 首页语言只有 zh／en 两档（ja 界面按 en）。地点保持来源原文，不声称已本地化。
 */
export function localizeHomeEventPool(
  pool: readonly HomeEventPoolItem[],
  lang: "en" | "zh",
): HomeEventPoolItem[] {
  return pool.map((item) => ({
    ...item,
    title: eventTitleForId(item.eventId, lang) ?? eventTitleForId(item.publicCode, lang) ?? item.title,
  }));
}

/** 报头旁的细线轨道：纯装饰（Q13）。 */
function OrbitMark() {
  return (
    <svg aria-hidden className="ir-m-orbit" viewBox="0 0 44 26">
      <ellipse
        cx="22"
        cy="13"
        fill="none"
        opacity=".55"
        rx="20"
        ry="8"
        stroke="#4B4FC7"
        strokeWidth="1.1"
        transform="rotate(-14 22 13)"
      />
      <circle cx="38.6" cy="7.6" fill="#4B4FC7" r="2.6" />
    </svg>
  );
}

export function IOrbitHome({
  communityJoined: communityJoinedProp = false,
  guideEnabled: guideEnabledProp = false,
  home: homeProp,
  loadSnapshot,
  navigate,
  onAsk,
  onOpenChat,
  onOpenHistory,
  onOpenSession,
  clock,
  demoEventCandidates,
  resolvePlanEvents,
}: IOrbitHomeProps) {
  const { language, t } = useOrbitLanguage();
  const lang: "en" | "zh" = language === "zh" ? "zh" : "en";
  const locale = lang === "zh" ? "zh-CN" : "en-US";

  const demo = useDemoMode();
  const demoActive = demo !== null;
  const guardWrite = demo?.guardWrite;

  const [draft, setDraft] = useState("");
  const [snapshotState, setSnapshot] = useState<Loadable<HomeDashboardSnapshot>>("pending");
  const [ledgerState, setLedger] = useState<Loadable<readonly AgentLedgerEntry[]>>("pending");
  const [planState, setPlan] = useState<Loadable<PlanViewSnapshot | null>>("pending");
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  // 首页上刚打过勾的行动暂留一行（可撤销），不占「最多 3 件」的名额；刷新后消失。
  const [planSticky, setPlanSticky] = useState<readonly string[]>([]);
  const [signalsState, setSignals] = useState<Loadable<readonly AgentTodaySignalView[]>>("pending");
  const [sessionsState, setSessions] = useState<Loadable<readonly IOrbitHomeSession[]>>("pending");
  const [signalBusyId, setSignalBusyId] = useState<string | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalsRefreshing, setSignalsRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  // W0010：待确认的人脉需求匹配（只在有生效计划时读取）；弹层打开时固定一份清单，
  // 确认过的行留在弹层里显示「约 TA」行动卡，计数照常减少。
  const [matches, setMatches] = useState<PlanMatchList | null>(null);
  const [matchSheet, setMatchSheet] = useState<readonly PlanMatchCandidate[] | null>(null);
  // W0011：本机进行中批次里待确认的名片（只读 GET；示例模式不读，恒为就绪）。
  // 读取中不算就绪、读不到算部分数据缺失：都不能给出「今天没有要紧的事」。
  const pendingCardsState = usePendingCards(!demoActive);
  // W0021：浏览器端读取按账号隔离（换账号、登出时清掉进行中的读取）。
  // W0036：「今天先不做」与补人脉免打扰按这个账号分 key；`null`（会话 loading、未登录）才算未知，
  // 这时只在本页内存里隐藏，不读不写存储。
  const { account } = useSharedReadAccount();
  const pendingCards = pendingCardsState.batches;

  // 时钟每分钟前进一次：倒计时、2 小时窗口、「现在」线和跨午夜切日都跟着走。
  // 示例模式用示例时钟（东京的今天 11:40）。
  const demoClock = demo?.clock;
  const readClock = useCallback(
    () => (demoClock ? demoClock() : clock ? clock() : new Date()),
    [clock, demoClock],
  );
  const [now, setNow] = useState<Date>(() => readClock());
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.setInterval !== "function") return;
    const id = window.setInterval(() => setNow(readClock()), 60_000);
    return () => window.clearInterval?.(id);
  }, [readClock]);
  const todayKey = iorbitDayKey(now);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [selectedDay, setSelectedDay] = useState(todayDay);
  // 跨过东京午夜时，停在「旧的今天」上的选择跟着移到新的今天。
  const [lastTodayKey, setLastTodayKey] = useState(todayKey);
  if (lastTodayKey !== todayKey) {
    setLastTodayKey(todayKey);
    setSelectedDay(todayDay);
  }

  // 示例数据：同形状替身，按「今天」生成（只随日期与语言变化）。
  const demoData = useMemo(
    () => (demoActive ? buildDemoHomeData(new Date(`${todayKey}T12:00:00+09:00`), lang) : null),
    [demoActive, lang, todayKey],
  );
  const snapshot: Loadable<HomeDashboardSnapshot> = demoData ? demoData.snapshot : snapshotState;
  const ledger: Loadable<readonly AgentLedgerEntry[]> = demoData ? demoData.ledger : ledgerState;
  const signals: Loadable<readonly AgentTodaySignalView[]> = demoData ? demoData.signals : signalsState;
  const sessions: Loadable<readonly IOrbitHomeSession[]> = demoData ? demoData.sessions : sessionsState;
  const home = demoData ? demoData.home : homeProp;
  const communityJoined = demoData ? demoData.communityJoined : communityJoinedProp;
  // W0022：示例期不出引导入口与提醒（示例壳本来也不传这两个值）。
  const guideEnabled = guideEnabledProp && !demoActive;
  // 示例模式保留示例的账本显示，不读计划。
  const plan: Loadable<PlanViewSnapshot | null> = demoData ? null : planState;
  const planSnapshot = plan !== "pending" && plan !== "unavailable" ? plan : null;

  // W0036「今天先不做」：按「账号 + 东京日」记一份隐藏集合。只在 effect 里读存储（服务端渲染不碰
  // localStorage）；集合带着它所属的范围，账号或日期一变就不再生效（A → B 不沿用 A 的隐藏项）。
  const skipScope = `${account ?? ""}|${todayKey}`;
  const [skipState, setSkipState] = useState<{ ids: readonly string[]; scope: string }>({ ids: [], scope: "" });
  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    if (account === null) {
      setSkipState({ ids: [], scope: `|${todayKey}` });
      return;
    }
    const stored = readStoredJson(todaySkipStorageKey(account, todayKey));
    const ids = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
    setSkipState({ ids, scope: `${account}|${todayKey}` });
  }, [account, demoActive, todayKey]);
  const skippedIds = skipState.scope === skipScope ? skipState.ids : [];
  const skipPlanToday = (itemId: string) => {
    const ids = skippedIds.includes(itemId) ? skippedIds : [...skippedIds, itemId];
    setSkipState({ ids, scope: skipScope });
    if (account === null) return;
    const key = todaySkipStorageKey(account, todayKey);
    writeStored(key, JSON.stringify(ids));
    pruneSkipKeys(account, key);
  };

  // W0036 补人脉「7 天内不再提示」：按账号记关掉当天的东京日，同样只在 effect 里读。
  const [nudgeState, setNudgeState] = useState<{ day: string | null; scope: string | null }>({ day: null, scope: null });
  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    if (account === null) {
      setNudgeState({ day: null, scope: "" });
      return;
    }
    const stored = readStoredJson(networkNudgeStorageKey(account));
    setNudgeState({ day: typeof stored === "string" ? stored : null, scope: account });
  }, [account, demoActive]);
  const nudgeDismissedDay = nudgeState.scope === (account ?? "") ? nudgeState.day : null;
  const dismissNudge = () => {
    setNudgeState({ day: todayKey, scope: account ?? "" });
    if (account !== null) writeStored(networkNudgeStorageKey(account), JSON.stringify(todayKey));
  };

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    let live = true;
    const load = loadSnapshot
      ? loadSnapshot()
      : import("../home-dashboard-actions")
          .then((mod) => mod.refreshHomeDashboardAction())
          .then((result) =>
            result.state === "snapshot"
              ? (result.snapshot as Loadable<HomeDashboardSnapshot>)
              : ("unavailable" as const),
          );
    void load
      .then((value) => {
        if (live) setSnapshot(value);
      })
      .catch(() => {
        if (live) setSnapshot("unavailable");
      });
    return () => {
      live = false;
    };
  }, [demoActive, loadSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    const controller = new AbortController();
    void fetch("/api/agent/ledger", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          data?: unknown;
          success?: boolean;
        } | null;
        if (!response.ok || !body?.success || !isLedgerEntries(body.data)) {
          setLedger("unavailable");
          return;
        }
        setLedger(body.data.entries);
      })
      .catch(() => setLedger("unavailable"));
    return () => controller.abort();
  }, [demoActive]);

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    const controller = new AbortController();
    // W0021：首页只要计划与条目（`?view=home`，服务端不读进展记录）。
    void fetchCurrentPlan(controller.signal, { view: "home" })
      .then((value) => setPlan(value))
      .catch(() => {
        if (!controller.signal.aborted) setPlan("unavailable");
      });
    return () => controller.abort();
  }, [demoActive]);

  const hasPlan = planState !== "pending" && planState !== "unavailable" && planState !== null;
  // W0012：东京周一才读上周小结（示例模式不读）；读不到就保持今日导语。
  const [weeklySummary, setWeeklySummary] = useState<PlanWeeklySummary | null>(null);
  const monday = isTokyoMonday(now);
  useEffect(() => {
    if (typeof window === "undefined" || demoActive || !hasPlan || !monday) return;
    const controller = new AbortController();
    void fetchWeeklySummary(controller.signal)
      .then((value) => setWeeklySummary(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, [demoActive, hasPlan, monday]);

  useEffect(() => {
    if (typeof window === "undefined" || demoActive || !hasPlan) return;
    const controller = new AbortController();
    // 读不到就当没有：今日要事不因为匹配接口故障而报错。
    void fetchPlanMatches(controller.signal)
      .then((value) => setMatches(value))
      .catch(() => undefined);
    return () => controller.abort();
  }, [demoActive, hasPlan]);

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    const controller = new AbortController();
    void fetch("/api/ai/conversations/sessions?limit=3", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
        if (response.ok && body?.data) setSessions(parseHomeSessions(body.data));
        else setSessions("unavailable");
      })
      .catch(() => setSessions("unavailable"));
    return () => controller.abort();
  }, [demoActive]);

  const refreshSignals = useCallback(
    async (background = false) => {
      // 重新拉取即覆盖列表：上一次行内写失败的提示指向的是旧数据，必须一并清掉。
      setSignalError(null);
      if (background) setSignalsRefreshing(true);
      try {
        const response = await fetch("/api/agent/signals?view=home", { method: "POST" });
        const payload = (await response.json().catch(() => null)) as {
          data?: { signals?: readonly AgentTodaySignalView[] };
        } | null;
        if (!response.ok || !payload?.data?.signals) {
          setSignals("unavailable");
          return;
        }
        setSignals(payload.data.signals);
      } catch {
        setSignals("unavailable");
      } finally {
        if (background) setSignalsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    void refreshSignals();
  }, [demoActive, refreshSignals]);

  const updateSignal = async (
    signalId: string,
    status: "dismissed" | "snoozed",
  ) => {
    if (guardWrite) {
      guardWrite(t({ en: "today's items", zh: "今日要事" }));
      return;
    }
    setSignalBusyId(signalId);
    setSignalError(null);
    try {
      const response = await fetch(`/api/agent/signals/${encodeURIComponent(signalId)}`, {
        body: JSON.stringify({
          status,
          snoozedUntil: status === "snoozed" ? snoozeUntilTomorrow() : undefined,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { signal?: AgentTodaySignalView };
      } | null;
      const updated = payload?.data?.signal;
      if (!response.ok || !updated) {
        setSignalError(
          signalErrorMessage(payload) ??
            t({ en: "The update failed. Please retry.", zh: "更新失败，请重试。" }),
        );
        return;
      }
      setSignals((current) =>
        Array.isArray(current)
          ? current.map((item) => (item.signalId === updated.signalId ? updated : item))
          : current,
      );
    } catch (cause) {
      setSignalError(
        cause instanceof Error
          ? cause.message
          : t({ en: "The update failed. Please retry.", zh: "更新失败，请重试。" }),
      );
    } finally {
      setSignalBusyId(null);
    }
  };

  const facts =
    snapshot !== "pending" && snapshot !== "unavailable" ? snapshot.facts : null;
  const personalItems = (facts?.personal.items ?? []).filter(isPersonalFact);
  const appointmentItems = (facts?.appointments.items ?? []).filter(isAppointmentFact);
  const followupItems = (facts?.followups.current.items ?? []).filter(isFollowupFact);

  const fmtTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? "--:--"
        : new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: TZ,
          }).format(date);
    },
    [locale],
  );
  const fmtDay = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? ""
        : new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", timeZone: TZ }).format(date);
    },
    [locale],
  );

  // 「接下来要去的两场」：未开始的按时间正序排前，已结束的按时间倒序排后。
  const registeredEvents = useMemo(
    () => iorbitRegisteredEvents(home?.events ?? [], now.getTime()),
    [home, now],
  );

  const scheduleRows: readonly ScheduleRow[] = useMemo(() => {
    const rows: ScheduleRow[] = [
      ...appointmentItems.map((item) => ({
        allDay: false,
        dayKey: iorbitDayKey(new Date(item.startsAtUtc)),
        id: `appointment:${item.key}`,
        startMs: Date.parse(item.startsAtUtc),
        meta:
          item.medium === "video"
            ? t({ en: "Video", zh: "视频" })
            : item.medium === "phone"
              ? t({ en: "Phone", zh: "电话" })
              : t({ en: "In person", zh: "线下" }),
        time: fmtTime(item.startsAtUtc),
        title: t({ en: "Confirmed appointment", zh: "已确认约谈" }),
      })),
      ...personalItems.map((item) => ({
        allDay: item.allDay === true,
        dayKey: item.occurrenceDate ?? item.startsAt.slice(0, 10),
        id: `personal:${item.key}`,
        startMs: item.allDay
          ? Date.parse(`${item.occurrenceDate ?? item.startsAt.slice(0, 10)}T00:00:00+09:00`)
          : Date.parse(item.startsAt),
        meta: t({ en: "Personal schedule", zh: "个人日程" }),
        time: item.allDay ? t({ en: "All day", zh: "全天" }) : fmtTime(item.startsAt),
        title: item.title,
      })),
      ...registeredEvents.map((event) => ({
        allDay: false,
        dayKey: iorbitDayKey(new Date(event.startsAt)),
        id: `event:${event.id}`,
        startMs: Date.parse(event.startsAt),
        meta: [t({ en: "Registered event", zh: "已报名活动" }), event.venue || event.place]
          .filter(Boolean)
          .join(" · "),
        time: fmtTime(event.startsAt),
        title: event.name,
      })),
    ];
    // 按真实时间戳排，不能按格式化后的字符串：en-US 的 "06:30 PM" 会排在
    // "10:30 AM" 前面，全天项在两种语言下都无序。无法解析的时间沉到最后。
    return rows.sort((a, b) => {
      const left = Number.isFinite(a.startMs) ? a.startMs : Number.POSITIVE_INFINITY;
      const right = Number.isFinite(b.startMs) ? b.startMs : Number.POSITIVE_INFINITY;
      return left - right || a.id.localeCompare(b.id);
    });
  }, [appointmentItems, fmtTime, personalItems, registeredEvents, t]);

  const todayRows = scheduleRows.filter((row) => row.dayKey === todayKey);
  const monthPrefix = `${todayYear}-${String(todayMonth).padStart(2, "0")}`;
  const selectedKey = `${monthPrefix}-${String(selectedDay).padStart(2, "0")}`;
  const selectedRows = scheduleRows.filter((row) => row.dayKey === selectedKey);
  const isTodaySelected = selectedDay === todayDay;
  const markedDays = useMemo(() => {
    const marked = new Set<number>();
    for (const row of scheduleRows) {
      if (row.dayKey.startsWith(monthPrefix)) marked.add(Number(row.dayKey.slice(8, 10)));
    }
    return marked;
  }, [monthPrefix, scheduleRows]);
  const cells = useMemo(
    () => iorbitCalendarCells(todayYear, todayMonth),
    [todayMonth, todayYear],
  );
  const todayWeek = Math.floor(cells.indexOf(todayDay) / 7);

  const signalRows = useMemo(
    () =>
      Array.isArray(signals)
        ? agentSignalsToNextActionRows(signals, lang)
            // 已解决的信号只是历史，不进今日要事（也不参与跟进去重）。
            .filter((row) => !row.completed)
            .map((row, index) => ({ index, row }))
            .sort(
              (a, b) =>
                SEVERITY_RANK[a.row.signal.severity] - SEVERITY_RANK[b.row.signal.severity] ||
                a.index - b.index,
            )
            .map(({ row }) => row)
        : [],
    [lang, signals],
  );

  const items: readonly TodayItem[] = useMemo(() => {
    const nowMs = now.getTime();
    const soon: TodayItem[] = todayRows
      .filter((row) => !row.allDay && row.startMs > nowMs && row.startMs - nowMs <= SOON_MS)
      .map((row) => {
        const minutes = Math.max(1, Math.round((row.startMs - nowMs) / 60000));
        const left =
          minutes >= 60
            ? t({
                en: `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`,
                zh: `还有 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`,
              })
            : t({ en: `in ${minutes} min`, zh: `还有 ${minutes} 分钟` });
        return {
          ask: null,
          hot: true,
          key: row.id,
          pills: [{ hot: true, text: t({ en: `Starts ${row.time} · ${left}`, zh: `${row.time} 开始 · ${left}` }) }],
          primary: { href: "/app/agent/plan", label: t({ en: "Open schedule", zh: "查看日程" }) },
          proof: [[t({ en: "Schedule", zh: "日程" }), row.meta] as const],
          signalId: null,
          title: `${row.time} ${row.title}`,
          why: null,
        };
      });

    const fromSignals: TodayItem[] = signalRows.map((row) => {
      const navigateAction = row.actions.find((action) => action.kind === "navigate" && action.href);
      const askAction = row.actions.find((action) => action.kind === "ask" && action.prompt);
      const urgent = row.signal.severity === "critical" || row.signal.severity === "high";
      return {
        ask: askAction?.prompt ? { label: askAction.label, prompt: askAction.prompt } : null,
        hot: false,
        key: `signal:${row.signal.signalId}`,
        pills: urgent ? [{ text: t({ en: "Needs you", zh: "需要处理" }) }] : [],
        primary: navigateAction?.href
          ? { href: navigateAction.href, label: navigateAction.label || t({ en: "Open", zh: "打开" }) }
          : { href: "/app/agent/actions", label: t({ en: "Open", zh: "打开" }) },
        proof: row.signal.sources.map((source) => [source.sourceLabel, fmtDay(source.capturedAt)] as const),
        signalId: row.signal.signalId,
        title: row.title,
        why: row.signal.reason || row.context || null,
      };
    });

    // W0011：「确认 N 张新名片」取最新一批有待确认卡的批次，依据写它的创建时间，按钮进该批次审阅
    // （与全站宿主胶囊的「去确认」同一地址）。多批时另注明还有几批。
    const cardBatch = pendingCards[0] ?? null;
    const fromCards: TodayItem[] = cardBatch
      ? [
          {
            ask: null,
            hot: false,
            key: "card-review",
            pills: [{ text: t({ en: "Cards", zh: "名片" }) }],
            primary: {
              href: `/app/contacts/new?job=${encodeURIComponent(cardBatch.batchId)}`,
              label: t({ en: "Review cards", zh: "去确认" }),
            },
            proof: [
              [
                t({ en: "Batch", zh: "批次" }),
                t({
                  en: `uploaded ${fmtDay(cardBatch.createdAt)} ${fmtTime(cardBatch.createdAt)}`,
                  zh: `${fmtDay(cardBatch.createdAt)} ${fmtTime(cardBatch.createdAt)} 上传`,
                }),
              ] as const,
              ...(pendingCards.length > 1
                ? [
                    [
                      t({ en: "Also", zh: "另有" }),
                      t({
                        en: `${pendingCards.length - 1} more batch(es) to check`,
                        zh: `${pendingCards.length - 1} 批待确认`,
                      }),
                    ] as const,
                  ]
                : []),
            ],
            signalId: null,
            title: t({
              en: `Confirm ${cardBatch.pending} new card(s)`,
              zh: `确认 ${cardBatch.pending} 张新名片`,
            }),
            why: t({
              en: "These weren't read with full confidence — check them against the photo.",
              zh: "这几张识别不太确定，需要你对照照片看一眼。",
            }),
          },
        ]
      : [];

    // W0010：「N 位新联系人可能对应你的计划」排在 critical/high 信号之后、其余信号之前。
    // W0011：名片待确认排在它前面——名片确认后才会产生新的匹配。
    const urgentCount = signalRows.filter(
      (row) => row.signal.severity === "critical" || row.signal.severity === "high",
    ).length;
    const matchCount = matches?.contactCount ?? 0;
    const matchNeeds = matches ? [...new Set(matches.candidates.map((candidate) => candidate.needTitle))] : [];
    const fromMatches: TodayItem[] =
      matches && matchCount > 0
        ? [
            {
              ask: null,
              hot: false,
              key: "plan-match",
              open: () => setMatchSheet(matches.candidates),
              pills: [{ text: t({ en: "Plan", zh: "计划" }) }],
              primary: { href: "/app/agent/plan", label: t({ en: "Review one by one", zh: "逐个确认" }) },
              proof: [[t({ en: "Network needs", zh: "人脉需求" }), matchNeeds.slice(0, 3).join(" · ")] as const],
              signalId: null,
              title: t({
                en: `${matchCount} new contact(s) may fit your plan`,
                zh: `${matchCount} 位新联系人可能对应你的计划`,
              }),
              why: t({
                en: "Only a suggestion — nothing is linked until you confirm.",
                zh: "只是建议，确认后才会关联到计划。",
              }),
            },
          ]
        : [];

    // 信号里已经有 followup_due 时，跟进队列不再补位（同一件事不出现两次）。
    const hasFollowupSignal = signalRows.some((row) => row.signal.type === "followup_due");
    const fromFollowups: TodayItem[] = hasFollowupSignal
      ? []
      : followupItems.map((item) => ({
          ask: null,
          hot: false,
          key: `followup:${item.key}`,
          pills: [],
          primary: { href: item.href ?? "/app/contacts", label: t({ en: "Open contact", zh: "打开联系人" }) },
          proof: [[t({ en: "Follow-up", zh: "跟进" }), [item.organization, item.title].filter(Boolean).join(" · ")] as const],
          signalId: null,
          title: t({ en: `Follow up with ${item.contactName}`, zh: `跟进 ${item.contactName}` }),
          why: null,
        }));

    const base: TodayItem[] = [
      ...soon,
      ...fromSignals.slice(0, urgentCount),
      ...fromCards,
      ...fromMatches,
      ...fromSignals.slice(urgentCount),
      ...fromFollowups,
    ];

    // W0036：原有来源之后补计划行动（≤ min(2, 3 − n)），先选定再去掉「今天先不做」的，不补位。
    // 示例期 `plan = null`，不加（W36-2）。
    const fromPlan: TodayItem[] = planSnapshot
      ? selectTodayPlanActions(planSnapshot, now, { baseCount: base.length, skippedIds }).map((action) => ({
          ask: null,
          hot: false,
          key: `plan:${action.id}`,
          kind: "plan" as const,
          pills: [
            {
              text: action.phase
                ? t({
                    en: `This week's plan · Phase ${action.phase.phaseNo} ${action.phase.phaseTitle}`,
                    zh: `本周计划 · 第 ${action.phase.phaseNo} 阶段 ${action.phase.phaseTitle}`,
                  })
                : t({ en: "This week's plan", zh: "本周计划" }),
            },
            ...(action.weeksOverdue > 0
              ? [{ text: t({ en: `Carried over ${action.weeksOverdue} wk`, zh: `已顺延 ${action.weeksOverdue} 周` }) }]
              : []),
          ],
          planItemId: action.id,
          primary: {
            href: action.href,
            label: action.href.startsWith("/app/contacts/")
              ? t({ en: "Open contact", zh: "打开联系人" })
              : action.href.startsWith("/app/events/")
                ? t({ en: "Open event", zh: "查看活动" })
                : t({ en: "Open in plan", zh: "在计划里查看" }),
          },
          proof: [],
          signalId: null,
          title: action.title,
          why: action.detail,
        }))
      : [];

    // W0036 补人脉：已确认联系人 < 10 且还有空位（计划读到之后才判断，免得计划行动到来时被挤走）。
    // `home` 为 null 时人数未知，不出。
    const people = home?.stats.people;
    const phase = planSnapshot ? currentPlanPhase(planSnapshot, now) : null;
    const nudgeOpen =
      !demoActive &&
      plan !== "pending" &&
      typeof people === "number" &&
      people < NETWORK_NUDGE_THRESHOLD &&
      base.length + fromPlan.length < 3 &&
      !networkNudgeQuiet(nudgeDismissedDay, todayKey);
    const fromNudge: TodayItem[] = nudgeOpen
      ? [
          {
            ask: null,
            hot: false,
            key: "network-nudge",
            kind: "nudge",
            // W36-4：有计划时药丸带当前阶段名（主稿与短讯都看得到），没有计划时不提阶段。
            pills: [
              {
                text: phase
                  ? t({
                      en: `Grow your network · Phase ${phase.phaseNo} ${phase.phaseTitle}`,
                      zh: `补人脉 · 第 ${phase.phaseNo} 阶段 ${phase.phaseTitle}`,
                    })
                  : t({ en: "Grow your network", zh: "补人脉" }),
              },
            ],
            primary: { href: NETWORK_NUDGE_HREF, label: t({ en: "Scan cards", zh: "去扫名片" }) },
            proof: [[t({ en: "Confirmed contacts", zh: "已确认联系人" }), t({ en: `${people}`, zh: `${people} 位` })] as const],
            signalId: null,
            title: t({
              en: `Only ${people} confirmed contact(s) so far — add a few business cards`,
              zh: `已确认的联系人只有 ${people} 位，补几张名片`,
            }),
            why: phase
              ? t({
                  en: `Phase ${phase.phaseNo} of your plan, ${phase.phaseTitle}, moves faster with more people to reach.`,
                  zh: `计划第 ${phase.phaseNo} 阶段「${phase.phaseTitle}」需要更多可以联系的人。`,
                })
              : t({
                  en: "The more people you have on file, the more paths iOrbit can find for you.",
                  zh: "联系人越多，iOrbit 能帮你找到的路越多。",
                }),
          },
        ]
      : [];

    return [...base, ...fromPlan, ...fromNudge];
  }, [
    demoActive,
    followupItems,
    fmtDay,
    fmtTime,
    home,
    matches,
    now,
    nudgeDismissedDay,
    pendingCards,
    plan,
    planSnapshot,
    signalRows,
    skippedIds,
    t,
    todayKey,
    todayRows,
  ]);

  const progress = Array.isArray(ledger) ? iorbitLedgerProgress(ledger) : null;
  const focusTasks = Array.isArray(ledger)
    ? ledger
        .filter(
          (entry) =>
            entry.status === "approved" ||
            entry.status === "executing" ||
            entry.status === "completed",
        )
        .slice(0, 3)
    : [];

  const recentSessions = Array.isArray(sessions) ? sessions.slice(0, 3) : [];

  const planSummary = planSnapshot ? buildPlanWeekSummary(planSnapshot, now, lang, planSticky) : null;

  // W0036 推荐活动池（RH-03，W0037 小模组与 W0038 月历只消费这两个值）。真实期由 snapshot 的
  // 目标匹配与「近期可报名」+ 已读到的计划算出，不新增客户端请求；示例期只用服务端读到的真实近期活动。
  // 标题按当前首页语言换成审阅过的三语标题（ja → en，未知 id 回退原标题）；地点是来源原文。
  const recommendations =
    snapshot !== "pending" && snapshot !== "unavailable" ? snapshot.recommendations : undefined;
  // SC-07 备选约束：snapshot 只带前 12 场时，计划点名却不在其中（也不在目标匹配里）的活动补查一次。
  const missingPlanEventKey = useMemo(() => {
    if (demoActive || !recommendations?.upcomingTruncated || !planSnapshot) return "";
    const known = new Set([
      ...(recommendations.upcoming ?? []).map((item) => item.eventId),
      ...(recommendations.state === "success" ? recommendations.items.map((item) => item.eventId) : []),
    ]);
    return planPoolEventIds(planSnapshot)
      .filter((eventId) => !known.has(eventId))
      .join("\n");
  }, [demoActive, planSnapshot, recommendations]);
  // 结果按「缺哪些 id」这把 key 记：同一 key 只查一次；key 变了（换账号、计划刷新后点名了别的活动）
  // 旧结果立即作废，再按新 key 查一次（review P2）。
  const [planEventLookup, setPlanEventLookup] = useState<{
    key: string;
    value: Loadable<readonly HomeEventPoolCandidate[]>;
  } | null>(null);
  const requestedPlanEventKey = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !missingPlanEventKey) return;
    if (requestedPlanEventKey.current === missingPlanEventKey) return;
    requestedPlanEventKey.current = missingPlanEventKey;
    const key = missingPlanEventKey;
    const eventIds = key.split("\n");
    setPlanEventLookup({ key, value: "pending" });
    const load = resolvePlanEvents
      ? resolvePlanEvents(eventIds)
      : import("../home-plan-events-actions")
          .then((mod) => mod.resolveHomePlanEventsAction(eventIds))
          .then((result) => {
            if (result.state !== "events") throw new Error(result.state);
            return result.items;
          });
    void load.then(
      (items) => setPlanEventLookup((current) => (current?.key === key ? { key, value: items } : current)),
      () => setPlanEventLookup((current) => (current?.key === key ? { key, value: "unavailable" } : current)),
    );
  }, [missingPlanEventKey, resolvePlanEvents]);
  const planEventExtra: Loadable<readonly HomeEventPoolCandidate[]> | "idle" =
    planEventLookup && planEventLookup.key === missingPlanEventKey ? planEventLookup.value : "idle";
  const eventPool: readonly HomeEventPoolItem[] = useMemo(() => {
    const pool = buildHomeEventPool({
      goalMatches: demoActive || recommendations?.state !== "success" ? [] : recommendations.items,
      now,
      planEventIds: planSnapshot ? planPoolEventIds(planSnapshot) : [],
      registeredEventIds: new Set(registeredEvents.map((event) => event.id)),
      upcoming: demoActive
        ? (demoEventCandidates ?? [])
        : [...(recommendations?.upcoming ?? []), ...(Array.isArray(planEventExtra) ? planEventExtra : [])],
    });
    return localizeHomeEventPool(pool, lang);
  }, [demoActive, demoEventCandidates, lang, now, planEventExtra, planSnapshot, recommendations, registeredEvents]);
  const eventPoolReady =
    demoActive ||
    (snapshot !== "pending" &&
      plan !== "pending" &&
      planEventExtra !== "pending" &&
      !(missingPlanEventKey && planEventExtra === "idle"));
  // 打勾：先改本地，服务端确认后换成返回的条目；失败只把这一条回滚并提示。
  const togglePlanAction = async (itemId: string, done: boolean) => {
    if (!planSnapshot || planBusyId) return;
    const previous = planSnapshot.items.find((item) => item.id === itemId);
    setPlanError(null);
    setPlanBusyId(itemId);
    setPlanSticky((current) => (current.includes(itemId) ? current : [...current, itemId]));
    setPlan((current) => (current && current !== "pending" && current !== "unavailable" ? withActionDone(current, itemId, done, new Date()) : current));
    try {
      const result = await patchPlanActionDone(itemId, done);
      setPlan((current) => (current && current !== "pending" && current !== "unavailable" ? withServerItem(current, result.item, result.log) : current));
    } catch (error) {
      setPlan((current) =>
        current && current !== "pending" && current !== "unavailable" && previous
          ? { ...current, items: current.items.map((item) => (item.id === itemId ? previous : item)) }
          : current,
      );
      setPlanError(
        t({
          en: `Couldn't save that — it has been put back. (${(error as Error).message})`,
          zh: `没能保存，已恢复原状。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setPlanBusyId(null);
    }
  };

  const dateMain = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "long" }).format(now);
  const monthLabel =
    lang === "zh"
      ? `${todayYear} 年 ${todayMonth} 月`
      : new Intl.DateTimeFormat(locale, { month: "long", timeZone: TZ, year: "numeric" }).format(now);
  const weekdayLabels =
    lang === "zh"
      ? ["日", "一", "二", "三", "四", "五", "六"]
      : ["S", "M", "T", "W", "T", "F", "S"];

  const chatLabel = t({ en: "conversation", zh: "对话" });
  const submitDraft = () => {
    const value = draft.trim();
    if (guardWrite) {
      guardWrite(chatLabel);
      return;
    }
    if (!value) return;
    setDraft("");
    onAsk(value);
  };
  const askSignal = (prompt: string) => (guardWrite ? guardWrite(chatLabel) : onAsk(prompt));
  const openChat = () => (guardWrite ? guardWrite(chatLabel) : onOpenChat());
  const openHistory = () =>
    guardWrite ? guardWrite(t({ en: "conversation history", zh: "对话记录" })) : onOpenHistory();
  // W0014：示例里只有那条示例问答（`openableSessions`）能打开——壳以只读对话显示它；其余照旧拦下。
  const openSession = (sessionId: string) =>
    guardWrite && !demoData?.openableSessions.includes(sessionId) ? guardWrite(chatLabel) : onOpenSession(sessionId);
  // 示例条目指向的是示例人物的数据，跳过去只会是别人的页面或 404：一律拦下。
  const openItem = (item: TodayItem) => {
    if (!item.primary) return;
    if (guardWrite) {
      guardWrite(demoData?.writeLabels[item.key] ?? t({ en: "today's items", zh: "今日要事" }));
      return;
    }
    if (item.open) {
      item.open();
      return;
    }
    navigate(item.primary.href);
  };
  const refreshNow = () => {
    if (guardWrite) {
      guardWrite(t({ en: "today's items", zh: "今日要事" }));
      return;
    }
    void refreshSignals(true);
  };

  // 「审阅修订」37：四个来源都不是 pending 了才算就绪，像素比对按它等待。
  const ready =
    snapshot !== "pending" &&
    ledger !== "pending" &&
    plan !== "pending" &&
    signals !== "pending" &&
    sessions !== "pending" &&
    pendingCardsState.status !== "pending";
  // W0036：计划行动是要事来源，计划读到之前不下「没有要紧的事」的结论。
  const itemsSettled =
    snapshot !== "pending" &&
    signals !== "pending" &&
    plan !== "pending" &&
    pendingCardsState.status !== "pending";
  // 任一核心来源读不到时，不能给出「今天没有要紧的事」这种确定结论。
  // 跟进来源（排序运行时未验证等）单独失败时 snapshot 仍可用，也要算进来（W0025）。
  const followupsUnavailable = facts?.followups.state === "unavailable";
  const partial =
    snapshot === "unavailable" ||
    followupsUnavailable ||
    signals === "unavailable" ||
    pendingCardsState.status === "unavailable";

  const lead = items[0] ?? null;
  const briefs = items.slice(1, expanded ? items.length : VISIBLE_ITEMS);
  const hiddenCount = Math.max(0, items.length - VISIBLE_ITEMS);

  // 导语：一句话概括今天，只用真实计数（Q9）。最紧的一件若有时间压力，钟点用暖色。
  // 暖色一屏不超过 3 处（主稿序号、倒计时、「现在」线），导语只用墨色强调。
  const lede = weeklySummary && monday && !demoActive ? (
    weeklySummaryLede(weeklySummary, lang)
  ) : !itemsSettled ? (
    t({ en: "Reading your day…", zh: "正在整理今天的事…" })
  ) : lead?.kind ? (
    // W0036：第一条是计划行动或补人脉时，导语只说可以推进的一步。
    <>
      {t({ en: "One step you can take today: ", zh: "今天可以推进一步：" })}
      <strong>{lead.title}</strong>
      {t({ en: ".", zh: "。" })}
    </>
  ) : lead ? (
    <>
      {t({ en: "Today there are ", zh: "今天有 " })}
      <strong>
        {partial
          ? t({ en: `at least ${items.length} thing(s)`, zh: `至少 ${items.length} 件事` })
          : t({ en: `${items.length} thing(s)`, zh: `${items.length} 件事` })}
      </strong>
      {t({ en: ". The most pressing: ", zh: "，最紧的是：" })}
      <strong>{lead.title}</strong>
      {t({ en: ".", zh: "。" })}
    </>
  ) : partial ? (
    t({ en: "Part of today's data can't be read right now.", zh: "今天的部分数据暂时读取不到。" })
  ) : todayRows.length > 0 ? (
    t({
      en: `Nothing pressing today. ${todayRows.length} item(s) on the schedule.`,
      zh: `今天没有要紧的事，日程上有 ${todayRows.length} 项安排。`,
    })
  ) : !eventPoolReady ? (
    // 空日导语要引池里的活动：池还在补查计划活动时先不下「没有要紧的事」的结论，免得导语跳变。
    t({ en: "Reading your day…", zh: "正在整理今天的事…" })
  ) : eventPool[0] ? (
    // W0036：空日导语引一场池里的活动（不写活动类型：目录里没有这个字段）。
    <>
      {t({
        en: `Nothing on today. On ${fmtDay(eventPool[0].startsAt)} there's an event that may suit you: `,
        zh: `今天没有安排，${fmtDay(eventPool[0].startsAt)} 有一场适合你的活动：`,
      })}
      <strong>{eventPool[0].title}</strong>
      {t({ en: ".", zh: "。" })}
    </>
  ) : (
    t({ en: "Nothing pressing today.", zh: "今天没有要紧的事。" })
  );

  const signalOps = (item: TodayItem) =>
    item.kind === "plan" && item.planItemId ? (
      <span className="ir-m-ops">
        <button
          className="btn ir-signal-op"
          data-orbit-today-plan-done={item.planItemId}
          disabled={planBusyId !== null}
          onClick={() => void togglePlanAction(item.planItemId!, true)}
          type="button"
        >
          {t({ en: "Done", zh: "完成" })}
        </button>
        <button
          className="btn ir-signal-op"
          data-orbit-today-plan-skip={item.planItemId}
          onClick={() => skipPlanToday(item.planItemId!)}
          type="button"
        >
          {t({ en: "Not today", zh: "今天先不做" })}
        </button>
      </span>
    ) : item.kind === "nudge" ? (
      <span className="ir-m-ops">
        <button className="btn ir-signal-op" data-orbit-today-nudge-dismiss onClick={dismissNudge} type="button">
          {t({ en: "Don't remind me for 7 days", zh: "7 天内不再提示" })}
        </button>
      </span>
    ) : item.signalId ? (
      <span className="ir-m-ops">
        {item.ask ? (
          <button
            className="btn ir-m-link"
            data-orbit-agent-signal-ask={item.signalId}
            onClick={() => askSignal(item.ask!.prompt)}
            type="button"
          >
            {item.ask.label}
          </button>
        ) : null}
        <button
          className="btn ir-signal-op"
          disabled={signalBusyId === item.signalId}
          onClick={() => void updateSignal(item.signalId!, "dismissed")}
          type="button"
        >
          {t({ en: "Done", zh: "完成" })}
        </button>
        <button
          className="btn ir-signal-op"
          disabled={signalBusyId === item.signalId}
          onClick={() => void updateSignal(item.signalId!, "snoozed")}
          type="button"
        >
          {t({ en: "Remind tomorrow", zh: "明天提醒" })}
        </button>
      </span>
    ) : null;

  // W0036：计划行动的标题可点，去联系人／活动／计划页对应行（与主按钮同一个去处）。
  const titleOf = (item: TodayItem) =>
    item.kind === "plan" && item.primary ? (
      <a
        className="ir-m-title-link"
        data-orbit-today-plan-title={item.planItemId}
        href={item.primary.href}
        onClick={(event) => {
          event.preventDefault();
          openItem(item);
        }}
      >
        {item.title}
      </a>
    ) : (
      item.title
    );

  const proofLine = (proof: TodayItem["proof"]) =>
    proof.length > 0 ? (
      <span className="ir-m-proof">
        {proof.map(([label, value]) => (
          <span key={`${label}:${value}`}>
            <b>{label}</b>
            {value}
          </span>
        ))}
      </span>
    ) : null;

  // 时间线：今天在第一条未开始的项前插「现在」线。
  const nowMs = now.getTime();
  const nowIndex = isTodaySelected
    ? selectedRows.findIndex((row) => !row.allDay && row.startMs > nowMs)
    : -1;
  const nowLabel = t({ en: `Now ${fmtTime(now.toISOString())}`, zh: `现在 ${fmtTime(now.toISOString())}` });

  return (
    <div className="ir-home" data-orbit-iorbit-ready={ready ? "true" : "false"}>
      {/* 报头 */}
      <header className="ir-m-mast">
        <div className="ir-m-mast-row">
          <span className="ir-m-title">
            <h1 className="ir-h1 ir-m-h1">iOrbit</h1>
            <OrbitMark />
          </span>
          <span className="ir-m-date">
            {dateMain}
            <small>{weekday}</small>
          </span>
        </div>
        <p className="ir-m-lede" data-orbit-home-lede={weeklySummary && monday && !demoActive ? "weekly" : "today"}>
          {lede}
        </p>
      </header>

      <div className="ir-m-spread">
        {/* 左宽栏：今日要事 + 追问 */}
        <section aria-label={t({ en: "Today", zh: "今日要事" })} className="ir-m-main">
          <div className="ir-m-label">
            <span>{t({ en: "TODAY", zh: "今日要事" })}</span>
            <span className="ir-m-label-side">
              {items.length > 0 ? (
                <em>
                  {t({
                    en: `${Math.min(items.length, expanded ? items.length : VISIBLE_ITEMS)} of ${items.length}`,
                    zh: `${Math.min(items.length, expanded ? items.length : VISIBLE_ITEMS)} / 共 ${items.length} 件`,
                  })}
                </em>
              ) : null}
              <button
                className="btn ir-refresh"
                data-orbit-agent-signals-refresh
                disabled={signalsRefreshing}
                onClick={refreshNow}
                type="button"
              >
                {signalsRefreshing
                  ? t({ en: "Refreshing", zh: "刷新中" })
                  : t({ en: "Refresh", zh: "刷新" })}
              </button>
            </span>
          </div>

          {partial && lead ? (
            <p className="ir-m-partial" role="status">
              {snapshot === "unavailable"
                ? t({ en: "Schedule and follow-ups can't be read right now; this list may be incomplete.", zh: "日程与跟进暂时读取不到，下面的要事可能不完整。" })
                : followupsUnavailable
                  ? t({ en: "Follow-ups can't be read right now; this list may be incomplete.", zh: "跟进暂时读取不到，下面的要事可能不完整。" })
                  : t({ en: "Relationship signals can't be read right now; this list may be incomplete.", zh: "关系信号暂时读取不到，下面的要事可能不完整。" })}
            </p>
          ) : null}
          {signalError ? (
            <p className="ir-note ir-note-error" role="alert">
              {signalError}
            </p>
          ) : null}
          {/* W0036：今日要事里勾掉失败时，这里也要看得到（本周推进那一列照旧提示）。 */}
          {planError && items.some((item) => item.kind === "plan") ? (
            <p className="ir-m-plan-alert" data-orbit-today-plan-error role="alert">
              {planError}
            </p>
          ) : null}

          {lead ? (
            <article
              className="ir-m-lead"
              data-orbit-agent-signal={lead.signalId ?? undefined}
            >
              <span className={lead.hot ? "ir-m-ord ir-m-ord-hot" : "ir-m-ord"}>1</span>
              <div className="ir-m-lead-body">
                {lead.pills.length > 0 || demoActive ? (
                  <span className="ir-m-pills">
                    {lead.pills.map((pill) => (
                      <span className={pill.hot ? "ir-m-pill ir-m-pill-hot" : "ir-m-pill"} key={pill.text}>
                        {pill.text}
                      </span>
                    ))}
                    {demoActive ? <DemoTag /> : null}
                  </span>
                ) : null}
                <h2 className="ir-m-lead-title">{titleOf(lead)}</h2>
                {lead.why ? <p className="ir-m-why">{lead.why}</p> : null}
                {proofLine(lead.proof)}
                <span className="ir-m-acts">
                  {lead.primary ? (
                    <button
                      className="btn ir-m-primary"
                      onClick={() => openItem(lead)}
                      type="button"
                    >
                      {lead.primary.label}
                    </button>
                  ) : null}
                  {signalOps(lead)}
                </span>
              </div>
            </article>
          ) : (
            <p className="ir-m-quiet">
              {!itemsSettled
                ? t({ en: "Checking what needs you today…", zh: "正在核对今天需要你处理的事…" })
                : partial
                  ? t({
                      en: "Some sources are unavailable, so we can't confirm whether anything needs you today.",
                      zh: "部分数据来源暂时不可用，无法确认今天是否有要紧的事。",
                    })
                  : t({
                      en: "You are caught up. Nothing needs you right now.",
                      zh: "今天没有必须处理的事。",
                    })}
            </p>
          )}

          {briefs.length > 0 ? (
            <div className="ir-m-briefs">
              {briefs.map((item, index) => (
                <div
                  className="ir-m-brief"
                  data-orbit-agent-signal={item.signalId ?? undefined}
                  key={item.key}
                >
                  <span className="ir-m-brief-n">{index + 2}</span>
                  <span className="ir-m-brief-body">
                    <strong className="ir-m-brief-title">
                      {titleOf(item)}
                      {demoActive ? <DemoTag /> : null}
                    </strong>
                    {item.kind && item.pills.length > 0 ? (
                      <span className="ir-m-pills">
                        {item.pills.map((pill) => (
                          <span className="ir-m-pill" key={pill.text}>
                            {pill.text}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {proofLine(item.proof)}
                    {signalOps(item)}
                  </span>
                  {item.primary ? (
                    <button
                      className="btn ir-m-go"
                      onClick={() => openItem(item)}
                      type="button"
                    >
                      {item.primary.label} →
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {hiddenCount > 0 ? (
            <button
              aria-expanded={expanded}
              className="btn ir-m-more"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded
                ? t({ en: "Show less ▴", zh: "收起 ▴" })
                : t({ en: `${hiddenCount} more ▾`, zh: `还有 ${hiddenCount} 件 ▾` })}
            </button>
          ) : null}

          {/* 追问条：原顶部大输入框 + chips + 「打开对话」合并（Q11） */}
          <div className="ir-m-ask">
            <span aria-hidden className="ir-m-ask-mark">
              ✦
            </span>
            <input
              aria-label={t({ en: "Ask iOrbit", zh: "向 iOrbit 提问" })}
              className="ir-m-ask-input"
              data-orbit-iorbit-ask-input
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              placeholder={t({
                en: "Anything else to move forward? Ask iOrbit",
                zh: "还有别的想推进？问 iOrbit",
              })}
              value={draft}
            />
            <button
              aria-label={t({ en: "Send", zh: "发送" })}
              className="btn ir-ask-send"
              onClick={submitDraft}
              type="button"
            >
              →
            </button>
            <span aria-hidden className="ir-m-ask-divider" />
            <button
              aria-label={t({ en: "Open chat", zh: "打开对话" })}
              className="btn ir-m-chat"
              onClick={openChat}
              title={t({ en: "Open chat", zh: "打开对话" })}
              type="button"
            >
              <svg aria-hidden fill="none" height="18" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" width="18">
                <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
              </svg>
            </button>
          </div>
        </section>

        {/* 右窄栏：时间（Q12） */}
        <aside className="ir-m-aside" id="calendar">
          <div data-orbit-iorbit-day-panel>
            <div className="ir-m-label">
              <span>
                {isTodaySelected
                  ? t({ en: "TODAY'S SCHEDULE", zh: "今天" })
                  : iorbitSelectedDayLabel(todayYear, todayMonth, selectedDay, lang)}
              </span>
              <span className="ir-m-label-side">
                <em>{t({ en: `${selectedRows.length} item(s)`, zh: `${selectedRows.length} 个日程` })}</em>
                {!isTodaySelected ? (
                  <button className="btn ir-m-link" onClick={() => setSelectedDay(todayDay)} type="button">
                    {t({ en: "Back to today", zh: "回到今天" })}
                  </button>
                ) : null}
              </span>
            </div>
            {selectedRows.length > 0 ? (
              <div className="ir-m-tl">
                {selectedRows.map((row, index) => (
                  <div key={row.id}>
                    {index === nowIndex ? <div className="ir-m-now">{nowLabel}</div> : null}
                    <div
                      className={
                        isTodaySelected && !row.allDay && row.startMs <= nowMs
                          ? "ir-m-tl-item ir-m-tl-past"
                          : "ir-m-tl-item"
                      }
                    >
                      <span className="ir-m-tl-time">{row.time}</span>
                      <span className="ir-m-tl-copy">
                        <strong className="ir-agenda-title">
                          {row.title}
                          {demoActive ? <DemoTag /> : null}
                        </strong>
                        <span className="ir-m-tl-sub">{row.meta}</span>
                      </span>
                    </div>
                  </div>
                ))}
                {isTodaySelected && nowIndex === -1 ? <div className="ir-m-now">{nowLabel}</div> : null}
              </div>
            ) : (
              <>
              {isTodaySelected && snapshot !== "pending" ? <div className="ir-m-now">{nowLabel}</div> : null}
              <p className="ir-m-tl-empty">
                {snapshot === "pending"
                  ? t({ en: "Reading your schedule…", zh: "正在读取日程…" })
                  : snapshot === "unavailable"
                    ? t({ en: "The schedule source is unavailable right now.", zh: "日程来源暂时不可用。" })
                    : isTodaySelected
                      ? t({ en: "Nothing confirmed for today.", zh: "今天没有已确认的日程。" })
                      : t({ en: "Nothing scheduled.", zh: "这一天没有日程。" })}
              </p>
              </>
            )}
          </div>

          <div className="ir-m-cal" data-open={calOpen ? "true" : "false"}>
            <div className="ir-m-cal-head">
              <strong>{monthLabel}</strong>
              <span className="ir-m-cal-head-side">
                {/* 只在窄屏出现：默认只露出本周一行 */}
                <button
                  aria-expanded={calOpen}
                  className="btn ir-m-link ir-m-cal-toggle"
                  onClick={() => setCalOpen((value) => !value)}
                  type="button"
                >
                  {calOpen ? t({ en: "Week ▴", zh: "收起月历 ▴" }) : t({ en: "Month ▾", zh: "月历 ▾" })}
                </button>
                <a className="ir-m-cal-link" href="/app/agent/plan">
                  {t({ en: "Schedule →", zh: "日程页 →" })}
                </a>
              </span>
            </div>
            <div className="ir-m-cal-wd">
              {weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className="ir-m-cal-days">
              {cells.map((day, index) =>
                day === null ? (
                  <span
                    className={Math.floor(index / 7) === todayWeek ? undefined : "ir-m-off-week"}
                    key={`blank-${index}`}
                  />
                ) : (
                  <button
                    aria-label={iorbitSelectedDayLabel(todayYear, todayMonth, day, lang)}
                    aria-pressed={day === selectedDay}
                    className={day === selectedDay ? "btn ir-day ir-day-on" : "btn ir-day"}
                    data-orbit-iorbit-day={day}
                    data-off-week={Math.floor(index / 7) === todayWeek ? undefined : "true"}
                    data-today={day === todayDay ? "true" : undefined}
                    key={`day-${day}`}
                    onClick={() => setSelectedDay(day)}
                    type="button"
                  >
                    {day}
                    <span className={markedDays.has(day) ? "ir-day-dot ir-day-dot-a" : "ir-day-dot"} />
                  </button>
                ),
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 栏目区（Q14） */}
      <section aria-label={t({ en: "Columns", zh: "栏目" })} className="ir-m-cols">
        {planSummary ? (
          <div className="ir-m-col" data-orbit-iorbit-week="plan">
            <div className="ir-m-col-head">
              <h3>{t({ en: "This week", zh: "本周推进" })}</h3>
              <em className="ir-m-plan-week">
                {lang === "zh"
                  ? `第 ${planSummary.week} 周 / 共 ${planSummary.totalWeeks} 周`
                  : `Week ${planSummary.week} of ${planSummary.totalWeeks}`}
              </em>
            </div>
            {planSummary.phaseTitle ? (
              <p className="ir-m-plan-phase">
                {lang === "zh" ? `第 ${planSummary.phaseNo} 阶段 · ` : `Phase ${planSummary.phaseNo} · `}
                <b>{planSummary.phaseTitle}</b>
              </p>
            ) : null}
            {planError ? (
              <p className="ir-m-plan-alert" role="alert">
                {planError}
              </p>
            ) : null}
            {planSummary.actions.length > 0 ? (
              <ul className="ir-m-plan-acts">
                {planSummary.actions.map((action) => (
                  <li
                    className={action.done ? "ir-m-plan-act ir-m-plan-act-done" : "ir-m-plan-act"}
                    data-orbit-iorbit-plan-action={action.id}
                    key={action.id}
                  >
                    <button
                      aria-checked={action.done}
                      aria-label={action.title}
                      className="btn ir-m-plan-box"
                      disabled={planBusyId === action.id}
                      onClick={() => void togglePlanAction(action.id, !action.done)}
                      role="checkbox"
                      type="button"
                    />
                    <span>{action.title}</span>
                    {action.weeksOverdue > 0 ? (
                      <small>
                        {lang === "zh" ? `已延后 ${action.weeksOverdue} 周` : `Pushed back ${action.weeksOverdue} wk`}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ir-m-empty">{t({ en: "Nothing left to do this week.", zh: "这周没有待办的行动。" })}</p>
            )}
            <span className="ir-m-plan-counts">
              <span>
                {t({ en: "Actions ", zh: "行动 " })}
                <b>
                  {planSummary.actionsDone}/{planSummary.actionsTotal}
                </b>
              </span>
              <span>
                {t({ en: "Connected ", zh: "已建立联系 " })}
                <b>{planSummary.contactsEstablished}</b>
                {t({ en: "", zh: " 位" })}
              </span>
            </span>
            <a className="ir-m-plan-link" href="/app/agent/plan">
              {t({ en: "See the full plan →", zh: "查看完整计划 →" })}
            </a>
          </div>
        ) : (
          <div className="ir-m-col">
            <div className="ir-m-col-head">
              <h3>{t({ en: "This week", zh: "本周推进" })}</h3>
              <a href="/app/agent/plan">{t({ en: "Plan →", zh: "执行计划 →" })}</a>
            </div>
            <p className="ir-m-goal">
              {home?.account.relationshipGoal?.trim() ||
                t({ en: "No goal on your profile yet.", zh: "还没有设定目标。" })}
            </p>
            <span className="ir-m-bar">
              <span className="ir-m-bar-track">
                <span className="ir-m-bar-fill" style={{ width: progress ? `${progress.percent}%` : "0%" }} />
              </span>
              <strong className="ir-progress-value">
                {progress ? `${progress.done}/${progress.total}` : "—"}
              </strong>
            </span>
            {focusTasks.length > 0 ? (
              <ul className="ir-m-tasks">
                {focusTasks.map((entry) => {
                  const done = entry.status === "completed";
                  return (
                    // 账本任务没有写接口：渲染为静态状态标记，不做假按钮。
                    <li className={done ? "ir-m-task ir-m-task-done" : "ir-m-task"} key={entry.entryId}>
                      {entry.title}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ir-m-empty">
                {ledger === "pending"
                  ? t({ en: "Reading your plan…", zh: "正在读取执行计划…" })
                  : ledger === "unavailable"
                    ? t({ en: "The plan source is unavailable right now.", zh: "执行计划来源暂时不可用。" })
                    : t({ en: "No task is in progress this week.", zh: "这周还没有进行中的任务。" })}
              </p>
            )}
            <span className="ir-m-strategy">
              <a href="/app/agent/strategy?view=contacts">
                {t({ en: "Who should I contact first? →", zh: "我该先联系谁 →" })}
              </a>
              <a href={guideEnabled ? "/app/start?step=3" : "/app/agent/strategy"}>
                {t({ en: "Draft a plan →", zh: "帮我制定推进计划 →" })}
              </a>
            </span>
          </div>
        )}

        <div className="ir-m-col">
          <div className="ir-m-col-head">
            <h3>{t({ en: "Registered events", zh: "已报名活动" })}</h3>
            <a href="/app/events">{t({ en: "All events →", zh: "全部活动 →" })}</a>
          </div>
          {/* 社群行（W0003）：永远在栏首，标「社群」而不是日期，不计入下面两场真实活动。 */}
          <a
            className="ir-m-event ir-m-community"
            data-orbit-iorbit-community={communityJoined ? "joined" : "invite"}
            href="/app/events#iorbit-community"
          >
            <span className="ir-m-event-date">
              {t({ en: "Always", zh: "常驻" })}
              <small>{t({ en: "Community", zh: "社群" })}</small>
            </span>
            <span className="ir-m-event-copy">
              {communityJoined ? (
                <>
                  <strong>{t({ en: "Joined the community", zh: "已加入社群" })}</strong>
                  <span>{t({ en: "iOrbit user community", zh: "iOrbit 用户社群" })}</span>
                </>
              ) : (
                <>
                  <strong>{t(COMMUNITY_CONFIG.name)}</strong>
                  <span>{t({ en: "Community · free · always open", zh: "社群 · 免费 · 长期有效" })}</span>
                </>
              )}
            </span>
          </a>
          {registeredEvents.length > 0 ? (
            registeredEvents.slice(0, 2).map((event) => {
              const start = new Date(event.startsAt);
              return (
                <a
                  className="ir-m-event"
                  href={`/app/events/${encodeURIComponent(event.id)}`}
                  key={event.id}
                  onClick={
                    guardWrite
                      ? (clickEvent) => {
                          clickEvent.preventDefault();
                          guardWrite(t({ en: "registered events", zh: "已报名活动" }));
                        }
                      : undefined
                  }
                >
                  <span className="ir-m-event-date">
                    {fmtDay(event.startsAt)}
                    <small>
                      {new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short" }).format(start)}{" "}
                      {fmtTime(event.startsAt)}
                    </small>
                  </span>
                  <span className="ir-m-event-copy">
                    <strong>{event.name}</strong>
                    <span>{event.venue || event.place}</span>
                  </span>
                </a>
              );
            })
          ) : (
            <p className="ir-m-empty">
              {t({ en: "No registered events yet.", zh: "还没有报名活动。" })}{" "}
              <a href="/app/events">{t({ en: "See recommendations →", zh: "看看推荐 →" })}</a>
            </p>
          )}
        </div>

        <div className="ir-m-col">
          <div className="ir-m-col-head">
            <h3>{t({ en: "Recent chats", zh: "最近对话" })}</h3>
            <span className="ir-m-col-acts">
              <button className="btn ir-history-btn" onClick={openHistory} type="button">
                {t({ en: "History", zh: "历史记录" })}
              </button>
              <button className="btn ir-enter-btn" onClick={openChat} type="button">
                {t({ en: "Open chat →", zh: "进入对话 →" })}
              </button>
            </span>
          </div>
          {recentSessions.length > 0 ? (
            <div className="ir-m-sessions">
              {recentSessions.map((item) => {
                const when = item.createdAt ? iorbitRelativeDayLabel(item.createdAt, now, lang) : null;
                return (
                  <button
                    className="btn ir-m-session"
                    data-orbit-iorbit-session={item.id}
                    key={item.id}
                    onClick={() => openSession(item.id)}
                    type="button"
                  >
                    <span className="ir-m-session-title">
                      {item.title || t({ en: "Untitled chat", zh: "未命名对话" })}
                    </span>
                    <time>
                      {when
                        ? t({ en: `Last chat · ${when}`, zh: `上次对话 · ${when}` })
                        : t({ en: "Last chat", zh: "上次对话" })}
                    </time>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="ir-m-empty">
              {sessions === "pending"
                ? t({ en: "Reading your conversations…", zh: "正在读取对话记录…" })
                : t({ en: "No conversation yet. Ask in the box above.", zh: "还没有对话。有问题在上面的输入框里问。" })}
            </p>
          )}
        </div>
      </section>
      {matchSheet ? (
        <PlanMatchDialog label={t({ en: "Plan matches", zh: "计划匹配" })} onClose={() => setMatchSheet(null)}>
          <PlanMatchSheet
            candidates={matchSheet}
            onDecided={(candidateId, decision) => {
              setMatches((current) => (current ? withoutCandidate(current, candidateId) : current));
              // 确认后本周多了一条「约 TA」：重新读计划，本周推进跟着更新。
              if (decision === "accept") {
                void fetchCurrentPlan(undefined, { view: "home" })
                  .then((value) => setPlan(value))
                  .catch(() => undefined);
              }
            }}
          />
        </PlanMatchDialog>
      ) : null}
    </div>
  );
}
