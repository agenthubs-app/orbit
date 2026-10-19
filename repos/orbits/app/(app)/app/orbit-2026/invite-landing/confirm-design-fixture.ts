import type { InviteProfileRead } from "../add/invite/invite-api";

/** b11 #12's read-only sample, used only by the local-mock ?design=confirm state. */
export const INVITE_CONFIRM_SAMPLE_PROFILE: InviteProfileRead["profile"] = {
  displayName: "高橋 美咲",
  organization: "青葉 VC",
  role: "投資担当",
  offering: ["投資・資金調達"],
  seeking: [],
  handles: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

export const INVITE_CONFIRM_SAMPLE_INVITER = "佐藤 健一";
