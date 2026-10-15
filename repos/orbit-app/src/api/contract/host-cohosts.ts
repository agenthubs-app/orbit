// R17 — 主催：共同運営者（抽屉）与「共同運営に参加」。Owner: 甲 (R17). Used by: host (Web 抽屉 / 落地页, App 落地 / 输码)。
// DESIGN §2.8。角色：画板「管理者 / 受付 / 閲覧」= `manager` / `check_in` / `read_only_analyst`（A9 照画板）。
// 邀请安全：链接令牌 ≥128 bit、单次、7 天；指定了邮箱 / Orbit ID 时只能同一账号接受；短码 `H-` 前缀、限流；
// 界面反馈不暴露邮箱是否注册；只给已有账号者写站内通知，不给陌生地址发邮件。

export type HostCohostRole = "manager" | "check_in" | "read_only_analyst";

export interface HostCohostMember {
  actorId: string;
  name: string;
  initial: string;
  org: string | null;
  /** owner 不可移除、不可改。 */
  role: "owner" | HostCohostRole;
  isMe: boolean;
  /** 角色头版本（改 / 移除时带上）。 */
  revision: number;
}

export interface HostCohostInvite {
  inviteId: string;
  role: HostCohostRole;
  /** 只显示被邀请人的打码形式（`ta***@example.com`）或 Orbit 名字；不回显完整邮箱。 */
  inviteeLabel: string | null;
  expiresAt: string;
}

export interface HostCohostHistoryItem {
  at: string;
  /** 「伊藤 直子 を管理者に」「渡辺 翔 を招待（閲覧）」。 */
  subjectName: string;
  action: "granted" | "changed" | "revoked" | "invited";
  role: "owner" | HostCohostRole | null;
  reason: string;
  byName: string;
}

/** `GET /api/host/events/[id]/cohosts`。 */
export interface HostCohostsResponse {
  eventId: string;
  eventTitle: string;
  members: readonly HostCohostMember[];
  invites: readonly HostCohostInvite[];
  history: readonly HostCohostHistoryItem[];
  canManage: boolean;
  sample?: true;
}

/** `POST /api/host/events/[id]/cohost-invites`。`target` 是邮箱或 Orbit ID（空 = 只发链接 / 码）。 */
export interface HostCohostInviteInput {
  role: HostCohostRole;
  target?: string | null;
  idempotencyKey: string;
}

export interface HostCohostInviteResult {
  inviteId: string;
  /** 招待リンク（`/app/host/join/<令牌>`；只在创建时返回一次）。 */
  link: string;
  /** 招待コード `H-XXXX-XXXX`。 */
  shortCode: string;
  expiresAt: string;
}

/** `PATCH /api/host/events/[id]/cohosts/[actorId]`：改角色（变更理由必填 1–100 字）。 */
export interface HostCohostRoleInput {
  role: HostCohostRole;
  reason: string;
  expectedRevision: number;
}

/** `DELETE /api/host/events/[id]/cohosts/[actorId]`。 */
export interface HostCohostRemoveInput {
  reason: string;
  expectedRevision: number;
}

/** `GET /api/host/cohost-invites/[code]`：落地页预览（令牌或短码）。无效 / 过期 / 已用都返回 `valid: false`，不区分原因。 */
export interface HostCohostInvitePreview {
  valid: boolean;
  eventId: string | null;
  eventTitle: string | null;
  organizerName: string | null;
  inviterName: string | null;
  role: HostCohostRole | null;
  expiresAt: string | null;
  sample?: true;
}

/** `POST /api/host/cohost-invites/[code]/accept`：服务端以邀请为凭证授予（不要求接受者有 `roles.manage`）。 */
export interface HostCohostAcceptResult {
  eventId: string;
  role: HostCohostRole;
  /** 接受后去哪（受付 → kiosk，其余 → 运营台）。 */
  href: string;
}

/** 「受付だけ担当」：只列我有 `check_in` 的活动。`GET /api/host/check-in-events`。 */
export interface HostCheckInEventsResponse {
  events: readonly HostCheckInEventItem[];
  sample?: true;
}

export interface HostCheckInEventItem {
  eventId: string;
  title: string;
  emoji: string | null;
  startsAt: string | null;
  venue: string | null;
}
