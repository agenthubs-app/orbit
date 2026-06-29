import { getOrbitLandingViewModel } from "./orbit-landing-route-view-model";

export interface OrbitAgentConnectionView {
  company: string;
  displayName: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  pipelineStatus: "to_contact" | "in_progress" | "partnered";
  title: string;
}

export interface OrbitAgentEventView {
  code: string;
  g: string;
  id: string;
  name: string;
  place: string;
  startsAt: string;
}

export interface OrbitAgentPeopleResultView {
  connection: OrbitAgentConnectionView;
  match: number;
  opener: string;
  reason: string;
}

export interface OrbitAgentEventResultView {
  event: OrbitAgentEventView;
  howto: string;
  reason: string;
  score: number;
}

export interface OrbitAgentScenarioView {
  intro: string;
  items: OrbitAgentPeopleResultView[] | OrbitAgentEventResultView[];
  kind: "people" | "events";
  note?: string;
  panelTitle: string;
  q: string;
}

export interface OrbitAgentHistoryView {
  group: string;
  id: string;
  q: string;
  title: string;
  when: string;
}

export interface OrbitAgentSuggestView {
  icon: string;
  label: string;
  q: string;
}

export interface OrbitAgentViewModel {
  history: OrbitAgentHistoryView[];
  scenarios: {
    events: OrbitAgentScenarioView;
    people: OrbitAgentScenarioView;
    peopleToEvents: OrbitAgentScenarioView;
  };
  suggests: OrbitAgentSuggestView[];
}

const connections: OrbitAgentConnectionView[] = [
  { id: "c1", displayName: "山田 健太", initial: "山", company: "三菱商事", title: "VP", g: "g-indigo", industry: "综合商社", pipelineStatus: "in_progress" },
  { id: "c2", displayName: "王芳", initial: "王", company: "华为日本", title: "COO", g: "g-slate", industry: "硬件", pipelineStatus: "partnered" },
  { id: "c3", displayName: "佐藤 美咲", initial: "佐", company: "Sony", title: "Director", g: "g-emerald", industry: "消费电子", pipelineStatus: "to_contact" },
  { id: "c4", displayName: "陈立", initial: "陈", company: "Parlay", title: "创始人", g: "g-rose", industry: "SaaS", pipelineStatus: "in_progress" },
  { id: "c5", displayName: "林雅玲", initial: "林", company: "Sequoia", title: "Partner", g: "g-amber", industry: "风险投资", pipelineStatus: "in_progress" },
  { id: "c6", displayName: "森田 健", initial: "森", company: "野村证券", title: "MD", g: "g-sky", industry: "金融", pipelineStatus: "to_contact" },
  { id: "c7", displayName: "张伟", initial: "张", company: "云启科技", title: "CEO", g: "g-violet", industry: "云计算", pipelineStatus: "partnered" },
  { id: "c8", displayName: "田中 由美", initial: "田", company: "Rakuten", title: "Head of BD", g: "g-emerald", industry: "电商", pipelineStatus: "to_contact" },
];

function connById(id: string) {
  return connections.find((connection) => connection.id === id) ?? connections[0];
}

function people(id: string, match: number, reason: string, opener: string): OrbitAgentPeopleResultView {
  return { connection: connById(id), match, reason, opener };
}

function eventByCode(code: string): OrbitAgentEventView {
  const event = getOrbitLandingViewModel().events.find((item) => item.code === code) ?? getOrbitLandingViewModel().events[0];

  return {
    code: event.code,
    g: event.theme,
    id: event.id,
    name: event.name,
    place: event.place,
    startsAt: event.startsAt,
  };
}

function event(code: string, score: number, reason: string, howto: string): OrbitAgentEventResultView {
  return { event: eventByCode(code), score, reason, howto };
}

export function getOrbitAgentViewModel(): OrbitAgentViewModel {
  const scenarios = {
    people: {
      q: "我想做金融领域的 AI 产品开发，找哪位朋友比较合适？",
      kind: "people" as const,
      panelTitle: "为你匹配的人脉 · 5 位",
      intro: "在你的名片夹里，我筛出 5 位「金融 × AI」方向、且与你诉求互补的人脉，按匹配度排序。点任意一张可直接打开名片。",
      items: [
        people("c5", 96, "她在 Sequoia 专投早期 AI 应用，正找有真实落地的金融科技团队 —— 与你做金融 AI 产品高度对口。", "直接同步你金融 AI 产品的最新进展，约一次正式 pitch。"),
        people("c6", 91, "野村的 MD，手握金融行业资源与 IPO 视角，能帮你验证金融 AI 的合规与落地路径。", "从「金融机构最痛的 AI 场景」切入，请教他的一线观察。"),
        people("c4", 88, "在做对话式 AI，技术栈与你互补，可共建金融场景的联合产品。", "约个 demo 互看，聊 AI 在金融对话场景的边界。"),
        people("c7", 84, "云启的云基础设施能大幅降低你金融 AI 的算力成本，已是你的云服务商。", "聊聊为金融 AI 负载做一套成本优化方案。"),
        people("c1", 79, "三菱的产业资源与日本金融机构关系网，能为你的金融 AI 打开本地渠道。", "请他引荐 1–2 家日本金融机构的创新部门。"),
      ],
    },
    peopleToEvents: {
      q: "帮我介绍几位做女装设计的朋友。",
      kind: "events" as const,
      panelTitle: "推荐活动 · 去认识他们",
      note: "如实说：你的名片夹里暂时没有女装 / 时尚设计方向的人脉。",
      intro: "这类人通常出现在下面这几场活动里 —— 我按「认识到他们的概率」排了序。点任意一张可打开活动详情。",
      items: [
        event("FASHN", 95, "官方 After-Party 直接聚集女装 / 成衣设计师与买手，认识目标人群效率最高。", "带上想合作的方向，主动找戴「设计师」胸牌的人，从他们的作品聊起。"),
        event("D2C03", 90, "服装类 D2C 创始人与主理人密集，很多本身就是设计师出身。", "圆桌环节坐到服装 / 时尚组，交换「供应链 × 设计」的互补资源。"),
        event("CONS5", 82, "覆盖服装与时尚零售品牌，能找到「设计 + 渠道」的复合人脉。", "用「我在找女装设计合作」做一句话自我介绍，让对方帮你牵线。"),
      ],
    },
    events: {
      q: "我最近想多参加一些 AI 和出海主题的活动。",
      kind: "events" as const,
      panelTitle: "推荐活动 · 3 场",
      intro: "结合你的画像（CTO · AI / 出海）和最近关注，这 3 场最值得去。点任意一张可打开活动详情。",
      items: [
        event("TBC26S", 97, "今晚正在进行的 AI × 出海主场，算法已为你预排了 5 位高匹配人脉。", "先签到，再按推荐顺序聊；重点约「在推进」状态的人深聊。"),
        event("SAAS04", 92, "40 人小规模，全是 SaaS 出海创始人，深聊密度高。", "准备一个「最想被引荐的人」画像，让组织者帮你定向匹配。"),
        event("AIFND", 89, "应用层 AI 创始人与早期投资人夜场，正对你的方向。", "一句话讲清产品和今晚想达成的事，Demo 环节主动展示。"),
      ],
    },
  };

  return {
    scenarios,
    suggests: [
      { label: "找金融 AI 方向的人脉", q: scenarios.people.q, icon: "users" },
      { label: "想认识女装设计师", q: scenarios.peopleToEvents.q, icon: "handshake" },
      { label: "推荐 AI / 出海活动", q: scenarios.events.q, icon: "calendar" },
    ],
    history: [
      { id: "h1", group: "今天", when: "刚刚", title: "金融 AI 产品找谁合作", q: scenarios.people.q },
      { id: "h2", group: "今天", when: "2 小时前", title: "想认识女装设计师", q: scenarios.peopleToEvents.q },
      { id: "h3", group: "本周", when: "昨天", title: "AI / 出海主题活动推荐", q: scenarios.events.q },
      { id: "h4", group: "本周", when: "周一", title: "找能谈云服务降本的人", q: "帮我从人脉里找能谈云服务降本的人" },
      { id: "h5", group: "更早", when: "上周三", title: "品牌联名的合适人选", q: "我想做品牌联名合作，找谁合适？" },
      { id: "h6", group: "更早", when: "6 月 18 日", title: "半导体供应链的局", q: "最近有什么半导体或硬科技供应链的活动" },
    ],
  };
}
