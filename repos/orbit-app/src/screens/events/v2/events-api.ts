// R26 イベント (App): the contract-8 and events-mine calls. Answers are read through the synced schemas
// (unknown enum values read leniently); a failure becomes a small reason the screens map to UI. No AI runs here.
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../../api/client";
import type { ApiResult } from "../../../api/types";
import { eventAssessmentAddToPlanResultSchema, eventAssessmentAvailabilitySchema, eventAssessmentDismissResultSchema, eventAssessmentSchema } from "../../../api/schema/event-assessment";
import { myEventsResponseSchema } from "../../../api/schema/events-mine";
import type { EventAssessmentAvailability, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../../../api/contract/event-assessment";
import type { MyEventsRange, MyEventsResponse } from "../../../api/contract/events-mine";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";

export type EventsFailure = "rate_limited" | "sample" | "not_found" | "invalid" | "network" | "unavailable";
export type EventsResult<T> = { ok: true; data: T } | { ok: false; reason: EventsFailure };

const BASE = "/api/events/assessments";

function failureOf(result: ApiResult<unknown>): EventsFailure {
  if (result.success) return "invalid";
  if (result.status === 0) return "network";
  const reason = result.error.context?.reason ?? null;
  if (result.status === 429 || reason === "RATE_LIMITED") return "rate_limited";
  if (reason === "SAMPLE_READ_ONLY") return "sample";
  if (result.status === 404) return "not_found";
  if (result.status === 400) return "invalid";
  return "unavailable";
}

async function read<T>(call: Promise<ApiResult<unknown>>, schema: ZodType<T>): Promise<EventsResult<T>> {
  const result = await call;
  if (!result.success) return { ok: false, reason: failureOf(result) };
  const parsed = schema.safeParse(result.data);
  return parsed.success ? { data: parsed.data, ok: true } : { ok: false, reason: "invalid" };
}

const listSchema = { safeParse: (value: unknown) => (Array.isArray(value) ? { data: value.flatMap((item) => { const parsed = eventAssessmentSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }), success: true as const } : { success: false as const }) } as unknown as ZodType<EventAssessmentContract[]>;

export interface EventsApi {
  list(): Promise<EventsResult<EventAssessmentContract[]>>;
  detail(id: string): Promise<EventsResult<EventAssessmentContract>>;
  create(input: EventAssessmentCreateInput): Promise<EventsResult<EventAssessmentContract>>;
  fill(id: string, input: EventAssessmentPatchInput): Promise<EventsResult<EventAssessmentContract>>;
  addToPlan(id: string): Promise<EventsResult<unknown>>;
  dismiss(id: string): Promise<EventsResult<unknown>>;
  availability(): Promise<EventsResult<EventAssessmentAvailability>>;
  mine(range: MyEventsRange, limit?: number): Promise<EventsResult<MyEventsResponse>>;
  uploadPoster(bytes: Uint8Array<ArrayBuffer>, mimeType: string): Promise<EventsResult<{ posterAssetId: string }>>;
}

export function createEventsApi(client: OrbitApiClient): EventsApi {
  const id = (value: string) => encodeURIComponent(value);
  return {
    list: () => read(client.get<unknown>(BASE), listSchema),
    detail: (value) => read(client.get<unknown>(`${BASE}/${id(value)}`), eventAssessmentSchema),
    create: (input) => read(client.post<unknown>(BASE, { body: input }), eventAssessmentSchema),
    fill: (value, input) => read(client.patch<unknown>(`${BASE}/${id(value)}`, { body: input }), eventAssessmentSchema),
    addToPlan: (value) => read(client.post<unknown>(`${BASE}/${id(value)}/add-to-plan`, { body: {} }), eventAssessmentAddToPlanResultSchema as ZodType<unknown>),
    dismiss: (value) => read(client.post<unknown>(`${BASE}/${id(value)}/dismiss`, { body: {} }), eventAssessmentDismissResultSchema as ZodType<unknown>),
    availability: () => read(client.get<unknown>(`${BASE}/availability`), eventAssessmentAvailabilitySchema as ZodType<EventAssessmentAvailability>),
    mine: (range, limit = 20) => read(client.get<unknown>(`/api/events/mine?range=${range}&limit=${limit}&platform=app`), myEventsResponseSchema as ZodType<MyEventsResponse>),
    async uploadPoster(bytes, mimeType) {
      const result = await client.post<unknown>(`${BASE}/posters`, { headers: { "content-type": mimeType }, rawBody: bytes });
      if (!result.success) return { ok: false, reason: failureOf(result) };
      const value = (result.data as { posterAssetId?: unknown } | null)?.posterAssetId;
      return typeof value === "string" ? { data: { posterAssetId: value }, ok: true } : { ok: false, reason: "invalid" };
    },
  };
}

export function useEventsApi(): EventsApi {
  const client = useOrbitApiClient();
  return useMemo(() => createEventsApi(client), [client]);
}

export function newIdempotencyKey(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `app-${Date.now().toString(36)}-${random()}${random()}`;
}
