// R17 — 主办方资料（一个 actor 可以有多份，A13）与公开主办方页 `/o/[slug]`。Owner: 甲 (R17).
// Used by: host（資料一覧と編集、建活动「所属する主催者ページ」）、公开页（Web `/o/[slug]`、App `o/[slug]`）。
// DESIGN §2.11。数字口径：開催回数 = 资料下已发布且已结束的场次；累計参加者 = 这些场次的受付人数合计；
// 过去活动行「参加 N名」= 受付人数；フォロワー = 关注数。只列 published（未来 / 已结束）的活动，不列草稿和已中止。

export type OrganizerProfileVisibility = "public" | "link_only";

export interface OrganizerProfile {
  profileId: string;
  slug: string;
  displayName: string;
  emoji: string | null;
  bio: string | null;
  visibility: OrganizerProfileVisibility;
  eventCount: number;
  updatedAt: string;
  sample?: true;
}

/** `GET /api/host/organizer-profiles`（我的资料）。 */
export interface OrganizerProfileListResponse {
  profiles: readonly OrganizerProfile[];
  sample?: true;
}

/** `POST /api/host/organizer-profiles`（建）与 `PUT …/[id]`（改）。slug 由名称转写，冲突加序号；公开后不变。 */
export interface OrganizerProfileInput {
  displayName: string;
  emoji?: string | null;
  bio?: string | null;
  visibility?: OrganizerProfileVisibility;
  /** 只在新建时可选指定；已有的 slug 不改。 */
  slug?: string | null;
}

export interface OrganizerProfileStats {
  eventsHeld: number;
  attendeesTotal: number;
  followers: number;
}

export interface OrganizerPublicUpcoming {
  eventId: string;
  title: string;
  emoji: string | null;
  startsAt: string;
  venue: string | null;
  /** 「¥5,000」「無料」——已按参加費显示方式排好的文字所需字段。 */
  feeKind: "free" | "amount" | "pay_at_door" | "external_link";
  feeAmountYen: number | null;
  /** 残り N席（无定员时 null）。 */
  remainingSeats: number | null;
  /** 「申込受付前」：申込还没开始（b12 #474）。 */
  registrationOpen: boolean;
  /** 申込页（`/e/<slug>` 或 `/app/events/<id>`）。 */
  href: string;
}

export interface OrganizerPublicPast {
  eventId: string;
  title: string;
  emoji: string | null;
  startsAt: string;
  /** 参加 N名 = 受付人数。 */
  attended: number;
}

/** 公开 `GET /api/organizers/by-slug/[slug]`（未登录可读；`following` 未登录为 null）。 */
export interface OrganizerPublicResponse {
  profile: OrganizerProfile;
  /** 关注用的主办方 key（R27 `organizerKeyFor`），给 `POST /api/organizers/[id]/follow`。 */
  organizerKey: string;
  stats: OrganizerProfileStats;
  following: boolean | null;
  upcoming: readonly OrganizerPublicUpcoming[];
  past: readonly OrganizerPublicPast[];
  pastTotal: number;
  sample?: true;
}
