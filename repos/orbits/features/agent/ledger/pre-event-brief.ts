import type { PreEventBriefArtifact } from "../../orbit-ai/workflows/contract";
import type { AgentActionRecord } from "../runtime/contract";
import type { AgentLedgerEntry, AgentLedgerOperation } from "./contract";

type BriefActionLike = Pick<
  AgentActionRecord,
  "operations" | "viewedAt" | "workflowKey"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readPeople(value: unknown): PreEventBriefArtifact["people"] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const people = value.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.contactId !== "string" ||
      typeof candidate.displayName !== "string" ||
      typeof candidate.whyWorthMeeting !== "string" ||
      !isStringArray(candidate.evidenceIds) ||
      !isStringArray(candidate.suggestedTopics) ||
      !isStringArray(candidate.openCommitments)
    ) {
      return [];
    }
    return [
      {
        contactId: candidate.contactId,
        displayName: candidate.displayName,
        organization:
          typeof candidate.organization === "string"
            ? candidate.organization
            : undefined,
        whyWorthMeeting: candidate.whyWorthMeeting,
        lastInteraction:
          typeof candidate.lastInteraction === "string"
            ? candidate.lastInteraction
            : undefined,
        evidenceIds: candidate.evidenceIds,
        evidenceSummaries: isStringArray(candidate.evidenceSummaries)
          ? candidate.evidenceSummaries
          : undefined,
        suggestedTopics: candidate.suggestedTopics,
        openCommitments: candidate.openCommitments,
      },
    ];
  });
  return people.length === value.length ? people : null;
}

function parseArtifact(value: unknown): PreEventBriefArtifact | null {
  if (
    !isRecord(value) ||
    typeof value.eventId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.startsAt !== "string" ||
    !Number.isFinite(Date.parse(value.startsAt)) ||
    !isStringArray(value.preparationGaps) ||
    !isStringArray(value.evidenceIds)
  ) {
    return null;
  }
  const people = readPeople(value.people);
  if (!people) return null;
  return {
    eventId: value.eventId,
    title: value.title,
    startsAt: value.startsAt,
    endsAt: typeof value.endsAt === "string" ? value.endsAt : undefined,
    location: typeof value.location === "string" ? value.location : undefined,
    goal: typeof value.goal === "string" ? value.goal : undefined,
    people,
    preparationGaps: value.preparationGaps,
    evidenceIds: value.evidenceIds,
  };
}

function briefOperation(
  operations: readonly Pick<
    AgentLedgerOperation,
    "operationType" | "payload"
  >[],
) {
  return operations.find(
    (operation) => operation.operationType === "generate_meeting_brief",
  );
}

export function readPreEventBriefFromAction(
  action: BriefActionLike,
): PreEventBriefArtifact | null {
  if (action.workflowKey !== "pre_event_brief_v1") return null;
  return parseArtifact(briefOperation(action.operations)?.payload?.artifact);
}

export function readPreEventBriefFromLedgerEntry(
  entry: AgentLedgerEntry,
): PreEventBriefArtifact | null {
  return readPreEventBriefFromAction(entry as BriefActionLike);
}

export function isUnviewedPreEventBriefEntry(
  entry: AgentLedgerEntry,
): boolean {
  return Boolean(readPreEventBriefFromLedgerEntry(entry)) && !entry.viewedAt;
}
