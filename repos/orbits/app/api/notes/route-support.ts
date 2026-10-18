import type { ConditionalReadDependencies } from "../_shared/conditional-read";
import { after, NextResponse } from "next/server";

import type { NoteService } from "../../../features/notes/service";
import type { NoteDTO } from "../../../features/notes/contract";
import type { MemoExtractionJobInput } from "../../../features/contacts/memo-extraction/job";
import { runConfiguredMemoExtraction } from "../../../features/contacts/memo-extraction/store";
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
  scheduleMemoExtraction?: (job: MemoExtractionJobInput & { usedForPlan: true }) => void;
}

export type NoteRouteContext = { params: Promise<{ id: string }> };
export type NoteContactRouteContext = { params: Promise<{ id: string; contactId: string }> };

export function noteNow(dependencies?: NoteRouteDependencies): string {
  return dependencies?.now?.() ?? new Date().toISOString();
}

export function noteService(dependencies?: NoteRouteDependencies): NoteService {
  return dependencies?.service ?? createConfiguredNoteService();
}

/** Only persisted, eligible notes reach this hook; the service suppresses replay and enqueue failures. */
export function noteOnPersisted(note: NoteDTO, dependencies?: NoteRouteDependencies): void {
  if (note.usedForPlan !== true || note.noteKind !== "meeting" || note.contactIds.length !== 1) return;
  const job = {
    actorId: note.ownerUserId, contactId: note.contactIds[0]!, noteId: note.id,
    body: note.body, contact: {}, usedForPlan: true as const,
  };
  (dependencies?.scheduleMemoExtraction ?? ((input: MemoExtractionJobInput & { usedForPlan: true }) => {
    after(async () => { await runConfiguredMemoExtraction(input); });
  }))(job);
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

export function noteKind(value: unknown): "free" | "meeting" | "voice" | undefined {
  if (value === undefined) return undefined;
  if (value === "free" || value === "meeting" || value === "voice") return value;
  throw new AppError("VALIDATION_ERROR", "noteKind is invalid.");
}

export function noteUsedForPlan(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  throw new AppError("VALIDATION_ERROR", "usedForPlan is invalid.");
}

export function noteContactIds(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new AppError("VALIDATION_ERROR", "contactIds must contain non-empty strings.");
  }
  return value;
}

export function noteMentions(value: unknown, allowStoredUnknown = false): readonly NoteMentionContract[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "mentions must be an array.");
  return value.map((item) => {
    const mention = item as Record<string, unknown>;
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      typeof mention.displayText !== "string" || !mention.displayText.trim() ||
      !Number.isSafeInteger(mention.start) || !Number.isSafeInteger(mention.end)
    ) throw new AppError("VALIDATION_ERROR", "mentions contains an invalid item.");
    const knownType = mention.entityType === undefined || mention.entityType === "contact" || mention.entityType === "event";
    if (knownType && Object.keys(mention).some((key) => !["entityType", "contactId", "eventId", "start", "end", "displayText"].includes(key))) {
      throw new AppError("VALIDATION_ERROR", "mentions contains an unsupported field.");
    }
    if (mention.entityType === undefined || mention.entityType === "contact") {
      if (typeof mention.contactId !== "string" || !mention.contactId.trim() || mention.eventId !== undefined) {
        throw new AppError("VALIDATION_ERROR", "mentions contains an invalid contact.");
      }
    } else if (mention.entityType === "event") {
      if (typeof mention.eventId !== "string" || !mention.eventId.trim() || mention.contactId !== undefined) {
        throw new AppError("VALIDATION_ERROR", "mentions contains an invalid event.");
      }
    } else if (!allowStoredUnknown || typeof mention.entityType !== "string" || !mention.entityType.trim()) {
      throw new AppError("VALIDATION_ERROR", "mentions contains an unknown type.");
    }
    return { ...mention } as NoteMentionContract;
  });
}
