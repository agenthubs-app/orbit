import { NextResponse } from "next/server";
import { createConfiguredNoteTaskPageReader } from "../../../../features/tasks/note-task-page";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

export function createNoteTaskPageGetHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; reader?: typeof createConfiguredNoteTaskPageReader } = {}) {
  return async function GET(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const params = new URL(request.url).searchParams, noteId = params.get("noteId") ?? "", cursor = params.get("cursor");
      const limit = params.has("limit") ? Number(params.get("limit")) : 20;
      if ([...params.keys()].some(key => !["noteId", "cursor", "limit"].includes(key) || params.getAll(key).length !== 1)
        || !noteId.trim() || noteId.length > 2048 || !Number.isSafeInteger(limit) || limit < 1 || limit > 30
        || (params.has("cursor") && (!cursor || cursor.length > 8000))) throw Error("NOTE_TASK_PAGE_INPUT_INVALID");
      const reader = (options.reader ?? createConfiguredNoteTaskPageReader)(actor.workspaceId);
      if (!reader) throw Error("NOTE_TASK_PAGE_STORAGE_UNAVAILABLE");
      return NextResponse.json(success(await reader.read(actor.id, { noteId, limit, cursor })), { headers });
    } catch (error) {
      const invalid = error instanceof Error && ["NOTE_TASK_PAGE_INPUT_INVALID", "NOTE_TASK_PAGE_CURSOR_INVALID"].includes(error.message);
      const safe = new AppError(invalid ? "VALIDATION_ERROR" : "SERVICE_UNAVAILABLE", invalid ? "Reload the first task page." : "Tasks are temporarily unavailable.");
      return NextResponse.json(failure(safe), { headers, status: getHttpStatusForAppErrorCode(safe.code) });
    }
  };
}
