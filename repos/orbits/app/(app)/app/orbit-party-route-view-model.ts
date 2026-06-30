import type {
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
} from "../../../shared/domain/contracts";
import {
  attendeesForEvent,
  connectionsByContactId,
  contactCompany,
  contactIndustry,
  contactOffering,
  contactSeeking,
  contactTitle,
  contactTopics,
  eventCodeFor,
  formatDuration,
  formatTimePart,
  getOrbitHybridRouteData,
  gradientFor,
  initialFor,
  networkPeopleById,
  passCodeForEvent,
  sortedContacts,
  sortedEvents,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export interface OrbitPartyPersonView {
  company: string;
  g: string;
  groupNumber: number;
  icebreakers: string[];
  id: string;
  industry: string;
  initial: string;
  name: string;
  offering: string;
  reason: string;
  score: number;
  seat: string;
  seeking: string;
  summary: string;
  title: string;
  topics: string[];
}

export interface OrbitPartyAgendaItemView {
  description: string;
  label: string;
  time: string;
}

export interface OrbitPartyMeView {
  groupNumber: number;
  initial: string;
  name: string;
  offering: string[];
  prompts: string[];
  role: string;
  seat: string;
  seeking: string[];
  topics: string[];
}

export interface OrbitPartyViewModel {
  accessCode: string;
  agenda: OrbitPartyAgendaItemView[];
  eventName: string;
  eventVenue: string;
  icebreakers: string[];
  me: OrbitPartyMeView;
  recommendations: OrbitPartyPersonView[];
  tableMates: OrbitPartyPersonView[];
}

function currentEvent(data: OrbitHybridRouteData) {
  return sortedEvents(data)[0];
}

function partyAgenda(data: OrbitHybridRouteData): OrbitPartyAgendaItemView[] {
  const event = currentEvent(data);
  const start = event?.startsAt ?? data.generatedAt;
  const startTime = formatTimePart(start) || "18:00";

  return [
    {
      time: startTime,
      label: "签到与来源确认",
      description: "读取本地数据库中的活动和参会人记录。",
    },
    {
      time: formatTimePart(event?.endsAt ?? start) || "20:00",
      label: "结构化交流",
      description: event ? `活动时长 ${formatDuration(event.startsAt, event.endsAt)}。` : "围绕关系图谱做分组交流。",
    },
    {
      time: "After",
      label: "推荐与跟进",
      description: "使用 matchRecommendations 和 tasks 生成会后动作。",
    },
  ];
}

function personFromContact(
  data: OrbitHybridRouteData,
  contact: ContactDTO,
  index: number,
  recommendation?: MatchRecommendationDTO,
): OrbitPartyPersonView {
  const connection = connectionsByContactId(data).get(contact.id);
  const offering = contactOffering(data, contact, connection);
  const seeking = contactSeeking(data, contact, connection);
  const topics = recommendation?.sharedTopics?.length
    ? Array.from(recommendation.sharedTopics).slice(0, 4)
    : contactTopics(connection);

  return {
    company: contactCompany(contact),
    g: gradientFor(contact.id, index),
    groupNumber: (index % 4) + 1,
    icebreakers:
      connection?.suggestedActions?.length
        ? Array.from(connection.suggestedActions).slice(0, 2)
        : ["What context should Orbit remember?", "What would make this follow-up useful?"],
    id: contact.id,
    industry: contactIndustry(contact, connection),
    initial: initialFor(contact.displayName),
    name: contact.displayName,
    offering,
    reason:
      recommendation?.reason ??
      connection?.summary ??
      contact.profileSnippet ??
      "Source-backed relationship from the hybrid local remote database.",
    score:
      recommendation?.score ??
      connection?.businessRelevanceScore ??
      connection?.relationshipStrength ??
      70,
    seat: `${String.fromCharCode(65 + (index % 6))}${index + 1}`,
    seeking,
    summary: `${contactTitle(contact)} @ ${contactCompany(contact)}. ${offering} / ${seeking}.`,
    title: contactTitle(contact),
    topics,
  };
}

function personFromNetworkPerson(
  person: NetworkPersonDTO,
  index: number,
  recommendation: MatchRecommendationDTO,
): OrbitPartyPersonView {
  const topics = recommendation.sharedTopics.length
    ? Array.from(recommendation.sharedTopics).slice(0, 4)
    : ["platform graph", "warm introduction"];

  return {
    company: person.organization ?? "Platform network",
    g: gradientFor(person.id, index),
    groupNumber: (index % 4) + 1,
    icebreakers: recommendation.suggestedActions.length
      ? Array.from(recommendation.suggestedActions).slice(0, 2)
      : ["Who can introduce us?", "What context should I mention?"],
    id: person.id,
    industry: topics[0] ?? "Platform network",
    initial: initialFor(person.displayName),
    name: person.displayName,
    offering: person.profileSnippet ?? "Recommended through the platform graph.",
    reason: recommendation.reason,
    score: recommendation.score,
    seat: `${String.fromCharCode(65 + (index % 6))}${index + 1}`,
    seeking: "Warm introduction or shared event context required before contact creation.",
    summary: `${person.role ?? "Recommended person"} @ ${person.organization ?? "Platform network"}.`,
    title: person.role ?? "Recommended person",
    topics,
  };
}

function recommendationPeople(data: OrbitHybridRouteData): OrbitPartyPersonView[] {
  const contacts = new Map(data.contacts.map((contact) => [contact.id, contact]));
  const people = networkPeopleById(data);
  const peopleFromMatches = data.matchRecommendations
    .map((recommendation, index) => {
      const contact = recommendation.contactId
        ? contacts.get(recommendation.contactId)
        : null;
      const person = recommendation.targetPersonId
        ? people.get(recommendation.targetPersonId)
        : null;

      if (contact) {
        return personFromContact(data, contact, index, recommendation);
      }

      return person ? personFromNetworkPerson(person, index, recommendation) : null;
    })
    .filter((person): person is OrbitPartyPersonView => person !== null);

  if (peopleFromMatches.length > 0) {
    return peopleFromMatches;
  }

  return sortedContacts(data).map((contact, index) =>
    personFromContact(data, contact, index),
  );
}

export function getOrbitPartyViewModel(): OrbitPartyViewModel {
  const data = getOrbitHybridRouteData();
  const event = currentEvent(data);
  const attendees = event ? attendeesForEvent(data, event.id) : [];
  const firstIntent = data.eventParticipantIntents[0];
  const profileTopics = firstIntent
    ? [...firstIntent.canOffer, ...firstIntent.lookingFor].slice(0, 3)
    : ["hybrid data", "relationship graph"];
  const people = recommendationPeople(data);

  return {
    accessCode: event ? passCodeForEvent(event) : "ORBT-0000",
    agenda: partyAgenda(data),
    eventName: event?.name ?? "Orbit local remote event",
    eventVenue: event?.location ?? "Local remote database",
    icebreakers: [
      "What evidence should Orbit keep for this relationship?",
      "What follow-up would make this connection actionable?",
      "Which introduction should happen next?",
    ],
    me: {
      groupNumber: 1,
      initial: initialFor(data.profile.displayName),
      name: data.profile.displayName,
      offering: firstIntent?.canOffer.length ? Array.from(firstIntent.canOffer) : ["relationship context"],
      prompts: [
        "Ask what outcome this person wants from the event.",
        "Capture one concrete next step before leaving the conversation.",
        "Confirm whether a warm introduction is appropriate.",
      ],
      role: [data.profile.role, data.account.name].filter(Boolean).join(" · "),
      seat: attendees[0] ? "A1" : "S1",
      seeking: firstIntent?.lookingFor.length ? Array.from(firstIntent.lookingFor) : ["relevant introductions"],
      topics: profileTopics,
    },
    recommendations: people,
    tableMates: people.slice(0, 4),
  };
}
