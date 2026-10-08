/**
 * 引导期示例人物（W0004；W0005 人脉页、W0014 我的计划与对话复用）。
 *
 * W0014：同一位人物的 12 周计划（`buildDemoPlanSnapshot`，形状就是 W0007 的 `PlanSnapshot`，
 * 「我的计划」页与对话里的计划卡片都从这一份推导），以及最近对话里那条「我该如何实现目标？」
 * 的示例问答（`DEMO_PLAN_SESSION_ID`：概览点它打开只读对话，回答就是这份计划的卡片）。
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
import type { PlanContactLink, PlanItem, PlanLogEntry, PlanSnapshot } from "../../../../features/plans/contract";
import type { PlanAnalysisV1 } from "../../../../features/plans/generator";
import { DEMO_CONTACT_ID_PREFIX } from "../../../../shared/domain/guide-demo-contact";
import type { HomeDashboardSnapshot } from "../agent/home-dashboard-route-service";
import type { AgentTodaySignalView } from "../agent/orbit-agent-next-actions";
import { iorbitDayKey } from "../agent/iorbit-0918/iorbit-model";
import { createOrbitAgentStarterViewModel, type OrbitAgentViewModel } from "../orbit-agent-route-view-model";
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
      open: { href: "/app/agent/plan", label: L({ en: "Meeting prep", zh: "看会面准备" }) },
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
      open: { href: "/app/agent/plan", label: L({ en: "Pick a time", zh: "定时间" }) },
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
    openableSessions: [DEMO_PLAN_SESSION_ID],
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

/* ── W0014：示例计划（「我的计划」页与对话里的计划卡片共用）──────────────────── */

/** 示例计划的 id（只在前端；打勾、记录等写操作在示例里一律被拦下，不会带着它发请求）。 */
export const DEMO_PLAN_ID = "demo-plan";

/** 计划里引用到的示例联系人（与 W0005 `demo-network.ts` 同一批人、同一套 `demo:` id）。 */
const DEMO_PLAN_CONTACTS = {
  lin: { company: { en: "Cloudia", zh: "Cloudia" }, name: { en: "Lin Zhiyuan", zh: "林志远" }, role: { en: "Partner Sales", zh: "合作伙伴营业" }, slug: "lin-zhiyuan" },
  nakamura: { company: { en: "Tokyo Chamber of Commerce", zh: "东京商工会议所" }, name: { en: "Nakamura Megumi", zh: "中村惠" }, role: { en: "SME Support", zh: "中小企业支援课" }, slug: "nakamura-megumi" },
  sato: { company: { en: "Maruwa Industries", zh: "丸和工业" }, name: { en: "Sato Misaki", zh: "佐藤美咲" }, role: { en: "IT Systems Manager", zh: "情报系统课长" }, slug: "sato-misaki" },
  suzuki: { company: { en: "Maruwa Industries", zh: "丸和工业" }, name: { en: "Suzuki Ken", zh: "铃木健" }, role: { en: "Head of IT Systems", zh: "情报系统部 部长" }, slug: "suzuki-ken" },
  wang: { company: { en: "Hokushin Seiko", zh: "北辰精工" }, name: { en: "Wang Yan", zh: "王砚" }, role: { en: "Head of Procurement", zh: "采购部长" }, slug: "wang-yan" },
  yamada: { company: { en: "JETRO Tokyo", zh: "JETRO 东京" }, name: { en: "Yamada Taro", zh: "山田太郎" }, role: { en: "Investment Advisor", zh: "投资咨询顾问" }, slug: "yamada-taro" },
} as const;

type DemoPlanContactKey = keyof typeof DEMO_PLAN_CONTACTS;

const demoContactId = (key: DemoPlanContactKey) => `${DEMO_CONTACT_ID_PREFIX}${DEMO_PLAN_CONTACTS[key].slug}`;

/** 「我的计划」人脉需求里的人名与「公司 · 职位」（真实页面由服务端按 id 解析；示例直接给）。 */
export function buildDemoPlanContactNames(lang: Lang): Record<string, { name: string; subtitle: string | null }> {
  return Object.fromEntries(
    (Object.keys(DEMO_PLAN_CONTACTS) as DemoPlanContactKey[]).map((key) => {
      const person = DEMO_PLAN_CONTACTS[key];
      return [demoContactId(key), { name: person.name[lang], subtitle: `${person.company[lang]} · ${person.role[lang]}` }];
    }),
  );
}

/**
 * 示例人物的 12 周计划（W0007 `PlanSnapshot` 的同形状替身）。
 *
 * 与概览屏的故事同一天：计划在 8 天前（最近对话里那条示例问答的时间）生成，今天是第 2 周、
 * 第 1 阶段「摸清需求」；今天 14:00 见王砚请他引荐铃木，18:30 去 JETRO 交流会；佐藤美咲已建立
 * 联系，铃木健昨晚导入后关联到「中小企业 IT 负责人」。阶段切分与 W0008 mock 生成器的 3 个月档
 * 一致（第 1–3 周／4–8 周／9–12 周），`analysis` 是 `PlanAnalysisV1`，所以对话里的计划卡片
 * （`planCardViewFromSnapshot`）与「我的计划」页（`buildMyPlanViewModel`）都能直接吃它。
 */
export function buildDemoPlanSnapshot(real: Date, lang: Lang): PlanSnapshot {
  const L = (copy: Copy) => copy[lang];
  const today = iorbitDayKey(real);
  const at = (days: number, time: string) => jstAt(shiftDay(today, days), time).toISOString();
  const createdAt = at(-8, "16:00");
  const person = (key: DemoPlanContactKey) => DEMO_PLAN_CONTACTS[key].name[lang];

  let sortKey = 0;
  const item = (input: Partial<PlanItem> & Pick<PlanItem, "id" | "kind" | "title" | "phaseKey">): PlanItem => {
    sortKey += 1;
    return {
      answer: null,
      carriedFromItemId: null,
      completedAt: null,
      contactLinks: [],
      createdAt,
      criteria: null,
      deferralCount: 0,
      detail: null,
      linkedContactIds: input.contactLinks?.map((link) => link.contactId) ?? [],
      linkedEventId: null,
      meta: {},
      planId: DEMO_PLAN_ID,
      sortKey,
      status: input.kind === "action" ? "not_started" : input.kind === "event" ? "recommended" : "open",
      suggestedWeek: null,
      updatedAt: createdAt,
      ...input,
    };
  };
  const link = (key: DemoPlanContactKey, linkedDays: number, establishedDays: number | null = null): PlanContactLink => ({
    contactId: demoContactId(key),
    establishedAt: establishedDays === null ? null : at(establishedDays, "10:20"),
    linkedAt: at(linkedDays, "22:14"),
    state: establishedDays === null ? "linked" : "established",
  });
  const done = (days: number) => ({ completedAt: at(days, "18:00"), status: "done" as const, updatedAt: at(days, "18:00") });

  const needIt = L({ en: "SME IT leads", zh: "中小企业 IT 负责人" });
  const needIntro = L({ en: "People who can introduce pilot companies", zh: "能引荐试点企业的商会／机构的人" });
  const needChannel = L({ en: "SaaS channel resellers in Japan", zh: "日本 SaaS 渠道代理商" });

  const items: PlanItem[] = [
    // 第 1 阶段（第 1–3 周）：摸清需求。
    item({ ...done(-5), id: "demo-plan-a-painpoints", kind: "action", phaseKey: "p1", suggestedWeek: 1, title: L({ en: "Write up the IT pain points of 3 target companies", zh: "整理 3 家目标企业的 IT 痛点" }) }),
    item({ ...done(-6), id: "demo-plan-a-offer", kind: "action", phaseKey: "p1", suggestedWeek: 1, title: L({ en: "Draft the Japanese trial offer", zh: "写好日文版试用方案" }) }),
    item({
      detail: L({ en: `${person("nakamura")} knows which member companies want to try digital tools.`, zh: `${person("nakamura")}知道哪些会员企业愿意尝试数字化工具。` }),
      id: "demo-plan-a-nakamura",
      kind: "action",
      phaseKey: "p1",
      suggestedWeek: 1,
      title: L({ en: `Ask ${person("nakamura")} for 3 pilot member companies`, zh: `请${person("nakamura")}推荐 3 家试点会员企业` }),
    }),
    item({
      detail: L({ en: "Today 14:00 · Marunouchi. On the last call he said Suzuki decides on systems.", zh: "今天 14:00 · 丸之内。上次通话时他说铃木才是系统采购的决策人。" }),
      id: "demo-plan-a-wang",
      kind: "action",
      phaseKey: "p1",
      suggestedWeek: 2,
      title: L({ en: `Meet ${person("wang")} and ask him to introduce Suzuki from IT`, zh: `和${person("wang")}见面，请他介绍 IT 部门的铃木` }),
    }),
    item({
      detail: L({ en: "They take notes by hand and spend 30 minutes after each meeting.", zh: "她们现在用 Word 手记，每次会后花 30 分钟整理。" }),
      id: "demo-plan-a-sato",
      kind: "action",
      phaseKey: "p1",
      status: "in_progress",
      suggestedWeek: 2,
      title: L({ en: `Book 20 minutes with ${person("sato")} to talk about a trial`, zh: `约${person("sato")}聊 20 分钟试用` }),
    }),
    item({ id: "demo-plan-a-jetro", kind: "action", phaseKey: "p1", suggestedWeek: 2, title: L({ en: "Meet 2 IT leads at the JETRO mixer", zh: "在 JETRO 交流会认识 2 位 IT 负责人" }) }),
    item({ id: "demo-plan-a-video", kind: "action", phaseKey: "p1", suggestedWeek: 2, title: L({ en: "Send the 1-minute demo video", zh: "发 1 分钟演示视频" }) }),
    item({ id: "demo-plan-a-lin", kind: "action", phaseKey: "p1", suggestedWeek: 3, title: L({ en: `Ask ${person("lin")} about channel pricing`, zh: `问${person("lin")}渠道定价` }) }),
    item({
      contactLinks: [link("sato", -6, -2), link("suzuki", -1)],
      criteria: { description: L({ en: "The person at an SME who decides on meeting tools", zh: "中小企业里决定用什么会议工具的人" }), primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.enterprise_software", titleKeywords: ["情報システム", "IT"] },
      id: "demo-plan-n-it",
      kind: "network_need",
      phaseKey: "p1",
      status: "established",
      title: needIt,
    }),
    item({
      contactLinks: [link("yamada", -7), link("nakamura", -7, -4)],
      criteria: { description: null, primaryIndustryId: "community_nonprofit", secondaryIndustryId: "community_nonprofit.industry_associations", titleKeywords: ["支援", "JETRO"] },
      id: "demo-plan-n-intro",
      kind: "network_need",
      phaseKey: "p1",
      status: "established",
      title: needIntro,
    }),
    item({
      answer: L({ en: `Mostly by hand in Word; about 30 minutes of clean-up after each meeting (${person("sato")}).`, zh: `多数用 Word 手记，会后要花 30 分钟整理（${person("sato")}）。` }),
      id: "demo-plan-i-notes",
      kind: "info",
      phaseKey: "p1",
      status: "answered",
      title: L({ en: "How do SMEs take meeting notes today?", zh: "中小企业现在怎么记会议？" }),
    }),
    item({ id: "demo-plan-i-approver", kind: "info", phaseKey: "p1", title: L({ en: "Who has to approve a trial?", zh: "试用需要谁点头？" }) }),
    item({
      id: "demo-plan-e-founders",
      kind: "event",
      meta: { startsAt: jstAt(today, "18:30").toISOString(), venue: L({ en: "Akasaka", zh: "赤坂" }) },
      phaseKey: "p1",
      status: "registered",
      suggestedWeek: 2,
      title: L({ en: "JETRO Tokyo founders mixer", zh: "JETRO 东京创业者交流会" }),
    }),
    item({
      id: "demo-plan-e-business",
      kind: "event",
      meta: { startsAt: jstAt(shiftDay(today, 11), "15:00").toISOString(), venue: L({ en: "Akasaka", zh: "赤坂" }) },
      phaseKey: "p1",
      suggestedWeek: 3,
      title: L({ en: "JETRO business exchange for foreign companies", zh: "JETRO 外资企业商务交流会" }),
    }),
    // 第 2 阶段（第 4–8 周）：集中接触。
    item({ id: "demo-plan-a-contacts", kind: "action", phaseKey: "p2", suggestedWeek: 4, title: L({ en: "Get contact details for 10 IT leads", zh: "拿到 10 位 IT 负责人的联系方式" }) }),
    item({ id: "demo-plan-a-kickoff", kind: "action", phaseKey: "p2", suggestedWeek: 6, title: L({ en: "Book trial kick-offs with 3 companies", zh: "和 3 家企业约好试用启动会" }) }),
    item({
      contactLinks: [link("lin", -7)],
      criteria: { description: null, primaryIndustryId: "technology_internet", secondaryIndustryId: null, titleKeywords: ["Partner", "パートナー"] },
      id: "demo-plan-n-channel",
      kind: "network_need",
      phaseKey: "p2",
      status: "linked",
      title: needChannel,
    }),
    item({ id: "demo-plan-i-share", kind: "info", phaseKey: "p2", title: L({ en: "How do Japanese SaaS channels split revenue?", zh: "日本 SaaS 渠道一般怎么分成？" }) }),
    item({
      id: "demo-plan-e-dx",
      kind: "event",
      meta: { startsAt: jstAt(shiftDay(today, 20), "14:00").toISOString(), venue: L({ en: "Marunouchi", zh: "丸之内" }) },
      phaseKey: "p2",
      suggestedWeek: 5,
      title: L({ en: "SME DX seminar", zh: "中小企业 DX 推进研讨会" }),
    }),
    // 第 3 阶段（第 9–12 周）：推进落地。
    item({ id: "demo-plan-a-trials", kind: "action", phaseKey: "p3", suggestedWeek: 9, title: L({ en: "Get 5 companies started on the trial", zh: "让 5 家企业开始试用" }) }),
    item({ id: "demo-plan-a-feedback", kind: "action", phaseKey: "p3", suggestedWeek: 11, title: L({ en: "Collect trial feedback and settle pricing", zh: "收集试用反馈，定下价格" }) }),
  ];

  const log = (input: Partial<PlanLogEntry> & Pick<PlanLogEntry, "id" | "body" | "createdAt">): PlanLogEntry => ({
    author: "user",
    event: "note",
    fromStatus: null,
    idempotencyKey: `demo:${input.id}`,
    itemId: null,
    kind: "manual",
    linkedContactIds: [],
    linkedEventId: null,
    payload: {},
    planId: DEMO_PLAN_ID,
    targetItemId: null,
    toStatus: null,
    ...input,
  });

  const analysis: PlanAnalysisV1 = {
    allies: [
      { contactId: demoContactId("wang"), help: L({ en: "Can introduce Suzuki, who decides on systems in IT.", zh: "可以引荐 IT 部门负责系统采购的铃木。" }), name: person("wang"), subtitle: `${L(DEMO_PLAN_CONTACTS.wang.company)} · ${L(DEMO_PLAN_CONTACTS.wang.role)}` },
      { contactId: demoContactId("nakamura"), help: L({ en: "Knows member companies open to piloting digital tools.", zh: "认识愿意试点数字化工具的会员企业。" }), name: person("nakamura"), subtitle: `${L(DEMO_PLAN_CONTACTS.nakamura.company)} · ${L(DEMO_PLAN_CONTACTS.nakamura.role)}` },
      { contactId: demoContactId("sato"), help: L({ en: "Already has the problem the trial solves; a likely first trial.", zh: "正有试用要解决的问题，最可能成为第一家试用。" }), name: person("sato"), subtitle: `${L(DEMO_PLAN_CONTACTS.sato.company)} · ${L(DEMO_PLAN_CONTACTS.sato.role)}` },
    ],
    answer:
      lang === "zh"
        ? [
            { text: "12 周分 3 步：先摸清中小企业怎么记会议、谁拍板，再借" },
            { emphasis: true, text: "王砚和中村惠" },
            { text: "接触 10 位 IT 负责人，第 9–12 周让" },
            { emphasis: true, text: "5 家企业" },
            { text: "开始试用。" },
          ]
        : [
            { text: "Three steps over 12 weeks: learn how SMEs take notes and who decides, reach 10 IT leads through " },
            { emphasis: true, text: "Wang Yan and Nakamura Megumi" },
            { text: ", then get " },
            { emphasis: true, text: "5 companies" },
            { text: " trialling in weeks 9–12." },
          ],
    figures: [
      { label: L({ en: "companies trialling", zh: "试用企业" }), unit: L({ en: "", zh: "家" }), value: "5" },
      { label: L({ en: "IT leads to meet", zh: "要认识的 IT 负责人" }), unit: L({ en: "", zh: "位" }), value: "10" },
      { label: L({ en: "weeks", zh: "计划周期" }), unit: L({ en: "", zh: "周" }), value: "12" },
    ],
    gaps: [needChannel, L({ en: "A pilot customer willing to be a public reference", zh: "愿意公开背书的试点客户" })],
    generator: "iorbit-guide-demo",
    kind: "plan_bootstrap",
    locale: lang,
    phases: [
      { detailed: true, followups: [L({ en: "Send a thank-you note with the demo video within a day", zh: "见面后一天内发感谢信和演示视频" })], key: "p1", who: [needIt, needIntro] },
      { detailed: true, followups: [L({ en: "Check in every two weeks during the trial", zh: "试用期间每两周问一次使用情况" })], key: "p2", who: [needIt, needChannel] },
      { detailed: true, followups: [L({ en: "Share trial results with Chen Siyuan", zh: "把试用结果同步给陈思远" })], key: "p3", who: [needChannel] },
    ],
    pitch: {
      setting: L({ en: "To an IT lead · 30 seconds", zh: "对 IT 负责人 · 30 秒" }),
      text: L({
        en: "We turn a one-hour meeting into clean Japanese minutes in two minutes. Teams like yours spend 30 minutes tidying notes after every meeting — a four-week free trial shows the difference.",
        zh: "我们把一小时的会议在两分钟内变成整理好的日文纪要。像贵司这样每次会后要花 30 分钟整理的团队，免费试用四周就能看到差别。",
      }),
    },
    read: { contacts: 30, contactsTotal: 30, events: 2 },
    request: { idempotencyKey: null, question: L(DEMO_PLAN_QUESTION), supplement: null },
    risk: L({
      en: "Trials are usually decided in IT, not by the procurement contacts you know; without an introduction, cold emails rarely get answered.",
      zh: "试用通常由 IT 部门决定，而不是你认识的采购；没有人引荐，陌生邮件很少有回音。",
    }),
    thisWeek: [
      { contactIds: [demoContactId("wang")], eventIds: [], title: L({ en: `Meet ${person("wang")} at 14:00 and ask for Suzuki`, zh: `14:00 见${person("wang")}，请他引荐铃木` }), why: L({ en: "He already knows who decides on systems.", zh: "他知道系统采购由谁拍板。" }) },
      { contactIds: [demoContactId("sato")], eventIds: [], title: L({ en: `Book 20 minutes with ${person("sato")}`, zh: `约${person("sato")}聊 20 分钟` }), why: L({ en: "She has exactly the problem the trial solves.", zh: "她正有试用要解决的问题。" }) },
      { contactIds: [], eventIds: [], title: L({ en: "Meet 2 IT leads at the JETRO mixer tonight", zh: "今晚在 JETRO 交流会认识 2 位 IT 负责人" }), why: L({ en: "The fastest way to widen the IT-lead list.", zh: "扩大 IT 负责人名单最快的一步。" }) },
    ],
    version: 1,
  };

  return {
    items,
    log: [
      log({ body: L({ en: `Call with ${person("wang")}: Suzuki in IT decides on systems`, zh: `和${person("wang")}通了电话：IT 部门的铃木才是系统采购的决策人` }), createdAt: at(-1, "17:30"), id: "demo-log-wang-call", linkedContactIds: [demoContactId("wang")] }),
      log({ author: "user", body: `${person("suzuki")} 关联到「${needIt}」`, createdAt: at(-1, "22:14"), event: "contact_linked", id: "demo-log-suzuki", itemId: "demo-plan-n-it", kind: "auto", linkedContactIds: [demoContactId("suzuki")] }),
      log({ author: "user", body: `与 ${person("sato")} 建立联系`, createdAt: at(-2, "10:20"), event: "contact_established", id: "demo-log-sato", itemId: "demo-plan-n-it", kind: "auto", linkedContactIds: [demoContactId("sato")] }),
      log({ author: "user", body: "完成行动", createdAt: at(-5, "18:00"), event: "item_status_changed", fromStatus: "not_started", id: "demo-log-painpoints", itemId: "demo-plan-a-painpoints", kind: "auto", toStatus: "done" }),
      log({ author: "user", body: "完成行动", createdAt: at(-6, "18:00"), event: "item_status_changed", fromStatus: "not_started", id: "demo-log-offer", itemId: "demo-plan-a-offer", kind: "auto", toStatus: "done" }),
      log({ author: "system", body: "生成计划 v1", createdAt, event: "plan_created", id: "demo-log-created", kind: "auto" }),
    ],
    plan: {
      analysis: analysis as unknown as Record<string, unknown>,
      archivedAt: null,
      createdAt,
      goalSnapshot: L(DEMO_GOAL),
      horizon: "quarter",
      id: DEMO_PLAN_ID,
      phases: [
        { endWeek: 3, granularity: "week", key: "p1", startWeek: 1, summary: L({ en: "Learn how 5 SMEs take meeting notes and who approves a trial.", zh: "和 5 家中小企业聊清楚会议怎么记、试用谁拍板。" }), title: L({ en: "Map the ground", zh: "摸清需求" }) },
        { endWeek: 8, granularity: "week", key: "p2", startWeek: 4, summary: L({ en: "Reach 10 IT leads through introductions and book 3 trial kick-offs.", zh: "经引荐接触 10 位 IT 负责人，约好 3 场试用启动会。" }), title: L({ en: "Meet the right people", zh: "集中接触" }) },
        { endWeek: 12, granularity: "week", key: "p3", startWeek: 9, summary: L({ en: "Get 5 companies trialling and settle pricing from their feedback.", zh: "让 5 家企业开始试用，按反馈定下价格。" }), title: L({ en: "Close it out", zh: "推进落地" }) },
      ],
      previousPlanId: null,
      sourceSessionId: DEMO_PLAN_SESSION_ID,
      startsOn: shiftDay(today, -8),
      status: "active",
      updatedAt: at(-1, "22:14"),
      version: 1,
    },
  };
}

/**
 * 示例壳（概览与只读示例问答）用的对话视图模型（W0014）。
 *
 * 真实的 `OrbitAgentViewModel` 由对话路由按本人数据组装，`suggests` 里会带真实联系人、公司与草稿文字，
 * 所以示例期间一律不用它：这里以不含任何人物的起步模型为底，只把「试试这些问题」换成示例人物会问的话。
 */
export function buildDemoAgentViewModel(lang: Lang): OrbitAgentViewModel {
  const L = (copy: Copy) => copy[lang];
  const suggest = (icon: string, copy: Copy) => ({ icon, label: L(copy), q: L(copy) });
  return {
    ...createOrbitAgentStarterViewModel(),
    suggests: [
      suggest("users", { en: "Who in my network can introduce an SME IT lead?", zh: "我的人脉里谁能引荐中小企业 IT 负责人？" }),
      suggest("calendar", { en: "Which events this month suit phase 1?", zh: "这个月哪些活动适合第 1 阶段？" }),
      suggest("check", { en: "Draft a thank-you note to Wang Yan", zh: "帮我起草给王砚的感谢信" }),
    ],
  };
}
