import type { OrbitAiCommandInput, OrbitAiCommandResult } from "./contract";
import type {
  OrbitAgentArtifactLookupInput,
  OrbitAgentArtifactResultEnvelope,
  OrbitAgentArtifactTaskRequest,
} from "./artifact-contract";
import type {
  OrbitAgentConversationInput,
  OrbitAgentConversationLookupInput,
  OrbitAgentConversationResult,
  OrbitAgentSendMessageInput,
} from "./conversation-contract";

export type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface OrbitAiCommandService {
  getCommandCenter: (input?: OrbitAiCommandInput) => OrbitAiCommandResult;
}

export interface OrbitAgentConversationService {
  listConversations: (
    input?: OrbitAgentConversationInput,
  ) => MaybePromise<OrbitAgentConversationResult>;
  getConversation: (
    input: OrbitAgentConversationLookupInput,
  ) => MaybePromise<OrbitAgentConversationResult>;
  sendMessage: (
    input: OrbitAgentSendMessageInput,
  ) => MaybePromise<OrbitAgentConversationResult>;
}

export interface OrbitAgentArtifactTaskService {
  createArtifactTask: (
    input: OrbitAgentArtifactTaskRequest,
  ) => OrbitAgentArtifactResultEnvelope;
  getArtifactTask: (
    input: OrbitAgentArtifactLookupInput,
  ) => OrbitAgentArtifactResultEnvelope;
}

export type { OrbitAiCommandInput, OrbitAiCommandResult };
export type {
  OrbitAgentArtifactLookupInput,
  OrbitAgentArtifactResultEnvelope,
  OrbitAgentArtifactTaskRequest,
};
export type {
  OrbitAgentConversationInput,
  OrbitAgentConversationLookupInput,
  OrbitAgentConversationResult,
  OrbitAgentSendMessageInput,
};
