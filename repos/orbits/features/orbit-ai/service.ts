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

export interface OrbitAiCommandService {
  getCommandCenter: (input?: OrbitAiCommandInput) => OrbitAiCommandResult;
}

export interface OrbitAgentConversationService {
  listConversations: (
    input?: OrbitAgentConversationInput,
  ) => OrbitAgentConversationResult;
  getConversation: (
    input: OrbitAgentConversationLookupInput,
  ) => OrbitAgentConversationResult;
  sendMessage: (
    input: OrbitAgentSendMessageInput,
  ) => OrbitAgentConversationResult;
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
