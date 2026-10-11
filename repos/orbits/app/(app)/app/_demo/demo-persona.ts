/**
 * 引导期示例人物（W0004；W0005 人脉页复用）。
 *
 * R25：v1「我的计划」页与对话里的计划卡片已删除，示例计划（W0014 `buildDemoPlanSnapshot`）随之删除；
 * 最近对话里那条「我该如何实现目标？」只作为列表行保留，点开和其余示例会话一样被拦下。
 *
 * 来源：已确认的 iOrbit 计划原型（第 9 版）里的示例——一位在东京做 AI 会议纪要 SaaS、
 * 正在把产品推到日本市场的创始人，12 周计划的第 1 阶段「摸清需求」。
 *
 * 规则：
 *   - 只在前端，不写库、不进入任何接口请求；
 *   - 形状与概览屏真实使用的视图数据完全相同（home view model、D25 facts、信号、账本、
 *     会话），`iorbit-home.tsx` 用同一套渲染路径渲染它，不为示例另写一份 UI；
 *   - 时间按「东京的今天」生成，示例时钟固定在 11:40（与原型的「14:00 会面，还有两个多小时」
 *     一致），所以每天打开都是「今天」这一天。
 */
import type { AgentLedgerEntry } from "../../../../features/agent/ledger/contract";
import { planTaskSegmentHref } from "../../../../shared/compute/plan-href";
import type { HomeDashboardSnapshot } from "../agent/home-dashboard-route-service";
import type { AgentTodaySignalView } from "../agent/orbit-agent-next-actions";
import { iorbitDayKey } from "../agent/iorbit-0918/iorbit-model";
import type { OrbitHomeViewModel } from "../orbit-home-route-view-model";
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { DEMO_CLOCK_TIME, demoNow } from "./demo-clock";

type Lang = "en" | "zh";
type Copy = { en: string; zh: string };

/** 示例时钟（`DEMO_CLOCK_TIME` / `demoNow`）在 `demo-clock.ts`，这里原样转出。 */
export { DEMO_CLOCK_TIME, demoNow };

/** 示例人物的目标（也是「本周推进」栏首的一句）。 */
export const DEMO_GOAL: Copy = {
  en: "Get 5 Japanese SMEs trialling our AI meeting notes this quarter, starting in Tokyo.",
  zh: "本季度找到 5 家日本中小企业试用我们的 AI 会议纪要，先从东京开始。",
};

/** 示例人物的人脉（W0005 人脉页复用）：姓名、公司、职位。 */
export const DEMO_PEOPLE = [
  { company: "北辰精工", name: "王砚", role: { en: "Head of Procurement", zh: "采购部长" } },
  { company: "丸和工业", name: "佐藤美咲", role: { en: "IT Systems Manager", zh: "情报系统课长" } },
  { company: "Cloudia", name: "林志远", role: { en: "Partner Sales", zh: "合作伙伴营业" } },
  { company: "丸和工业", name: "铃木健", role: { en: "Head of IT Systems", zh: "情报系统部 部长" } },
  { company: "JETRO 东京", name: "山田太郎", role: { en: "Investment Advisor", zh: "投资咨询顾问" } },
  { company: "东京商工会议所", name: "中村惠", role: { en: "SME Support", zh: "中小企业支援课" } },
] as const;

export interface DemoHomeSession {
  createdAt: string;
  id: string;
  title: string;
}

/** 概览屏的整份示例数据：每一项都是真实数据源的同形状替身。 */
export interface DemoHomeData {
  home: OrbitHomeViewModel;
  ledger: readonly AgentLedgerEntry[];
  sessions: readonly DemoHomeSession[];
  signals: readonly AgentTodaySignalView[];
  snapshot: HomeDashboardSnapshot;
  /**
   * 示例期间可以打开的最近对话（W0014）：只读，回答来自示例数据；其余会话点了照旧拦截。
   */
  openableSessions: readonly string[];
  /**
   * 今日要事里各条目被拦截时弹层说的「这里会是你自己的 ___」。键是概览屏的条目 key
   * （`signal:<id>`、`personal:<key>`），缺省时用「今日要事」。
   */
  writeLabels: Readonly<Record<string, string>>;
}

/** 最近对话里的示例问答（「根据我的目标和人脉信息，我该如何实现目标？」），回答是示例计划卡片。 */
export const DEMO_PLAN_SESSION_ID = "demo-session-plan";

/** 那条示例问答的问题（最近对话的标题 = 计划卡片上方的用户气泡）。 */
const DEMO_PLAN_QUESTION: Copy = {
  en: "Given my goal and my network, how do I get there?",
  zh: "根据我的目标和人脉信息，我该如何实现目标？",
};

/** 东京某天某钟点的绝对时间。 */
function jstAt(dayKey: string, time: string): Date {
  return new Date(`${dayKey}T${time}:00+09:00`);
}

function shiftDay(dayKey: string, days: number): string {
  const noon = jstAt(dayKey, "12:00");
  return iorbitDayKey(new Date(noon.getTime() + days * 86_400_000));
}

function demoEvent(input: {
  id: string;
  name: string;
  startsAt: Date;
  venue: string;
  hours: number;
}): OrbitLandingEventView {
  return {
    address: input.venue,
    agenda: [],
    brandColor: "#4B4FC7",
    code: input.id,
    descriptionZh: "",
    detailLogoUrl: "",
    endsAt: new Date(input.startsAt.getTime() + input.hours * 3_600_000).toISOString(),
    feeLabel: "",
    host: "JETRO",
    id: input.id,
    industry: "",
    logoUrl: "",
    mapX: 0,
    mapY: 0,
    name: input.name,
    organizer: "JETRO",
    participantCount: null,
    place: input.venue,
    startsAt: input.startsAt.toISOString(),
    stats: { attendees: [], authed: true, count: null, youRsvped: true },
    status: "upcoming",
    summaryZh: "",
    tags: [],
    theme: "",
    venue: input.venue,
    youRsvped: true,
  };
}

function demoLedgerEntry(input: {
  id: string;
  status: AgentLedgerEntry["status"];
  title: string;
  at: string;
}): AgentLedgerEntry {
  return {
    autonomousExecutionStarted: false,
    createdAt: input.at,
    entryId: input.id,
    evidenceChips: [],
    evidenceIds: [],
    externalSideEffectExecuted: false,
    messageAutoSendExecuted: false,
    operations: [],
    provenance: {
      autonomousExecutionStarted: false,
      collectedAt: input.at,
      evidenceIds: [],
      externalNetworkRequested: false,
      externalSideEffectExecuted: false,
      generationMethod: "fixture",
      liveDatabaseReadExecuted: false,
      liveDatabaseWriteExecuted: false,
      messageAutoSendExecuted: false,
      privacy: "demo-agent-ledger-only",
      source: "iorbit-guide-demo",
      sourceLabel: "iOrbit guide demo persona",
    },
    sourceRefs: [],
    status: input.status,
    title: input.title,
    undoable: false,
    updatedAt: input.at,
    whyNow: "",
  };
}

function demoSignal(input: {
  id: string;
  type: AgentTodaySignalView["type"];
  severity: AgentTodaySignalView["severity"];
  title: string;
  reason: string;
  sources: AgentTodaySignalView["sources"];
  open: { href: string; label: string };
  ask?: string;
  at: string;
}): AgentTodaySignalView {
  return {
    actions: [
      { actionId: "open", href: input.open.href, label: input.open.label },
      ...(input.ask
        ? [{ actionId: "ask_agent" as const, href: "/app/agent", label: "iOrbit", prompt: input.ask }]
        : []),
    ],
    changes: [],
    confidence: 0.9,
    lastObservedAt: input.at,
    reason: input.reason,
    severity: input.severity,
    signalId: input.id,
    sources: input.sources,
    status: "new",
    summary: input.reason,
    title: input.title,
    type: input.type,
  };
}

/**
 * 示例人物在「东京的今天」的一整天。`real` 只决定是哪一天；钟点固定（见 `demoNow`）。
 */
export function buildDemoHomeData(real: Date, lang: Lang): DemoHomeData {
  const L = (copy: Copy) => copy[lang];
  const today = iorbitDayKey(real);
  const at = (days: number, time: string) => jstAt(shiftDay(today, days), time).toISOString();

  const meeting = {
    id: "demo-personal-wang",
    key: "demo-personal-wang",
    occurrenceDate: today,
    startsAt: at(0, "14:00"),
    endsAt: at(0, "15:00"),
    state: "active",
    timeZone: "Asia/Tokyo",
    title: L({ en: "Meet Wang Yan · Hokushin Seiko (Marunouchi)", zh: "和王砚见面 · 北辰精工（丸之内）" }),
  };

  // 概览屏只读 facts 的 personal / appointments / followups 三段；其余字段示例不需要。
  const snapshot = {
    facts: {
      appointments: { items: [], state: "ready" },
      followups: { current: { items: [] }, state: "ready" },
      personal: { items: [meeting], state: "ready" },
    },
    snapshotAt: at(0, DEMO_CLOCK_TIME),
  } as unknown as HomeDashboardSnapshot;

  const signals = [
    demoSignal({
      ask: L({
        en: "Help me prepare for today's meeting with Wang Yan: how do I ask him to introduce Suzuki from IT?",
        zh: "帮我准备今天和王砚的会面：怎么请他介绍 IT 部门的铃木？",
      }),
      at: at(0, "08:00"),
      id: "demo-signal-wang",
      open: { href: "/app/tasks?tab=calendar", label: L({ en: "Meeting prep", zh: "看会面准备" }) },
      reason: L({
        en: "Phase 1 of your plan needs an SME IT decision-maker. Wang Yan runs procurement, and on your last call he said Suzuki is the one who buys systems.",
        zh: "你的计划第 1 阶段要认识「中小企业 IT 负责人」。王砚是采购部长，上次通话时提到铃木才是系统采购的决策人。",
      }),
      severity: "critical",
      sources: [
        { capturedAt: at(-3, "10:00"), sourceLabel: L({ en: "Schedule", zh: "日程" }) },
        { capturedAt: at(-1, "17:30"), sourceLabel: L({ en: "Progress log", zh: "进展记录" }) },
      ],
      title: L({
        en: "14:00 meet Wang Yan and ask him to introduce Suzuki from IT",
        zh: "14:00 和王砚见面，请他介绍 IT 部门的铃木",
      }),
      type: "event_upcoming",
    }),
    demoSignal({
      at: at(-1, "22:14"),
      id: "demo-signal-new-cards",
      open: { href: "/app/contacts", label: L({ en: "Review", zh: "去确认" }) },
      reason: L({
        en: "Suzuki Ken and Takahashi Yumi were imported last night; their roles match two people your plan is looking for.",
        zh: "昨晚导入的铃木健、高桥由美，职位和计划里要找的两类人对得上。",
      }),
      severity: "high",
      sources: [{ capturedAt: at(-1, "22:14"), sourceLabel: L({ en: "Business cards", zh: "名片" }) }],
      title: L({
        en: "2 new contacts may match people your plan needs",
        zh: "2 位新联系人可能对应你计划里的人脉需求",
      }),
      type: "relationship_stale",
    }),
    demoSignal({
      at: at(0, "09:00"),
      id: "demo-signal-sato",
      open: { href: planTaskSegmentHref("web"), label: L({ en: "Pick a time", zh: "定时间" }) },
      reason: L({
        en: "Sato Misaki was just linked to the plan's “SME IT lead” need.",
        zh: "佐藤美咲刚关联到计划里的人脉需求「中小企业 IT 负责人」。",
      }),
      severity: "medium",
      sources: [{ capturedAt: at(0, "09:00"), sourceLabel: L({ en: "Plan", zh: "计划" }) }],
      title: L({ en: "Set up a meeting with Sato Misaki", zh: "约佐藤美咲见面" }),
      type: "followup_due",
    }),
    demoSignal({
      at: at(-45, "10:00"),
      id: "demo-signal-lin",
      open: { href: "/app/contacts", label: L({ en: "Open", zh: "打开" }) },
      reason: L({
        en: "You last talked about channel revenue share six weeks ago.",
        zh: "上次聊日本 SaaS 渠道分成是六周前。",
      }),
      severity: "low",
      sources: [{ capturedAt: at(-45, "10:00"), sourceLabel: L({ en: "Progress log", zh: "进展记录" }) }],
      title: L({ en: "Check in with Lin Zhiyuan about channel pricing", zh: "问候林志远，问渠道定价" }),
      type: "relationship_stale",
    }),
  ];

  const ledger = [
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-1", status: "approved", title: L({ en: "Set up a meeting with Sato Misaki", zh: "约佐藤美咲见面" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-2", status: "executing", title: L({ en: "Meet 2 IT leads at the JETRO mixer", zh: "在 JETRO 交流会认识 2 位 IT 负责人" }) }),
    demoLedgerEntry({ at: at(-3, "09:00"), id: "demo-act-3", status: "completed", title: L({ en: "Write up the IT pain points of 3 target companies", zh: "整理 3 家目标企业的 IT 痛点" }) }),
    demoLedgerEntry({ at: at(-6, "09:00"), id: "demo-act-4", status: "completed", title: L({ en: "Draft the Japanese trial offer", zh: "写好日文版试用方案" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-5", status: "approved", title: L({ en: "Ask Nakamura Megumi for 3 pilot members", zh: "请中村惠推荐 3 家试点会员企业" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-6", status: "approved", title: L({ en: "Send the 1-minute demo video", zh: "发 1 分钟演示视频" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-7", status: "approved", title: L({ en: "Register for the SME DX seminar", zh: "报名中小企业 DX 推进研讨会" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-8", status: "approved", title: L({ en: "Ask Lin Zhiyuan about channel pricing", zh: "问林志远渠道定价" }) }),
    demoLedgerEntry({ at: at(-2, "09:00"), id: "demo-act-9", status: "approved", title: L({ en: "Share trial progress with Chen Siyuan", zh: "向陈思远同步试用进展" }) }),
  ];

  const events = [
    demoEvent({
      hours: 2.5,
      id: "demo-event-jetro-founders",
      name: L({ en: "JETRO Tokyo founders mixer", zh: "JETRO 东京创业者交流会" }),
      startsAt: jstAt(today, "18:30"),
      venue: L({ en: "Akasaka", zh: "赤坂" }),
    }),
    demoEvent({
      hours: 2,
      id: "demo-event-jetro-business",
      name: L({ en: "JETRO business exchange for foreign companies", zh: "JETRO 外资企业商务交流会" }),
      startsAt: jstAt(shiftDay(today, 11), "15:00"),
      venue: L({ en: "Akasaka", zh: "赤坂" }),
    }),
  ];

  return {
    home: {
      account: {
        fullName: L({ en: "Demo founder", zh: "示例创始人" }),
        headline: L({ en: "AI meeting notes SaaS · Tokyo", zh: "AI 会议纪要 SaaS · 东京" }),
        initial: "O",
        relationshipGoal: L(DEMO_GOAL),
        // 对话屏右栏「上下文」（W0014 示例问答）读这两项；概览屏不用。
        targetRelationshipTypes: [
          L({ en: "SME IT leads", zh: "中小企业 IT 负责人" }),
          L({ en: "SaaS channel resellers", zh: "SaaS 渠道代理商" }),
        ],
        topics: [L({ en: "AI meeting notes", zh: "AI 会议纪要" }), L({ en: "Japan SaaS market", zh: "日本 SaaS 市场" })],
      },
      events,
      stats: { events: events.length, inProgress: 3, people: 30 },
    },
    ledger,
    openableSessions: [],
    sessions: [
      {
        createdAt: at(-1, "21:10"),
        id: "demo-session-suzuki",
        title: L({ en: "How do I get Wang Yan to introduce Suzuki?", zh: "王砚提到的铃木，怎么请他引荐？" }),
      },
      {
        createdAt: at(-4, "10:30"),
        id: "demo-session-pricing",
        title: L({ en: "How do Japanese SMEs usually price SaaS?", zh: "日本中小企业的 SaaS 一般怎么定价？" }),
      },
      {
        createdAt: at(-8, "16:00"),
        id: DEMO_PLAN_SESSION_ID,
        title: L(DEMO_PLAN_QUESTION),
      },
    ],
    signals,
    snapshot,
    writeLabels: {
      "personal:demo-personal-wang": L({ en: "schedule", zh: "日程" }),
      "signal:demo-signal-lin": L({ en: "contacts", zh: "人脉" }),
      "signal:demo-signal-new-cards": L({ en: "contact matches", zh: "人脉匹配" }),
      "signal:demo-signal-sato": L({ en: "schedule", zh: "日程" }),
      "signal:demo-signal-wang": L({ en: "meeting prep", zh: "会面准备" }),
    },
  };
}
