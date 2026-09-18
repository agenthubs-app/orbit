import type { ConditionalReadDependencies } from "../_shared/conditional-read";
import { NextResponse } from "next/server";

import type { NoteService } from "../../../features/notes/service";
import type { NoteMentionContract } from "../../../shared/contract/notes";
import { NoteServiceError } from "../../../features/notes/service";
import { createConfiguredNoteService } from "../../../features/notes/service-factory";
import { failure, runtimeBoundaryHeaders, success } from "../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

export interface NoteRouteDependencies {
  now?: () => string;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: NoteService;
  conditionalRead?: ConditionalReadDependencies;
}

export type NoteRouteContext = { params: Promise<{ id: string }> };
export type NoteContactRouteContext = { params: Promise<{ id: string; contactId: string }> };

export function noteNow(dependencies?: NoteRouteDependencies): string {
  return dependencies?.now?.() ?? new Date().toISOString();
}

export function noteService(dependencies?: NoteRouteDependencies): NoteService {
  return dependencies?.service ?? createConfiguredNoteService();
}

export function noteActorResolver(dependencies?: NoteRouteDependencies): ResolveAuthenticatedApiActor {
  return dependencies?.resolveActor ?? resolveAuthenticatedApiActor;
}

export function noteSuccess(data: unknown, status = 200): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(success(data), { headers: runtimeBoundaryHeaders(mode), status });
}

export function noteError(error: unknown): Response {
  const mode = resolveFeatureMode();
  let appError: AppError;
  if (error instanceof AppError) appError = error;
  else if (error instanceof NoteServiceError) {
    if (error.code === "NOTE_NOT_FOUND") appError = new AppError("NOT_FOUND", "Note not found.");
    else if (error.code === "NOTE_INVALID_INPUT") appError = new AppError("VALIDATION_ERROR", error.message);
    else appError = new AppError("CONFLICT", error.message);
  } else appError = new AppError("INTERNAL_ERROR", "An unexpected error occurred.", { cause: error });
  return NextResponse.json(failure(appError, {
    boundary: "runtime",
    mode,
    privacy: "actor-scoped-private-note-data",
    service: "notes",
  }), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(appError.code),
  });
}

export async function noteBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = await request.json(); }
  catch { throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON."); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

export function noteExactKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = new Set(allowed);
  if (Object.keys(body).some((key) => !keys.has(key))) {
    throw new AppError("VALIDATION_ERROR", "Request contains unsupported fields.");
  }
}

export function noteString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new AppError("VALIDATION_ERROR", `${field} is required.`);
  return value;
}

export function noteOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return noteString(value, field);
}

export function noteVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new AppError("VALIDATION_ERROR", "expectedVersion is invalid.");
  return Number(value);
}

export function noteContactIds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new AppError("VALIDATION_ERROR", "contactIds must contain non-empty strings.");
  }
  return value;
}

export function noteMentions(value: unknown): readonly NoteMentionContract[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "mentions must be an array.");
  return value.map((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof (item as Record<string, unknown>).contactId !== "string" ||
      typeof (item as Record<string, unknown>).displayText !== "string" ||
      !Number.isSafeInteger((item as Record<string, unknown>).start) ||
      !Number.isSafeInteger((item as Record<string, unknown>).end)
    ) throw new AppError("VALIDATION_ERROR", "mentions contains an invalid item.");
    const mention = item as unknown as NoteMentionContract;
    return { ...mention };
  });
}
