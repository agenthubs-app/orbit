/**
 * R17 定型通知的固定文（host/DESIGN.md §2.10；b12 #406 / #410）。Owner: 甲 (R17).
 * 不调 AI；主办方只能附加「主催者からのひとこと」（≤140 字、不带链接，承認 / 繰り上げ / 中止 时显示）。
 */
import type { HostNoticeKind } from "../../../../shared/contract/host-notices";

type Lang = "ja" | "zh" | "en";
export interface NoticeContext {
  eventTitle: string;
  organizerName: string | null;
  startsAt?: string | null;
  venue?: string | null;
  receptionNumber?: string | null;
  role?: string | null;
}

type Template = Record<Lang, (c: NoticeContext) => { title: string; body: string }>;

const T: Record<HostNoticeKind, Template> = {
  admission_approved: {
    en: (c) => ({ body: `Your place at ${c.eventTitle} is confirmed. Show your check-in QR at the reception.`, title: "You're in" }),
    ja: (c) => ({ body: `${c.eventTitle} への参加が承認されました。当日は受付で QR を表示してください。`, title: "参加が承認されました" }),
    zh: (c) => ({ body: `你已获准参加${c.eventTitle}。当天请在签到处出示签到二维码。`, title: "参加已获批准" }),
  },
  admission_promoted: {
    en: (c) => ({ body: `A place opened up at ${c.eventTitle}. Your attendance is confirmed.`, title: "A place opened up" }),
    ja: (c) => ({ body: `キャンセルが出たため、${c.eventTitle} への参加が確定しました。`, title: "参加が確定しました" }),
    zh: (c) => ({ body: `有人取消，你参加${c.eventTitle}已确定。`, title: "参加已确定" }),
  },
  admission_rejected: {
    en: (c) => ({ body: `We could not offer you a place at ${c.eventTitle} this time due to capacity.`, title: "About your application" }),
    ja: (c) => ({ body: `今回は定員の都合により、${c.eventTitle} へのご参加をお見送りさせていただきます。`, title: "申込について" }),
    zh: (c) => ({ body: `因名额限制，这次未能安排你参加${c.eventTitle}。`, title: "关于你的报名" }),
  },
  admission_waitlisted: {
    en: (c) => ({ body: `You're on the waitlist for ${c.eventTitle}. We'll let you know if a place opens up.`, title: "You're on the waitlist" }),
    ja: (c) => ({ body: `${c.eventTitle} のキャンセル待ちとして受け付けました。空きが出たらお知らせします。`, title: "キャンセル待ちになりました" }),
    zh: (c) => ({ body: `你已进入${c.eventTitle}的候补名单，有空位会通知你。`, title: "已进入候补" }),
  },
  cohost_invite: {
    en: (c) => ({ body: `You've been invited to help run ${c.eventTitle}.`, title: "Co-host invitation" }),
    ja: (c) => ({ body: `${c.eventTitle} の共同運営に招待されました。`, title: "共同運営への招待" }),
    zh: (c) => ({ body: `你被邀请参与${c.eventTitle}的共同运营。`, title: "共同运营邀请" }),
  },
  desktop_link: {
    en: () => ({ body: "Open this on a computer to create events and edit the registration form.", title: "Open on a computer" }),
    ja: () => ({ body: "PC で開くと、イベントの作成と申込フォームの編集ができます。", title: "PC で開くリンク" }),
    zh: () => ({ body: "在电脑上打开，可以创建活动、编辑报名表。", title: "在电脑上打开" }),
  },
  event_cancelled: {
    en: (c) => ({ body: `${c.eventTitle} has been cancelled.`, title: `${c.eventTitle} is cancelled` }),
    ja: (c) => ({ body: `${c.eventTitle} は中止になりました。`, title: `${c.eventTitle} は中止になりました` }),
    zh: (c) => ({ body: `${c.eventTitle}已取消。`, title: `${c.eventTitle}已取消` }),
  },
  event_changed: {
    en: (c) => ({ body: `The date or venue of ${c.eventTitle} has changed. Please check the event page.`, title: "Date or venue changed" }),
    ja: (c) => ({ body: `${c.eventTitle} の日時・会場が変わりました。イベントページでご確認ください。`, title: "日時・会場が変わりました" }),
    zh: (c) => ({ body: `${c.eventTitle}的时间或地点有变动，请在活动页确认。`, title: "时间或地点有变动" }),
  },
  event_published: {
    en: (c) => ({ body: `${c.organizerName ?? "An organizer you follow"} has published ${c.eventTitle}.`, title: "New event" }),
    ja: (c) => ({ body: `${c.organizerName ?? "フォロー中の主催者"} が ${c.eventTitle} を公開しました。`, title: "新しいイベント" }),
    zh: (c) => ({ body: `${c.organizerName ?? "你关注的主办方"}发布了${c.eventTitle}。`, title: "新活动" }),
  },
  matching_published: {
    en: () => ({ body: "The table plan is out. Check who you're sitting with in the app.", title: "Tables are out" }),
    ja: () => ({ body: "テーブル編成を公開しました。アプリで同席者を確認できます。", title: "テーブル編成が公開されました" }),
    zh: () => ({ body: "分桌已公布，可在 App 里查看同桌的人。", title: "分桌已公布" }),
  },
  profile_incomplete: {
    en: () => ({ body: "Please complete your profile for the table matching (about 2 minutes).", title: "Complete your profile" }),
    ja: () => ({ body: "マッチングのためにプロフィールを完成させてください（所要 2分）。", title: "プロフィールを完成させてください" }),
    zh: () => ({ body: "为了分桌匹配，请补全个人资料（约 2 分钟）。", title: "请补全个人资料" }),
  },
};

const HOST_NOTE_KINDS = new Set<HostNoticeKind>(["admission_approved", "admission_promoted", "event_cancelled"]);
const NOTE_PREFIX: Record<Lang, string> = { en: "From the organizer: ", ja: "主催者より：", zh: "主办方：" };

export function renderHostNotice(kind: HostNoticeKind, context: NoticeContext, hostNote: string | null): Record<Lang, { title: string; body: string }> {
  const out = {} as Record<Lang, { title: string; body: string }>;
  for (const lang of ["ja", "zh", "en"] as const) {
    const base = T[kind][lang](context);
    out[lang] = hostNote && HOST_NOTE_KINDS.has(kind) ? { ...base, body: `${base.body}\n${NOTE_PREFIX[lang]}${hostNote}` } : base;
  }
  return out;
}
