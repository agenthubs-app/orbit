// R15 招待コード (DESIGN add-and-invite §2.4–§2.6): the pure rules the App sender page, the receiver
// pages `i/<code>` / `i` and the share / unlink sheets share — same rules as the Web
// (orbits orbit-2026/add/invite/invite-model.ts, invite-landing/landing-model.ts): dates in Japan time,
// days left, which share keys a profile can offer, the default switches, which screen a preview or a
// redeem answer leads to, the draft links (LINE / mail), and the short-profile tag lists. No IO.
import type {
  InviteCodeHistoryStatus,
  InviteCodePreview,
  InviteCodeRedeemResult,
  InviteSharedFieldKey,
  InviteSharedFields,
} from "../../../api/contract/invite-codes";
import type { OrbitLanguage } from "../../../api/contract/language";
import { INVITE_DEFAULT_SHARED_KEYS, INVITE_SHARED_FIELD_KEYS } from "../../../api/compute/invite-code-format";
import type { MessageKey, OrbitTranslator } from "../../../i18n/messages";

/** Dates are shown in Japan time, like the Web page and the server (profiles default to Asia/Tokyo). */
export const INVITE_TIME_ZONE = "Asia/Tokyo";
const DAY_MS = 86_400_000;

/** 「10/14」/「10月14日」/「Oct 14」. */
export function inviteDate(iso: string, language: OrbitLanguage, t: OrbitTranslator): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: language === "en" ? "short" : "numeric", timeZone: INVITE_TIME_ZONE }).formatToParts(at);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return t("add.invite.dateShort", { day, month });
}

/** Whole days until the code expires (a part day counts as one; never below 0). */
export function inviteDaysLeft(expiresAt: string, now: number): number {
  const left = Date.parse(expiresAt) - now;
  return Number.isNaN(left) || left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** The switch labels, in switch order (名前 is always shared and is not a switch). */
export const INVITE_KEY_COPY: Readonly<Record<InviteSharedFieldKey, MessageKey>> = {
  organization: "add.invite.keyOrganization",
  offering: "add.invite.keyOffering",
  seeking: "add.invite.keySeeking",
  email: "add.invite.keyEmail",
  phone: "add.invite.keyPhone",
};

export const INVITE_HISTORY_STATUS_COPY: Readonly<Record<InviteCodeHistoryStatus, MessageKey>> = {
  active: "add.invite.statusActive",
  expired: "add.invite.statusExpired",
  revoked: "add.invite.statusRevoked",
  superseded: "add.invite.statusSuperseded",
  full: "add.invite.statusFull",
};

const filled = (value: string | undefined | null): value is string => typeof value === "string" && value.trim().length > 0;
const filledList = (value: readonly string[] | undefined | null) => Array.isArray(value) && value.some((item) => filled(item));

/** One key's display value (会社 · 役職 joined; lists joined by 「、」), or "" when empty. */
export function inviteKeyValue(key: InviteSharedFieldKey, fields: InviteSharedFields | null | undefined, t: OrbitTranslator): string {
  if (!fields) return "";
  const join = t("add.invite.listSeparator");
  switch (key) {
    case "organization":
      return [fields.organization, fields.role].filter(filled).map((part) => part.trim()).join(" · ");
    case "offering":
      return (fields.offering ?? []).filter(filled).join(join);
    case "seeking":
      return (fields.seeking ?? []).filter(filled).join(join);
    case "email":
      return fields.email?.trim() ?? "";
    case "phone":
      return fields.phone?.trim() ?? "";
  }
}

/** The keys a set of fields has a value for (a switch with nothing behind it is not shown). */
export function inviteKeysWithValues(fields: InviteSharedFields | null | undefined): InviteSharedFieldKey[] {
  if (!fields) return [];
  return INVITE_SHARED_FIELD_KEYS.filter((key) => {
    if (key === "organization") return filled(fields.organization) || filled(fields.role);
    if (key === "offering") return filledList(fields.offering);
    if (key === "seeking") return filledList(fields.seeking);
    return filled(fields[key]);
  });
}

/** Default switches: 会社・役職 / 提供 / 求めている on, メール / 電話 off — limited to what the profile has. */
export function inviteDefaultKeys(available: readonly InviteSharedFieldKey[]): InviteSharedFieldKey[] {
  return INVITE_DEFAULT_SHARED_KEYS.filter((key) => available.includes(key));
}

/** Keys in switch order, without repeats. */
export function orderedInviteKeys(keys: Iterable<InviteSharedFieldKey>): InviteSharedFieldKey[] {
  const set = new Set(keys);
  return INVITE_SHARED_FIELD_KEYS.filter((key) => set.has(key));
}

export function toggleInviteKey(keys: readonly InviteSharedFieldKey[], key: InviteSharedFieldKey, on: boolean): InviteSharedFieldKey[] {
  return orderedInviteKeys(on ? [...keys, key] : keys.filter((item) => item !== key));
}

/** The profile fields an invite can share (GET /api/profile `profile`). */
export interface InviteProfile {
  displayName?: string;
  organization?: string;
  role?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  handles?: { email?: string; phone?: string } | null;
  updatedAt?: string | null;
}

/** Profile → the fields a code can share. */
export function inviteFieldsFromProfile(profile: InviteProfile | null | undefined): InviteSharedFields | null {
  if (!profile) return null;
  return {
    displayName: profile.displayName?.trim() ?? "",
    ...(filled(profile.organization) ? { organization: profile.organization.trim() } : {}),
    ...(filled(profile.role) ? { role: profile.role.trim() } : {}),
    ...(filledList(profile.offering) ? { offering: profile.offering!.filter(filled).map((item) => item.trim()) } : {}),
    ...(filledList(profile.seeking) ? { seeking: profile.seeking!.filter(filled).map((item) => item.trim()) } : {}),
    ...(filled(profile.handles?.email) ? { email: profile.handles!.email!.trim() } : {}),
    ...(filled(profile.handles?.phone) ? { phone: profile.handles!.phone!.trim() } : {}),
  };
}

/** LINE's share page with the text filled in (the person sends it from LINE; Orbit never does). */
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

/** A mail draft in the person's own mail app. */
export function mailDraftUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The link without the scheme, as the design shows it (orbitailink.com/i/XXXX-XXXX). */
export function inviteLinkLabel(link: string): string {
  return link.replace(/^https?:\/\//u, "");
}

export function newInviteKey(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

// ── 受け取る側（i/<code>） ──

export type InviteLandingView =
  | { view: "loading" }
  | { view: "failed" }
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

/** A preview read → the first screen: own code > already connected > expired / full > signed out > profile check. */
export function viewForPreview(preview: InviteCodePreview, signedIn: boolean): InviteLandingView {
  if (signedIn && preview.isOwnCode) return { view: "own" };
  if (signedIn && preview.inviterAlreadyConnected) return { view: "already" };
  if (preview.status === "expired") return { view: "expired" };
  if (preview.status === "full") return { view: "full" };
  return signedIn ? { view: "checking" } : { view: "open" };
}

/**
 * A failed preview read: unknown / turned off / replaced / malformed / expired over 30 days are one page
 * (404 INVITE_UNAVAILABLE; 429 adds 「しばらくしてから」, §6); anything else (offline, 5xx) can be retried.
 */
export function viewForPreviewFailure(status: number, reason: string | null): InviteLandingView {
  if (reason === "INVITE_UNAVAILABLE" || status === 404 || status === 429) return { view: "unavailable", limited: status === 429 };
  return { view: "failed" };
}

/** After the profile read: a profile without a name gets the short profile step first (§2.5 第 3 步). */
export function viewAfterProfile(displayName: string | null | undefined): InviteLandingView {
  return displayName && displayName.trim() ? { view: "confirm" } : { view: "profile" };
}

/** A redeem failure → its page; "login" = the session ended; `null` = stay on the confirm step with an error line. */
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

/** Where ログイン / 登録 come back to (`initial-route` lets exactly `/i/<code>` through). */
export function inviteAuthHref(kind: "signup" | "login", code: string): string {
  return `/account/${kind}?next=${encodeURIComponent(`/i/${code}`)}`;
}

/** Short profile tag lists: the profile save takes at most 5 each (orbits features/profile). */
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
