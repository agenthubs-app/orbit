/**
 * 管理后台「读取量」页文案。口径（Sprint 0122，Codex 99-C）：数字只覆盖记录了
 * 数据库读取的请求（抽样后放大）；不读数据库的请求没有小票，缺账号的读取归入未归属。
 */
type Copy = Record<string, { zh: string; en: string }>;
export const READ_COST_ADMIN_COPY = {
  title: { zh: "读取量", en: "Read volume" },
  subtitle: { zh: "只统计记录了数据库读取的请求，按每日汇总计算（UTC 日），数字按抽样率放大；不读数据库的请求不在内，缺账号的读取记为未归属。", en: "Counts only requests with recorded database reads, from daily rollups (UTC days), scaled by sample rate. Requests that read no database are not included; reads without an account are unattributed." },
  back: { zh: "返回管理后台", en: "Back to admin" },
  days: { zh: "最近 7 天总量与 Neon 对账", en: "Last 7 days vs. Neon transfer" },
  day: { zh: "日期", en: "Day" },
  requests: { zh: "记录读取的请求", en: "Requests with recorded reads" },
  recorded: { zh: "我们记录的读取", en: "Recorded reads" },
  neon: { zh: "Neon 传输量", en: "Neon transfer" },
  coverage: { zh: "覆盖率", en: "Coverage" },
  unavailable: { zh: "未取得（未配置 Neon 用量接口）", en: "Unavailable (Neon usage API not configured)" },
  failed: { zh: "未取得（Neon 接口出错）", en: "Unavailable (Neon request failed)" },
  pending: { zh: "尚未汇总", en: "Not rolled up yet" },
  routes: { zh: "最费的 20 个接口（7 天）", en: "Top 20 routes (7 days)" },
  route: { zh: "接口", en: "Route" },
  avg: { zh: "平均每次", en: "Avg per request" },
  total: { zh: "合计", en: "Total" },
  max: { zh: "单次最大", en: "Largest request" },
  accounts: { zh: "最费的 20 个用户（7 天，不含未归属的读取）", en: "Top 20 accounts (7 days, unattributed reads excluded)" },
  account: { zh: "账号编号", en: "Account ID" },
  trend: { zh: "接口 30 天趋势", en: "30-day route trend" },
  peak: { zh: "最高", en: "Peak" },
  trendHint: { zh: "点上表中的接口切换。柱高为平均每次读取量。", en: "Pick a route above. Bar height is the average read per request." },
  alerts: { zh: "最近报警（30 天）", en: "Recent alerts (30 days)" },
  noData: { zh: "暂无数据", en: "No data yet" },
  notified: { zh: "已通知", en: "Notified" },
  waiting: { zh: "待通知", en: "Pending" },
} satisfies Copy;
