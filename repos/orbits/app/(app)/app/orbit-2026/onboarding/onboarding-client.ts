/**
 * 新用户引导的接口层：读资料、分步保存（PUT /api/profile + 回执核验 + 复读核验）、
 * 名片识别自动填写、按名片推断、AI 起草介绍。与个人中心编辑器同一套接口与核验口径。
 */
import type { ManualProfileUpdateInput, ProfilePayload } from "../../../../../features/profile/contract";
import type { ProfileOnboardingProgressCommandContract, ProfileOnboardingProgressContract } from "../../../../../shared/contract/profile";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../../../shared/contract/industries";
import type { OwnCardScanContract, ProfileAutofillInferenceContract, ProfileAutofillInferenceRequestContract } from "../../../../../shared/contract/profile-autofill";
import type { SeniorityLevelCode } from "../../../../../shared/contract/profile";
import { sanitizeIndustryPair } from "../../../../../shared/domain/industries";
import { normalizeRegion } from "../../../../../shared/domain/regions";
import { profileEditorReadbackMatches } from "../../profile/profile-editor-adapter";

interface ApiEnvelope<TData> {
  success?: boolean;
  data?: TData;
  error?: { code?: string; message?: string };
}

export type ProfileFields = Omit<ManualProfileUpdateInput, "expectedUpdatedAt" | "mutationId">;

export class OnboardingRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return {};
  }
}

export async function fetchProfile(): Promise<ProfilePayload> {
  const response = await fetch("/api/profile", { cache: "no-store", headers: { accept: "application/json" } });
  const envelope = await readJson<ProfilePayload>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Profile read failed", envelope.error?.code);
  }
  return envelope.data;
}

export async function fetchOnboardingProgress(): Promise<ProfileOnboardingProgressContract | null> {
  const response = await fetch("/api/profile/onboarding-progress", { cache: "no-store" });
  const envelope = await readJson<ProfileOnboardingProgressContract | null>(response);
  if (!response.ok || envelope.success !== true || envelope.data === undefined) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Onboarding progress read failed", envelope.error?.code);
  }
  return envelope.data;
}

export async function updateOnboardingProgress(command: ProfileOnboardingProgressCommandContract): Promise<ProfileOnboardingProgressContract> {
  const response = await fetch("/api/profile/onboarding-progress", {
    body: JSON.stringify(command),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<ProfileOnboardingProgressContract>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Onboarding progress update failed", envelope.error?.code);
  }
  const readback = await fetchOnboardingProgress();
  if (!readback || readback.revision !== envelope.data.revision) {
    throw new OnboardingRequestError("Onboarding progress could not be verified by reading it back.");
  }
  return readback;
}

function newMutationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `onboarding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function putOnce(fields: ProfileFields, expectedUpdatedAt: string | null): Promise<
  | { ok: true; input: ManualProfileUpdateInput }
  | { ok: false; message: string; code?: string }
> {
  const input: ManualProfileUpdateInput = { ...fields, expectedUpdatedAt, mutationId: newMutationId() };
  const response = await fetch("/api/profile", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  const envelope = await readJson<ProfilePayload>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    const code = envelope.error?.code ?? (response.status === 409 ? "PROFILE_VERSION_CONFLICT" : undefined);
    return {
      ok: false,
      message: envelope.error?.message ?? "Profile save failed",
      code,
    };
  }
  if (envelope.data.mutationId !== input.mutationId) {
    return { ok: false, message: "The save receipt could not be verified." };
  }
  return { ok: true, input };
}

/**
 * 保存一步的字段。版本冲突时保留本地输入并请用户复核，不能把旧标签页的值
 * 无条件重发到另一标签页刚确认的新版本上。成功后复读核验屏幕上的值。
 */
export async function saveProfileFields(fields: ProfileFields, expectedUpdatedAt: string | null): Promise<ProfilePayload> {
  const attempt = await putOnce(fields, expectedUpdatedAt);
  if (attempt.ok === false) throw new OnboardingRequestError(attempt.message, attempt.code);
  const readback = await fetchProfile();
  if (!profileEditorReadbackMatches(attempt.input, readback)) {
    throw new OnboardingRequestError("The save could not be verified by reading the profile back.");
  }
  return readback;
}

export interface CardAutofill {
  company: string;
  email: string;
  name: string;
  phone: string;
  /** AI 按公司和职位判断的（同一次识别顺带给出）；两项同时有或同时没有。 */
  industry: { primaryIndustryId: IndustryIdCode; secondaryIndustryId: SecondaryIndustryIdCode } | null;
  region: { countryCode: string; city?: string } | null;
  seniorityLevel: SeniorityLevelCode | null;
  title: string;
}

/** 名片识别只产出待复核草稿，不建联系人、不存图片（live-business-card-scan-service）。 */
export async function scanOwnBusinessCard(file: File): Promise<CardAutofill> {
  const form = new FormData();
  form.append("image", file, file.name);
  const response = await fetch("/api/contact-drafts/business-card/scan", { body: form, method: "POST" });
  const envelope = await readJson<Partial<OwnCardScanContract>>(response);
  const draft = envelope.data?.draft;
  if (!response.ok || envelope.success !== true || !draft) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Business card recognition failed", envelope.error?.code);
  }
  const read = envelope.data?.ocr?.structuredExtraction;
  const { primaryIndustryId, secondaryIndustryId } = sanitizeIndustryPair(read?.primaryIndustryId, read?.secondaryIndustryId);
  const region = normalizeRegion(read?.regionCountryCode, read?.regionCity);
  return {
    company: draft.organization?.trim() ?? "",
    email: draft.email?.trim() ?? "",
    industry: primaryIndustryId && secondaryIndustryId ? { primaryIndustryId, secondaryIndustryId } : null,
    name: draft.displayName?.trim() ?? "",
    phone: draft.phone?.trim() ?? "",
    region: region ? { countryCode: region.countryCode, ...(region.city ? { city: region.city } : {}) } : null,
    seniorityLevel: read?.seniorityLevel ?? null,
    title: draft.role?.trim() ?? "",
  };
}

const INFERENCE_TIMEOUT_MS = 20_000;
export const NO_INFERENCE: ProfileAutofillInferenceContract = { status: "unavailable", primaryIndustryId: null, secondaryIndustryId: null, seniorityLevel: null, offering: [], topics: [] };

/** 按名片推断资料；任何失败都读作 unavailable，不打断引导。 */
export async function fetchAutofillInference(input: ProfileAutofillInferenceRequestContract): Promise<ProfileAutofillInferenceContract> {
  try {
    const response = await fetch("/api/profile/autofill-inference", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    const envelope = await readJson<ProfileAutofillInferenceContract>(response);
    return response.ok && envelope.success === true && envelope.data?.status === "ready" ? envelope.data : NO_INFERENCE;
  } catch {
    return NO_INFERENCE;
  }
}

export async function generateIntroDraft(language: "zh" | "en" | "ja", idempotencyKey: string): Promise<{ bio: string; headline: string }> {
  const response = await fetch("/api/profile/intro-draft", {
    body: JSON.stringify({ language, idempotencyKey }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<{ bio: string; headline: string }>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Introduction generation failed", envelope.error?.code);
  }
  return { bio: envelope.data.bio, headline: envelope.data.headline };
}

/** 「我在寻找」✦ 建议：后端按已保存的资料和表单里的目标让 AI 从候选里挑选，返回值必为候选原文。 */
export async function fetchSeekSuggestions(candidates: readonly string[], goal: string, language: "zh" | "en" | "ja"): Promise<string[]> {
  const response = await fetch("/api/profile/seek-suggestions", {
    body: JSON.stringify({ candidates, goal, language }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<{ suggestions?: string[] }>(response);
  if (!response.ok || envelope.success !== true || !Array.isArray(envelope.data?.suggestions)) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Suggestions failed", envelope.error?.code);
  }
  return envelope.data.suggestions;
}
