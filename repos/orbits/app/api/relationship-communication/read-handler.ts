import { NextResponse } from "next/server";
import { createRelationshipReadService } from "../../../features/relationship-communication/read-service";
import { failure, success } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

export function createRelationshipPageGetHandler(kind: "conversations" | "messages", options: {
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: typeof createRelationshipReadService;
} = {}) {
  return async function GET(request: Request, context?: { params: Promise<{ id: string }> }) {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const params = new URL(request.url).searchParams;
      if (["limit", "cursor", "direction", "conversationId"].some(key => params.getAll(key).length > 1)) throw Error("RELATIONSHIP_PAGE_INPUT_INVALID");
      const service = (options.service ?? createRelationshipReadService)(actor);
      const query = { ...(params.has("limit") ? { limit: Number(params.get("limit")) } : {}), cursor: params.get("cursor") };
      const data = kind === "conversations"
        ? await service.conversations({ ...query, ...(params.has("conversationId") ? { conversationId: params.get("conversationId")! } : {}) })
        : await service.messages((await context?.params)?.id ?? "", { ...query, direction: (params.get("direction") ?? "older") as "older" | "newer" });
      return NextResponse.json(success(data), { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const safe = new AppError(message === "RELATIONSHIP_NOT_FOUND" ? "NOT_FOUND" : ["RELATIONSHIP_CURSOR_INVALID", "RELATIONSHIP_PAGE_INPUT_INVALID"].includes(message) ? "VALIDATION_ERROR" : "SERVICE_UNAVAILABLE",
        message === "RELATIONSHIP_NOT_FOUND" ? "This conversation is unavailable." : message === "RELATIONSHIP_CURSOR_INVALID" ? "Pagination changed. Reload the latest page." : "Conversation page could not be read.");
      return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
