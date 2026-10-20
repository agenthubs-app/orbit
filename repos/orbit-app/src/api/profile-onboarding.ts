/**
 * HTTP layer for new-user onboarding. Same endpoints and checks as the web flow
 * (onboarding-0918/onboarding-client.ts): GET/PUT /api/profile with a verified mutation
 * receipt and a readback, a visible version conflict, the intro draft, the own
 * business-card scan, and the business-card batch v2 collection for the import step.
 */
import type { OrbitApiClient } from "./client";
import type { IngestBatchDetailContract } from "./contract/business-card-batch";
import type { ManualProfileContract } from "./contract/profile";
import { ORBIT_API_ENDPOINTS } from "./endpoints";
import { profileDetailSchema, profileSaveReceiptSchema, type ProfileDetail, type ProfileSaveRequest } from "./profile-detail-contract";
import type { ApiResult } from "./types";
import { acceptedBatchCollection, acceptedIngestDetail, INGEST_COLLECTION_PATH, ingestBatchPath } from "../view-models/business-card-ingest";
import { onboardingImportSummary, type OnboardingImportSummary } from "../view-models/profile-onboarding";

export const PROFILE_INTRO_DRAFT_PATH = "/api/profile/intro-draft";

export type OnboardingFailure = { ok: false; kind: "offline" | "failed" };
export type OnboardingSaveFailure = OnboardingFailure | { ok: false; kind: "conflict" };
export type OnboardingProfileFields = Partial<Pick<ManualProfileContract,
  "birthDate" | "displayName" | "organization" | "primaryIndustryId" | "role" | "secondaryIndustryId"
  | "relationshipGoal" | "offering" | "seeking" | "topics" | "bio" | "headline">>;

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
  const receipt = profileSaveReceiptSchema(base.profile?.id ?? null, request as ProfileSaveRequest).safeParse(result.success ? result.data : null);
  if (!receipt.success) return { ok: false, kind: "failed" };
  const readback = await readOnboardingProfile(client);
  if (!readback.ok) return readback;
  return readbackMatches(fields, readback.detail) ? readback : { ok: false, kind: "failed" };
}

export async function generateOnboardingIntro(
  client: OrbitApiClient,
  language: "zh" | "en" | "ja",
  idempotencyKey: string,
): Promise<{ ok: true; bio: string; headline: string } | OnboardingFailure> {
  const result = await client.post<unknown>(PROFILE_INTRO_DRAFT_PATH, { body: { language, idempotencyKey } });
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

/** The scan only returns a draft for review; it does not create a contact. */
export async function scanOwnBusinessCard(
  client: OrbitApiClient,
  image: OwnCardImage,
  signal?: AbortSignal,
): Promise<{ ok: true; name: string; company: string; title: string } | OnboardingFailure> {
  const body = { imageBase64: image.base64, imageName: image.fileName, ...(image.size && image.size > 0 ? { imageSizeBytes: image.size } : {}), mimeType: image.mimeType };
  const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactDraftBusinessCardScan, { body, ...(signal ? { signal } : {}) });
  if (!succeeded(result) || !result.success) return failure(result);
  const draft = (result.data as { draft?: { displayName?: unknown; organization?: unknown; role?: unknown } | null } | null)?.draft;
  if (!draft) return { ok: false, kind: "failed" };
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return { ok: true, name: text(draft.displayName), company: text(draft.organization), title: text(draft.role) };
}

export async function readOnboardingImportSummary(
  client: OrbitApiClient,
  sinceMs: number,
  ownerId: string | null
): Promise<{ ok: true; summary: OnboardingImportSummary } | OnboardingFailure> {
  const list = await client.get<unknown>(INGEST_COLLECTION_PATH);
  const batches = acceptedBatchCollection(list, "current");
  if (!batches) return failure(list);
  const recent = batches.filter(batch => Date.parse(batch.createdAt) >= sinceMs).slice(0, 5);
  const details: IngestBatchDetailContract[] = [];
  for (const batch of recent) {
    const result = await client.get<unknown>(ingestBatchPath(batch.id));
    const detail = acceptedIngestDetail(result, batch.id, ownerId);
    if (!detail) return failure(result);
    details.push(detail);
  }
  return { ok: true, summary: onboardingImportSummary(details) };
}
