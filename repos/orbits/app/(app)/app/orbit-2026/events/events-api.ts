"use client";

// R26 イベント: the contract-8 and events-mine calls the Web page makes. Responses are read leniently through the
// contract schemas (unknown fields dropped, unknown enum values fall back). Failures come back as a reason, never thrown.
import { eventAssessmentAddToPlanResultSchema, eventAssessmentAvailabilitySchema, eventAssessmentDismissResultSchema, eventAssessmentSchema } from "../../../../../shared/api-schema/event-assessment";
import { myEventsResponseSchema } from "../../../../../shared/api-schema/events-mine";
import type { EventAssessmentAvailability, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../../../../../shared/contract/event-assessment";
import type { MyEventsRange, MyEventsResponse } from "../../../../../shared/contract/events-mine";
import type { ZodType } from "zod";

export type EventsApiFailure = "rate_limited" | "unavailable" | "sample" | "not_found" | "invalid" | "network";
export type EventsApiResult<T> = { ok: true; data: T } | { ok: false; reason: EventsApiFailure };

const BASE = "/api/events/assessments";

async function call<T>(url: string, init: RequestInit | undefined, schema: ZodType<T>): Promise<EventsApiResult<T>> {
  try {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: { context?: { reason?: string } } } | null;
    if (!response.ok) {
      const reason = body?.error?.context?.reason;
      if (response.status === 429 || reason === "RATE_LIMITED") return { ok: false, reason: "rate_limited" };
      if (reason === "SAMPLE_READ_ONLY") return { ok: false, reason: "sample" };
      if (response.status === 404) return { ok: false, reason: "not_found" };
      if (response.status === 400) return { ok: false, reason: "invalid" };
      return { ok: false, reason: "unavailable" };
    }
    const parsed = schema.safeParse(body?.data);
    return parsed.success ? { data: parsed.data, ok: true } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

const list = { safeParse: (value: unknown) => (Array.isArray(value) ? { data: value.flatMap((item) => { const parsed = eventAssessmentSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }), success: true as const } : { success: false as const }) } as unknown as ZodType<EventAssessmentContract[]>;

export const eventsApi = {
  list: () => call(BASE, undefined, list),
  get: (id: string) => call(`${BASE}/${encodeURIComponent(id)}`, undefined, eventAssessmentSchema),
  create: (input: EventAssessmentCreateInput) => call(BASE, { body: JSON.stringify(input), method: "POST" }, eventAssessmentSchema),
  patch: (id: string, input: EventAssessmentPatchInput) => call(`${BASE}/${encodeURIComponent(id)}`, { body: JSON.stringify(input), method: "PATCH" }, eventAssessmentSchema),
  addToPlan: (id: string) => call(`${BASE}/${encodeURIComponent(id)}/add-to-plan`, { body: "{}", method: "POST" }, eventAssessmentAddToPlanResultSchema),
  dismiss: (id: string) => call(`${BASE}/${encodeURIComponent(id)}/dismiss`, { body: "{}", method: "POST" }, eventAssessmentDismissResultSchema),
  availability: () => call(`${BASE}/availability`, undefined, eventAssessmentAvailabilitySchema as ZodType<EventAssessmentAvailability>),
  mine: (range: MyEventsRange, limit = 20) => call(`/api/events/mine?range=${range}&limit=${limit}`, undefined, myEventsResponseSchema as ZodType<MyEventsResponse>),
  async uploadPoster(file: File): Promise<EventsApiResult<{ posterAssetId: string }>> {
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${BASE}/posters`, { body: form, method: "POST" });
      const body = (await response.json().catch(() => null)) as { data?: { posterAssetId?: unknown } } | null;
      return response.ok && typeof body?.data?.posterAssetId === "string" ? { data: { posterAssetId: body.data.posterAssetId }, ok: true } : { ok: false, reason: response.status === 403 ? "sample" : "unavailable" };
    } catch {
      return { ok: false, reason: "network" };
    }
  },
};

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Poll a `reading` assessment every 2 seconds for up to 90 seconds (DESIGN §5). */
export async function pollAssessment(id: string, onUpdate: (value: EventAssessmentContract) => void, signal?: AbortSignal): Promise<EventAssessmentContract | null> {
  const started = Date.now();
  while (!signal?.aborted && Date.now() - started < 90_000) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (signal?.aborted) return null;
    const result = await eventsApi.get(id);
    if (!result.ok) continue;
    onUpdate(result.data);
    if (result.data.status !== "reading") return result.data;
  }
  return null;
}

/** R27：参加者动线的接口（journey-api.ts）共用同一个读取 / 失败归类。 */
export { call as eventsCall };
