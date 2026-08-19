import { createHash } from "node:crypto";

export type OrganizerRelationship = "existing_contact" | "outside_network";

export interface OrganizerAccountDefinition {
  readonly contactId: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly key: string;
  readonly organization: string;
  readonly relationship: OrganizerRelationship;
  readonly role: string;
}

export interface EventOrganizerAssignmentDefinition {
  readonly eventId: string;
  readonly organizerKey: "xiaoyu" | OrganizerAccountDefinition["key"];
}

export interface EventOrganizerManifestValidation {
  readonly errors: readonly string[];
  readonly state: "invalid" | "valid";
}

const reviewedAccounts: readonly OrganizerAccountDefinition[] = [
  { contactId: "contact_090", displayName: "魏宇航", email: "yuhang-wei@organizers.orbit.example.test", key: "yuhang-wei", organization: "Nanshan Community", relationship: "existing_contact", role: "Community Organizer" },
  { contactId: "contact_005", displayName: "伊藤香織", email: "kaori-ito@organizers.orbit.example.test", key: "kaori-ito", organization: "Yokohama Foods", relationship: "existing_contact", role: "Marketing Lead" },
  { contactId: "contact_003", displayName: "高橋智子", email: "tomoko-takahashi@organizers.orbit.example.test", key: "tomoko-takahashi", organization: "Aoba Foods", relationship: "existing_contact", role: "Investor Partner" },
  { contactId: "contact_085", displayName: "袁子墨", email: "zimo-yuan@organizers.orbit.example.test", key: "zimo-yuan", organization: "Cedar Community", relationship: "existing_contact", role: "Marketing Lead" },
  { contactId: "contact_066", displayName: "吉田彩", email: "aya-yoshida@organizers.orbit.example.test", key: "aya-yoshida", organization: "Morning Light Capital", relationship: "existing_contact", role: "Community Organizer" },
  { contactId: "contact_027", displayName: "前田祐介", email: "yusuke-maeda@organizers.orbit.example.test", key: "yusuke-maeda", organization: "Umeda Technologies", relationship: "existing_contact", role: "Investor Partner" },
  { contactId: null, displayName: "中島美咲", email: "misaki-nakajima@organizers.orbit.example.test", key: "misaki-nakajima", organization: "Tokyo FinTech Network", relationship: "outside_network", role: "Community Lead" },
  { contactId: null, displayName: "森川玲奈", email: "rena-morikawa@organizers.orbit.example.test", key: "rena-morikawa", organization: "Tokyo Fashion Council", relationship: "outside_network", role: "Program Lead" },
  { contactId: null, displayName: "Daniel Kim", email: "daniel-kim@organizers.orbit.example.test", key: "daniel-kim", organization: "Climate Founders Japan", relationship: "outside_network", role: "Community Director" },
  { contactId: null, displayName: "石井拓真", email: "takuma-ishii@organizers.orbit.example.test", key: "takuma-ishii", organization: "Infra Operators Guild", relationship: "outside_network", role: "Operations Lead" },
  { contactId: null, displayName: "陈嘉宁", email: "jianing-chen@organizers.orbit.example.test", key: "jianing-chen", organization: "East Asia Venture Circle", relationship: "outside_network", role: "Investor and Community Organizer" },
  { contactId: null, displayName: "山本直樹", email: "naoki-yamamoto@organizers.orbit.example.test", key: "naoki-yamamoto", organization: "Kansai Global Business Association", relationship: "outside_network", role: "Program Lead" },
  { contactId: null, displayName: "周雨晨", email: "yuchen-zhou@organizers.orbit.example.test", key: "yuchen-zhou", organization: "Japan-China Innovation Network", relationship: "outside_network", role: "Community Lead" },
];

const reviewedAssignments: readonly EventOrganizerAssignmentDefinition[] = [
  { eventId: "event_01", organizerKey: "yuhang-wei" },
  { eventId: "event_02", organizerKey: "xiaoyu" },
  { eventId: "event_03", organizerKey: "kaori-ito" },
  { eventId: "event_04", organizerKey: "tomoko-takahashi" },
  { eventId: "event_05", organizerKey: "zimo-yuan" },
  { eventId: "event_06", organizerKey: "aya-yoshida" },
  { eventId: "event_07", organizerKey: "misaki-nakajima" },
  { eventId: "event_08", organizerKey: "xiaoyu" },
  { eventId: "event_09", organizerKey: "yusuke-maeda" },
  { eventId: "event_10", organizerKey: "rena-morikawa" },
  { eventId: "demo-event-1", organizerKey: "daniel-kim" },
  { eventId: "demo-event-2", organizerKey: "takuma-ishii" },
  { eventId: "event:manual:founder-investor-salon", organizerKey: "jianing-chen" },
  { eventId: "event_signup_01", organizerKey: "naoki-yamamoto" },
  { eventId: "event_signup_02", organizerKey: "xiaoyu" },
  { eventId: "event_signup_03", organizerKey: "yuchen-zhou" },
];

function deepFreeze<TValue>(value: TValue): TValue {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const EVENT_ORGANIZER_ACCOUNT_MANIFEST = deepFreeze([...reviewedAccounts]);
export const EVENT_ORGANIZER_ASSIGNMENTS = deepFreeze([...reviewedAssignments]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalManifest() {
  return canonicalize({
    accounts: [...EVENT_ORGANIZER_ACCOUNT_MANIFEST].sort((left, right) => left.key.localeCompare(right.key)),
    assignments: [...EVENT_ORGANIZER_ASSIGNMENTS].sort((left, right) => left.eventId.localeCompare(right.eventId)),
  });
}

export function validateEventOrganizerManifest(): EventOrganizerManifestValidation {
  const errors: string[] = [];
  const accountKeys = new Set(EVENT_ORGANIZER_ACCOUNT_MANIFEST.map((item) => item.key));
  const normalizedEmails = EVENT_ORGANIZER_ACCOUNT_MANIFEST.map((item) => item.email.trim().toLowerCase());
  const eventIds = EVENT_ORGANIZER_ASSIGNMENTS.map((item) => item.eventId);

  if (EVENT_ORGANIZER_ACCOUNT_MANIFEST.length !== 13) errors.push("expected 13 non-Xiaoyu accounts");
  if (EVENT_ORGANIZER_ASSIGNMENTS.length !== 16) errors.push("expected 16 event assignments");
  if (accountKeys.size !== EVENT_ORGANIZER_ACCOUNT_MANIFEST.length) errors.push("account keys must be unique");
  if (new Set(normalizedEmails).size !== normalizedEmails.length) errors.push("emails must be unique after normalization");
  if (normalizedEmails.some((email) => !/^[^@]+@[^@]+\.orbit\.example\.test$/u.test(email))) errors.push("emails must use the reserved Orbit test domain");
  if (new Set(eventIds).size !== eventIds.length) errors.push("event assignments must be unique");
  if (EVENT_ORGANIZER_ASSIGNMENTS.some((item) => item.organizerKey !== "xiaoyu" && !accountKeys.has(item.organizerKey))) errors.push("assignments must reference a reviewed account");
  if (EVENT_ORGANIZER_ACCOUNT_MANIFEST.some((item) => (item.relationship === "outside_network") !== (item.contactId === null))) errors.push("contact IDs must match organizer relationships");
  if (EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter((item) => item.relationship === "existing_contact").length !== 6) errors.push("expected 6 existing contacts");
  if (EVENT_ORGANIZER_ACCOUNT_MANIFEST.filter((item) => item.relationship === "outside_network").length !== 7) errors.push("expected 7 outside-network accounts");

  return { errors: Object.freeze(errors), state: errors.length === 0 ? "valid" : "invalid" };
}

export function eventOrganizerManifestHash(): string {
  return createHash("sha256").update(JSON.stringify(canonicalManifest())).digest("hex");
}
