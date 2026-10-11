/**
 * R15 招待コード服务端的内部类型（DESIGN add-and-invite §2.4–2.6、§3.2、§6）。Owner: 甲 (R15).
 * Used by: `features/invite-codes/{repository,service,sync,handlers,configured}.ts`。
 *
 * 对外契约在 `shared/contract/invite-codes.ts`（只加不改）；这里是服务端自己的行、端口与错误。
 */
import type { InviteSharedFieldKey } from "../../shared/contract/invite-codes";

/** 码的有效期：7 天（DESIGN §2.4）。 */
export const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 过期不到 30 天的真码还能预览（显示「请对方重发」），超过按「使えません」处理（§2.5 第 6 条、§6 第 2 条）。 */
export const INVITE_EXPIRED_PREVIEW_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_DEFAULT_MAX_USES = 10;
export const INVITE_HISTORY_LIMIT = 20;
/** 码冲突（全局唯一）时最多重试的次数（§6 第 1 条）。 */
export const INVITE_CODE_GENERATE_ATTEMPTS = 5;

/** 失败码 → HTTP：UNAVAILABLE 404（防枚举，响应逐字节相同）；EXPIRED / FULL / OWN_CODE / PROFILE_REQUIRED 409；NOT_FOUND 404。 */
export type InviteCodeErrorCode =
  | "UNAVAILABLE"
  | "EXPIRED"
  | "FULL"
  | "OWN_CODE"
  | "PROFILE_REQUIRED"
  | "NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "CONFLICT"
  | "INVALID";

export class InviteCodeError extends Error {
  readonly code: InviteCodeErrorCode;

  constructor(code: InviteCodeErrorCode, message: string) {
    super(message);
    this.name = "InviteCodeError";
    this.code = code;
  }
}

/** 本人资料里招待会用到的部分（值一律由服务端读，客户端只传键）。列表已去空、去重。 */
export interface InviteProfile {
  actorId: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  offering: string[];
  seeking: string[];
  email: string | null;
  phone: string | null;
  updatedAt: string;
}

/** 联系人上会被招待写入 / 同步的字段。名字总是共享；`organization` 键 = 会社 + 役職。 */
export type InviteSyncField = "displayName" | "organization" | "role" | "email" | "phone" | "offering" | "seeking";

export const INVITE_KEY_FIELDS: Readonly<Record<InviteSharedFieldKey, readonly InviteSyncField[]>> = {
  email: ["email"],
  offering: ["offering"],
  organization: ["organization", "role"],
  phone: ["phone"],
  seeking: ["seeking"],
};

/**
 * 一条联系人上「上次同步」的状态（存进连接行的 `*_synced`）。
 * - `values`：招待写进这条联系人、由对方资料「拥有」的字段 → 写入时的值（列表按换行拼成一个字符串比较）。
 *   不在 `values` 里的字段招待从没写过（例如统合时对方资料里没有），同步不会去清它。
 * - `profileUpdatedAt`：上次同步时对方资料的 `updatedAt`；与 `keys` 一起决定这一轮要不要处理。
 */
export interface InviteSyncedState {
  profileUpdatedAt: string | null;
  keys: InviteSharedFieldKey[];
  values: Partial<Record<InviteSyncField, string>>;
  at: string;
}

export interface InviteCodeRow {
  id: string;
  actorId: string;
  /** 8 位规范形式（无连字符）。 */
  code: string;
  sharedKeys: InviteSharedFieldKey[];
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  revokedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  idempotencyKey: string | null;
}

export type InviteSide = "inviter" | "redeemer";

export interface InviteConnectionRow {
  id: string;
  codeId: string;
  /** 连接所用的码（规范形式）。 */
  code: string;
  inviterActorId: string;
  redeemerActorId: string;
  outcome: "connected" | "merged";
  inviterContactId: string;
  redeemerContactId: string;
  inviterContactCreated: boolean;
  redeemerContactCreated: boolean;
  inviterSharedKeys: InviteSharedFieldKey[];
  redeemerSharedKeys: InviteSharedFieldKey[];
  inviterSynced: InviteSyncedState;
  redeemerSynced: InviteSyncedState;
  redeemerIdempotencyKey: string;
  createdAt: string;
  unlinkedAt: string | null;
  unlinkedBy: string | null;
  unlinkIdempotencyKey: string | null;
  unlinkKept: boolean | null;
}

/** 从某一方看一条连接：我的联系人（里面是对方的资料）、对方的联系人（里面是我的资料）。 */
export interface InviteConnectionPerspective {
  side: InviteSide;
  myActorId: string;
  peerActorId: string;
  /** 我人脈里的对方。 */
  myContactId: string;
  /** 对方人脈里的我。 */
  peerContactId: string;
  myContactCreated: boolean;
  peerContactCreated: boolean;
  /** 我共享给对方的键。 */
  sharedByMe: InviteSharedFieldKey[];
  /** 对方共享给我的键。 */
  sharedByPeer: InviteSharedFieldKey[];
  /** 我那条联系人的同步状态。 */
  mySynced: InviteSyncedState;
  /** 对方那条联系人的同步状态。 */
  peerSynced: InviteSyncedState;
}

export function perspectiveOf(row: InviteConnectionRow, actorId: string): InviteConnectionPerspective | null {
  if (row.inviterActorId === actorId) {
    return {
      myActorId: row.inviterActorId,
      myContactCreated: row.inviterContactCreated,
      myContactId: row.inviterContactId,
      mySynced: row.inviterSynced,
      peerActorId: row.redeemerActorId,
      peerContactCreated: row.redeemerContactCreated,
      peerContactId: row.redeemerContactId,
      peerSynced: row.redeemerSynced,
      sharedByMe: row.inviterSharedKeys,
      sharedByPeer: row.redeemerSharedKeys,
      side: "inviter",
    };
  }
  if (row.redeemerActorId === actorId) {
    return {
      myActorId: row.redeemerActorId,
      myContactCreated: row.redeemerContactCreated,
      myContactId: row.redeemerContactId,
      mySynced: row.redeemerSynced,
      peerActorId: row.inviterActorId,
      peerContactCreated: row.inviterContactCreated,
      peerContactId: row.inviterContactId,
      peerSynced: row.inviterSynced,
      sharedByMe: row.redeemerSharedKeys,
      sharedByPeer: row.inviterSharedKeys,
      side: "redeemer",
    };
  }
  return null;
}

export function emptySyncedState(at: string): InviteSyncedState {
  return { at, keys: [], profileUpdatedAt: null, values: {} };
}
