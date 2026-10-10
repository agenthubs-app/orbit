// R23: the plan flow's API calls (UI-SPEC 接口). Every call sends the UI language in
// `x-orbit-lang`; writes carry an idempotency key the caller makes once per user
// action — a network failure is retried once here with the same key and body.
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planFlowCopy } from "../copy/plan";
import type { PlanApiError } from "./plan-model";

export const PLAN_API = "/api/agent/plans";

export type PlanApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: PlanApiError };

/** A fresh key per user action (reuse it only to retry the same action). */
export function newActionKey(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return `web:plan:${crypto.randomUUID()}`;
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `web:plan:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

type Envelope = { success?: boolean; data?: unknown; error?: { code?: string; context?: Record<string, string> } };

async function once(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${PLAN_API}${path}`, init);
}

export async function planApi<T>(path: string, options: { language: OrbitLanguage; method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }): Promise<PlanApiResult<T>> {
  const init: RequestInit = {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), "x-orbit-lang": options.language },
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
  };
  let response: Response;
  try {
    response = await once(path, init);
  } catch {
    try {
      response = await once(path, init);
    } catch {
      return { error: { code: "NETWORK", limit: null, network: true, reason: null, retryOn: null, status: 0 }, ok: false };
    }
  }
  const body = (await response.json().catch(() => null)) as Envelope | null;
  if (response.ok && body?.success) return { data: body.data as T, ok: true, status: response.status };
  const context = body?.error?.context ?? {};
  const limit = context.limit === "daily" || context.limit === "monthly" ? context.limit : null;
  return { error: { code: body?.error?.code ?? "UNKNOWN", limit, network: false, reason: context.reason ?? null, retryOn: context.retryOn ?? null, status: response.status }, ok: false };
}

export type PersonCandidate = { contactId: string; name: string; organization: string; role: string; context: string };

/** 人脈から選ぶ: the existing natural search endpoint; only id, name, company, role. */
export async function searchNetwork(query: string, signal?: AbortSignal): Promise<PersonCandidate[]> {
  const response = await fetch("/api/search/relationships", { body: JSON.stringify({ query }), headers: { "content-type": "application/json" }, method: "POST", signal });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: { results?: { contactId?: string; displayName?: string; organization?: string | null; role?: string | null; relationshipContext?: string | null }[] } } | null;
  const results = body?.success && Array.isArray(body.data?.results) ? body.data!.results! : [];
  return results.filter((item) => item.contactId && item.displayName).slice(0, 8).map((item) => ({
    contactId: item.contactId!,
    context: item.relationshipContext ?? "",
    name: item.displayName!,
    organization: item.organization ?? "",
    role: item.role ?? "",
  }));
}

// 「共同創業者」 in any UI language (the contact's role or relationship context).
const COFOUNDER_WORDS = [planFlowCopy.relationCofounder.ja, planFlowCopy.relationCofounder.zh, planFlowCopy.relationCofounder.en, "cofounder"].map((word) => word.toLowerCase());

/** Candidate order (UI-SPEC): marked co-founders first, then those whose role names an open gap. */
export function rankCandidates(candidates: readonly PersonCandidate[], gapLabels: readonly { id: string; label: string }[]): (PersonCandidate & { cofounder: boolean; fills: string[] })[] {
  return candidates
    .map((candidate, index) => {
      const text = `${candidate.role} ${candidate.context}`.toLowerCase();
      return { ...candidate, cofounder: COFOUNDER_WORDS.some((word) => text.includes(word)), fills: gapLabels.filter((gap) => text.includes(gap.label.toLowerCase())).map((gap) => gap.label), index };
    })
    .sort((left, right) => Number(right.cofounder) - Number(left.cofounder) || Number(right.fills.length > 0) - Number(left.fills.length > 0) || left.index - right.index)
    .map(({ index: _index, ...candidate }) => candidate);
}
