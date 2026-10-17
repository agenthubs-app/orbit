import { z } from "zod";
import type { OrbitApiClient } from "../../api/client";
import { profileBioWithinLimit } from "../../api/schema/profile-bio";

export { settingsFetch } from "./settings-transport";
export const integrationSchema = z.object({ provider: z.enum(["gmail", "google_calendar", "microsoft_graph"]), status: z.string(), healthStatus: z.string(), healthMessage: z.string().optional() });
export type AccountIntegration = z.infer<typeof integrationSchema>;
export const memorySchema = z.object({ memoryId: z.string(), content: z.string(), source: z.enum(["manual", "conversation"]), createdAt: z.string() });
export type AccountMemory = z.infer<typeof memorySchema>;
export function integrationState(record?: Pick<AccountIntegration, "status" | "healthStatus">): "connected" | "disconnected" | "preparing" | "action_required" {
  if (!record || record.status === "unavailable" || record.healthStatus === "unavailable") return "preparing";
  if (record.status === "active" && ["healthy", "not_checked"].includes(record.healthStatus)) return "connected";
  if (["pending", "revoked"].includes(record.status)) return "disconnected";
  return "action_required";
}
export function integrationAuthorizePath(provider: "gmail" | "google_calendar"): string { return `/api/integrations/${provider}/authorize?returnTo=settings`; }
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
    async memories(signal?: AbortSignal): Promise<AccountMemory[] | null> {
      const result = await client.get<unknown>("/api/agent/memory", signal ? { signal } : {});
      const parsed = result.success ? z.object({ memories: z.array(z.unknown()) }).safeParse(result.data) : null;
      if (!parsed?.success) return null;
      return parsed.data.memories.flatMap(value => { const memory = memorySchema.safeParse(value); return memory.success ? [memory.data] : []; });
    },
    async removeMemory(id: string, signal?: AbortSignal): Promise<boolean> { return (await client.delete<unknown>(`/api/agent/memory/${encodeURIComponent(id)}`, signal ? { signal } : {})).success; },
    async introDraft(language: string, signal?: AbortSignal): Promise<string | null> {
      const result = await client.post<unknown>("/api/profile/intro-draft", { body: { language }, ...(signal ? { signal } : {}) });
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
