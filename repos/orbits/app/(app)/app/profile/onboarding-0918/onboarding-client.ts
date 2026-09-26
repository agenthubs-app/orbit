/**
 * 新用户引导的接口层：读资料、分步保存（PUT /api/profile + 回执核验 + 复读核验）、
 * 名片识别自动填写、AI 起草介绍。与个人中心编辑器同一套接口与核验口径。
 */
import type { ManualProfileUpdateInput, ProfilePayload } from "../../../../../features/profile/contract";
import { profileEditorReadbackMatches } from "../profile-editor-adapter";

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

function newMutationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `onboarding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function putOnce(fields: ProfileFields, expectedUpdatedAt: string | null): Promise<
  | { ok: true; input: ManualProfileUpdateInput }
  | { ok: false; conflict: boolean; message: string; code?: string }
> {
  const input: ManualProfileUpdateInput = { ...fields, expectedUpdatedAt, mutationId: newMutationId() };
  const response = await fetch("/api/profile", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  const envelope = await readJson<ProfilePayload>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    const code = envelope.error?.code;
    return {
      ok: false,
      conflict: response.status === 409 || code === "PROFILE_VERSION_CONFLICT",
      message: envelope.error?.message ?? "Profile save failed",
      code,
    };
  }
  if (envelope.data.mutationId !== input.mutationId) {
    return { ok: false, conflict: false, message: "The save receipt could not be verified." };
  }
  return { ok: true, input };
}

/**
 * 保存一步的字段。引导里这些字段就是用户刚在本屏确认的值，版本冲突（例如另一个标签页
 * 同时保存）时读最新版本后重发一次；随后复读核验，确保写进去的就是屏幕上的值。
 */
export async function saveProfileFields(fields: ProfileFields, expectedUpdatedAt: string | null): Promise<ProfilePayload> {
  let attempt = await putOnce(fields, expectedUpdatedAt);
  if (attempt.ok === false && attempt.conflict) {
    const latest = await fetchProfile();
    attempt = await putOnce(fields, latest.profile?.updatedAt ?? null);
  }
  if (attempt.ok === false) throw new OnboardingRequestError(attempt.message, attempt.code);
  const readback = await fetchProfile();
  if (!profileEditorReadbackMatches(attempt.input, readback)) {
    throw new OnboardingRequestError("The save could not be verified by reading the profile back.");
  }
  return readback;
}

export interface CardAutofill {
  company: string;
  name: string;
  title: string;
}

/** 名片识别只产出待复核草稿，不建联系人、不存图片（live-business-card-scan-service）。 */
export async function scanOwnBusinessCard(file: File): Promise<CardAutofill> {
  const form = new FormData();
  form.append("image", file, file.name);
  const response = await fetch("/api/contact-drafts/business-card/scan", { body: form, method: "POST" });
  const envelope = await readJson<{ draft?: { displayName?: string; organization?: string; role?: string } }>(response);
  const draft = envelope.data?.draft;
  if (!response.ok || envelope.success !== true || !draft) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Business card recognition failed", envelope.error?.code);
  }
  return { company: draft.organization?.trim() ?? "", name: draft.displayName?.trim() ?? "", title: draft.role?.trim() ?? "" };
}

export async function generateIntroDraft(language: "zh" | "en"): Promise<{ bio: string; headline: string }> {
  const response = await fetch("/api/profile/intro-draft", {
    body: JSON.stringify({ language }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<{ bio: string; headline: string }>(response);
  if (!response.ok || envelope.success !== true || !envelope.data) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Introduction generation failed", envelope.error?.code);
  }
  return { bio: envelope.data.bio, headline: envelope.data.headline };
}

/** 「我在寻找」✦ 建议：后端按已保存的资料让 AI 从候选里挑选，返回值必为候选原文。 */
export async function fetchSeekSuggestions(candidates: readonly string[], language: "zh" | "en"): Promise<string[]> {
  const response = await fetch("/api/profile/seek-suggestions", {
    body: JSON.stringify({ candidates, language }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<{ suggestions?: string[] }>(response);
  if (!response.ok || envelope.success !== true || !Array.isArray(envelope.data?.suggestions)) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Suggestions failed", envelope.error?.code);
  }
  return envelope.data.suggestions;
}
