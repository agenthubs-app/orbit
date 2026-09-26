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

// ── 引导内扫描名片：识别 → 用户核对 → 确认后才建联系人（与名片收录工作台同一对接口）──
export interface ScannedCard {
  company: string;
  draftId: string;
  email: string;
  evidenceIds: string[];
  imageDigest: string;
  issues: { code: string; field: string; message: string }[];
  name: string;
  phone: string;
  relationshipContext: string;
  title: string;
}

interface ScanPayload {
  capture?: { imageDigest?: string };
  draft?: {
    displayName?: string;
    email?: string;
    evidence?: readonly { evidenceId: string }[];
    id?: string;
    organization?: string;
    phone?: string;
    relationshipContext?: string;
    role?: string;
  } | null;
  ocr?: { reviewIssues?: readonly { code: string; field: string; message: string }[] };
}

export async function scanContactCard(file: File): Promise<ScannedCard> {
  const form = new FormData();
  form.append("image", file, file.name);
  const response = await fetch("/api/contact-drafts/business-card/scan", { body: form, method: "POST" });
  const envelope = await readJson<ScanPayload>(response);
  const data = envelope.data;
  const draft = data?.draft;
  if (!response.ok || envelope.success !== true || !draft?.id || !data?.capture?.imageDigest) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Business card recognition failed", envelope.error?.code);
  }
  return {
    company: draft.organization?.trim() ?? "",
    draftId: draft.id,
    email: draft.email?.trim() ?? "",
    evidenceIds: (draft.evidence ?? []).map(item => item.evidenceId),
    imageDigest: data.capture.imageDigest,
    issues: [...(data.ocr?.reviewIssues ?? [])],
    name: draft.displayName?.trim() ?? "",
    phone: draft.phone?.trim() ?? "",
    relationshipContext: draft.relationshipContext?.trim() ?? "",
    title: draft.role?.trim() ?? "",
  };
}

export async function confirmContactCard(card: ScannedCard): Promise<{ contactId: string }> {
  const response = await fetch("/api/contacts/business-card/confirm", {
    body: JSON.stringify({
      confirmed: true,
      displayName: card.name,
      draftId: card.draftId,
      email: card.email,
      evidenceIds: card.evidenceIds,
      imageDigest: card.imageDigest,
      organization: card.company,
      phone: card.phone,
      relationshipContext: card.relationshipContext,
      role: card.title,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const envelope = await readJson<{ contactId?: string; state?: string }>(response);
  if (envelope.data?.state === "duplicate_review") {
    throw new OnboardingRequestError("duplicate", "DUPLICATE_REVIEW");
  }
  if (!response.ok || envelope.success !== true || !envelope.data?.contactId) {
    throw new OnboardingRequestError(envelope.error?.message ?? "Contact save failed", envelope.error?.code);
  }
  return { contactId: envelope.data.contactId };
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
