import { NextResponse } from "next/server";
import { createConfiguredContactLabelsReader,validateContactLabelIds } from "../../../../features/contacts/contact-label-service";
import { authenticatedApiActorRequiredResponse,resolveAuthenticatedApiActor,type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { success,failure } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";

export function createContactLabelsGetHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;reader?:typeof createConfiguredContactLabelsReader}={}){
  return async function GET(request:Request):Promise<Response>{
    const headers={"Cache-Control":"private, no-store"};
    try{
      const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();
      if(!actor)return authenticatedApiActorRequiredResponse("live");
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(key=>key!=="id"))throw Error("CONTACT_LABEL_INPUT_INVALID");
      const ids=params.getAll("id");validateContactLabelIds(ids);
      return NextResponse.json(success(await(options.reader??createConfiguredContactLabelsReader)(actor.workspaceId).read(actor.id,ids)),{headers});
    }catch(error){
      const invalid=error instanceof Error&&error.message==="CONTACT_LABEL_INPUT_INVALID";
      return NextResponse.json(failure(new AppError(invalid?"VALIDATION_ERROR":"SERVICE_UNAVAILABLE",invalid?"Contact reference list is invalid.":"Contact names are temporarily unavailable.")),{headers,status:invalid?400:503});
    }
  };
}
