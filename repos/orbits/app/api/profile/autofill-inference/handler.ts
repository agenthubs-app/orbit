import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { isSampleWrite } from "../../../../features/guide/sample-write";
import { configuredAutofillLimit } from "../../../../features/profile/autofill-inference-limit";
import { AUTOFILL_UNAVAILABLE, createAutofillInferenceService } from "../../../../features/profile/autofill-inference-service";
import type { ProfileAutofillInferenceRequestContract } from "../../../../shared/contract/profile-autofill";
import { sanitizeIndustryPair } from "../../../../shared/domain/industries";

const FIELDS = new Set(["displayName", "organization", "role", "primaryIndustryId", "secondaryIndustryId", "language"]);
const headers = { "cache-control": "private, no-store" };
const error = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { headers, status });

function readRequest(value: unknown): ProfileAutofillInferenceRequestContract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !FIELDS.has(key))) return null;
  if (body.language !== "zh" && body.language !== "ja" && body.language !== "en") return null;
  for (const key of ["displayName", "organization", "role"]) if (body[key] !== undefined && typeof body[key] !== "string") return null;
  const organization = ((body.organization as string | undefined) ?? "").trim();
  const role = ((body.role as string | undefined) ?? "").trim();
  if (!organization && !role) return null;
  return {
    displayName: (body.displayName as string | undefined)?.trim() ?? "",
    organization,
    role,
    ...sanitizeIndustryPair(body.primaryIndustryId, body.secondaryIndustryId),
    language: body.language,
  };
}

export function createAutofillInferenceHandler(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  withinLimit?: (actorId: string) => Promise<boolean>;
  service?: Pick<ReturnType<typeof createAutofillInferenceService>, "infer">;
} = {}) {
  return async function POST(request: Request): Promise<Response> {
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor?.id) return error(401, "ACTOR_REQUIRED", "Sign in before requesting suggestions.");
    if (isSampleWrite(request, actor.id)) return error(403, "SAMPLE_READ_ONLY", "Sample data cannot request suggestions.");
    const input = readRequest(await request.json().catch(() => null));
    if (!input) return error(400, "VALIDATION_ERROR", "Send a company or a title, and a supported language.");
    const data = await (dependencies.withinLimit ?? configuredAutofillLimit)(actor.id)
      ? await (dependencies.service ?? createAutofillInferenceService()).infer(input)
      : AUTOFILL_UNAVAILABLE;
    return NextResponse.json({ success: true, data }, { headers });
  };
}
