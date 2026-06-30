import type {
  AccountDTO,
  ConnectionDTO,
  ContactDTO,
  EventDTO,
  EventParticipantIntentDTO,
  MatchRecommendationDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
  UserProfileDTO,
} from "../../../shared/domain/contracts";
import type { SourceType } from "../../../shared/domain/source-types";
import {
  createOrbitLocalRemoteDatabase,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type {
  EventAttendeeDTO,
  MockRuntimeFixtures,
} from "../../../shared/mock/fixtures";

export const orbitGradients = [
  "g-indigo",
  "g-emerald",
  "g-sky",
  "g-rose",
  "g-amber",
  "g-violet",
  "g-slate",
] as const;

export type OrbitGradient = (typeof orbitGradients)[number];

export interface OrbitHybridRouteData {
  account: AccountDTO;
  accounts: AccountDTO[];
  attendees: EventAttendeeDTO[];
  connections: ConnectionDTO[];
  contacts: ContactDTO[];
  eventParticipantIntents: EventParticipantIntentDTO[];
  events: EventDTO[];
  evidence: RelationshipEvidenceDTO[];
  generatedAt: string;
  matchRecommendations: MatchRecommendationDTO[];
  profile: UserProfileDTO;
  tasks: TaskDTO[];
}

const fallbackGeneratedAt = "2026-06-30T00:00:00.000Z";

function fallbackAccount(generatedAt: string): AccountDTO {
  return {
    id: "account_orbit_fallback",
    name: "Orbit Workspace",
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

function fallbackProfile(accountId: string, generatedAt: string): UserProfileDTO {
  return {
    id: "profile_orbit_fallback",
    accountId,
    displayName: "Orbit User",
    role: "Relationship Operator",
    timezone: "Asia/Tokyo",
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

export function getOrbitHybridRouteData(
  database: OrbitLocalRemoteDatabase = createOrbitLocalRemoteDatabase(),
): OrbitHybridRouteData {
  const state: MockRuntimeFixtures = database.getState();
  const generatedAt = state.generatedAt || fallbackGeneratedAt;
  const account = state.accounts[0] ?? fallbackAccount(generatedAt);
  const profile =
    state.profiles.find((item) => item.accountId === account.id) ??
    state.profiles[0] ??
    fallbackProfile(account.id, generatedAt);

  return {
    account,
    accounts: state.accounts.length ? state.accounts : [account],
    attendees: state.attendees,
    connections: state.connections,
    contacts: state.contacts,
    eventParticipantIntents: state.eventParticipantIntents,
    events: state.events,
    evidence: state.evidence,
    generatedAt,
    matchRecommendations: state.matchRecommendations,
    profile,
    tasks: state.tasks,
  };
}

export function hashString(value: string): number {
  return Array.from(value).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
}

export function gradientFor(value: string, index = 0): OrbitGradient {
  return orbitGradients[
    (hashString(value || String(index)) + index) % orbitGradients.length
  ];
}

export function initialFor(value: string, fallback = "O"): string {
  return value.trim().slice(0, 1).toUpperCase() || fallback;
}

export function compactCodeFor(value: string, fallback: string): string {
  const compact = value
    .replace(/^source[:_-]?/i, "")
    .replace(/^event[:_-]?/i, "evt")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  return compact.slice(0, 10) || fallback;
}

export function eventCodeFor(event: EventDTO, index = 0): string {
  return compactCodeFor(event.id || event.source.id || event.name, `EVT${index + 1}`);
}

export function passCodeForEvent(event: EventDTO, index = 0): string {
  const code = eventCodeFor(event, index);
  const suffix = String(hashString(`${event.id}:${event.startsAt}`) % 10_000)
    .padStart(4, "0");

  return `${code.slice(0, 4)}-${suffix}`;
}

export function eventStatusFor(
  event: EventDTO,
  generatedAt: string,
): "active" | "upcoming" | "ended" {
  const now = new Date(generatedAt).getTime();
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt ?? event.startsAt).getTime();

  if (!Number.isFinite(now) || !Number.isFinite(startsAt)) {
    return "upcoming";
  }

  if (Number.isFinite(endsAt) && endsAt < now) {
    return "ended";
  }

  if (startsAt <= now) {
    return "active";
  }

  return "upcoming";
}

function normalizedTextFor(event: EventDTO): string {
  return `${event.name} ${event.source.label ?? ""} ${event.location ?? ""}`.toLowerCase();
}

export function eventThemeFor(event: EventDTO): string {
  const text = normalizedTextFor(event);

  if (text.includes("ai") || text.includes("人工") || text.includes("自動")) return "ai";
  if (text.includes("finance") || text.includes("投資") || text.includes("金融")) return "finance";
  if (text.includes("manufact") || text.includes("製造") || text.includes("半導体")) return "chip";
  if (text.includes("retail") || text.includes("fashion") || text.includes("consumer")) return "fashion";
  if (text.includes("ecommerce") || text.includes("越境") || text.includes("cross-border")) return "globe";
  if (text.includes("saas") || text.includes("workflow")) return "cloud";

  return "ai";
}

export function eventIndustryFor(event: EventDTO): string {
  const text = normalizedTextFor(event);

  if (text.includes("ai") || text.includes("自動")) return "AI / automation";
  if (text.includes("finance") || text.includes("投資") || text.includes("金融")) return "Finance / investment";
  if (text.includes("ecommerce") || text.includes("越境")) return "Cross-border commerce";
  if (text.includes("manufact") || text.includes("製造")) return "Manufacturing";
  if (text.includes("community") || text.includes("コミュニティ")) return "Community";
  if (text.includes("restaurant") || text.includes("飲食")) return "Hospitality";

  return "Relationship building";
}

export function eventTagsFor(event: EventDTO): string[] {
  const industry = eventIndustryFor(event);
  const sourceLabel = event.source.type === "event_import" ? "event import" : event.source.type.replace(/_/g, " ");

  return [...new Set([industry, sourceLabel, event.location].filter(Boolean))];
}

export function attendeesForEvent(
  data: OrbitHybridRouteData,
  eventId: string,
): EventAttendeeDTO[] {
  return data.attendees.filter((attendee) => attendee.eventId === eventId);
}

export function evidenceSummaryFor(
  data: OrbitHybridRouteData,
  evidenceIds: readonly string[],
  fallback: string,
): string {
  const byId = new Map(data.evidence.map((item) => [item.id, item]));
  const summary = evidenceIds
    .map((evidenceId) => byId.get(evidenceId)?.summary)
    .find((value): value is string => Boolean(value?.trim()));

  return summary ?? fallback;
}

export function contactsById(data: OrbitHybridRouteData): Map<string, ContactDTO> {
  return new Map(data.contacts.map((contact) => [contact.id, contact]));
}

export function connectionsByContactId(
  data: OrbitHybridRouteData,
): Map<string, ConnectionDTO> {
  return new Map(
    data.connections.map((connection) => [connection.contactId, connection]),
  );
}

export function intentForContact(
  data: OrbitHybridRouteData,
  contactId: string,
): EventParticipantIntentDTO | undefined {
  return data.eventParticipantIntents.find(
    (intent) => intent.contactId === contactId,
  );
}

export function contactCompany(contact: ContactDTO): string {
  return contact.organization ?? "Independent";
}

export function contactTitle(contact: ContactDTO): string {
  return contact.role ?? "Contact";
}

export function contactIndustry(contact: ContactDTO, connection?: ConnectionDTO): string {
  return (
    connection?.valueTypes[0]?.replace(/_/g, " ") ??
    contact.location ??
    contact.source.type.replace(/_/g, " ")
  );
}

export function contactOffering(
  data: OrbitHybridRouteData,
  contact: ContactDTO,
  connection?: ConnectionDTO,
): string {
  return (
    intentForContact(data, contact.id)?.canOffer[0] ??
    connection?.suggestedActions[0] ??
    connection?.summary ??
    contact.profileSnippet ??
    "Source-backed relationship context"
  );
}

export function contactSeeking(
  data: OrbitHybridRouteData,
  contact: ContactDTO,
  connection?: ConnectionDTO,
): string {
  return (
    intentForContact(data, contact.id)?.lookingFor[0] ??
    connection?.sharedTopics?.[0] ??
    connection?.valueTypes[0]?.replace(/_/g, " ") ??
    "Relevant introductions"
  );
}

export function contactTopics(connection?: ConnectionDTO): string[] {
  return connection?.sharedTopics?.length
    ? Array.from(connection.sharedTopics).slice(0, 4)
    : ["relationship context", "follow-up"];
}

export function contactStageLabel(stage: ContactDTO["stage"]): string {
  switch (stage) {
    case "active":
      return "在推进";
    case "needs_follow_up":
    case "reviewing":
      return "待联系";
    case "nurture":
      return "在推进";
    case "archived":
      return "已合作";
    case "captured":
    default:
      return "待联系";
  }
}

export function contactPipelineStatus(
  stage: ContactDTO["stage"],
): "to_contact" | "in_progress" | "partnered" {
  switch (stage) {
    case "active":
    case "nurture":
      return "in_progress";
    case "archived":
      return "partnered";
    case "captured":
    case "needs_follow_up":
    case "reviewing":
    default:
      return "to_contact";
  }
}

export function contactSourceKind(sourceType: SourceType): "exchange" | "scan" | "manual" {
  if (sourceType === "business_card_ocr" || sourceType === "qr_scan") {
    return "scan";
  }

  if (sourceType === "manual") {
    return "manual";
  }

  return "exchange";
}

export function sortedEvents(data: OrbitHybridRouteData): EventDTO[] {
  return [...data.events].sort(
    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );
}

export function sortedContacts(data: OrbitHybridRouteData): ContactDTO[] {
  const connections = connectionsByContactId(data);

  return [...data.contacts].sort((a, b) => {
    const scoreA = connections.get(a.id)?.businessRelevanceScore ?? 0;
    const scoreB = connections.get(b.id)?.businessRelevanceScore ?? 0;

    if (scoreA !== scoreB) return scoreB - scoreA;

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function formatDatePart(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function formatTimePart(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(11, 16);
}

export function formatDuration(startValue: string, endValue?: string): string {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue ?? startValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "30 分钟";
  }

  const minutes = Math.round((end - start) / 60_000);

  if (minutes >= 120) {
    return `${Math.round(minutes / 60)} 小时`;
  }

  return `${minutes} 分钟`;
}
