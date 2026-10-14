// R15 招待コード (DESIGN add-and-invite §2.4–§2.5): the pure rules shared by the sender dialog and the
// public page /i/<code> — dates in the page language, days left, which share keys a profile can offer,
// the default switches, the first-visit flag, and the LINE / mail / app links for a draft. No IO except the
// guarded localStorage flag.
import type { InviteCodeHistoryStatus, InviteSharedFieldKey, InviteSharedFields } from "../../../../../../shared/contract/invite-codes";
import type { OrbitLanguage } from "../../../../../../shared/contract/language";
import { INVITE_DEFAULT_SHARED_KEYS, INVITE_SHARED_FIELD_KEYS } from "../../../../../../shared/compute/invite-code-format";
import { pickCopy, type OrbitCopyEntry } from "../../copy/types";
import { inviteSenderCopy as c } from "../../copy/invite";

/** Dates are shown in Japan time on both sides (server render and browser agree; profiles default to Asia/Tokyo). */
export const INVITE_TIME_ZONE = "Asia/Tokyo";
const DAY_MS = 86_400_000;

/** `{month}{day}` placeholders, same rule as `fillCopy` (kept here so the model has no UI import). */
function fillCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z]+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

/** 「10/14」/「10月14日」/「Oct 14」. */
export function inviteDate(iso: string, language: OrbitLanguage): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: language === "en" ? "short" : "numeric", timeZone: INVITE_TIME_ZONE }).formatToParts(at);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return fillCopy(pickCopy(c.dateShort, language), { day, month });
}

/** Whole days until the code expires (a part day counts as one; never below 0). */
export function inviteDaysLeft(expiresAt: string, now: number): number {
  const left = Date.parse(expiresAt) - now;
  return Number.isNaN(left) || left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** The switch labels, in the order of the switches (名前 is always shared and not a switch). */
export const INVITE_KEY_COPY: Readonly<Record<InviteSharedFieldKey, OrbitCopyEntry>> = {
  organization: c.keyOrganization,
  offering: c.keyOffering,
  seeking: c.keySeeking,
  email: c.keyEmail,
  phone: c.keyPhone,
};

export const INVITE_HISTORY_STATUS_COPY: Readonly<Record<InviteCodeHistoryStatus, OrbitCopyEntry>> = {
  active: c.statusActive,
  expired: c.statusExpired,
  revoked: c.statusRevoked,
  superseded: c.statusSuperseded,
  full: c.statusFull,
};

const filled = (value: string | undefined | null) => typeof value === "string" && value.trim().length > 0;
const filledList = (value: readonly string[] | undefined | null) => Array.isArray(value) && value.some((item) => filled(item));

/** The display value of one key in a set of fields (会社 · 役職 joined; lists joined by 「、」), or "" when empty. */
export function inviteKeyValue(key: InviteSharedFieldKey, fields: InviteSharedFields | null | undefined, language: OrbitLanguage): string {
  if (!fields) return "";
  const join = pickCopy(c.listSeparator, language);
  switch (key) {
    case "organization":
      return [fields.organization, fields.role].filter(filled).map((part) => part!.trim()).join(" · ");
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

/** The keys a set of fields actually has a value for (a switch with nothing behind it is not shown). */
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

/** Profile (GET /api/profile `profile`) → the fields a code can share. */
export function inviteFieldsFromProfile(profile: {
  displayName?: string;
  organization?: string;
  role?: string;
  offering?: readonly string[];
  seeking?: readonly string[];
  handles?: { email?: string; phone?: string } | null;
} | null | undefined): InviteSharedFields | null {
  if (!profile) return null;
  return {
    displayName: profile.displayName?.trim() ?? "",
    ...(filled(profile.organization) ? { organization: profile.organization!.trim() } : {}),
    ...(filled(profile.role) ? { role: profile.role!.trim() } : {}),
    ...(filledList(profile.offering) ? { offering: profile.offering!.filter(filled).map((item) => item.trim()) } : {}),
    ...(filledList(profile.seeking) ? { seeking: profile.seeking!.filter(filled).map((item) => item.trim()) } : {}),
    ...(filled(profile.handles?.email) ? { email: profile.handles!.email!.trim() } : {}),
    ...(filled(profile.handles?.phone) ? { phone: profile.handles!.phone!.trim() } : {}),
  };
}

/** 説明 is shown the first time only; after that the dialog opens on 共有 (DESIGN §2.4). */
export const INVITE_GUIDE_SEEN_KEY = "orbit.invite.guideSeen.v1";

export function inviteGuideSeen(): boolean {
  try {
    return window.localStorage.getItem(INVITE_GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markInviteGuideSeen(): void {
  try {
    window.localStorage.setItem(INVITE_GUIDE_SEEN_KEY, "1");
  } catch {
    // Without storage the guide just shows again next time.
  }
}

/** LINE's share page with the text filled in (the person sends it from LINE). */
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

/** A mail draft in the person's own mail app. */
export function mailDraftUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The App opens the same code (DESIGN §2.5 第 7 条). */
export function inviteAppLink(code: string): string {
  return `orbit://i/${encodeURIComponent(code)}`;
}

/**
 * How the pages address the inviter in running text (b11 #10 / #12 / #13: 「佐藤さんに見せる情報」「佐藤さんとつながりました」):
 * the family name when the name is written 「姓 名」 with a space, otherwise the whole name. Headings that introduce
 * the person keep the full name (「佐藤 健一さんとつながりますか？」).
 */
export function inviteCallName(name: string): string {
  const parts = name.trim().split(/[\s\u3000]+/u);
  return parts.length > 1 && parts[0] ? parts[0] : name.trim();
}

/** The link without the scheme, as the design shows it (orbit.app/i/XXXX-XXXX). */
export function inviteLinkLabel(link: string): string {
  return link.replace(/^https?:\/\//u, "");
}

export function newInviteKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
