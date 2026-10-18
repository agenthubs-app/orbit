import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { pickCopy, type OrbitCopyTable } from "./types";

// R29: the admin pages have no board. These strings describe existing, actor-scoped
// read sources and never imply a platform role or an unwired write action.
export const adminCopy = {
  loginTitle: { ja: "管理画面への入口", zh: "后台入口", en: "Admin access", kind: "title" },
  loginHeading: { ja: "アカウントでログイン", zh: "使用账号登录", en: "Sign in with your account", kind: "title" },
  loginDescription: { ja: "ログイン後、このアカウントで見られる記録を確認します。ログインしても管理者権限は付与されません。", zh: "登录后核对当前账号可查看的来源记录。登录不会授予管理员角色。", en: "Sign in to check source records available to your account. Signing in does not grant an admin role.", kind: "body" },
  loginAction: { ja: "アカウントでログイン", zh: "继续账号登录", en: "Sign in to account", kind: "button" },
  workspace: { ja: "管理ワークスペース", zh: "管理工作区", en: "Admin workspace", kind: "label" },
  dashboard: { ja: "概要", zh: "概览", en: "Overview", kind: "button" },
  events: { ja: "イベント", zh: "活动", en: "Events", kind: "button" },
  exit: { ja: "管理画面を閉じる", zh: "退出后台", en: "Exit admin", kind: "button" },
  readOnly: { ja: "閲覧専用", zh: "只读来源", en: "Read-only source", kind: "chip" },
  dashboardTitle: { ja: "主催者の管理画面", zh: "主办方后台", en: "Organizer workspace", kind: "title" },
  eventsTitle: { ja: "イベントの記録", zh: "活动来源记录", en: "Event source records", kind: "title" },
  eventSource: { ja: "このアカウントのイベント", zh: "当前账号的活动", en: "Events for this account", kind: "title" },
  statRecords: { ja: "イベント記録", zh: "活动记录", en: "Event records", kind: "label" },
  statUpcoming: { ja: "開催予定", zh: "即将开始", en: "Upcoming", kind: "label" },
  statActive: { ja: "開催中", zh: "进行中", en: "Live", kind: "label" },
  statEnded: { ja: "終了", zh: "已结束", en: "Ended", kind: "label" },
  eventCount: { ja: "{count} 件の記録", zh: "{count}条记录", en: "Records: {count}", kind: "label" },
  accountProfile: { ja: "現在のアカウント情報", zh: "当前账号资料", en: "Current account profile", kind: "title" },
  emailUnavailable: { ja: "メールアドレスは確認できません", zh: "邮箱资料不可用", en: "Email unavailable", kind: "label" },
  dataBoundary: { ja: "データの範囲", zh: "数据边界", en: "Data boundary", kind: "title" },
  boundary: { ja: "ここでは現在のアカウントの記録のみ確認できます。申込、受付、定員、マッチング、チームの数値には専用の確認済みデータが必要です。", zh: "这里仅核对当前账号的来源记录。报名、签到、容量、匹配和团队数字需要专用可信数据源。", en: "Only source records for this account appear here. Registration, check-in, capacity, matching and team metrics need dedicated trusted sources.", kind: "body" },
  all: { ja: "すべて", zh: "全部", en: "All", kind: "label" },
  active: { ja: "開催中", zh: "进行中", en: "Live", kind: "label" },
  upcoming: { ja: "開催予定", zh: "即将开始", en: "Upcoming", kind: "label" },
  ended: { ja: "終了", zh: "已结束", en: "Ended", kind: "label" },
  noEvents: { ja: "イベントの記録はありません", zh: "暂无活动来源记录", en: "No event source records", kind: "title" },
  noSummary: { ja: "概要は登録されていません", zh: "来源未提供摘要", en: "No source summary", kind: "label" },
  openEvent: { ja: "イベントを開く", zh: "打开活动", en: "Open event", kind: "button" },
  platformTitle: { ja: "プラットフォーム管理は利用できません", zh: "平台管理暂不可用", en: "Platform administration is unavailable", kind: "title" },
  platformDescription: { ja: "確認済みのプラットフォーム管理者情報と専用データがまだありません。個人のワークスペースに戻れます。", zh: "当前没有可验证的平台管理员身份和专用数据源。可返回个人工作区。", en: "Verified platform admin identity and a dedicated data source are not available. Return to your workspace.", kind: "body" },
  backWorkspace: { ja: "ワークスペースに戻る", zh: "返回个人工作区", en: "Back to workspace", kind: "button" },
  readCostUnavailable: { ja: "読み取り量を表示できません", zh: "读取量暂不可用", en: "Read volume is unavailable", kind: "title" },
  readCostFailure: { ja: "集計データを読み込めませんでした。時間をおいてもう一度お試しください。", zh: "汇总数据读取失败，请稍后重试。", en: "The rollup could not be loaded. Please retry shortly.", kind: "body" },
  readCostRuntime: { ja: "集計データへの接続がありません。再試行できます。", zh: "汇总数据连接未就绪，可稍后重试。", en: "The rollup connection is unavailable. You can retry.", kind: "body" },
  retry: { ja: "再試行", zh: "重试", en: "Retry", kind: "button" },
  stateEmptyTitle: { ja: "管理画面の準備ができていません", zh: "管理工作区尚未就绪", en: "Admin workspace is not ready", kind: "title" },
  stateEmptyDescription: { ja: "イベントとプロフィールの記録がまだありません。", zh: "当前尚无可查看的活动和个人资料。", en: "Event and profile records are not available yet.", kind: "body" },
  statePendingTitle: { ja: "管理画面を読み込み中", zh: "正在加载管理工作区", en: "Admin workspace is loading", kind: "title" },
  statePendingDescription: { ja: "イベントまたはプロフィールの読み込みが終わるまでお待ちください。", zh: "请等待活动或个人资料读取完成。", en: "Waiting for event or profile data to load.", kind: "body" },
  stateFailureTitle: { ja: "管理画面を読み込めませんでした", zh: "管理工作区加载失败", en: "Admin workspace could not load", kind: "title" },
  stateFailureDescription: { ja: "イベントまたはプロフィールの情報を確認できませんでした。後でもう一度お試しください。", zh: "活动或个人资料来源暂时无法读取，请稍后重试。", en: "Event or profile sources could not be loaded. Please retry later.", kind: "body" },
  returnEvents: { ja: "イベントに戻る", zh: "返回活动", en: "Return to events", kind: "button" },
  returnEventsDescription: { ja: "イベントの情報を確認します。", zh: "查看活动来源记录。", en: "Review event source records.", kind: "body" },
  returnProfile: { ja: "プロフィールを確認", zh: "查看个人资料", en: "Review profile", kind: "button" },
  returnProfileDescription: { ja: "ワークスペースのプロフィールを確認します。", zh: "核对工作区个人资料。", en: "Review the workspace profile.", kind: "body" },
} as const satisfies OrbitCopyTable;

export type AdminCopyKey = keyof typeof adminCopy;
export function adminText(key: AdminCopyKey, language: OrbitLanguage): string {
  return pickCopy(adminCopy[key], language);
}

export function adminRouteStateText(scenario: "empty" | "pending" | "failure", language: OrbitLanguage) {
  const keys = {
    empty: ["stateEmptyTitle", "stateEmptyDescription"],
    pending: ["statePendingTitle", "statePendingDescription"],
    failure: ["stateFailureTitle", "stateFailureDescription"],
  } as const;
  const [titleKey, descriptionKey] = keys[scenario];
  return {
    title: adminText(titleKey, language),
    description: adminText(descriptionKey, language),
  };
}

export function adminRecoveryText(id: string, language: OrbitLanguage) {
  const isEvents = id === "admin-return-events";
  return {
    label: adminText(isEvents ? "returnEvents" : "returnProfile", language),
    description: adminText(isEvents ? "returnEventsDescription" : "returnProfileDescription", language),
  };
}
