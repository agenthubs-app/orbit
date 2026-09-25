import {NextResponse} from 'next/server';
import {createConfiguredRelationshipTaskPageReader} from '../../../../features/connections/lifecycle/task-page';
import {failure,success} from '../../../../shared/api/envelope';
import {AppError,getHttpStatusForAppErrorCode} from '../../../../shared/errors/app-error';
import {authenticatedApiActorRequiredResponse,resolveAuthenticatedApiActor,type ResolveAuthenticatedApiActor} from '../../_shared/authenticated-actor';

export function createRelationshipTaskPageGetHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;reader?:typeof createConfiguredRelationshipTaskPageReader}={}) {
  return async function GET(request:Request):Promise<Response> {
    const headers={'Cache-Control':'private, no-store'};
    try {
      const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();
      if(!actor)return authenticatedApiActorRequiredResponse('live');
      const params=new URL(request.url).searchParams;
      const mode=params.get('mode')??'open',limit=params.has('limit')?Number(params.get('limit')):30,cursor=params.get('cursor');
      if([...params.keys()].some(key=>!['mode','limit','cursor'].includes(key)||params.getAll(key).length!==1)
        || !['open','completed'].includes(mode)||!Number.isSafeInteger(limit)||limit<1||limit>50
        ||(params.has('cursor')&&(!cursor||cursor.length>18000)))throw Error('RELATIONSHIP_TASK_PAGE_INPUT_INVALID');
      const reader=(options.reader??createConfiguredRelationshipTaskPageReader)(actor.workspaceId);
      if(!reader)throw Error('RELATIONSHIP_TASK_STORAGE_UNAVAILABLE');
      const data=await reader.read(actor.id,{mode:mode as 'open'|'completed',limit,cursor});
      return NextResponse.json(success(data),{headers});
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const invalid=['RELATIONSHIP_TASK_PAGE_INPUT_INVALID','RELATIONSHIP_TASK_CURSOR_INVALID'].includes(message);
      const safe=new AppError(invalid?'VALIDATION_ERROR':'SERVICE_UNAVAILABLE',invalid?'Reload the first follow-up page.':'Follow-ups are temporarily unavailable.');
      return NextResponse.json(failure(safe),{status:getHttpStatusForAppErrorCode(safe.code),headers});
    }
  };
}
