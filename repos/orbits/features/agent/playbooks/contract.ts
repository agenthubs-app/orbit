import type {
  CreateAgentAutomationInput,
} from "../automations/contract";

export const AGENT_PLAYBOOK_CAPABILITY_IDS = [
  "followups.reviewQueue",
  "contacts.recommend",
  "events.recommend",
  "chat.context",
] as const;

export type AgentPlaybookCapabilityId =
  (typeof AGENT_PLAYBOOK_CAPABILITY_IDS)[number];

export interface AgentPlaybookDraft {
  definition: CreateAgentAutomationInput;
  explanation: string;
  assumptions: readonly string[];
  model: string;
  provider: string;
}

export type AgentPlaybookCompileResult =
  | { success: true; draft: AgentPlaybookDraft }
  | {
      success: false;
      error: {
        code:
          | "PLAYBOOK_REQUEST_REQUIRED"
          | "PLAYBOOK_PROVIDER_FAILED"
          | "PLAYBOOK_SCHEMA_INVALID";
        message: string;
      };
    };

export interface AgentPlaybookCompiler {
  compile(input: {
    request: string;
    locale?: "zh" | "en";
    timeZone: string;
    currentTimeIso?: string;
  }): Promise<AgentPlaybookCompileResult>;
}
