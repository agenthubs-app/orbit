import type { AgentActionRecord, AgentRun } from "../../agent/runtime/contract";

export const ORBIT_KNOWN_WORKFLOW_KEYS = [
  "post_event_followup_v1",
  "pre_event_brief_v1",
  "event_matchmaking_v1",
] as const;

export type OrbitKnownWorkflowKey =
  (typeof ORBIT_KNOWN_WORKFLOW_KEYS)[number];

export interface OrbitWorkflowResult<TArtifact = unknown> {
  run: AgentRun;
  actions: readonly AgentActionRecord[];
  artifact: TArtifact;
}

export interface OrbitKnownWorkflow<TInput, TArtifact = unknown> {
  key: OrbitKnownWorkflowKey;
  version: number;
  canHandle: (trigger: string) => boolean;
  run: (input: TInput) => Promise<OrbitWorkflowResult<TArtifact>>;
}

export interface PostEventFollowupArtifact {
  eventId: string;
  contactId: string | null;
  contactResolution:
    | "resolved"
    | "candidate_confirmation_required"
    | "merge_review_required";
  summary: string;
  messageDraft: string;
  rawAudioPersisted: false;
  evidenceIds: readonly string[];
}

export interface PreEventBriefPerson {
  contactId: string;
  displayName: string;
  organization?: string;
  whyWorthMeeting: string;
  lastInteraction?: string;
  evidenceIds: readonly string[];
  evidenceSummaries?: readonly string[];
  suggestedTopics: readonly string[];
  openCommitments: readonly string[];
}

export interface PreEventBriefArtifact {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  goal?: string;
  people: readonly PreEventBriefPerson[];
  preparationGaps: readonly string[];
  evidenceIds: readonly string[];
}
