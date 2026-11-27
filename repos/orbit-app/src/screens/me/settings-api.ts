import { z } from "zod";
import type { OrbitApiClient } from "../../api/client";
import { profileBioWithinLimit } from "../../api/schema/profile-bio";
import { agentMemoryEntrySchema, agentMemorySettingsSchema } from "../../api/schema/agent-v1";
import type { AgentMemoryEntryContract, AgentMemoryListContract, AgentMemorySettingsContract } from "../../api/contract/agent-v1";
import type { memoryEditorInput } from "../../api/compute/agent-memory-view";

export { settingsFetch } from "./settings-transport";
export const integrationSchema = z.object({ provider: z.enum(["gmail", "google_calendar", "microsoft_graph"]), status: z.string(), healthStatus: z.string(), healthMessage: z.string().optional() });
export type AccountIntegration = z.infer<typeof integrationSchema>;
export const memorySchema = z.object({ memoryId: z.string(), content: z.string(), source: z.enum(["manual", "conversation"]), createdAt: z.string() });
export type AccountMemory = AgentMemoryEntryContract;
/** AG14: what the iOrbit settings screen reads (the settings API's list without its version counter). */
export type AccountMemoryList = Pick<AgentMemoryListContract, "memories" | "settings" | "ruleLimit">;
export type MemorySaveInput = ReturnType<typeof memoryEditorInput>;
/** An entry of the older shape (design fixtures) as a list entry: no task yet, 酌情参考的. */
export function memoryEntryOf(value: { memoryId: string; content: string; source: "manual" | "conversation"; createdAt: string }): AgentMemoryEntryContract {
  return { appliesTo: [], category: "preference", content: value.content, createdAt: value.createdAt, memoryId: value.memoryId, revision: 1, source: value.source, sourceMessageRef: null, status: "active", structured: null, updatedAt: value.createdAt, validFrom: null, validUntil: null };
}
export function integrationState(record?: Pick<AccountIntegration, "status" | "healthStatus">): "connected" | "disconnected" | "preparing" | "action_required" {
  if (!record || record.status === "unavailable" || record.healthStatus === "unavailable") return "preparing";
  if (record.status === "active" && ["healthy", "not_checked"].includes(record.healthStatus)) return "connected";
  if (["pending", "revoked"].includes(record.status)) return "disconnected";
  return "action_required";
}
export function integrationAuthorizePath(provider: "gmail" | "google_calendar", native = false): string { return native ? "/app/settings/integrations" : `/api/integrations/${provider}/authorize?returnTo=settings`; }
export function createAccountSettingsApi(client: OrbitApiClient) {
  return {
    async goal(signal?: AbortSignal): Promise<{ planId: string; goal: string } | null | undefined> {
      const result = await client.get<unknown>("/api/agent/plans/v2/summary", signal ? { signal } : {});
      const parsed = result.success ? z.object({ current: z.object({ planId: z.string(), goal: z.string() }).nullable() }).safeParse(result.data) : null;
      return parsed?.success ? parsed.data.current : undefined;
    },
    async integrations(signal?: AbortSignal): Promise<AccountIntegration[] | null> {
      const result = await client.get<unknown>("/api/integrations", signal ? { signal } : {});
      if (!result.success || !Array.isArray(result.data)) return null;
      return result.data.flatMap(value => { const parsed = integrationSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
    },
    async disconnect(provider: "gmail" | "google_calendar", signal?: AbortSignal): Promise<boolean> {
      const result = await client.delete<unknown>(`/api/integrations/${provider}`, signal ? { signal } : {});
      const receipt = result.success ? z.object({ provider: z.literal(provider), status: z.literal("revoked") }).safeParse(result.data) : null;
      return receipt?.success === true;
    },
    /** AG14: the whole list — entries, both switches, the rule limit. An entry this build cannot read is left out. */
    async memories(signal?: AbortSignal): Promise<AccountMemoryList | null> {
      const result = await client.get<unknown>("/api/agent/memory", signal ? { signal } : {});
      const parsed = result.success ? z.object({ memories: z.array(z.unknown()), ruleLimit: z.number().int().optional(), settings: agentMemorySettingsSchema.optional() }).safeParse(result.data) : null;
      if (!parsed?.success) return null;
      const memories = parsed.data.memories.flatMap(value => { const memory = agentMemoryEntrySchema.safeParse(value); return memory.success ? [memory.data] : []; });
      return { memories, ruleLimit: parsed.data.ruleLimit, settings: parsed.data.settings ?? { allowConversationLearning: false, enabled: true, updatedAt: "" } };
    },
    /** AG14: the user's own add (POST) or change (PATCH, at the revision shown); no card. */
    async saveMemory(input: MemorySaveInput, memoryId: string | null, signal?: AbortSignal): Promise<boolean> {
      const options = { body: input, ...(signal ? { signal } : {}) };
      return (memoryId ? await client.patch<unknown>(`/api/agent/memory/${encodeURIComponent(memoryId)}`, options) : await client.post<unknown>("/api/agent/memory", options)).success;
    },
    async memorySettings(patch: Partial<Pick<AgentMemorySettingsContract, "enabled" | "allowConversationLearning">>, signal?: AbortSignal): Promise<boolean> {
      return (await client.patch<unknown>("/api/agent/memory/settings", { body: patch, ...(signal ? { signal } : {}) })).success;
    },
    async removeMemory(id: string, signal?: AbortSignal, expectedRevision?: number): Promise<boolean> { return (await client.delete<unknown>(`/api/agent/memory/${encodeURIComponent(id)}${expectedRevision ? `?expectedRevision=${expectedRevision}` : ""}`, signal ? { signal } : {})).success; },
    /** The draft's bio; `{ monthlyLimit: true }` when this month's AI drafts are used up (2026-11-27); null when it failed. */
    async introDraft(language: string, signal?: AbortSignal): Promise<string | { monthlyLimit: true } | null> {
      const result = await client.post<unknown>("/api/profile/intro-draft", { body: { language }, ...(signal ? { signal } : {}) });
      if (!result.success && result.error.code === "AI_MONTHLY_LIMIT") return { monthlyLimit: true };
      const parsed = result.success ? z.object({ bio: z.string().refine(profileBioWithinLimit) }).safeParse(result.data) : null;
      return parsed?.success ? parsed.data.bio : null;
    },
    async semanticAvailable(signal?: AbortSignal): Promise<boolean> {
      const result = await client.get<unknown>("/api/search/global?q=&platform=app", signal ? { signal } : {});
      const parsed = result.success ? z.object({ semantic: z.object({ available: z.boolean() }) }).safeParse(result.data) : null;
      return parsed?.success ? parsed.data.semantic.available : false;
    },
  };
}
