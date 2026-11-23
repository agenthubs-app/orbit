/**
 * agent-design AG05 run-03 repair 1 (AE-SCL-004 R2): a contact profile a newer dated record contradicts.
 * Whether the profile and the newer record disagree is a reading of the words — the model says it, as
 * structured entries (`profile` in its segment), never as free text. Code checks each entry against this
 * turn's materials (the profile really holds that value, the source is a record read now and dated after
 * the profile's last update, the new value is copied from it) and writes the sentence itself (zh/ja/en).
 * Asked only for a part about how a person stands now, or a profile question, where a profile and a newer
 * record were both read.
 */
import type { Material } from "./schema";

export const PROFILE_FIELDS = ["organization", "role"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export interface ProfileUpdate {
  contact: Material;
  field: ProfileField;
  profileValue: string;
  newValue: string;
  source: Material;
}

const squash = (text: string) => text.replace(/\s+/gu, "").toLowerCase();
const after = (left: string | null | undefined, right: string | null | undefined) => !left || !right || Date.parse(left) > Date.parse(right);

/** The contacts of these materials whose profile a newer record could contradict (organization or role set, a record dated after it). */
export function profileCheckOf(materials: readonly Material[]): Material[] {
  return materials.filter((material) => material.kind === "contact" && material.profile && (material.profile.organization || material.profile.role) && materials.some((other) => other.kind !== "contact" && other.at && after(other.at, material.profile!.updatedAt)));
}

/** The note under an item that asks for the profile check. */
export function profileCheckNote(contacts: readonly Material[]): string {
  const fields = contacts.map((material) => `${material.handle} (${[material.profile!.organization ? `organization "${material.profile!.organization}"` : null, material.profile!.role ? `role "${material.profile!.role}"` : null].filter(Boolean).join(", ")})`).join("; ");
  return `Profile check — answer it in "profile", not in text: does a newer material say something else than the contact profile ${fields}? If the profile still holds, or the question is not about it, give "profile": []. Otherwise one entry per field a newer material replaces: {"contact": the profile handle, "field": "organization" | "role", "profileValue": the profile's value, "newValue": the words of the newer material that replace it, copied exactly, "source": that material's handle}. Code writes the sentence that the profile is out of date; do not write it yourself.`;
}

export function verifyProfileUpdates(raw: unknown, materials: readonly Material[]): { updates: ProfileUpdate[]; problems: string[] } {
  const byHandle = new Map(materials.map((material) => [material.handle, material]));
  const updates: ProfileUpdate[] = [];
  const problems: string[] = [];
  for (const entry of Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []) {
    const name = JSON.stringify(entry).slice(0, 80);
    const contact = typeof entry?.contact === "string" ? byHandle.get(entry.contact.trim()) : undefined;
    const source = typeof entry?.source === "string" ? byHandle.get(entry.source.trim()) : undefined;
    const field = PROFILE_FIELDS.find((item) => item === entry?.field);
    const profileValue = typeof entry?.profileValue === "string" ? entry.profileValue.trim() : "";
    const newValue = typeof entry?.newValue === "string" ? entry.newValue.trim() : "";
    if (!contact || contact.kind !== "contact" || !contact.profile) {
      problems.push(`profile entry ${name}: "contact" must be a contact profile handle of these materials`);
      continue;
    }
    if (!field || !contact.profile[field]) {
      problems.push(`profile entry ${name}: "field" must be organization or role, and the profile must have it`);
      continue;
    }
    const held = contact.profile[field]!;
    if (!profileValue || !(squash(held).includes(squash(profileValue)) || squash(profileValue).includes(squash(held)))) {
      problems.push(`profile entry ${name}: the profile's ${field} is "${held}", not "${profileValue}"`);
      continue;
    }
    if (!source || source.kind === "contact" || !source.at || !after(source.at, contact.profile.updatedAt)) {
      problems.push(`profile entry ${name}: "source" must be a record of these materials dated after the profile's last update`);
      continue;
    }
    const sourceText = squash(source.sentences.map((sentence) => sentence.text).join(""));
    if (!newValue || newValue.length > 80 || !sourceText.includes(squash(newValue)) || squash(newValue) === squash(held)) {
      problems.push(`profile entry ${name}: "newValue" must be words copied from ${source.handle} that differ from the profile`);
      continue;
    }
    if (updates.some((item) => item.contact === contact && item.field === field)) continue;
    updates.push({ contact, field, newValue, profileValue: held, source });
  }
  return { problems, updates };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayOf(value: string, timeZone: string): { month: number; day: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "numeric", month: "numeric", timeZone }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: Number(parts.month) };
}

/** Code's sentence: the profile still says these values, a newer record says otherwise. One per contact, joined. */
export function profileLine(language: "zh" | "ja" | "en", updates: readonly ProfileUpdate[], timeZone: string): string | null {
  if (!updates.length) return null;
  const lines: string[] = [];
  for (const contact of [...new Set(updates.map((item) => item.contact))]) {
    const own = updates.filter((item) => item.contact === contact).sort((left, right) => PROFILE_FIELDS.indexOf(left.field) - PROFILE_FIELDS.indexOf(right.field));
    const newest = own.map((item) => item.source.at!).sort().at(-1)!;
    const { day, month } = dayOf(newest, timeZone);
    // AG12 run-03 (AE-SCL-004 R2): an outdated organization is said with the title the profile holds there ("拾野选物店店长").
    // AG13 opening 1: also when the title is flagged outdated with it — one value, the title as the profile holds it.
    const organization = own.find((item) => item.field === "organization");
    const role = own.find((item) => item.field === "role")?.profileValue ?? (contact as { profile?: { role: string | null } }).profile?.role ?? null;
    const values = organization && role
      ? [language === "en" ? `${role} at ${organization.profileValue}` : language === "ja" ? `${organization.profileValue}の${role}` : `${organization.profileValue}${role}`]
      : own.map((item) => item.profileValue);
    if (language === "zh") lines.push(`（联系人资料里写的还是${values.map((value) => `「${value}」`).join("")}，和${month}月${day}日的记录不一致，这份资料已经过时了。）`);
    else if (language === "ja") lines.push(`（連絡先にはまだ${values.map((value) => `「${value}」`).join("")}とあり、${month}月${day}日の記録と食い違っています。連絡先の情報が古くなっています。）`);
    else lines.push(`(The contact profile still says ${values.map((value) => `"${value}"`).join(", ")}, which differs from the record of ${MONTHS[month - 1]} ${day}; the profile is out of date.)`);
  }
  return lines.join("\n");
}
