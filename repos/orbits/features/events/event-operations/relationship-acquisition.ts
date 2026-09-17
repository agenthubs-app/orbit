import { createHash } from "node:crypto";
import type { ContactDTO, ConnectionDTO } from "../../../shared/domain/contracts";
import type { EventOperationsParticipant } from "./contract";

function digest(...values: readonly string[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value).update("\u0000");
  return hash.digest("hex").slice(0, 28);
}

export function contactFor(input: {
  evidenceId: string;
  eventId: string;
  ownerActorId: string;
  participant: EventOperationsParticipant;
  timestamp: string;
}): ContactDTO {
  return {
    createdAt: input.timestamp,
    displayName: input.participant.displayName,
    evidenceIds: [input.evidenceId],
    id: `contact:event-consent:${digest(
      input.eventId,
      input.ownerActorId,
      input.participant.actorId,
    )}`,
    organization: input.participant.company ?? undefined,
    personId: input.participant.actorId,
    profileSnippet: [
      ...input.participant.offers.map((value) => `Offers: ${value}`),
      ...input.participant.needs.map((value) => `Needs: ${value}`),
    ].join(" · "),
    publicProfile: {
      industry: input.participant.industry ?? undefined,
      offering: input.participant.offers,
      seeking: input.participant.needs,
      topics: input.participant.topics,
    },
    role: input.participant.role ?? undefined,
    source: {
      id: input.eventId,
      label: "Accepted event business-card request",
      type: "event_import",
    },
    stage: "captured",
    version: 1,
    lifecycleInitialization: "pending",
    updatedAt: input.timestamp,
  };
}

export function connectionFor(input: {
  contact: ContactDTO;
  evidenceId: string;
  eventId: string;
  ownerActorId: string;
  participant: EventOperationsParticipant;
  timestamp: string;
}): ConnectionDTO {
  return {
    accountId: input.ownerActorId,
    contactId: input.contact.id,
    createdAt: input.timestamp,
    evidenceIds: [input.evidenceId],
    id: `connection:event-consent:${digest(
      input.eventId,
      input.ownerActorId,
      input.participant.actorId,
    )}`,
    sharedTopics: input.participant.topics,
    source: {
      id: input.eventId,
      label: "Mutually accepted event connection",
      type: "event_import",
    },
    stage: "captured",
    version: 1,
    lifecycleInitialization: "pending",
    summary: `Mutual business-card consent at event ${input.eventId}.`,
    updatedAt: input.timestamp,
    valueTypes: ["community_context"],
  };
}
