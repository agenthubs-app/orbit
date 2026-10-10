// R08 contract 4 — invite codes and links. Owner: 甲 (R15). Used by: 人脈「＋」, home.
export interface InviteSharedFields {
  displayName: string;
  organization?: string;
  role?: string;
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
}

/** POST /api/invite-codes — the inviter picks what to share and how many people may use it. */
export interface InviteCodeCreateInput {
  shared: InviteSharedFields;
  /** 1–10. */
  maxUses: number;
  idempotencyKey: string;
}

export interface InviteCodeRedeemResult {
  outcome: "connected" | "merged" | "already_connected";
  contactId: string;
}
