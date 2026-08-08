import type {
  AgentAutomation,
  CreateAgentAutomationInput,
  AgentAutomationService,
} from "./contract";
import type { AgentMemoryContext } from "../memory/contract";
import type { AgentSignal } from "../signals/contract";
import { createOrbitAgentArtifactTaskServiceForActor } from "../../orbit-ai/service-factory";
import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactProducer,
} from "../../orbit-ai/artifact-contract";
import { stablePayloadHash } from "../runtime/hash";

const playbookArtifactByCapability: Readonly<
  Record<
    string,
    {
      kind: OrbitAgentArtifactKind;
      producer: OrbitAgentArtifactProducer;
    }
  >
> = {
  "chat.context": {
    kind: "relationship_chat_context",
    producer: "relationship_chat_review_producer",
  },
  "contacts.recommend": {
    kind: "contact_recommendations",
    producer: "contact_recommendation_producer",
  },
  "events.recommend": {
    kind: "event_recommendations",
    producer: "event_recommendation_producer",
  },
  "followups.reviewQueue": {
    kind: "followup_queue",
    producer: "followup_review_producer",
  },
};

export interface AgentAutomationExecutionResult {
  summary: string;
  runId?: string;
  sourceModules?: readonly string[];
  evidenceIds?: readonly string[];
}

export interface AgentAutomationTriggerContext {
  eventId: string;
  eventIds?: readonly string[];
  signalType: "followup_due" | "event_upcoming" | "relationship_stale";
  importance: number;
  title: string;
  summary: string;
  evidenceIds: readonly string[];
}

export interface AgentAutomationRunnerDependencies {
  actorId?: string;
  execute?: (
    automation: AgentAutomation,
  ) => Promise<AgentAutomationExecutionResult>;
  now?: () => string;
  workerId?: string;
  memory?: readonly AgentMemoryContext[];
  triggerContext?: AgentAutomationTriggerContext;
}

async function finishClaimedAgentAutomation(
  service: AgentAutomationService,
  claimed: AgentAutomation,
  execute: (
    automation: AgentAutomation,
  ) => Promise<AgentAutomationExecutionResult>,
  now: () => string,
): Promise<AgentAutomation> {
  const leaseId = claimed.lease?.leaseId;
  if (!leaseId) {
    throw new Error(
      `Agent automation ${claimed.automationId} is missing its execution lease.`,
    );
  }
  try {
    const result = await execute(claimed);
    return service.recordRun({
      automationId: claimed.automationId,
      completedAt: now(),
      leaseId,
      outcome: {
        evidenceIds: result.evidenceIds,
        sourceModules: result.sourceModules,
        status: "success",
        summary: result.summary,
        runId: result.runId,
      },
    });
  } catch (error) {
    return service.recordRun({
      automationId: claimed.automationId,
      completedAt: now(),
      leaseId,
      outcome: {
        status: "failure",
        summary:
          error instanceof Error
            ? error.message
            : "Agent automation execution failed.",
      },
    });
  }
}

async function executeWithOrbitAgent(
  automation: AgentAutomation,
  actorId: string | undefined,
  _memory: readonly AgentMemoryContext[] = [],
  triggerContext?: AgentAutomationTriggerContext,
): Promise<AgentAutomationExecutionResult> {
  const authenticatedActorId = actorId?.trim();
  if (!authenticatedActorId) {
    throw new Error(
      "Authenticated actor identity is required to run an Agent Playbook.",
    );
  }
  const artifactDefinition =
    playbookArtifactByCapability[automation.capabilityId];
  if (!artifactDefinition) {
    throw new Error(
      `Agent Playbook capability ${automation.capabilityId} is not a registered read-only artifact tool.`,
    );
  }
  const service = createOrbitAgentArtifactTaskServiceForActor(
    authenticatedActorId,
  );
  const triggerEvidence = triggerContext
    ? [
        "",
        "Orbit relationship signal evidence:",
        `type=${triggerContext.signalType}`,
        `importance=${triggerContext.importance}`,
        `title=${triggerContext.title}`,
        `summary=${triggerContext.summary}`,
        `evidenceIds=${triggerContext.evidenceIds.join(",")}`,
      ].join("\n")
    : "";
  const result = await service.createArtifactTask({
    artifactProducer: artifactDefinition.producer,
    kind: artifactDefinition.kind,
    conversationId: `automation:${automation.automationId}`,
    locale: "zh",
    query: `${automation.instruction}${triggerEvidence}`,
  });
  if (result.success === false) {
    throw new Error(result.error.message);
  }
  const generatedView = result.data.result.generatedView;
  return {
    evidenceIds: [...new Set(result.data.result.provenance.evidenceIds)],
    sourceModules: [...new Set(result.data.result.provenance.sourceModules)],
    summary:
      generatedView?.summary ||
      generatedView?.emptyState ||
      result.data.result.nextAction,
    runId: result.data.task.taskId,
  };
}

export async function runAgentAutomation(
  service: AgentAutomationService,
  automationId: string,
  dependencies: AgentAutomationRunnerDependencies = {},
): Promise<AgentAutomation> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(
        automation,
        dependencies.actorId,
        dependencies.memory,
        dependencies.triggerContext,
      ));
  const workerId = dependencies.workerId ?? "agent-automation-runner";
  const claimed = await service.claim({
    automationId,
    claimedAt: now(),
    workerId,
  });
  return finishClaimedAgentAutomation(service, claimed, execute, now);
}

export async function runDueAgentAutomations(
  service: AgentAutomationService,
  input: {
    limit: number;
    now: string;
    workerId: string;
  },
  dependencies: Omit<
    AgentAutomationRunnerDependencies,
    "now" | "workerId"
  > = {},
): Promise<readonly AgentAutomation[]> {
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(
        automation,
        dependencies.actorId,
        dependencies.memory,
      ));
  const claimed = await service.claimDue(input);
  return Promise.all(
    claimed.map((automation) =>
      finishClaimedAgentAutomation(
        service,
        automation,
        execute,
        () => new Date().toISOString(),
      ),
    ),
  );
}

export async function runAgentAutomationSignalTriggers(
  service: AgentAutomationService,
  triggerContext: AgentAutomationTriggerContext,
  dependencies: Omit<
    AgentAutomationRunnerDependencies,
    "triggerContext"
  > = {},
): Promise<readonly AgentAutomation[]> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const workerId =
    dependencies.workerId ?? "agent-automation-signal-runner";
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(
        automation,
        dependencies.actorId,
        dependencies.memory,
        triggerContext,
      ));
  const claimed = await service.claimForSignal({
    claimedAt: now(),
    batchId: triggerContext.eventId,
    eventIds: triggerContext.eventIds ?? [triggerContext.eventId],
    importance: triggerContext.importance,
    limit: 20,
    signalType: triggerContext.signalType,
    workerId,
  });
  return Promise.all(
    claimed.map((automation) =>
      finishClaimedAgentAutomation(
        service,
        automation,
        execute,
        now,
      ),
    ),
  );
}

export async function runAgentAutomationsForSignals(
  service: AgentAutomationService,
  signals: readonly AgentSignal[],
  dependencies: Omit<
    AgentAutomationRunnerDependencies,
    "triggerContext"
  > = {},
): Promise<readonly AgentAutomation[]> {
  const runs: AgentAutomation[] = [];
  const signalsByType = new Map<
    AgentSignal["type"],
    AgentSignal[]
  >();
  for (const signal of signals) {
    const grouped = signalsByType.get(signal.type) ?? [];
    grouped.push(signal);
    signalsByType.set(signal.type, grouped);
  }
  for (const [signalType, groupedSignals] of signalsByType) {
    const eventIds = groupedSignals
      .map(
        (signal) =>
          `${signal.signalId}:${signal.lastMeaningfulChangeAt}`,
      )
      .sort();
    const evidenceIds = [
      ...new Set(
        groupedSignals.flatMap((signal) =>
          signal.sources.flatMap((source) => source.evidenceIds),
        ),
      ),
    ];
    runs.push(
      ...(
        await runAgentAutomationSignalTriggers(
          service,
          {
            eventId: `batch:${signalType}:${stablePayloadHash(eventIds)}`,
            eventIds,
            evidenceIds,
            importance: Math.max(
              ...groupedSignals.map((signal) => signal.importance),
            ),
            signalType,
            summary: groupedSignals
              .map(
                (signal) =>
                  `- ${signal.title}: ${signal.summary}`,
              )
              .join("\n"),
            title: `${groupedSignals.length} ${signalType} signals`,
          },
          dependencies,
        )
      ),
    );
  }
  return runs;
}

export async function previewAgentAutomationDefinition(
  input: CreateAgentAutomationInput,
  dependencies: Pick<
    AgentAutomationRunnerDependencies,
    "actorId" | "execute" | "memory"
  > = {},
): Promise<AgentAutomationExecutionResult> {
  const timestamp = new Date().toISOString();
  const preview: AgentAutomation = {
    automationId: "playbook:dry-run",
    capabilityId: input.capabilityId,
    createdAt: timestamp,
    delivery: input.delivery,
    handledEventIds: [],
    instruction: input.instruction,
    lastRun: null,
    nextRunAt: null,
    revisions: [],
    runCount: 0,
    status: "paused",
    title: input.title,
    trigger: input.trigger,
    updatedAt: timestamp,
    version: 1,
  };
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(
        automation,
        dependencies.actorId,
        dependencies.memory,
      ));
  return execute(preview);
}
