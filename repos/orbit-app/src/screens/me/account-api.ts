import { z } from "zod";
import type { OrbitApiClient } from "../../api/client";
import { profileAccountSchema } from "../../api/schema/profile-account";
import { hostCenterSummarySchema } from "../../api/schema/host-events";
import type { HostCenterSummary } from "../../api/contract/host-events";
import type { AccountProfileData } from "./MyPageContent";

type Profile = NonNullable<AccountProfileData["profile"]>;
const count = z.number().int().nonnegative();
export function accountProfilePath(design: unknown, development: boolean): string {
  return development && (design === "25" || design === "50" || design === "100") ? `/api/profile?design=${design}` : "/api/profile";
}
export function accountDestination(path: string, profilePath: string): string {
  const design = new URL(profilePath, "http://orbit.invalid").searchParams.get("design");
  return design && (path.startsWith("/profile") || path.startsWith("/settings")) ? `${path}${path.includes("?") ? "&" : "?"}design=${design}` : path;
}
export function candidateSeeking(current: readonly string[] | undefined, candidate: string, accept: boolean): string[] | null {
  if (!accept || !candidate.trim()) return null;
  const values = [...new Set([...(current ?? []), candidate.trim()])];
  return values.length <= 5 ? values : null;
}
export function createAccountApi(client: OrbitApiClient, profilePath = "/api/profile") {
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T | null> {
    const result = await client.get<unknown>(path, signal ? { signal } : {});
    const parsed = result.success ? schema.safeParse(result.data) : null;
    return parsed?.success ? parsed.data : null;
  }
  return {
    async summaries(signal?: AbortSignal): Promise<{ unread: number | null; going: number | null; host: HostCenterSummary | null }> {
      const [inbox, events, host] = await Promise.all([
        read("/api/inbox/notifications?limit=1", z.object({ unreadCount: count }), signal),
        read("/api/events/mine?range=upcoming", z.object({ upcomingCount: count }), signal),
        read("/api/events/center?summary=1", hostCenterSummarySchema, signal),
      ]);
      return { unread: inbox?.unreadCount ?? null, going: events?.upcomingCount ?? null, host };
    },
    async seekCandidates(language: string, signal?: AbortSignal): Promise<string[]> {
      const result = await client.post<unknown>("/api/profile/seek-suggestions", { body: { language }, ...(signal ? { signal } : {}) });
      const parsed = result.success ? z.object({ suggestions: z.array(z.string()) }).safeParse(result.data) : null;
      return parsed?.success ? parsed.data.suggestions.filter(value => value.trim()).slice(0, 5) : [];
    },
    async acceptCandidate(profile: Profile, candidate: string, mutationId: string, signal?: AbortSignal): Promise<AccountProfileData | null> {
      const seeking = candidateSeeking(profile.seeking, candidate, true);
      if (!seeking) return null;
      const result = await client.put<unknown>(profilePath, { body: { seeking, expectedUpdatedAt: profile.updatedAt, mutationId }, ...(signal ? { signal } : {}) });
      const parsed = result.success ? profileAccountSchema.safeParse(result.data) : null;
      if (!parsed?.success || parsed.data.state !== "success" || parsed.data.profile?.id !== profile.id || parsed.data.mutationId !== mutationId ||
        Date.parse(parsed.data.profile.updatedAt) <= Date.parse(profile.updatedAt) || parsed.data.editor.lastSavedAt !== parsed.data.profile.updatedAt ||
        JSON.stringify(parsed.data.profile.seeking) !== JSON.stringify(seeking)) return null;
      return parsed.data;
    },
  };
}
