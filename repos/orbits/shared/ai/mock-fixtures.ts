import {
  type AiProviderFallbackBehavior,
  type AiProviderOutput,
  type AiProviderPayload,
  type AiProviderRunRecord,
  type AiProviderSourceReference,
  type PromptTemplateId,
} from "./provider";
import {
  buildMockAiRunProvenance,
  createMockInputHash,
  type AiRunProvenanceRecord,
} from "./provenance";

export const AI_PROVIDER_FIXTURE_SOURCE =
  "fixture:shared/ai/mock-fixtures.ts" as const;

const fixtureCollectedAt = "2026-06-26T00:12:00.000Z";

const mockOnlyExecutionFlags = {
  modelCallExecuted: false,
  liveAiProviderRequested: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationProviderRequested: false,
  deviceRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
} as const;

function source(input: {
  id: string;
  type: AiProviderSourceReference["type"];
  label: string;
  providerRecordId: string;
}): AiProviderSourceReference {
  return {
    ...input,
    collectedAt: fixtureCollectedAt,
    generatedBy: "mock-ai-provider-rules",
  };
}

const mayaPilotSource = source({
  id: "source:ai-provider:maya:pilot-timing",
  type: "chat_summary",
  label: "Maya pilot timing relationship evidence",
  providerRecordId: "chat-summary:maya:pilot-timing",
});

const diegoEventNoteSource = source({
  id: "source:ai-provider:diego:case-study",
  type: "event_note",
  label: "Diego case study event note",
  providerRecordId: "event-note:diego:case-study",
});

const providerGuardSource = source({
  id: "source:ai-provider:local-guard",
  type: "system",
  label: "Local AI provider guard",
  providerRecordId: "mock-ai-provider-guard",
});

function run(input: {
  runId: string;
  promptTemplateId: PromptTemplateId;
  hashInput: Readonly<Record<string, unknown>>;
  output: AiProviderOutput;
  fallbackBehavior: AiProviderFallbackBehavior;
  sourceRefs: readonly AiProviderSourceReference[];
  evidenceIds: readonly string[];
  generationMethod: AiRunProvenanceRecord["generationMethod"];
  sourceLabel: string;
}): AiProviderRunRecord {
  const inputHash = createMockInputHash(input.hashInput);

  return {
    runId: input.runId,
    state: "success",
    promptTemplateId: input.promptTemplateId,
    inputHash,
    output: input.output,
    provenance: buildMockAiRunProvenance({
      source: AI_PROVIDER_FIXTURE_SOURCE,
      runId: input.runId,
      promptTemplateId: input.promptTemplateId,
      inputHash,
      outputPreview: input.output.text.slice(0, 120),
      evidenceIds: input.evidenceIds,
      sourceLabel: input.sourceLabel,
      collectedAt: fixtureCollectedAt,
      generationMethod: input.generationMethod,
      fallbackUsed: input.fallbackBehavior.used,
    }),
    fallbackBehavior: input.fallbackBehavior,
    sourceRefs: input.sourceRefs,
    evidenceIds: input.evidenceIds,
    generatedBy: "mock-ai-provider-rules",
    ...mockOnlyExecutionFlags,
  };
}

export const mockAiProviderRuns: readonly AiProviderRunRecord[] = [
  run({
    runId: "demo-ai-run-1",
    promptTemplateId: "orbit.message-draft.followup.v1",
    hashInput: {
      desiredOutcome: "Send the pilot timing comparison",
      promptTemplateId: "orbit.message-draft.followup.v1",
      recipientName: "Maya Chen",
      relationshipContext:
        "Maya asked for the pilot timing comparison after breakfast.",
    },
    output: {
      kind: "message_draft",
      text:
        "Hi Maya Chen, following up from breakfast: I pulled together the pilot timing comparison and the operator-readiness notes. Would a 20-minute review next week help your team choose the right pilot window?",
      structured: {
        relationshipContext:
          "Maya asked for the pilot timing comparison after breakfast.",
        recipientName: "Maya Chen",
        recommendedAction: "Review the draft before any external send action.",
      },
      fallbackUsed: false,
    },
    fallbackBehavior: {
      used: false,
      reason: "Supported prompt template matched relationship context.",
      output: "",
    },
    sourceRefs: [mayaPilotSource],
    evidenceIds: [
      "evidence:ai-provider:message-draft",
      "evidence:chat:maya:pilot-timing",
    ],
    generationMethod: "fixture",
    sourceLabel: "Maya pilot timing relationship evidence",
  }),
  run({
    runId: "demo-ai-run-2",
    promptTemplateId: "orbit.relationship-context-summary.v1",
    hashInput: {
      promptTemplateId: "orbit.relationship-context-summary.v1",
      relationshipContext:
        "Diego wants a short case study before next week's regional planning meeting.",
    },
    output: {
      kind: "relationship_context_summary",
      text:
        "Diego Rivera is preparing regional planning and needs a concise Japan expansion case study before the meeting.",
      structured: {
        contactName: "Diego Rivera",
        relationshipSignal: "Requested case study from event note.",
        recommendedAction: "Prepare source-backed case study notes.",
      },
      fallbackUsed: false,
    },
    fallbackBehavior: {
      used: false,
      reason: "Supported prompt template matched relationship context.",
      output: "",
    },
    sourceRefs: [diegoEventNoteSource],
    evidenceIds: [
      "evidence:ai-provider:relationship-summary",
      "evidence:event:diego:case-study",
    ],
    generationMethod: "fixture",
    sourceLabel: "Diego case study event note",
  }),
] as const;

export const mockAiProviderProvenance: AiRunProvenanceRecord = {
  ...mockAiProviderRuns[0].provenance,
  runId: "demo-ai-provider-fixture",
  sourceLabel: "Mock AI provider fixture",
  evidenceIds: mockAiProviderRuns.flatMap((item) => item.evidenceIds),
  generationMethod: "fixture",
  fallbackUsed: false,
};

export const mockAiProviderFailureProvenance: AiRunProvenanceRecord = {
  ...buildMockAiRunProvenance({
    source: AI_PROVIDER_FIXTURE_SOURCE,
    runId: "demo-ai-run-controlled-failure",
    promptTemplateId: "orbit.message-draft.followup.v1",
    inputHash: createMockInputHash({
      scenario: "failure",
      source: providerGuardSource.providerRecordId,
    }),
    outputPreview: "Controlled local AI provider failure.",
    evidenceIds: ["evidence:ai-provider:controlled-failure"],
    sourceLabel: "Controlled AI provider mock failure",
    collectedAt: fixtureCollectedAt,
    generationMethod: "rule-based-state",
    fallbackUsed: false,
  }),
};

export const mockAiProviderFixture: AiProviderPayload = {
  state: "success",
  runs: mockAiProviderRuns,
  summary:
    "Local rules prepared AI-shaped message draft and relationship summary outputs with prompt template ids, input hashes, output records, and run provenance.",
  provenance: mockAiProviderProvenance,
  nextAction:
    "Review source evidence, prompt template id, input hash, output, and fallback behavior before wiring a live provider.",
};

export const mockEmptyAiProviderFixture: AiProviderPayload = {
  state: "empty",
  runs: [],
  summary:
    "No mock AI provider output is available because no prompt-ready relationship context exists.",
  provenance: {
    ...mockAiProviderProvenance,
    runId: "demo-ai-run-empty",
    sourceLabel: "Empty AI provider fixture",
    evidenceIds: ["evidence:ai-provider:empty"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Add relationship context, source evidence, and a prompt template before requesting mock AI output.",
};

export const mockPendingAiProviderFixture: AiProviderPayload = {
  state: "pending",
  runs: [],
  summary:
    "Mock AI provider output is waiting on a local provider guard state.",
  provenance: {
    ...mockAiProviderProvenance,
    runId: "demo-ai-run-pending",
    sourceLabel: "Pending AI provider fixture",
    evidenceIds: ["evidence:ai-provider:pending-local-provider-guard"],
    generationMethod: "rule-based-state",
  },
  nextAction:
    "Resolve the local provider guard before displaying AI-shaped output.",
};
