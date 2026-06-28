export interface OrbitAdminEventView {
  cap: number;
  checkedin: number;
  code: string;
  g: string;
  id: string;
  matched: number;
  name: string;
  phase: number;
  registered: number;
  status: string;
}

export interface OrbitAdminMemberView {
  email: string;
  g: string;
  initial: string;
  name: string;
  role: string;
}

export interface OrbitAdminFeedView {
  company: string;
  g: string;
  id: string;
  initial: string;
  kind: string;
  name: string;
  t: string;
  title: string;
}

export interface OrbitAdminViewModel {
  adminEvents: OrbitAdminEventView[];
  adminFeed: OrbitAdminFeedView[];
  adminFunnel: Array<[string, number, number]>;
  adminMembers: OrbitAdminMemberView[];
  adminOrg: { g: string; initial: string; name: string; owner: string; sub: string };
  adminPhases: string[];
  adminStats: Array<{ delta: string; g: string; icon: string; label: string; value: string }>;
}

export interface OrbitPlatformReviewView {
  desc: string;
  facts: Array<[string, string]>;
  flags: string[];
  g: string;
  id: string;
  letter: string;
  name: string;
  org: string;
  submitted: string;
}

export interface OrbitPlatformAccountView {
  events: number;
  g: string;
  letter: string;
  name: string;
  owner: string;
  status: string;
}

export interface OrbitPlatformViewModel {
  orgAccounts: OrbitPlatformAccountView[];
  platformStats: Array<{ icon: string; label: string; note: string; tone: string; value: string }>;
  reviewQueue: OrbitPlatformReviewView[];
}

const adminEvents: OrbitAdminEventView[] = [
  { id: "e-tbc", name: "Tokyo Business Connect", code: "TBC26S", g: "g-indigo", phase: 3, registered: 142, cap: 160, checkedin: 96, matched: 71, status: "active" },
  { id: "e-saas", name: "SaaS 出海闭门局", code: "SAAS04", g: "g-emerald", phase: 1, registered: 48, cap: 60, checkedin: 0, matched: 0, status: "upcoming" },
  { id: "e-past", name: "跨境电商 Meetup", code: "XB25", g: "g-amber", phase: 4, registered: 88, cap: 100, checkedin: 82, matched: 64, status: "ended" },
  { id: "e-fin", name: "FinTech Tokyo Mixer", code: "FINTK8", g: "g-sky", phase: 2, registered: 72, cap: 120, checkedin: 0, matched: 0, status: "upcoming" },
];

const adminMembers: OrbitAdminMemberView[] = [
  { name: "李明", role: "拥有者", initial: "李", g: "g-indigo", email: "li@tbc.events" },
  { name: "佐藤 由香", role: "管理员", initial: "佐", g: "g-emerald", email: "sato@tbc.events" },
  { name: "王凯", role: "签到员", initial: "王", g: "g-sky", email: "wang@tbc.events" },
];

export function getOrbitAdminViewModel(): OrbitAdminViewModel {
  return {
    adminOrg: { name: "TBC 组委会", sub: "已认证主办方", owner: "li@tbc.events", initial: "T", g: "g-indigo" },
    adminEvents,
    adminPhases: ["创建", "报名", "签到", "匹配", "复盘"],
    adminStats: [
      { label: "总报名", value: "350", delta: "+18 今日", icon: "users", g: "g-indigo" },
      { label: "已签到", value: "178", delta: "51% 到场", icon: "checkCircle", g: "g-emerald" },
      { label: "完成匹配", value: "135", delta: "AI 已运行", icon: "sparkle", g: "g-violet" },
      { label: "进行中活动", value: "1", delta: "现场进行", icon: "zap", g: "g-amber" },
    ],
    adminFunnel: [["浏览详情页", 1240, 1], ["完成报名", 350, 0.28], ["现场签到", 178, 0.51]],
    adminFeed: [
      { id: "c1", name: "山田 健太", initial: "山", g: "g-indigo", company: "三菱商事", title: "VP", t: "2 分钟前", kind: "签到" },
      { id: "c2", name: "王芳", initial: "王", g: "g-slate", company: "华为日本", title: "COO", t: "9 分钟前", kind: "报名" },
      { id: "c3", name: "佐藤 美咲", initial: "佐", g: "g-emerald", company: "Sony", title: "Director", t: "16 分钟前", kind: "报名" },
      { id: "c4", name: "陈立", initial: "陈", g: "g-rose", company: "Parlay", title: "创始人", t: "23 分钟前", kind: "签到" },
      { id: "c5", name: "林雅玲", initial: "林", g: "g-amber", company: "Sequoia", title: "Partner", t: "30 分钟前", kind: "报名" },
      { id: "c6", name: "森田 健", initial: "森", g: "g-sky", company: "野村证券", title: "MD", t: "37 分钟前", kind: "报名" },
    ],
    adminMembers,
  };
}

export function getOrbitPlatformViewModel(): OrbitPlatformViewModel {
  return {
    platformStats: [
      { label: "主办方账号", value: "48", note: "+3 本周", icon: "building", tone: "indigo" },
      { label: "累计活动", value: "312", note: "+12 本周", icon: "calendar", tone: "live" },
      { label: "待审核", value: "3", note: "需处理", icon: "checkCircle", tone: "amber" },
      { label: "平台用户", value: "4,280", note: "+86 本周", icon: "users", tone: "sky" },
    ],
    reviewQueue: [
      { id: "r1", name: "深圳硬科技 Demo Day", org: "湾区创投", letter: "深", g: "g-rose", submitted: "2 小时前", desc: "面向硬科技创业者与产业投资人的 Demo Day，预计 120 人。", facts: [["预计人数", "120"], ["场地", "深圳湾"], ["日期", "8月20日"]], flags: ["新主办方", "大型活动"] },
      { id: "r2", name: "京都茶道 × 商务雅集", org: "和敬塾", letter: "京", g: "g-emerald", submitted: "5 小时前", desc: "结合茶道体验的高端小型商务社交，限 30 人。", facts: [["预计人数", "30"], ["场地", "京都"], ["日期", "9月3日"]], flags: ["小型活动"] },
      { id: "r3", name: "大阪制造业供需对接会", org: "关西制造联盟", letter: "阪", g: "g-sky", submitted: "1 天前", desc: "制造业上下游供需对接，含工厂参访。", facts: [["预计人数", "200"], ["场地", "大阪"], ["日期", "9月10日"]], flags: ["大型活动", "需资质核验"] },
    ],
    orgAccounts: [
      { name: "TBC 组委会", events: 12, owner: "li@tbc.events", status: "已认证", letter: "T", g: "g-indigo" },
      { name: "出海邦", events: 8, owner: "ops@chuhaibang.com", status: "已认证", letter: "出", g: "g-emerald" },
      { name: "J-Tech", events: 5, owner: "contact@jtech.jp", status: "已认证", letter: "J", g: "g-slate" },
      { name: "湾区创投", events: 1, owner: "hello@bayvc.com", status: "待审", letter: "湾", g: "g-rose" },
      { name: "和敬塾", events: 2, owner: "info@wakei.jp", status: "已认证", letter: "和", g: "g-amber" },
    ],
  };
}
