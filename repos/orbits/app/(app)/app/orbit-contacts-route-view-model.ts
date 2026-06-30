import type { ContactDTO } from "../../../shared/domain/contracts";
import {
  connectionsByContactId,
  contactCompany,
  contactIndustry,
  contactOffering,
  contactPipelineStatus,
  contactSeeking,
  contactSourceKind,
  contactStageLabel,
  contactTitle,
  contactTopics,
  eventCodeFor,
  evidenceSummaryFor,
  getOrbitHybridRouteData,
  gradientFor,
  initialFor,
  intentForContact,
  sortedContacts,
  sortedEvents,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export type OrbitContactPipelineStatus = "to_contact" | "in_progress" | "partnered";
export type OrbitIntroStatus = "draft" | "sent";

export interface OrbitContactView {
  company: string;
  encounters: OrbitContactEncounterView[];
  displayName: string;
  email: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  lineId: string;
  lastEventId: string;
  met: string;
  note: string;
  notes: OrbitContactNoteView[];
  offering: string;
  phone: string;
  pipelineStatus: OrbitContactPipelineStatus;
  seeking: string;
  source: "exchange" | "scan" | "manual";
  stage: string;
  title: string;
  wechat: string;
}

export interface OrbitContactNoteView {
  body: string;
  createdAt: string;
  id: string;
}

export interface OrbitContactPublicProfileView {
  bio: string;
  conversationPrompts: string[];
  industry: string;
  intro: string;
  offering: string[];
  seeking: string[];
  topics: string[];
}

export interface OrbitContactEncounterView {
  context: {
    metAt: string;
    publicProfile: OrbitContactPublicProfileView;
    reason: string;
    score: number;
    tableNo: number;
  };
  createdAt: string;
  eventId: string;
  id: string;
}

export interface OrbitPipelineStatusView {
  label: string;
  value: OrbitContactPipelineStatus;
}

export interface OrbitContactEventView {
  id: string;
  name: string;
}

export interface OrbitIntroView {
  blurb: string;
  id: string;
  labelA: string;
  labelB: string;
  statusBadge: OrbitIntroStatus;
}

export interface OrbitContactsViewModel {
  connections: OrbitContactView[];
  events: OrbitContactEventView[];
  intros: OrbitIntroView[];
  pipelineStatuses: OrbitPipelineStatusView[];
}

function eventForContact(data: OrbitHybridRouteData, contact: ContactDTO) {
  const attendee = data.attendees.find((item) => item.contactId === contact.id);

  return data.events.find((event) => event.id === attendee?.eventId) ?? data.events[0];
}

function contactView(
  data: OrbitHybridRouteData,
  contact: ContactDTO,
  index: number,
): OrbitContactView {
  const connection = connectionsByContactId(data).get(contact.id);
  const intent = intentForContact(data, contact.id);
  const event = eventForContact(data, contact);
  const offering = contactOffering(data, contact, connection);
  const seeking = contactSeeking(data, contact, connection);
  const note = connection?.summary ?? contact.profileSnippet ?? "";
  const eventId = event?.id ?? "";
  const eventName = event?.name ?? "Local remote event";
  const reason = evidenceSummaryFor(
    data,
    contact.evidenceIds,
    connection?.summary ?? "Source-backed contact from the local remote database.",
  );

  return {
    company: contactCompany(contact),
    displayName: contact.displayName,
    email: contact.primaryEmail ?? "",
    encounters: [
      {
        context: {
          metAt: contact.updatedAt,
          publicProfile: {
            bio: contact.profileSnippet ?? connection?.summary ?? "",
            conversationPrompts:
              connection?.suggestedActions?.length
                ? Array.from(connection.suggestedActions).slice(0, 2)
                : ["What outcome should this relationship support?", "What context should be captured next?"],
            industry: contactIndustry(contact, connection),
            intro: note || reason,
            offering: intent?.canOffer.length ? Array.from(intent.canOffer) : [offering],
            seeking: intent?.lookingFor.length ? Array.from(intent.lookingFor) : [seeking],
            topics: contactTopics(connection),
          },
          reason,
          score: connection?.businessRelevanceScore ?? connection?.relationshipStrength ?? 70,
          tableNo: (index % 8) + 1,
        },
        createdAt: contact.updatedAt,
        eventId,
        id: `encounter:${contact.id}`,
      },
    ],
    g: gradientFor(contact.id, index),
    id: contact.id,
    industry: contactIndustry(contact, connection),
    initial: initialFor(contact.displayName),
    lastEventId: eventId,
    lineId: "",
    met: `${eventName} · ${contact.source.label ?? contact.source.type}`,
    note,
    notes: note ? [{ body: note, createdAt: contact.updatedAt, id: `note:${contact.id}` }] : [],
    offering,
    phone: contact.primaryPhone ?? "",
    pipelineStatus: contactPipelineStatus(contact.stage),
    seeking,
    source: contactSourceKind(contact.source.type),
    stage: contactStageLabel(contact.stage),
    title: contactTitle(contact),
    wechat: "",
  };
}

function introViews(data: OrbitHybridRouteData): OrbitIntroView[] {
  const contacts = new Map(data.contacts.map((contact) => [contact.id, contact]));

  return data.matchRecommendations.slice(0, 6).map((recommendation) => {
    const contact = contacts.get(recommendation.contactId);
    const targetEvent = data.events.find((event) => event.id === recommendation.eventId);

    return {
      blurb: recommendation.reason,
      id: recommendation.id,
      labelA: data.profile.displayName,
      labelB: contact?.displayName ?? targetEvent?.name ?? "Recommended relationship",
      statusBadge: recommendation.recommendationType === "warm_intro" ? "sent" : "draft",
    };
  });
}

export function getOrbitContactsViewModel(): OrbitContactsViewModel {
  const data = getOrbitHybridRouteData();

  return {
    connections: sortedContacts(data).map((contact, index) =>
      contactView(data, contact, index),
    ),
    events: sortedEvents(data).map((event, index) => ({
      id: event.id || eventCodeFor(event, index),
      name: event.name,
    })),
    intros: introViews(data),
    pipelineStatuses: [
      { value: "to_contact", label: "待联系" },
      { value: "in_progress", label: "在推进" },
      { value: "partnered", label: "已合作" },
    ],
  };
}
