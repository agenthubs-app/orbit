import { randomUUID } from "node:crypto";
import { getSelfProfileForAi, type SelfProfileReadContext, type SelfProfileReadResult } from "../profile/self-profile-reader";
import { getOrbitAgentToolMetadata } from "./agent-tools/registry";
import {
  ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS,
  type OrbitAgentArtifactPayload,
  type OrbitAgentArtifactResultEnvelope,
} from "./artifact-contract";
import type { OrbitAgentArtifactTaskService } from "./service";

// No profile cache or lookup by actor/artifact ID. The private snapshot lives only
// alongside its current runtime object; JSON responses and persisted traces omit it.
const runtimeProfiles = new WeakMap<OrbitAgentArtifactPayload, SelfProfileReadResult>();

export function selfProfileContextForSynthesis(artifact: OrbitAgentArtifactPayload): SelfProfileReadResult {
  return runtimeProfiles.get(artifact) ?? { status: "error", code: "SERVICE_UNAVAILABLE" };
}

export function createSelfProfileArtifactService(options: {
  context: SelfProfileReadContext;
  fallbackService: OrbitAgentArtifactTaskService;
}): OrbitAgentArtifactTaskService {
  const context = { ...options.context };
  const notFound = (): OrbitAgentArtifactResultEnvelope => ({
    success: false,
    error: { ...ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS.ORBIT_AGENT_ARTIFACT_NOT_FOUND, state: "failure", evidenceIds: [] },
  });
  return {
    async createArtifactTask(input) {
      if (input.kind !== "self_profile") return options.fallbackService.createArtifactTask(input);
      const parsed = getOrbitAgentToolMetadata("profile.getSelf")?.inputSchema.parse(
        input.toolArguments ?? { query: input.query, locale: input.locale ?? "zh" },
      );
      if (!parsed?.success || !parsed.data) {
        return {
          success: false,
          error: { ...ORBIT_AGENT_ARTIFACT_ERROR_DEFINITIONS.ORBIT_AGENT_ARTIFACT_UNSUPPORTED_KIND, state: "failure", evidenceIds: [] },
        };
      }
      const locale = parsed.data.locale ?? "zh";
      const profile = await getSelfProfileForAi(context, { locale });
      const reference = randomUUID();
      const artifactId = `artifact:self-profile:${reference}`;
      const taskId = `task:self-profile:${reference}`;
      const timestamp = new Date().toISOString();
      const status = profile.status === "error" ? "failed" : "ready";
      const presentation = { preferredSurface: "inline_card" as const, title: locale === "en" ? "My profile" : "本人资料" };
      const summary = profile.status === "ok"
        ? (locale === "en" ? "Your profile is available for this conversation." : "已读取本人资料，用于本轮对话。")
        : profile.status === "empty"
          ? (locale === "en" ? "You have not added a profile yet." : "你还没有填写本人资料。")
          : (locale === "en" ? "Your profile could not be read." : "暂时无法读取本人资料。" );
      const artifact: OrbitAgentArtifactPayload = {
        task: {
          artifactId, taskId, conversationId: input.conversationId ?? null, kind: "self_profile", status,
          query: parsed.data.query, artifactProducer: "self_profile_reader", presentation, createdAt: timestamp, updatedAt: timestamp,
        },
        result: {
          artifactId, taskId, kind: "self_profile", status, presentation,
          generatedView: { summary, sections: [] },
          selfProfile: {
            status: profile.status, reference,
            sourceVersion: profile.status === "ok" ? profile.profile.updatedAt : null,
            ...(profile.status === "error" ? { code: profile.code } : {}),
          },
          provenance: {
            source: "runtime:features/profile/self-profile-reader.ts", sourceModules: ["profile"], evidenceIds: [reference],
            toolCalls: [{ toolCallId: taskId, toolName: "profile.getSelf", status: profile.status === "error" ? "failed" : "completed", reason: profile.status, evidenceIds: [reference] }],
            generatedAt: timestamp, generationMethod: "rule-based-artifact-task",
          },
          safety: {
            externalSideEffectsExecuted: false, domainWritesExecuted: false, aiProviderRequested: false, externalNetworkRequested: false,
            liveDatabaseReadExecuted: context.mode === "live" && Boolean(context.actorId.trim()), liveDatabaseWriteExecuted: false,
            emailProviderRequested: false, calendarProviderRequested: false, notificationDelivered: false, actionsRequireConfirmation: true,
          },
          nextAction: summary,
        },
      };
      runtimeProfiles.set(artifact, profile);
      return { success: true, data: artifact };
    },
    getArtifactTask(input) {
      // Never reconstruct or serve another turn's private snapshot from an ID.
      if (input.artifactId.startsWith("artifact:self-profile:")) return notFound();
      return options.fallbackService.getArtifactTask(input);
    },
  };
}
