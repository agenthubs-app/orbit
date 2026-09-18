import { NextResponse } from 'next/server';
import { resolveAuthenticatedApiActor,authenticatedApiActorRequiredResponse,type ResolveAuthenticatedApiActor } from '../../_shared/authenticated-actor';
import { success,failure } from '../../../../shared/api/envelope';
import { AppError } from '../../../../shared/errors/app-error';
import { createConfiguredInboxRuntime,isTypedInboxEnabled } from '../../../../features/notifications/inbox-record-service-factory';
import { refreshInboxBusinessRecords } from '../../../../features/notifications/inbox-business-refresh';
import { InboxRecordError } from '../../../../features/notifications/inbox-record-service';
import { inboxNotificationActionSchema,inboxNotificationReadBatchSchema } from '../../../../shared/api-schema/inbox-notifications';
import type { InboxNotificationKind } from '../../../../shared/contract/inbox-notifications';

type Operation='list'|'detail'|'action'|'read';
export function createInboxNotificationHandler(options:{resolveActor?:ResolveAuthenticatedApiActor;enabled?:(actorId:string)=>boolean;runtime?:typeof createConfiguredInboxRuntime;refresh?:(input:Parameters<typeof refreshInboxBusinessRecords>[0])=>Promise<unknown>}={}) {
  return async(operation:Operation,request:Request,context?:{params:Promise<{id:string}>}):Promise<Response>=>{
    const actor=await (options.resolveActor??resolveAuthenticatedApiActor)();if(!actor)return authenticatedApiActorRequiredResponse('live');
    const send=(data:unknown)=>NextResponse.json(success(data),{headers:{'Cache-Control':'no-store'}});
    if(!(options.enabled??isTypedInboxEnabled)(actor.id))return operation==='list'?send({enabled:false,items:[],unreadCount:0,nextCursor:null,asOf:new Date().toISOString()}):NextResponse.json(failure(new AppError('NOT_FOUND','Notification not found')),{status:404});
    try {
      const runtime=(options.runtime??createConfiguredInboxRuntime)();if(!runtime)throw new Error('Storage unavailable');
      const url=new URL(request.url),language=url.searchParams.get('language');const lang=language==='en'||language==='ja'?language:'zh';
      if(operation==='list') {
        const kind=url.searchParams.get('kind');if(kind&&!['reminder','suggestion','update'].includes(kind))throw new InboxRecordError('VALIDATION_ERROR','Invalid category');
        await (options.refresh??refreshInboxBusinessRecords)({...runtime,actorId:actor.id,principalId:actor.userId,since:process.env.ORBIT_TYPED_INBOX_SINCE??new Date(Date.now()-30*86400000).toISOString()});
        return send(await runtime.service.list(actor.id,{language:lang,...(kind?{kind:kind as InboxNotificationKind}:{}),...(url.searchParams.has('cursor')?{cursor:url.searchParams.get('cursor')!}:{}),...(url.searchParams.has('limit')?{limit:Number(url.searchParams.get('limit'))}:{}),history:url.searchParams.get('history')==='true'}));
      }
      if(operation==='read') {
        const parsed=inboxNotificationReadBatchSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new InboxRecordError('VALIDATION_ERROR','Invalid read snapshot');
        return send(await runtime.service.readBatch(actor.id,parsed.data));
      }
      const id=(await context?.params)?.id;if(!id)throw new InboxRecordError('VALIDATION_ERROR','Notification ID required');
      if(operation==='detail')return send(await runtime.service.get(actor.id,id,lang));
      const parsed=inboxNotificationActionSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new InboxRecordError('VALIDATION_ERROR','Invalid notification action');
      const receipt=await runtime.service.action(actor.id,id,parsed.data);
      return send({...receipt,notification:await runtime.service.get(actor.id,id,lang)});
    } catch(error) {
      const code=error instanceof InboxRecordError?error.code:'SERVICE_UNAVAILABLE';
      // An unclassifiable record is a data fault, not a transient outage: answer a
      // named 409 so the client shows "收件箱数据异常" with the code instead of an
      // empty list or a placeholder row.
      const status=code==='NOT_FOUND'?404:code==='CONFLICT'||code==='INTEGRITY_VIOLATION'?409:code==='SOURCE_UNAVAILABLE'?410:code==='VALIDATION_ERROR'?400:503;
      const appCode=code==='SOURCE_UNAVAILABLE'?'NOT_FOUND':code==='INTEGRITY_VIOLATION'?'CONFLICT':code;
      return NextResponse.json(failure(new AppError(appCode,error instanceof InboxRecordError?error.message:'Notifications are temporarily unavailable'),{inboxErrorCode:code}),{status,headers:{'Cache-Control':'no-store'}});
    }
  };
}
