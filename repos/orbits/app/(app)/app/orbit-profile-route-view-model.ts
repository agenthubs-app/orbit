import {
  connectionsByContactId,
  getOrbitHybridRouteData,
  sortedContacts,
} from "./orbit-hybrid-route-data";

export interface OrbitProfileView {
  bio: string;
  company: string;
  email: string;
  fullName: string;
  headline: string;
  industry: string;
  intro: string;
  lineId: string;
  offering: string[];
  seeking: string[];
  title: string;
  topics: string[];
  wechatName: string;
}

export interface OrbitProfileViewModel {
  industries: string[];
  offeringTags: string[];
  profile: OrbitProfileView;
  seekingTags: string[];
  topics: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function getOrbitProfileViewModel(): OrbitProfileViewModel {
  const data = getOrbitHybridRouteData();
  const contacts = sortedContacts(data);
  const connections = connectionsByContactId(data);
  const connectionTopics = unique(
    contacts.flatMap((contact) => connections.get(contact.id)?.sharedTopics ?? []),
  );
  const valueTypes = unique(
    data.connections.flatMap((connection) =>
      connection.valueTypes.map((value) => value.replace(/_/g, " ")),
    ),
  );
  const intentOffers = unique(
    data.eventParticipantIntents.flatMap((intent) => intent.canOffer),
  );
  const intentNeeds = unique(
    data.eventParticipantIntents.flatMap((intent) => intent.lookingFor),
  );
  const title = data.profile.role ?? "Relationship Operator";
  const company = data.account.name;

  return {
    industries: unique([
      ...valueTypes,
      ...contacts.map((contact) => contact.location ?? ""),
      "Relationship operations",
      "Community",
      "Investment",
      "Commerce",
    ]).slice(0, 12),
    offeringTags: unique([
      ...intentOffers,
      ...data.connections.flatMap((connection) => connection.suggestedActions ?? []),
      "relationship context",
    ]).slice(0, 12),
    profile: {
      bio: `${title} working from ${company}.`,
      company,
      email: "",
      fullName: data.profile.displayName,
      headline: `${title} · ${company}`,
      industry: valueTypes[0] ?? "Relationship operations",
      intro: "Use source-backed relationship data to decide who to meet, follow up with, and introduce.",
      lineId: "",
      offering: intentOffers.slice(0, 3),
      seeking: intentNeeds.slice(0, 3),
      title,
      topics: connectionTopics.slice(0, 5),
      wechatName: "",
    },
    seekingTags: unique([...intentNeeds, ...connectionTopics, "relevant introductions"]).slice(0, 12),
    topics: unique([...connectionTopics, ...valueTypes, "follow-up", "warm introductions"]).slice(0, 12),
  };
}
