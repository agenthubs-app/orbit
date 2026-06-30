import type { ContactDTO, EventDTO, MatchRecommendationDTO } from "../../../shared/domain/contracts";
import {
  connectionsByContactId,
  contactCompany,
  contactIndustry,
  contactPipelineStatus,
  contactTitle,
  eventCodeFor,
  eventIndustryFor,
  getOrbitHybridRouteData,
  gradientFor,
  initialFor,
  sortedContacts,
  sortedEvents,
  type OrbitHybridRouteData,
} from "./orbit-hybrid-route-data";

export interface OrbitAgentConnectionView {
  company: string;
  displayName: string;
  g: string;
  id: string;
  industry: string;
  initial: string;
  pipelineStatus: "to_contact" | "in_progress" | "partnered";
  title: string;
}

export interface OrbitAgentEventView {
  code: string;
  g: string;
  id: string;
  name: string;
  place: string;
  startsAt: string;
}

export interface OrbitAgentPeopleResultView {
  connection: OrbitAgentConnectionView;
  match: number;
  opener: string;
  reason: string;
}

export interface OrbitAgentEventResultView {
  event: OrbitAgentEventView;
  howto: string;
  reason: string;
  score: number;
}

export interface OrbitAgentScenarioView {
  intro: string;
  items: OrbitAgentPeopleResultView[] | OrbitAgentEventResultView[];
  kind: "people" | "events";
  note?: string;
  panelTitle: string;
  q: string;
}

export interface OrbitAgentHistoryView {
  group: string;
  id: string;
  q: string;
  title: string;
  when: string;
}

export interface OrbitAgentSuggestView {
  icon: string;
  label: string;
  q: string;
}

export interface OrbitAgentViewModel {
  history: OrbitAgentHistoryView[];
  scenarios: {
    events: OrbitAgentScenarioView;
    people: OrbitAgentScenarioView;
    peopleToEvents: OrbitAgentScenarioView;
  };
  suggests: OrbitAgentSuggestView[];
}

function connectionView(
  data: OrbitHybridRouteData,
  contact: ContactDTO,
  index: number,
): OrbitAgentConnectionView {
  const connection = connectionsByContactId(data).get(contact.id);

  return {
    company: contactCompany(contact),
    displayName: contact.displayName,
    g: gradientFor(contact.id, index),
    id: contact.id,
    industry: contactIndustry(contact, connection),
    initial: initialFor(contact.displayName),
    pipelineStatus: contactPipelineStatus(contact.stage),
    title: contactTitle(contact),
  };
}

function peopleResult(
  data: OrbitHybridRouteData,
  recommendation: MatchRecommendationDTO,
  index: number,
): OrbitAgentPeopleResultView | null {
  const contact = data.contacts.find((item) => item.id === recommendation.contactId);

  if (!contact) {
    return null;
  }

  return {
    connection: connectionView(data, contact, index),
    match: recommendation.score,
    opener:
      recommendation.suggestedActions[0] ??
      "Share the source-backed relationship context and ask for the next step.",
    reason: recommendation.reason,
  };
}

function fallbackPeople(data: OrbitHybridRouteData): OrbitAgentPeopleResultView[] {
  return sortedContacts(data).slice(0, 5).map((contact, index) => {
    const connection = connectionsByContactId(data).get(contact.id);

    return {
      connection: connectionView(data, contact, index),
      match: connection?.businessRelevanceScore ?? connection?.relationshipStrength ?? 70,
      opener:
        connection?.suggestedActions?.[0] ??
        "Review the local remote evidence before sending a follow-up.",
      reason:
        connection?.summary ??
        contact.profileSnippet ??
        "This contact is present in the hybrid local remote relationship graph.",
    };
  });
}

function eventView(event: EventDTO, index: number): OrbitAgentEventView {
  return {
    code: eventCodeFor(event, index),
    g: eventIndustryFor(event),
    id: event.id,
    name: event.name,
    place: event.location ?? "Local remote database",
    startsAt: event.startsAt,
  };
}

function eventResults(data: OrbitHybridRouteData): OrbitAgentEventResultView[] {
  return sortedEvents(data).slice(0, 5).map((event, index) => ({
    event: eventView(event, index),
    howto: "Review attendees, recommendations, and follow-up tasks before acting.",
    reason: `${event.name} is available from the hybrid local remote database.`,
    score: Math.max(70, 96 - index * 4),
  }));
}

export function getOrbitAgentViewModel(): OrbitAgentViewModel {
  const data = getOrbitHybridRouteData();
  const recommendationItems = data.matchRecommendations
    .slice(0, 5)
    .map((recommendation, index) => peopleResult(data, recommendation, index))
    .filter((item): item is OrbitAgentPeopleResultView => item !== null);
  const peopleItems =
    recommendationItems.length > 0 ? recommendationItems : fallbackPeople(data);
  const events = eventResults(data);
  const peopleQuery = "根据本地 hybrid 数据，帮我找最值得跟进的人脉。";
  const eventQuery = "根据本地 hybrid 数据，推荐我应该关注的活动。";
  const peopleToEventsQuery = "如果目标人脉还不够，哪些活动最适合继续拓展？";
  const scenarios = {
    people: {
      q: peopleQuery,
      kind: "people" as const,
      panelTitle: `为你匹配的人脉 · ${peopleItems.length} 位`,
      intro: "这些结果来自 local-remote database 中的联系人、连接和匹配推荐。",
      items: peopleItems,
    },
    peopleToEvents: {
      q: peopleToEventsQuery,
      kind: "events" as const,
      panelTitle: `推荐活动 · ${events.length} 场`,
      note: "当现有联系人不足时，优先看本地数据库中证据最完整的活动。",
      intro: "以下活动来自 hybrid events 表，可继续用于参会和拓展关系。",
      items: events,
    },
    events: {
      q: eventQuery,
      kind: "events" as const,
      panelTitle: `推荐活动 · ${events.length} 场`,
      intro: "结合本地数据库的活动、参会人和推荐记录，按可行动性排序。",
      items: events,
    },
  };

  return {
    scenarios,
    suggests: [
      { label: "找值得跟进的人脉", q: peopleQuery, icon: "users" },
      { label: "推荐可拓展活动", q: eventQuery, icon: "calendar" },
      { label: "活动补足人脉缺口", q: peopleToEventsQuery, icon: "handshake" },
    ],
    history: [
      { id: "history:people", group: "今天", when: "刚刚", title: "Hybrid 人脉推荐", q: peopleQuery },
      { id: "history:events", group: "今天", when: "稍早", title: "Hybrid 活动推荐", q: eventQuery },
      { id: "history:gaps", group: "本周", when: "最近", title: "通过活动补足关系缺口", q: peopleToEventsQuery },
    ],
  };
}
