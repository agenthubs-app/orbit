import { NextResponse } from "next/server";
import { createConfiguredTaskPageReader } from "../../../../features/tasks/task-page";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

export function createTaskPageGetHandler(options: {resolveActor?:ResolveAuthenticatedApiActor;reader?:typeof createConfiguredTaskPageReader} = {}) {
  return async function GET(request:Request):Promise<Response> {
    const headers = {"Cache-Control":"private, no-store"};
    try {
      const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const params = new URL(request.url).searchParams;
      const status=params.get("status")??"open", scope=params.get("scope")??"all", query=params.get("query")??"", cursor=params.get("cursor"), limit=params.has("limit")?Number(params.get("limit")):30;
      if ([...params.keys()].some(key=>!["status","scope","query","cursor","limit"].includes(key)||params.getAll(key).length!==1)
        || !["open","completed"].includes(status) || !["all","relationship"].includes(scope) || query.length>240 || !Number.isSafeInteger(limit) || limit<1 || limit>50
        || (params.has("cursor") && (!cursor || cursor.length>8000))) throw Error("TASK_PAGE_INPUT_INVALID");
      const reader=(options.reader ?? createConfiguredTaskPageReader)(actor.workspaceId);
      if (!reader) throw Error("TASK_PAGE_STORAGE_UNAVAILABLE");
      return NextResponse.json(success(await reader.read(actor.id,{status:status as "open"|"completed",scope:scope as "all"|"relationship",query,limit,cursor})),{headers});
    } catch(error) {
      const invalid=error instanceof Error && ["TASK_PAGE_INPUT_INVALID","TASK_PAGE_CURSOR_INVALID"].includes(error.message);
      const safe=new AppError(invalid?"VALIDATION_ERROR":"SERVICE_UNAVAILABLE",invalid?"Reload the first task page.":"Tasks are temporarily unavailable.");
      return NextResponse.json(failure(safe),{headers,status:getHttpStatusForAppErrorCode(safe.code)});
    }
  };
}
