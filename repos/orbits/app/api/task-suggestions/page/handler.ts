import { NextResponse } from "next/server";
import { createConfiguredTaskSuggestionPageReader } from "../../../../features/tasks/suggestion-page";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

export function createTaskSuggestionPageGetHandler(options: {resolveActor?:ResolveAuthenticatedApiActor;reader?:typeof createConfiguredTaskSuggestionPageReader} = {}) {
  return async function GET(request:Request):Promise<Response> {
    const headers={"Cache-Control":"private, no-store"};
    try {
      const actor=await (options.resolveActor??resolveAuthenticatedApiActor)();
      if(!actor)return authenticatedApiActorRequiredResponse("live");
      const params=new URL(request.url).searchParams;
      const scope=params.get("scope")??"all",limit=params.has("limit")?Number(params.get("limit")):20,cursor=params.get("cursor");
      if([...params.keys()].some(key=>!["scope","limit","cursor"].includes(key)||params.getAll(key).length!==1)
        || !["all","relationship"].includes(scope) || !Number.isSafeInteger(limit)||limit<1||limit>30
        || (params.has("cursor")&&(!cursor||cursor.length>8000)))throw Error("SUGGESTION_PAGE_INPUT_INVALID");
      const reader=(options.reader??createConfiguredTaskSuggestionPageReader)(actor.workspaceId);
      if(!reader)throw Error("SUGGESTION_PAGE_STORAGE_UNAVAILABLE");
      return NextResponse.json(success(await reader.read(actor.id,{scope:scope as "all"|"relationship",limit,cursor})),{headers});
    } catch(error) {
      const invalid=error instanceof Error&&["SUGGESTION_PAGE_INPUT_INVALID","SUGGESTION_PAGE_CURSOR_INVALID"].includes(error.message);
      const safe=new AppError(invalid?"VALIDATION_ERROR":"SERVICE_UNAVAILABLE",invalid?"Reload the first suggestion page.":"Suggestions are temporarily unavailable.");
      return NextResponse.json(failure(safe),{headers,status:getHttpStatusForAppErrorCode(safe.code)});
    }
  };
}
