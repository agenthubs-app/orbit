export const AGENT_FEEDBACK_RATINGS = [
  "helpful",
  "not_relevant",
] as const;
export type AgentFeedbackRating =
  (typeof AGENT_FEEDBACK_RATINGS)[number];

export const AGENT_FEEDBACK_OUTCOMES = [
  "contacted",
  "meeting_booked",
  "goal_advanced",
] as const;
export type AgentFeedbackOutcome =
  (typeof AGENT_FEEDBACK_OUTCOMES)[number];

export interface AgentFeedback {
  feedbackId: string;
  runId: string;
  rating?: AgentFeedbackRating;
  outcome?: AgentFeedbackOutcome;
  sourceModules: readonly string[];
  evidenceIds: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentFeedbackContext {
  summary: string;
}

export type AgentFeedbackRecordPayload = Record<string, unknown> & {
  kind: "agent_feedback";
  feedback: AgentFeedback;
};

export interface UpsertAgentFeedbackInput {
  runId: string;
  rating?: AgentFeedbackRating;
  outcome?: AgentFeedbackOutcome;
  sourceModules?: readonly string[];
  evidenceIds?: readonly string[];
}

export interface AgentFeedbackService {
  list: () => Promise<readonly AgentFeedback[]>;
  get: (runId: string) => Promise<AgentFeedback | null>;
  upsert: (input: UpsertAgentFeedbackInput) => Promise<AgentFeedback>;
  remove: (runId: string) => Promise<void>;
  context: (limit?: number) => Promise<readonly AgentFeedbackContext[]>;
}
