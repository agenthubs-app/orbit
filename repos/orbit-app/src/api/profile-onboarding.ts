/**
 * HTTP layer for new-user onboarding. Same endpoints and checks as the web flow
 * (orbit-2026/onboarding/onboarding-client.ts): GET/PUT /api/profile with a verified mutation
 * receipt and a readback, a visible version conflict, the intro draft and the own
 * business-card scan.
 */
import { AI_MONTHLY_LIMIT_CODE, aiLimitDetailOf, type AiLimitDetail } from "./ai-limit";
import type { OrbitApiClient } from "./client";
import type { ManualProfileContract } from "./contract/profile";
import type { OwnCardScanContract, ProfileAutofillInferenceContract, ProfileAutofillInferenceRequestContract } from "./contract/profile-autofill";
import { isSeniorityLevelValue, type SeniorityLevelValue } from "./compute/seniority-group";
import { isIndustryIdCode, validateIndustrySelection } from "./domain/industries";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "./contract/industries";
import { ORBIT_API_ENDPOINTS } from "./endpoints";
import { profileDetailSchema, profileSaveReceiptSchema, type ProfileDetail, type ProfileSaveRequest } from "./profile-detail-contract";
import type { ApiResult } from "./types";

export const PROFILE_INTRO_DRAFT_PATH = "/api/profile/intro-draft";
export const PROFILE_AUTOFILL_PATH = "/api/profile/autofill-inference";
export const PROFILE_SEEK_SUGGESTIONS_PATH = "/api/profile/seek-suggestions";
/** The server answers within 15 s; later than this counts as unavailable (profile-autofill contract). */
const AUTOFILL_TIMEOUT_MS = 20_000;

export type OnboardingFailure = { ok: false; kind: "offline" | "failed" };
export type OnboardingSaveFailure = OnboardingFailure | { ok: false; kind: "conflict" };
export type OnboardingProfileFields = Partial<Pick<ManualProfileContract,
  "birthDate" | "displayName" | "organization" | "primaryIndustryId" | "role" | "secondaryIndustryId"
  | "handles" | "homeMarket" | "relationshipGoal" | "offering" | "seeking" | "topics" | "bio" | "headline">>
  /** null clears the level; leaving it out keeps the saved one. */
  & { seniorityLevel?: SeniorityLevelValue | null };

function failure(result: ApiResult<unknown>): OnboardingFailure {
  return { ok: false, kind: !result.success && result.error.code === "ORBIT_APP_NETWORK_ERROR" ? "offline" : "failed" };
}

function succeeded(result: ApiResult<unknown>): boolean {
  return result.success && result.status >= 200 && result.status < 300;
}

export async function readOnboardingProfile(client: OrbitApiClient): Promise<{ ok: true; detail: ProfileDetail } | OnboardingFailure> {
  const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.profile);
  if (!succeeded(result)) return failure(result);
  const parsed = profileDetailSchema.safeParse(result.success ? result.data : null);
  return parsed.success ? { ok: true, detail: parsed.data } : { ok: false, kind: "failed" };
}

function readbackMatches(fields: OnboardingProfileFields, detail: ProfileDetail): boolean {
  const saved = detail.profile as Record<string, unknown> | null;
  if (!saved) return false;
  return Object.entries(fields).every(([key, value]) => JSON.stringify(saved[key] ?? null) === JSON.stringify(value ?? null));
}

/**
 * Save one step. A version conflict means another device may have confirmed the same
 * fields. Keep this draft for review instead of resending it over that newer profile.
 * The result is the readback, never the optimistic local copy.
 */
export async function saveOnboardingFields(
  client: OrbitApiClient,
  fields: OnboardingProfileFields,
  base: ProfileDetail,
  mutationId: () => string
): Promise<{ ok: true; detail: ProfileDetail } | OnboardingSaveFailure> {
  const request = { ...fields, expectedUpdatedAt: base.profile?.updatedAt ?? null, mutationId: mutationId() };
  const result = await client.put<unknown>(ORBIT_API_ENDPOINTS.profile, { body: request });
  if (result.status === 409) return { ok: false, kind: "conflict" };
  if (!succeeded(result)) return failure(result);
  // A cleared level is simply absent from the receipt.
  const expected = "seniorityLevel" in request ? { ...request, seniorityLevel: request.seniorityLevel ?? undefined } : request;
  const receipt = profileSaveReceiptSchema(base.profile?.id ?? null, expected as ProfileSaveRequest).safeParse(result.success ? result.data : null);
  if (!receipt.success) return { ok: false, kind: "failed" };
  const readback = await readOnboardingProfile(client);
  if (!readback.ok) return readback;
  return readbackMatches(fields, readback.detail) ? readback : { ok: false, kind: "failed" };
}

export async function generateOnboardingIntro(
  client: OrbitApiClient,
  language: "zh" | "en" | "ja",
  idempotencyKey: string,
): Promise<{ ok: true; bio: string; headline: string } | OnboardingFailure | { ok: false; kind: "limit" } | { ok: false; kind: "monthlyLimit"; detail: AiLimitDetail }> {
  const result = await client.post<unknown>(PROFILE_INTRO_DRAFT_PATH, { body: { language, idempotencyKey } });
  if (!result.success && result.error.code === "INTRO_LIMIT_REACHED") return { ok: false, kind: "limit" };
  // 2026-11-27 隐藏月上限（草稿类合计）：这次没有调用模型。
  if (!result.success && result.error.code === AI_MONTHLY_LIMIT_CODE) return { detail: aiLimitDetailOf(result.error.context), kind: "monthlyLimit", ok: false };
  if (!succeeded(result) || !result.success) return failure(result);
  const data = result.data as { bio?: unknown; headline?: unknown } | null;
  if (typeof data?.bio !== "string" || typeof data.headline !== "string") return { ok: false, kind: "failed" };
  return { ok: true, bio: data.bio, headline: data.headline };
}

export interface OwnCardImage {
  base64: string;
  fileName: string;
  mimeType: string;
  size: number | null;
}

export interface OwnCard {
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  /** Judged by AI from the card, both or neither. */
  industry: { primary: IndustryIdCode; secondary: SecondaryIndustryIdCode } | null;
  /** Judged by AI from the printed title. */
  seniorityLevel: SeniorityLevelValue | null;
  /** The region of the printed address: ISO country code + canonical English city. */
  region: { countryCode: string; city: string } | null;
  /** WeChat, LINE and the website printed on the card. Step 1 has no box for them; they only fill what the profile leaves empty. */
  handles: { lineId?: string; website?: string; wechatId?: string };
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function industryPair(primary: unknown, secondary: unknown): OwnCard["industry"] {
  if (!isIndustryIdCode(primary) || typeof secondary !== "string") return null;
  return validateIndustrySelection({ primaryIndustryId: primary, secondaryIndustryId: secondary }).valid ? { primary, secondary: secondary as SecondaryIndustryIdCode } : null;
}

function printedHandles(read: OwnCardScanContract["ocr"]["structuredExtraction"]): OwnCard["handles"] {
  const points = Array.isArray(read?.contactPoints) ? read.contactPoints : [];
  const point = (type: string) => points.filter(item => item?.type === type).map(item => text(item.value)).find(Boolean) ?? "";
  const found = { lineId: point("line"), website: text(read?.website) || point("website"), wechatId: point("wechat") };
  return Object.fromEntries(Object.entries(found).filter(([, value]) => value));
}

/** The scan only returns a draft for review; it does not create a contact. */
export async function scanOwnBusinessCard(
  client: OrbitApiClient,
  image: OwnCardImage,
  signal?: AbortSignal,
): Promise<({ ok: true } & OwnCard) | OnboardingFailure> {
  const body = { imageBase64: image.base64, imageName: image.fileName, ...(image.size && image.size > 0 ? { imageSizeBytes: image.size } : {}), mimeType: image.mimeType };
  const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactDraftBusinessCardScan, { body, ...(signal ? { signal } : {}) });
  if (!succeeded(result) || !result.success) return failure(result);
  const data = result.data as Partial<OwnCardScanContract> | null;
  if (!data?.draft) return { ok: false, kind: "failed" };
  const judged = data.ocr?.structuredExtraction;
  return {
    ok: true, name: text(data.draft.displayName), company: text(data.draft.organization), title: text(data.draft.role), email: text(data.draft.email), phone: text(data.draft.phone),
    industry: industryPair(judged?.primaryIndustryId, judged?.secondaryIndustryId),
    seniorityLevel: isSeniorityLevelValue(judged?.seniorityLevel) ? judged.seniorityLevel : null,
    region: /^[A-Z]{2}$/u.test(text(judged?.regionCountryCode)) ? { countryCode: text(judged?.regionCountryCode), city: text(judged?.regionCity) } : null,
    handles: printedHandles(judged),
  };
}

const labels = (value: unknown, limit: number): string[] => (Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))].slice(0, limit) : []);

/** Industry and candidate tags from company + title. Anything but a ready answer is null: the fields stay for the person to fill. */
export async function inferOnboardingAutofill(
  client: OrbitApiClient,
  request: ProfileAutofillInferenceRequestContract,
): Promise<{ industry: OwnCard["industry"]; seniorityLevel: SeniorityLevelValue | null; offering: string[]; topics: string[] } | null> {
  const result = await client.post<unknown>(PROFILE_AUTOFILL_PATH, { body: request, timeoutMs: AUTOFILL_TIMEOUT_MS });
  if (!succeeded(result) || !result.success) return null;
  const data = result.data as Partial<ProfileAutofillInferenceContract> | null;
  if (data?.status !== "ready") return null;
  return { industry: industryPair(data.primaryIndustryId, data.secondaryIndustryId), seniorityLevel: isSeniorityLevelValue(data.seniorityLevel) ? data.seniorityLevel : null, offering: labels(data.offering, 5), topics: labels(data.topics, 8) };
}

/** Dashed candidates for 「求めていること」; only the texts offered come back. Empty on any failure. */
export async function suggestOnboardingSeeking(client: OrbitApiClient, input: { candidates: readonly string[]; goal: string; language: "zh" | "en" | "ja" }): Promise<string[]> {
  const result = await client.post<unknown>(PROFILE_SEEK_SUGGESTIONS_PATH, { body: input, timeoutMs: AUTOFILL_TIMEOUT_MS });
  if (!succeeded(result) || !result.success) return [];
  return labels((result.data as { suggestions?: unknown } | null)?.suggestions, 4).filter(label => input.candidates.includes(label));
}
