export type OrbitContactPipelineStatus = "to_contact" | "in_progress" | "partnered";
export type OrbitIntroStatus = "draft" | "sent";

export interface OrbitContactView {
  company: string;
  encounters: OrbitContactEncounterView[];
  displayName: string;
  email: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  lineId: string;
  lastEventId: string;
  met: string;
  note: string;
  notes: OrbitContactNoteView[];
  offering: string;
  phone: string;
  pipelineStatus: OrbitContactPipelineStatus;
  seeking: string;
  source: "exchange" | "scan" | "manual";
  stage: string;
  title: string;
  wechat: string;
}

export interface OrbitContactNoteView {
  body: string;
  createdAt: string;
  id: string;
}

export interface OrbitContactPublicProfileView {
  bio: string;
  conversationPrompts: string[];
  industry: string;
  intro: string;
  offering: string[];
  seeking: string[];
  topics: string[];
}

export interface OrbitContactEncounterView {
  context: {
    metAt: string;
    publicProfile: OrbitContactPublicProfileView;
    reason: string;
    score: number;
    tableNo: number;
  };
  createdAt: string;
  eventId: string;
  id: string;
}

export interface OrbitPipelineStatusView {
  label: string;
  value: OrbitContactPipelineStatus;
}

export interface OrbitContactEventView {
  id: string;
  name: string;
}

export interface OrbitIntroView {
  blurb: string;
  id: string;
  labelA: string;
  labelB: string;
  statusBadge: OrbitIntroStatus;
}

export interface OrbitContactsViewModel {
  connections: OrbitContactView[];
  events: OrbitContactEventView[];
  intros: OrbitIntroView[];
  pipelineStatuses: OrbitPipelineStatusView[];
}

const stageToStatus: Record<string, OrbitContactPipelineStatus> = {
  "待联系": "to_contact",
  "在推进": "in_progress",
  "已合作": "partnered",
};

const sourceByIndex: OrbitContactView["source"][] = ["exchange", "scan", "manual"];
const eventIds = ["e-tbc", "e-saas", "e-fin", "e-semi", "e-past"];

const baseConnections = [
  { id: "c1", displayName: "山田 健太", initial: "山", company: "三菱商事", title: "VP", email: "yamada@mitsubishi.jp", g: "g-indigo", industry: "综合商社", stage: "在推进", offering: "日本本地化与渠道", seeking: "AI 选品系统", note: "对跨境供应链很有兴趣，约了下周二线上细聊。" },
  { id: "c2", displayName: "王芳", initial: "王", company: "华为日本", title: "COO", email: "wangfang@huawei.jp", g: "g-slate", industry: "硬件", stage: "已合作", offering: "硬件供应链", seeking: "海外 PR 资源", note: "已签 MOU，Q3 联合发布。" },
  { id: "c3", displayName: "佐藤 美咲", initial: "佐", company: "Sony", title: "Director", email: "misaki@sony.jp", g: "g-emerald", industry: "消费电子", stage: "待联系", offering: "品牌联名", seeking: "新兴市场洞察", note: "" },
  { id: "c4", displayName: "陈立", initial: "陈", company: "Parlay", title: "创始人", email: "chen@parlay.io", g: "g-rose", industry: "SaaS", stage: "在推进", offering: "对话式 AI", seeking: "种子轮领投", note: "Demo 很惊艳，介绍给了红杉的林雅玲。" },
  { id: "c5", displayName: "林雅玲", initial: "林", company: "Sequoia", title: "Partner", email: "lin@sequoia.com", g: "g-amber", industry: "风险投资", stage: "在推进", offering: "A 轮资金 + 网络", seeking: "出海 SaaS 团队", note: "正在看我们的 deck。" },
  { id: "c6", displayName: "森田 健", initial: "森", company: "野村证券", title: "MD", email: "morita@nomura.jp", g: "g-sky", industry: "金融", stage: "待联系", offering: "IPO 顾问", seeking: "金融科技标的", note: "" },
  { id: "c7", displayName: "张伟", initial: "张", company: "云启科技", title: "CEO", email: "zhang@yunqi.com", g: "g-violet", industry: "云计算", stage: "已合作", offering: "云基础设施折扣", seeking: "日本客户", note: "已成为我们的云服务商。" },
  { id: "c8", displayName: "田中 由美", initial: "田", company: "Rakuten", title: "Head of BD", email: "tanaka@rakuten.jp", g: "g-emerald", industry: "电商", stage: "待联系", offering: "电商平台入驻", seeking: "跨境品牌", note: "" },
];

export function getOrbitContactsViewModel(): OrbitContactsViewModel {
  const events: OrbitContactEventView[] = [
    { id: "e-tbc", name: "Tokyo Business Connect" },
    { id: "e-saas", name: "SaaS 出海闭门局" },
    { id: "e-fin", name: "FinTech Tokyo Mixer" },
    { id: "e-semi", name: "半导体 × 制造峰会" },
    { id: "e-past", name: "跨境电商 Meetup" },
  ];

  return {
    connections: baseConnections.map((connection, index) => ({
      ...connection,
      lastEventId: eventIds[index % eventIds.length] ?? "e-tbc",
      lineId: index % 2 === 0 ? connection.email.split("@")[0] ?? "" : "",
      met: `${events.find((event) => event.id === eventIds[index % eventIds.length])?.name ?? "活动"} · 圆桌 ${(index % 8) + 1}`,
      notes: connection.note
        ? [{ id: `note-${connection.id}`, body: connection.note, createdAt: "2026-05-16T10:00:00+09:00" }]
        : [],
      pipelineStatus: stageToStatus[connection.stage] ?? "to_contact",
      phone: index % 3 === 0 ? `+81 90-${1000 + index}-${2000 + index}` : "",
      source: sourceByIndex[index % sourceByIndex.length] ?? "exchange",
      wechat: `wx_${connection.id}`,
      encounters: [
        {
          id: `enc-${connection.id}`,
          eventId: eventIds[index % eventIds.length] ?? "e-tbc",
          createdAt: "2026-05-15T19:30:00+09:00",
          context: {
            reason: `在「${events.find((event) => event.id === eventIds[index % eventIds.length])?.name ?? "活动"}」同桌，${connection.offering} ↔ ${connection.seeking}，匹配度高。`,
            score: 80 + (index % 15),
            tableNo: (index % 8) + 1,
            metAt: "2026-05-15T19:30:00+09:00",
            publicProfile: {
              industry: connection.industry,
              bio: `${connection.title} @ ${connection.company}。`,
              intro: connection.note || "希望多认识跨境合作的朋友。",
              offering: [connection.offering],
              seeking: [connection.seeking],
              topics: ["出海", "AI 应用"],
              conversationPrompts: ["你们出海最大的卡点是什么？", "今年最想达成的一个合作？"],
            },
          },
        },
      ],
    })),
    events,
    intros: [
      { id: "i1", labelA: "陈立", labelB: "林雅玲", blurb: "陈立在做对话式 AI，林雅玲在 Sequoia 看 AI 应用 —— 一个找钱，一个找标的，值得聊。", statusBadge: "sent" },
      { id: "i2", labelA: "王芳", labelB: "张伟", blurb: "华为日本的硬件供应链 × 云启的云基础设施，联合方案对出海客户很有吸引力。", statusBadge: "sent" },
      { id: "i3", labelA: "佐藤 美咲", labelB: "田中 由美", blurb: "", statusBadge: "draft" },
    ],
    pipelineStatuses: [
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
    ],
  };
}
