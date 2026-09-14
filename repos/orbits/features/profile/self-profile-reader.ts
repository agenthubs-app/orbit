import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import type { OrbitLanguage } from "../../shared/contract/language";
import { INDUSTRY_TAXONOMY_VERSION, industryLabel, secondaryIndustryLabel, validateIndustrySelection } from "../../shared/domain/industries";
import { createProfileService } from "./service-factory";

export type SelfProfileReadContext = { actorId: string; mode: "mock" | "hybrid" | "live" };
export type SelfProfileForAi = {
  profileId: string;
  displayName: string;
  organization: string | null;
  role: string | null;
  bio: string | null;
  offering: readonly string[];
  seeking: readonly string[];
  topics: readonly string[];
  industry: {
    primaryIndustryId: IndustryIdCode | null;
    secondaryIndustryId: SecondaryIndustryIdCode | null;
    primaryLabel: string | null;
    secondaryLabel: string | null;
    taxonomyVersion: 1;
  };
  updatedAt: string;
};
export type SelfProfileReadResult =
  | { status: "ok"; profile: SelfProfileForAi }
  | { status: "empty"; profile: null }
  | { status: "error"; code: "UNAUTHORIZED" | "FORBIDDEN" | "SERVICE_UNAVAILABLE" };

// Actor identity comes from server assembly, never from model arguments.
// No cache or mock fallback: account changes and live failures stay isolated.
export async function getSelfProfileForAi(
  context: SelfProfileReadContext,
  input: { locale: OrbitLanguage },
): Promise<SelfProfileReadResult> {
  const actorId = context.actorId.trim();
  if (!actorId) return { status: "error", code: "UNAUTHORIZED" };
  try {
    const result = await createProfileService(context.mode).getProfile({ actorId });
    if (result.success === false) {
      return {
        status: "error",
        code: result.error.appCode === "UNAUTHORIZED" ? "UNAUTHORIZED"
          : result.error.appCode === "FORBIDDEN" ? "FORBIDDEN" : "SERVICE_UNAVAILABLE",
      };
    }
    if (result.data.state === "empty" && !result.data.profile) return { status: "empty", profile: null };
    const profile = result.data.profile;
    if (result.data.state !== "success" || !profile || !validateIndustrySelection(profile).valid) {
      return { status: "error", code: "SERVICE_UNAVAILABLE" };
    }
    const primaryIndustryId = profile.primaryIndustryId ?? null;
    const secondaryIndustryId = profile.secondaryIndustryId ?? null;
    return {
      status: "ok",
      profile: {
        profileId: profile.id,
        displayName: profile.displayName,
        organization: profile.organization || null,
        role: profile.role || null,
        bio: profile.bio || null,
        offering: [...(profile.offering ?? [])],
        seeking: [...(profile.seeking ?? [])],
        topics: [...(profile.topics ?? [])],
        industry: {
          primaryIndustryId,
          secondaryIndustryId,
          primaryLabel: primaryIndustryId ? industryLabel(primaryIndustryId, input.locale) : null,
          secondaryLabel: secondaryIndustryId ? secondaryIndustryLabel(secondaryIndustryId, input.locale) : null,
          taxonomyVersion: INDUSTRY_TAXONOMY_VERSION,
        },
        updatedAt: profile.updatedAt,
      },
    };
  } catch {
    return { status: "error", code: "SERVICE_UNAVAILABLE" };
  }
}
