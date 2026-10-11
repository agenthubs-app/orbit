// R15 招待コード · 接收方 /i/<code> (DESIGN add-and-invite §2.5, §6): which screen to show. Pure.
//   - the server reads the code through the same preview service as the API (same rate limit) and hands
//     over either a preview or "unavailable" (unknown / turned off / replaced / malformed / expired over
//     30 days are one and the same page; rate-limited adds 「しばらくしてから」);
//   - own code > already connected > expired / full > signed out > (signed in) profile check.
import type { InviteCodePreview, InviteCodeRedeemResult } from "../../../../../shared/contract/invite-codes";

export type InviteLandingInitial =
  | { kind: "preview"; preview: InviteCodePreview }
  | { kind: "unavailable"; limited: boolean };

export type InviteLandingView =
  | { view: "open" }
  | { view: "checking" }
  | { view: "profile" }
  | { view: "confirm" }
  | { view: "done"; result: InviteCodeRedeemResult }
  | { view: "expired" }
  | { view: "full" }
  | { view: "already"; contactId?: string }
  | { view: "own" }
  | { view: "unavailable"; limited: boolean };

export function initialLandingView(initial: InviteLandingInitial, signedIn: boolean): InviteLandingView {
  if (initial.kind === "unavailable") return { view: "unavailable", limited: initial.limited };
  const { preview } = initial;
  if (signedIn && preview.isOwnCode) return { view: "own" };
  if (signedIn && preview.inviterAlreadyConnected) return { view: "already" };
  if (preview.status === "expired") return { view: "expired" };
  if (preview.status === "full") return { view: "full" };
  return signedIn ? { view: "checking" } : { view: "open" };
}

/** After the profile read: a profile without a name gets the short profile step first (DESIGN §2.5 第 3 步). */
export function viewAfterProfile(displayName: string | null | undefined): InviteLandingView {
  return displayName && displayName.trim() ? { view: "confirm" } : { view: "profile" };
}

/** A redeem failure → the page for it; `null` = stay on the confirm step with an error line. */
export function viewForRedeemFailure(status: number, reason: string | null): InviteLandingView | "login" | null {
  if (status === 401) return "login";
  switch (reason) {
    case "INVITE_EXPIRED":
      return { view: "expired" };
    case "INVITE_FULL":
      return { view: "full" };
    case "OWN_CODE":
      return { view: "own" };
    case "PROFILE_REQUIRED":
      return { view: "profile" };
    case "INVITE_UNAVAILABLE":
      return { view: "unavailable", limited: status === 429 };
    default:
      return null;
  }
}

export function viewForRedeemResult(result: InviteCodeRedeemResult): InviteLandingView {
  return result.outcome === "already_connected" ? { view: "already", contactId: result.contactId } : { view: "done", result };
}

/** Where 登録 / ログイン come back to (normalizeOrbitAuthReturnPath lets exactly `/i/<code>` through). */
export function inviteAuthHref(kind: "signup" | "login", code: string): string {
  return `/app/account/${kind}?next=${encodeURIComponent(`/i/${code}`)}`;
}

/** Short profile tag lists: the profile save takes at most 5 each (features/profile live-service). */
export const INVITE_PROFILE_TAG_LIMIT = 5;

const tagDisplay = (tag: string) => tag.normalize("NFKC").replace(/\s+/gu, " ").trim();
/** Same rule as the profile save's dedupe (NFKC, spaces folded, case ignored). */
export const sameTag = (a: string, b: string) => tagDisplay(a).toLowerCase() === tagDisplay(b).toLowerCase();

export function toggleTag(tags: readonly string[], tag: string): string[] {
  const value = tagDisplay(tag);
  if (!value) return [...tags];
  if (tags.some((item) => sameTag(item, value))) return tags.filter((item) => !sameTag(item, value));
  return tags.length >= INVITE_PROFILE_TAG_LIMIT ? [...tags] : [...tags, value];
}
