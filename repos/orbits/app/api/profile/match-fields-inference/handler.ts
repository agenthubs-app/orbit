import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { isSampleWrite } from "../../../../features/guide/sample-write";
import { configuredAutofillLimit } from "../../../../features/profile/autofill-inference-limit";
import { createMatchFieldsInferenceService, type MatchFieldsInferenceInput, type MatchFieldsInferenceResult } from "../../../../features/profile/match-fields-inference";

/**
 * POST /api/profile/match-fields-inference (2026-11-28): after a business-card scan (or on request), infer the
 * matching fields from what the client sends. Nothing is stored — the client shows the values as 推断 with their
 * evidence, and a save makes them confirmed. Shares the autofill daily limit.
 * Body: { organization?, role?, headline?, bio?, primaryIndustryId?, secondaryIndustryId?, offering?, seeking? } — at
 * least a company, a title, a headline or a self-introduction.
 * Response: { success: true, data: { status: "inferred" | "insufficient" | "unavailable", fields } }.
 */
const STRING_FIELDS = ["organization", "role", "headline", "bio", "primaryIndustryId", "secondaryIndustryId"] as const;
const LIST_FIELDS = ["offering", "seeking"] as const;
const FIELDS = new Set<string>([...STRING_FIELDS, ...LIST_FIELDS]);
const headers = { "cache-control": "private, no-store" };
const error = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { headers, status });

function readRequest(value: unknown): MatchFieldsInferenceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return null;
  const input: Record<string, unknown> = {};
  for (const key of STRING_FIELDS) {
    if (body[key] === undefined || body[key] === null) continue;
    if (typeof body[key] !== "string") return null;
    input[key] = (body[key] as string).trim().slice(0, key === "bio" ? 800 : 200);
  }
  for (const key of LIST_FIELDS) {
    if (body[key] === undefined || body[key] === null) continue;
    if (!Array.isArray(body[key]) || (body[key] as unknown[]).some((item) => typeof item !== "string")) return null;
    input[key] = (body[key] as string[]).slice(0, 8);
  }
  if (!input.organization && !input.role && !input.headline && !input.bio) return null;
  return input as MatchFieldsInferenceInput;
}

export function createMatchFieldsInferenceHandler(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  withinLimit?: (actorId: string) => Promise<boolean>;
  service?: { infer(input: MatchFieldsInferenceInput): Promise<MatchFieldsInferenceResult> };
} = {}) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor?.id) return error(401, "ACTOR_REQUIRED", "Sign in before requesting suggestions.");
    if (isSampleWrite(request, actor.id)) return error(403, "SAMPLE_READ_ONLY", "Sample data cannot request suggestions.");
    const input = readRequest(await request.json().catch(() => null));
    if (!input) return error(400, "VALIDATION_ERROR", "Send a company, a title, a headline or a self-introduction.");
    const data: MatchFieldsInferenceResult = await (dependencies.withinLimit ?? configuredAutofillLimit)(actor.id)
      ? await (dependencies.service ?? createMatchFieldsInferenceService()).infer(input)
      : { fields: {}, status: "unavailable" };
    const { usage: _usage, ...publicData } = data;
    return NextResponse.json({ success: true, data: publicData }, { headers });
  };
}
