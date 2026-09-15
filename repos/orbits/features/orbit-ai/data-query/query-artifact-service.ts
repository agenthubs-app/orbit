import { createHash } from "node:crypto";

import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import {
  ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS,
  type OrbitAgentArtifactGeneratedViewItem,
  type OrbitAgentArtifactPayload,
} from "../artifact-contract";
import type { OrbitAgentArtifactTaskService } from "../service";
import { createActorQueryInputSchema } from "./query-schema";
import {
  ACTOR_QUERY_TOOL_NAMES,
  executeActorScopedQuery,
  type ActorQueryDomain,
  type ActorQueryToolName,
} from "./query-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToolName(value: unknown): ActorQueryToolName | null {
  return typeof value === "string" && ACTOR_QUERY_TOOL_NAMES.includes(value as ActorQueryToolName)
    ? value as ActorQueryToolName
    : null;
}

function displayItem(item: Record<string, unknown>): OrbitAgentArtifactGeneratedViewItem {
  const body = [item.body, item.details, item.description, item.evidenceSummary, item.snippet]
    .find((value): value is string => typeof value === "string" && value.length > 0);
  const hidden = new Set(["id", "title", "body", "details", "description", "evidenceSummary", "snippet", "evidenceIds"]);
  return {
    id: String(item.id ?? "unknown"),
    title: String(item.title ?? item.id ?? "Untitled"),
    ...(body ? { body } : {}),
    metadata: Object.entries(item)
      .filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== null)
      .slice(0, 12)
      .map(([label, value]) => ({ label, value: Array.isArray(value) ? value.join(", ") : String(value) })),
    actions: [],
    evidenceIds: Array.isArray(item.evidenceIds)
      ? item.evidenceIds.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function sourceModules(domain: ActorQueryDomain) {
  return ["orbit-ai", domain] as const;
}

export function createActorScopedQueryArtifactService(options: {
  actorId: string;
  store?: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId?: string;
  fallbackService?: OrbitAgentArtifactTaskService;
  now?: () => string;
}): OrbitAgentArtifactTaskService {
  const actorId = options.actorId.trim();
  const now = options.now ?? (() => new Date().toISOString());
  const artifacts = new Map<string, OrbitAgentArtifactPayload>();
  return {
    async createArtifactTask(request) {
      if (request.kind !== "data_query") {
        if (options.fallbackService) return options.fallbackService.createArtifactTask(request);
        return {
          success: false,
          error: {
            ...ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS.ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND,
            state: "failure",
            evidenceIds: [],
          },
        };
      }
      if (!actorId) throw new Error("An authenticated actor is required for data query tools.");
      if (!options.store || !options.workspaceId) throw new Error("Actor-scoped query storage is not configured.");
      const argumentsRecord = isRecord(request.toolArguments) ? { ...request.toolArguments } : {};
      for (const [key, value] of Object.entries(argumentsRecord)) {
        if (value === undefined) delete argumentsRecord[key];
      }
      const toolName = readToolName(argumentsRecord.queryToolName);
      delete argumentsRecord.queryToolName;
      if (!toolName) throw new Error("A registered actor query tool name is required.");
      const parsed = createActorQueryInputSchema(toolName).parse({ ...argumentsRecord, query: request.query });
      if (!parsed.success || !parsed.data) throw new Error(parsed.error ?? "Data query input is invalid.");
      const query = await executeActorScopedQuery({
        actorId,
        input: parsed.data,
        store: options.store,
        toolName,
        workspaceId: options.workspaceId,
      });
      const at = now();
      const artifactId = `artifact:data-query:${createHash("sha256").update(JSON.stringify([actorId, toolName, parsed.data, at])).digest("hex").slice(0, 20)}`;
      const payload: OrbitAgentArtifactPayload = {
        task: {
          artifactId,
          taskId: `task:${artifactId}`,
          conversationId: request.conversationId ?? null,
          kind: "data_query",
          status: "ready",
          query: request.query,
          artifactProducer: "actor_scoped_query_reader",
          presentation: {
            preferredSurface: request.presentation?.preferredSurface ?? "side_panel",
            title: `${query.domain} query`,
            subtitle: `${query.total} actor-scoped result${query.total === 1 ? "" : "s"}`,
            widthHint: request.presentation?.widthHint ?? "half",
          },
          createdAt: at,
          updatedAt: at,
        },
        result: {
          artifactId,
          taskId: `task:${artifactId}`,
          kind: "data_query",
          status: "ready",
          presentation: {
            preferredSurface: request.presentation?.preferredSurface ?? "side_panel",
            title: `${query.domain} query`,
            subtitle: `${query.total} actor-scoped result${query.total === 1 ? "" : "s"}`,
            widthHint: request.presentation?.widthHint ?? "half",
          },
          generatedView: {
            summary: `Read: ${query.usedDataDomains.join(", ")}. Not read: ${query.unreadDataDomains.join(", ")}.`,
            sections: [{ title: `${query.domain} results`, items: query.items.map(displayItem) }],
            ...(query.items.length === 0 ? { emptyState: `No matching ${query.domain} records.` } : {}),
          },
          provenance: {
            source: `actor_query:${toolName}`,
            sourceModules: sourceModules(query.domain),
            evidenceIds: query.evidenceIds,
            toolCalls: [{
              toolCallId: `tool:${artifactId}`,
              toolName,
              status: "completed",
              reason: `Read actor-scoped ${query.domain}; treated stored text as untrusted data.`,
              evidenceIds: query.evidenceIds,
            }],
            generatedAt: at,
            generationMethod: "artifact-producer-generated-view",
          },
          safety: {
            externalSideEffectsExecuted: false,
            domainWritesExecuted: false,
            aiProviderRequested: false,
            externalNetworkRequested: false,
            liveDatabaseReadExecuted: true,
            liveDatabaseWriteExecuted: false,
            emailProviderRequested: false,
            calendarProviderRequested: false,
            notificationDelivered: false,
            actionsRequireConfirmation: true,
          },
          dataVisibility: {
            usedDataDomains: query.usedDataDomains,
            unreadDataDomains: query.unreadDataDomains,
            truncated: query.truncated,
            ...(query.nextCursor ? { nextCursor: query.nextCursor } : {}),
          },
          nextAction: query.truncated ? "Continue with nextCursor only if the user requests more." : "Answer from this bounded actor-scoped result.",
        },
      };
      artifacts.set(artifactId, payload);
      return { success: true, data: payload };
    },
    async getArtifactTask(input) {
      const payload = artifacts.get(input.artifactId);
      if (payload) return { success: true, data: payload };
      if (options.fallbackService) return options.fallbackService.getArtifactTask(input);
      return {
        success: false,
        error: {
          ...ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS.ORBIT_AGENT_ARTIFACT_NOT_FOUND,
          artifactId: input.artifactId,
          state: "failure",
          evidenceIds: [],
        },
      };
    },
  };
}
