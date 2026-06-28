export interface OrbitLandingEventView {
  address: string;
  agenda: OrbitEventAgendaItem[];
  brandColor: string;
  cap: number;
  code: string;
  descriptionZh: string;
  detailLogoUrl: string;
  endsAt: string;
  feeLabel: string;
  host: string;
  id: string;
  industry: string;
  logoUrl: string;
  mapX: number;
  mapY: number;
  name: string;
  organizer: string;
  participantCount: number;
  place: string;
  startsAt: string;
  stats: OrbitEventStatsView;
  status: "active" | "upcoming" | "ended";
  summaryZh: string;
  tags: string[];
  theme: string;
  venue: string;
  youRsvped: boolean;
}

export interface OrbitEventAgendaItem {
  description: string;
  label: string;
  time: string;
}

export interface OrbitEventAttendeeView {
  initial: string;
  name: string;
  role: string;
}

export interface OrbitEventStatsView {
  attendees: OrbitEventAttendeeView[];
  authed: boolean;
  count: number;
  youRsvped: boolean;
}

export interface OrbitLandingConnectionView {
  displayName: string;
  id: string;
  initial: string;
}

export interface OrbitLandingViewModel {
  account: {
    fullName: string;
  };
  connections: OrbitLandingConnectionView[];
  events: OrbitLandingEventView[];
}

const agendaEventColors: Record<string, string> = {
  TBC26S: "#6359E9",
  SAAS04: "#0E9E68",
  SEMI26: "#4A5468",
  FINTK8: "#2D7FF0",
  AIFND: "#8B3FD6",
  FASHN: "#E0415F",
  D2C03: "#8B3FD6",
  CONS5: "#E08A2B",
  XB25: "#E08A2B",
};

const themeByCode: Record<string, string> = {
  TBC26S: "ai",
  SAAS04: "cloud",
  SEMI26: "chip",
  FINTK8: "finance",
  AIFND: "ai",
  FASHN: "fashion",
  D2C03: "fashion",
  CONS5: "globe",
  XB25: "globe",
};

const tagsByCode: Record<string, string[]> = {
  TBC26S: ["AI 商务", "出海", "跨境"],
  SAAS04: ["出海", "SaaS"],
  SEMI26: ["硬科技", "制造"],
  FINTK8: ["金融", "FinTech"],
  AIFND: ["AI", "创业"],
  FASHN: ["时尚", "设计", "女装", "D2C"],
  D2C03: ["D2C", "消费", "品牌", "女装"],
  CONS5: ["消费", "零售", "时尚", "品牌"],
  XB25: ["电商", "跨境"],
};

const mapPositionByCode: Record<string, [number, number]> = {
  TBC26S: [52, 46],
  SAAS04: [49, 50],
  SEMI26: [40, 70],
  FINTK8: [55, 44],
  AIFND: [47, 52],
  FASHN: [50, 48],
  D2C03: [46, 54],
  CONS5: [54, 47],
  XB25: [42, 58],
};

const defaultAgenda: OrbitEventAgendaItem[] = [
  { time: "18:00", label: "入场签到 · 欢迎酒会", description: "领取专属座位卡与破冰任务" },
  { time: "18:45", label: "主题分享：2026 出海新地图", description: "三菱商事 × Sequoia 对谈" },
  { time: "19:30", label: "AI 圆桌配对", description: "按行业与诉求自动分桌，附破冰话术" },
  { time: "20:30", label: "自由社交 · 交换联系方式", description: "把今晚认识的人沉淀进名片夹" },
];

const attendeeSamples: OrbitEventAttendeeView[] = [
  { name: "山田 健太", initial: "山", role: "VP · 三菱商事" },
  { name: "王芳", initial: "王", role: "COO · 华为日本" },
  { name: "佐藤 美咲", initial: "佐", role: "Director · Sony" },
  { name: "陈立", initial: "陈", role: "创始人 · Parlay" },
  { name: "林雅玲", initial: "林", role: "Partner · Sequoia" },
  { name: "森田 健", initial: "森", role: "MD · 野村证券" },
  { name: "张伟", initial: "张", role: "CEO · 云启科技" },
  { name: "田中 由美", initial: "田", role: "Head of BD · Rakuten" },
];

const themeGlyphs: Record<string, string> = {
  ai: "<path d='M200 80l9 26 26 9-26 9-9 26-9-26-26-9 26-9z'/><circle cx='150' cy='96' r='4.5'/><circle cx='252' cy='150' r='4.5'/>",
  chip: "<rect x='169' y='93' width='62' height='54' rx='7'/><rect x='187' y='111' width='26' height='18' rx='3'/><path d='M186 93v-12M214 93v-12M186 147v12M214 147v12M169 108h-13M169 132h-13M231 108h13M231 132h13'/>",
  cloud: "<path d='M160 150a26 26 0 0 1 5-50 34 34 0 0 1 65 5 23 23 0 0 1 3 45z'/>",
  fashion: "<circle cx='200' cy='90' r='7'/><path d='M200 97l-46 44h92z'/><path d='M154 141h92'/>",
  finance: "<path d='M170 118v32M198 104v44M226 92v56'/><path d='M150 150l26-24 18 12 28-38 24 16' stroke-opacity='.6'/>",
  globe: "<circle cx='200' cy='120' r='42'/><path d='M158 120h84M200 78c-15 12-15 72 0 84M200 78c15 12 15 72 0 84M168 98c20 10 44 10 64 0M168 142c20-10 44-10 64 0'/>",
};

function coverSvg(color: string, theme: string, letter: string) {
  const glyph = themeGlyphs[theme] ?? themeGlyphs.ai;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 240'><defs><radialGradient id='h' cx='28%' cy='18%' r='95%'><stop offset='0' stop-color='#fff' stop-opacity='.34'/><stop offset='58%' stop-color='${color}' stop-opacity='0'/></radialGradient></defs><rect width='400' height='240' fill='${color}'/><rect width='400' height='240' fill='url(#h)'/><g fill='none' stroke='#fff' stroke-opacity='.2' stroke-width='1.3' stroke-dasharray='2 9'><circle cx='200' cy='120' r='150'/><circle cx='200' cy='120' r='112'/></g><g fill='none' stroke='#fff' stroke-opacity='.5' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'>${glyph}</g><text x='374' y='54' text-anchor='end' font-family='Inter Tight,Inter,sans-serif' font-size='30' font-weight='700' fill='#fff' fill-opacity='.18'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const eventDetailByCode: Record<string, {
  address: string;
  agenda: OrbitEventAgendaItem[];
  brandColor: string;
  cap: number;
  descriptionZh: string;
  endsAt: string;
  organizer: string;
  stats: OrbitEventStatsView;
  summaryZh: string;
  venue: string;
}> = {
  TBC26S: {
    address: "东京都港区赤坂 9-7-1",
    agenda: defaultAgenda,
    brandColor: "#6359E9",
    cap: 160,
    descriptionZh: "我们用算法把对的人安排到同一张圆桌，配上破冰话术，让每一次握手都不浪费。一个晚上，认识今年最值得认识的几个人。",
    endsAt: "2026-06-27T12:30:00.000Z",
    organizer: "TBC 组委会",
    stats: { attendees: attendeeSamples.slice(0, 8), authed: true, count: 142, youRsvped: true },
    summaryZh: "面向出海与跨境商务人群的高密度晚间社交局。",
    venue: "东京中城 · Hall B",
  },
  SAAS04: {
    address: "东京都港区六本木 6-10-1",
    agenda: defaultAgenda.slice(0, 3),
    brandColor: "#0E9E68",
    cap: 60,
    descriptionZh: "40 人小规模深聊，分享出海定价、本地化与渠道打法。",
    endsAt: "2026-07-20T09:00:00.000Z",
    organizer: "出海邦",
    stats: { attendees: attendeeSamples.slice(3, 7), authed: true, count: 48, youRsvped: true },
    summaryZh: "只面向 SaaS 创始人与增长负责人的闭门交流。",
    venue: "六本木 Hills",
  },
};

function eventView(
  id: string,
  code: string,
  name: string,
  theme: string,
  host: string,
  startsAt: string,
  status: OrbitLandingEventView["status"],
  place: string,
  participantCount: number,
  industry: string,
  youRsvped: boolean,
): OrbitLandingEventView {
  const [mapX, mapY] = mapPositionByCode[code] ?? [50, 50];
  const color = agendaEventColors[code] ?? "#6359E9";
  const logoUrl = coverSvg(color, themeByCode[code] ?? "ai", name.slice(0, 1));
  const detail = eventDetailByCode[code] ?? {
    address: "",
    agenda: defaultAgenda.slice(0, 3),
    brandColor: color,
    cap: participantCount,
    descriptionZh: `${name} 的活动介绍使用原型样例数据占位。`,
    endsAt: startsAt,
    organizer: host,
    stats: { attendees: attendeeSamples.slice(0, Math.min(6, attendeeSamples.length)), authed: true, count: participantCount, youRsvped },
    summaryZh: [industry, theme].filter(Boolean).join(" · "),
    venue: place,
  };
  return {
    address: detail.address,
    agenda: detail.agenda,
    brandColor: detail.brandColor,
    cap: detail.cap,
    code,
    descriptionZh: detail.descriptionZh,
    detailLogoUrl: logoUrl,
    endsAt: detail.endsAt,
    feeLabel: "免费 · 需审核",
    host,
    id,
    industry,
    logoUrl,
    mapX,
    mapY,
    name,
    organizer: detail.organizer,
    participantCount,
    place,
    startsAt,
    stats: detail.stats,
    status,
    summaryZh: detail.summaryZh,
    tags: tagsByCode[code] ?? [industry],
    theme,
    venue: detail.venue,
    youRsvped,
  };
}

export function getOrbitLandingViewModel(): OrbitLandingViewModel {
  return {
    account: { fullName: "李明" },
    connections: [
      { id: "c1", displayName: "山田 健太", initial: "山" },
      { id: "c2", displayName: "王芳", initial: "王" },
      { id: "c3", displayName: "佐藤 美咲", initial: "佐" },
      { id: "c4", displayName: "陈立", initial: "陈" },
      { id: "c5", displayName: "林雅玲", initial: "林" },
      { id: "c6", displayName: "森田 健", initial: "森" },
    ],
    events: [
      eventView("e-tbc", "TBC26S", "Tokyo Business Connect", "Spring 2026", "TBC 组委会", "2026-06-27T09:00:00.000Z", "active", "东京中城 · Hall B", 142, "AI 商务", true),
      eventView("e-saas", "SAAS04", "SaaS 出海闭门局", "第 4 期", "出海邦", "2026-07-20T05:00:00.000Z", "upcoming", "六本木 Hills", 48, "SaaS", true),
      eventView("e-semi", "SEMI26", "半导体 × 制造峰会", "2026 夏", "J-Tech", "2026-07-04T01:00:00.000Z", "upcoming", "横滨国际会议中心", 96, "硬科技", false),
      eventView("e-fin", "FINTK8", "FinTech Tokyo Mixer", "Vol.8", "Nomura", "2026-07-18T10:00:00.000Z", "upcoming", "丸之内 Bldg 35F", 72, "金融", false),
      eventView("e-ai", "AIFND", "AI Founders Night", "Summer", "Anthropic Tokyo", "2026-08-08T09:30:00.000Z", "upcoming", "涩谷 Stream Hall", 60, "AI", false),
      eventView("e-fashion", "FASHN", "东京时尚设计周 Mixer", "SS27", "Tokyo Fashion Lab", "2026-07-25T09:00:00.000Z", "upcoming", "表参道 Spiral Hall", 110, "时尚设计", false),
      eventView("e-d2c", "D2C03", "D2C 品牌出海沙龙", "第 3 期", "品牌出海邦", "2026-08-02T05:00:00.000Z", "upcoming", "代官山 T-Site", 56, "消费品牌", false),
      eventView("e-consumer", "CONS5", "消费升级闭门会", "Vol.5", "新消费研究所", "2026-08-15T06:00:00.000Z", "upcoming", "银座 Six 13F", 64, "新消费", false),
      eventView("e-past", "XB25", "跨境电商 Meetup", "2025 秋", "Rakuten", "2026-05-15T10:00:00.000Z", "ended", "二子玉川 Rise", 88, "电商", true),
    ],
  };
}

export function getOrbitEventDetailViewModel(code: string) {
  const normalized = String(code || "").toUpperCase();
  return getOrbitLandingViewModel().events.find((event) => event.code === normalized) ?? getOrbitLandingViewModel().events[0];
}
