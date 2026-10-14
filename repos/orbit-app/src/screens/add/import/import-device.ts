// R16 取り込み: the pure parts of the import pages — a device contact as the choose list shows it (rule
// pre-selection, work-contact-likelihood), and the LinkedIn file (a ZIP is opened, its Connections.csv sent).
import type { Contact } from "expo-contacts/legacy";
import { unzipSync } from "fflate";

import { deviceContactDisplayName, type DeviceContactEntry } from "../../../api/compute/vcard-build";
import { workContactLikelihood } from "../../../api/compute/work-contact-likelihood";

type Translate = (key: "add.import.noName" | "add.import.noCompany") => string;

/** A device contact as the choose list shows it, with the rule pre-selection (work-contact-likelihood). */
export interface PickPerson {
  id: string;
  name: string;
  sub: string;
  likely: boolean;
  excluded: boolean;
  hasCompany: boolean;
  workMail: boolean;
  entry: DeviceContactEntry;
}

export function toDeviceEntry(contact: Contact): DeviceContactEntry {
  return {
    displayName: contact.name ?? null,
    familyName: contact.lastName ?? null,
    givenName: contact.firstName ?? null,
    middleName: contact.middleName ?? null,
    phoneticFamilyName: contact.phoneticLastName ?? null,
    phoneticGivenName: contact.phoneticFirstName ?? null,
    organization: contact.company ?? null,
    department: contact.department ?? null,
    jobTitle: contact.jobTitle ?? null,
    emails: (contact.emails ?? []).flatMap((entry) => (entry.email ? [{ label: entry.label ?? null, value: entry.email }] : [])),
    phones: (contact.phoneNumbers ?? []).flatMap((entry) => (entry.number ? [{ label: entry.label ?? null, value: entry.number }] : [])),
  };
}

export function toPickPerson(id: string, entry: DeviceContactEntry, t: Translate): PickPerson {
  const name = deviceContactDisplayName(entry);
  const emails = entry.emails.map((item) => item.value);
  const verdict = workContactLikelihood({ displayName: name, organization: entry.organization ?? null, role: entry.jobTitle ?? null, emails, phones: entry.phones.map((item) => item.value) });
  const org = [entry.organization, entry.jobTitle ?? entry.department].filter(Boolean).join(" · ");
  return {
    id, name: name || t("add.import.noName"),
    sub: org || (entry.phones[0]?.value ? `${t("add.import.noCompany")} · ${entry.phones[0].value}` : ""),
    likely: verdict.likely, excluded: verdict.excludedBy !== null,
    hasCompany: Boolean(entry.organization?.trim()), workMail: verdict.reasons.includes("work_email"), entry,
  };
}


/** A CSV as is; a ZIP is opened and its Connections.csv (or its only CSV) is sent instead. */
export function prepareLinkedInFile(bytes: Uint8Array, name: string): { ok: true; bytes: Uint8Array<ArrayBuffer>; name: string } | { ok: false; reason: "add.import.errZipNoCsv" | "add.import.errZipBroken" | "add.import.errWrongType" } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return { ok: true, bytes: bytes.slice() as Uint8Array<ArrayBuffer>, name };
  if (!lower.endsWith(".zip")) return { ok: false, reason: "add.import.errWrongType" };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (entry) => entry.name.toLowerCase().endsWith(".csv") });
  } catch {
    return { ok: false, reason: "add.import.errZipBroken" };
  }
  const names = Object.keys(entries).filter((entry) => !entry.startsWith("__MACOSX/"));
  const picked = names.find((entry) => /(^|\/)connections\.csv$/i.test(entry)) ?? (names.length === 1 ? names[0] : undefined);
  if (!picked) return { ok: false, reason: "add.import.errZipNoCsv" };
  return { ok: true, bytes: entries[picked]!.slice() as Uint8Array<ArrayBuffer>, name: picked.split("/").pop() ?? picked };
}

