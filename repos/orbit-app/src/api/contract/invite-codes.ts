// R08 contract 4 — invite codes and links. Owner: 甲 (R15). Used by: 人脈「＋」, home.
export interface InviteSharedFields {
  displayName: string;
  organization?: string;
  role?: string;
  // R15（§4.2）追加
  /** 提供できること（服务端按键从资料读出）。 */
  offering?: string[];
  /** 求めていること。 */
  seeking?: string[];
  /** 只出现在连上之后的响应里；公开预览永远不含。 */
  email?: string;
  /** 只出现在连上之后的响应里；公开预览永远不含。 */
  phone?: string;
}

export interface InviteCodeContract {
  /** 8 characters as XXXX-XXXX. */
  code: string;
  link: string;
  /** At most 10. */
  maxUses: number;
  usedCount: number;
  /** 7 days after creation. */
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
  shared: InviteSharedFields;
  sample?: true;
}

/** Public preview: only what the inviter chose to share. */
export interface InviteCodePreview {
  code: string;
  expiresAt: string;
  shared: InviteSharedFields;
  sample?: true;
  // R15（§4.2）追加
  /** 缺省 = active。只有真实存在、未作废、未被替换、过期不到 30 天的码才会带 expired / full；其余一律 404。读取端未知值按 expired（保守：不让人以为还能用）。 */
  status?: "active" | "expired" | "full";
  /** 登录时才算：我和邀请人已经连着。 */
  inviterAlreadyConnected?: boolean;
  /** 登录时才算：这是我自己的码。 */
  isOwnCode?: boolean;
}

/** POST /api/invite-codes — the inviter picks what to share and how many people may use it. */
export interface InviteCodeCreateInput {
  shared: InviteSharedFields;
  /** 1–10. */
  maxUses: number;
  idempotencyKey: string;
  // R15（§4.2）追加
  /** 共享哪些项目（live 只认这个、忽略 `shared` 里的值）；缺省 = organization / offering / seeking。 */
  sharedKeys?: InviteSharedFieldKey[];
}

export interface InviteCodeRedeemResult {
  outcome: "connected" | "merged" | "already_connected";
  contactId: string;
  // R15（§4.2）追加
  /** 对方（邀请人）共享给我的，完成页用。 */
  peer?: InviteSharedFields;
}

// ── R15（DESIGN add-and-invite §2.4–2.6、§4.2、§6）：只加不改。Owner: 甲 (R15).
// Used by: 发出方（App contacts/new/invite、Web 人脈を追加 › 招待コード）、接收方 /i/<code>（两端）、
// 联系人详情的「共有する項目」「つながりを解除」（R11 挂载）。

/**
 * 发码 / 兑换时选择共享的项目键（名字总是共享，不在这里）。客户端只传键，值一律由服务端从本人资料读：
 * `organization` = 会社・役職，`offering` = 提供できること，`seeking` = 求めていること，`email` / `phone` = 連絡先。
 */
export type InviteSharedFieldKey = "organization" | "offering" | "seeking" | "email" | "phone";

/** POST /api/invite-codes/[code]/redeem 的请求体（R15 起必填）。 */
export interface InviteCodeRedeemInput {
  idempotencyKey: string;
  /** 我共享给邀请人的项目（可以为空：只共享名字）。 */
  sharedKeys: InviteSharedFieldKey[];
}

/** 失败时 `error.context.reason`：不存在 / 作废 / 被替换 / 格式错 / 过期超过 30 天 / 被限流都是 INVITE_UNAVAILABLE（防枚举，§6）。 */
export type InviteCodeFailureReason = "INVITE_UNAVAILABLE" | "INVITE_EXPIRED" | "INVITE_FULL" | "OWN_CODE";

/** 履历里一个码的状态（读取端未知值按 expired）。 */
export type InviteCodeHistoryStatus = "active" | "expired" | "revoked" | "superseded" | "full";

export interface InviteCodeHistoryJoined {
  contactId: string;
  displayName: string;
  joinedAt: string;
}

export interface InviteCodeHistoryItem {
  code: string;
  createdAt: string;
  expiresAt: string;
  status: InviteCodeHistoryStatus;
  usedCount: number;
  maxUses: number;
  /** 用这个码连上的人（点名字进联系人详情）。 */
  joined: InviteCodeHistoryJoined[];
  sample?: true;
}

/** GET /api/invite-codes：最近 20 个码，新的在前。 */
export interface InviteCodeHistoryResponse {
  items: InviteCodeHistoryItem[];
}

/** GET /api/invite-codes/connections/[contactId]：这条联系人是招待连接时（否则 404）。 */
export interface InviteConnectionView {
  contactId: string;
  connectedAt: string;
  via: { code: string };
  /** 我共享给对方的项目。 */
  sharedByMe: InviteSharedFieldKey[];
  /** 对方共享给我的项目。 */
  sharedByPeer: InviteSharedFieldKey[];
  /** 我自己改过、因此停止同步的字段。 */
  pausedFields: InviteSharedFieldKey[];
  sample?: true;
}

/** PUT /api/invite-codes/connections/[contactId]/share：改我共享给对方的项目（下一轮同步生效）。 */
export interface InviteShareUpdateInput {
  sharedKeys: InviteSharedFieldKey[];
  idempotencyKey: string;
}

/** POST /api/invite-codes/connections/[contactId]/unlink：解除连接（不通知对方）。 */
export interface InviteUnlinkInput {
  /** true = 我这边留作只有名字和公司的普通联系人；false = 删除。 */
  keepAsContact: boolean;
  idempotencyKey: string;
}

export interface InviteUnlinkResult {
  outcome: "unlinked";
  keptContactId?: string;
}
