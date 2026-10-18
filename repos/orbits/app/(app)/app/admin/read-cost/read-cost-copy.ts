/**
 * 管理后台「读取量」页文案。口径（Sprint 0122，Codex 99-C）：数字只覆盖记录了
 * 数据库读取的请求（抽样后放大）；不读数据库的请求没有小票，缺账号的读取归入未归属。
 */
type Copy = Record<string, { zh: string; en: string; ja: string }>;
export const READ_COST_ADMIN_COPY = {
  title: { zh: "读取量", en: "Read volume", ja: "読み取り量" },
  subtitle: { zh: "只统计记录了数据库读取的请求，按每日汇总计算（UTC 日），数字按抽样率放大；不读数据库的请求不在内，缺账号的读取记为未归属。", en: "Counts only requests with recorded database reads, from daily rollups (UTC days), scaled by sample rate. Requests that read no database are not included; reads without an account are unattributed.", ja: "データベースの読み取りを記録したリクエストのみ、UTC 日の集計から表示します。抽出率で拡大換算し、読み取りのないリクエストは含みません。アカウントがない読み取りは未帰属です。" },
  back: { zh: "返回管理后台", en: "Back to admin", ja: "管理画面に戻る" },
  days: { zh: "最近 7 天总量与 Neon 对账", en: "Last 7 days vs. Neon transfer", ja: "直近 7 日間と Neon 転送量の照合" },
  day: { zh: "日期", en: "Day", ja: "日付" },
  requests: { zh: "记录读取的请求", en: "Requests with recorded reads", ja: "読み取りを記録したリクエスト" },
  recorded: { zh: "我们记录的读取", en: "Recorded reads", ja: "記録された読み取り" },
  neon: { zh: "Neon 传输量", en: "Neon transfer", ja: "Neon 転送量" },
  coverage: { zh: "覆盖率", en: "Coverage", ja: "カバー率" },
  unavailable: { zh: "未取得（未配置 Neon 用量接口）", en: "Unavailable (Neon usage API not configured)", ja: "取得不可（Neon 使用量 API 未設定）" },
  failed: { zh: "未取得（Neon 接口出错）", en: "Unavailable (Neon request failed)", ja: "取得不可（Neon API エラー）" },
  pending: { zh: "尚未汇总", en: "Not rolled up yet", ja: "集計待ち" },
  routes: { zh: "最费的 20 个接口（7 天）", en: "Top 20 routes (7 days)", ja: "読み取り量の多い上位 20 ルート（7 日間）" },
  route: { zh: "接口", en: "Route", ja: "ルート" },
  avg: { zh: "平均每次", en: "Avg per request", ja: "1 回あたり平均" },
  total: { zh: "合计", en: "Total", ja: "合計" },
  max: { zh: "单次最大", en: "Largest request", ja: "1 回の最大値" },
  accounts: { zh: "最费的 20 个用户（7 天，不含未归属的读取）", en: "Top 20 accounts (7 days, unattributed reads excluded)", ja: "読み取り量の多い上位 20 アカウント（7 日間、未帰属を除く）" },
  account: { zh: "账号编号", en: "Account ID", ja: "アカウント ID" },
  trend: { zh: "接口 30 天趋势", en: "30-day route trend", ja: "ルートの 30 日間推移" },
  peak: { zh: "最高", en: "Peak", ja: "最大" },
  trendHint: { zh: "可在上表切换接口。柱高为平均每次读取量。", en: "Switch routes above. Bar height is the average read per request.", ja: "上の表でルートを切り替えられます。棒の高さは 1 回あたりの平均読み取り量です。" },
  alerts: { zh: "最近报警（30 天）", en: "Recent alerts (30 days)", ja: "最近のアラート（30 日間）" },
  noData: { zh: "暂无数据", en: "No data yet", ja: "データはありません" },
  emptyMessage: { zh: "所选时段没有记录到数据库读取。", en: "No database reads were recorded in this period.", ja: "この期間に記録されたデータベースの読み取りはありません。" },
  notified: { zh: "已通知", en: "Notified", ja: "通知済み" },
  waiting: { zh: "待通知", en: "Pending", ja: "通知待ち" },
} satisfies Copy;
