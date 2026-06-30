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

// Orbit AI 的 service interface 聚合点。
// 各 API route 和页面 view model 只依赖这些接口，
// 具体 mock/live 实现由 service-factory 选择。
export type MaybePromise<TValue> = TValue | Promise<TValue>;

// 旧 command center 能力：当前只有 mock，用于首页/命令中心类 UI。
export interface OrbitAiCommandService {
  getCommandCenter: (input?: OrbitAiCommandInput) => OrbitAiCommandResult;
}

// Chat Agent conversation 能力：mock 可以同步返回，live 会异步调用模型 provider。
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

// Artifact task 能力：把模型计划出的内部工具请求转成可复核 UI 面板。
// 当前实现仍是 mock，后续真实 artifact producer 可以在不改 UI contract 的前提下替换。
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
