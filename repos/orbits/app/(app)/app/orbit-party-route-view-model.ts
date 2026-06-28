export interface OrbitPartyPersonView {
  company: string;
  g: string;
  groupNumber: number;
  icebreakers: string[];
  id: string;
  industry: string;
  initial: string;
  name: string;
  offering: string;
  reason: string;
  score: number;
  seat: string;
  seeking: string;
  summary: string;
  title: string;
  topics: string[];
}

export interface OrbitPartyAgendaItemView {
  description: string;
  label: string;
  time: string;
}

export interface OrbitPartyMeView {
  groupNumber: number;
  initial: string;
  name: string;
  offering: string[];
  prompts: string[];
  role: string;
  seat: string;
  seeking: string[];
  topics: string[];
}

export interface OrbitPartyViewModel {
  accessCode: string;
  agenda: OrbitPartyAgendaItemView[];
  icebreakers: string[];
  me: OrbitPartyMeView;
  recommendations: OrbitPartyPersonView[];
  tableMates: OrbitPartyPersonView[];
}

const agenda: OrbitPartyAgendaItemView[] = [
  { time: "18:00", label: "入场签到 · 欢迎酒会", description: "领取专属座位卡与破冰任务" },
  { time: "18:45", label: "主题分享：2026 出海新地图", description: "三菱商事 × Sequoia 对谈" },
  { time: "19:30", label: "AI 圆桌配对", description: "按行业与诉求自动分桌，附破冰话术" },
  { time: "20:30", label: "自由社交 · 交换联系方式", description: "把今晚认识的人沉淀进名片夹" },
];

const people: Array<{
  company: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  name: string;
  offering: string;
  seeking: string;
  title: string;
}> = [
  { id: "c1", name: "山田 健太", initial: "山", company: "三菱商事", title: "VP", g: "g-indigo", industry: "综合商社", offering: "日本本地化与渠道", seeking: "AI 选品系统" },
  { id: "c2", name: "王芳", initial: "王", company: "华为日本", title: "COO", g: "g-slate", industry: "硬件", offering: "硬件供应链", seeking: "海外 PR 资源" },
  { id: "c3", name: "佐藤 美咲", initial: "佐", company: "Sony", title: "Director", g: "g-emerald", industry: "消费电子", offering: "品牌联名", seeking: "新兴市场洞察" },
  { id: "c4", name: "陈立", initial: "陈", company: "Parlay", title: "创始人", g: "g-rose", industry: "SaaS", offering: "对话式 AI", seeking: "种子轮领投" },
  { id: "c5", name: "林雅玲", initial: "林", company: "Sequoia", title: "Partner", g: "g-amber", industry: "风险投资", offering: "A 轮资金 + 网络", seeking: "出海 SaaS 团队" },
];

const reasons = [
  "你们都在做出海，且诉求互补：他能提供渠道，你正寻找日本客户。",
  "同为 AI 方向，他在找技术合伙人，与你的工程背景高度契合。",
  "他手握你需要的 A 轮资金与网络，正是你这轮在找的人。",
  "硬件供应链 × 你的软件能力，联合方案对出海客户很有吸引力。",
  "她在投早期 AI，今晚最想认识有真实落地的创始人，正是你。",
];

const recommendations: OrbitPartyPersonView[] = people.map((person, index) => ({
  ...person,
  groupNumber: (index % 3) + 1,
  icebreakers: ["你们今年出海最大的卡点是什么？", "最想在今晚达成的一个合作？"],
  reason: reasons[index % reasons.length] ?? reasons[0],
  score: 92 - index * 4,
  seat: `${String.fromCharCode(65 + index)}${index + 1}`,
  summary: `${person.title} @ ${person.company}。${person.offering} ↔ ${person.seeking}。`,
  topics: ["出海", "AI 应用"],
}));

export function getOrbitPartyViewModel(): OrbitPartyViewModel {
  return {
    accessCode: "TBC-A8-4821",
    agenda,
    icebreakers: ["先聊聊各自今年最想达成的一件事。", "你们公司最近在日本市场的最大挑战？", "有没有可以互相介绍的人？"],
    me: {
      groupNumber: 1,
      initial: "李",
      name: "李明",
      offering: ["技术合作", "海外拓展", "招聘 / 人才"],
      prompts: ["问问对方今年最想推进的一个合作。", "聊聊你们在日本本地化上踩过的坑。", "交换一个你最近在用的好工具。"],
      role: "CTO · 东京科技有限公司",
      seat: "A1",
      seeking: ["A 轮融资", "日本客户", "出海打法"],
      topics: ["出海", "AI 应用", "硬件创业"],
    },
    recommendations,
    tableMates: recommendations.slice(0, 4),
  };
}
