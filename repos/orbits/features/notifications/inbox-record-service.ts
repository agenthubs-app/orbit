import { createHash } from 'node:crypto';
import type { InboxNotificationDTO, InboxNotificationKind, InboxNotificationActionInput, InboxNotificationActionReceipt, InboxNotificationReadBatchInput, InboxNotificationSource, InboxNotificationListDTO } from '../../shared/contract/inbox-notifications';
import { inboxNotificationSchema, inboxNotificationActionSchema, inboxNotificationReadBatchSchema } from '../../shared/api-schema/inbox-notifications';
import type { InboxRecordRepository, InboxRecordTransaction } from './storage/inbox-record-repository';

export class InboxRecordError extends Error {
  constructor(readonly code:'NOT_FOUND'|'CONFLICT'|'SOURCE_UNAVAILABLE'|'VALIDATION_ERROR',message:string){super(message);}
}
export type InboxNotificationUpsert = Omit<InboxNotificationDTO,'id'|'revision'|'readAt'|'disposition'|'updatedAt'> & {readAt?:string|null;disposition?:InboxNotificationDTO['disposition']};
export interface InboxSourceAccess { (actorId:string,source:InboxNotificationSource,transaction?:InboxRecordTransaction):Promise<'available'|'changed'|'unavailable'>; }
export interface InboxBusinessEffects {
  accept(notification:InboxNotificationDTO,key:string,transaction:InboxRecordTransaction):Promise<string>;
  snooze(notification:InboxNotificationDTO,scheduledFor:string,key:string,transaction:InboxRecordTransaction):Promise<void>;
}
export interface InboxListQuery {cursor?:string;limit?:number;kind?:InboxNotificationKind;history?:boolean;language?:'zh'|'en'|'ja'}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable={zh:{title:'来源已不可用',reason:'来源已变更、不可访问，或此通知已不再适用。'},en:{title:'Source unavailable',reason:'The source changed, access is unavailable, or this notification no longer applies.'},ja:{title:'参照元を利用できません',reason:'参照元が変更されたか、アクセスできないか、この通知が対象外になりました。'}};
export function createInboxRecordService(input:{repository:InboxRecordRepository;sourceAccess:InboxSourceAccess;effects:InboxBusinessEffects;now?:()=>string}) {
  const now=input.now??(()=>new Date().toISOString());
  async function present(n:InboxNotificationDTO,language:'zh'|'en'|'ja'='zh',transaction?:InboxRecordTransaction):Promise<InboxNotificationDTO> {
    const states=await Promise.all(n.sources.map(s=>input.sourceAccess(n.actorId,s,transaction)));
    const access=states.includes('unavailable')?'unavailable':states.includes('changed')?'changed':'available';
    const expired=n.expiresAt && Date.parse(n.expiresAt)<=Date.parse(now()) && n.disposition==='open';
    if(access!=='available') {
      const {object:_object,copy:_copy,createdTaskId:_task,...safe}=n;
      return {...safe,...unavailable[language],target:{...n.target,href:null,status:access},sources:n.sources.map(({excerpt:_excerpt,authorId:_author,objectId:_object,...s})=>s),actions:[]};
    }
    return {...n,...n.copy?.[language],...(expired?{disposition:'expired' as const}:{}),actions:expired||n.disposition!=='open'?n.actions.filter(a=>a==='read'):n.actions};
  }
  const service={
    async upsert(raw:InboxNotificationUpsert) {
      const id='inbox:'+digest([raw.actorId,raw.semanticKey]).slice(0,32);
      const parsed=inboxNotificationSchema.safeParse({...raw,id,revision:1,readAt:raw.readAt??null,disposition:raw.disposition??'open',updatedAt:now()});
      if(!parsed.success || (raw.kind==='reminder' && !raw.dueAt && !raw.scheduledFor))throw new InboxRecordError('VALIDATION_ERROR','Notification needs valid sources, text and reminder time');
      return input.repository.transaction(raw.actorId,async tx=>{
        const existing=await tx.get(id);
        if(existing) {
          // Producer replays never resurrect a disposition or reset reading. A new
          // semantic fact needs a distinct key; ordinary wording is not a new fact.
          const old=existing.notification;
          const changed=digest([old.sources.map(s=>[s.sourceKind,s.sourceId,s.sourceRevision]),old.dueAt,old.scheduledFor,old.title,old.reason,old.copy])!==digest([raw.sources.map(s=>[s.sourceKind,s.sourceId,s.sourceRevision]),raw.dueAt,raw.scheduledFor,raw.title,raw.reason,raw.copy]);
          if(!changed)return old;
          const notification={...parsed.data,revision:old.revision+1,readAt:old.readAt,disposition:old.disposition,occurredAt:old.occurredAt,expiresAt:old.expiresAt??parsed.data.expiresAt};
          await tx.save({...existing,notification});return notification;
        }
        await tx.save({notification:parsed.data,operations:{}});return parsed.data;
      });
    },
    async get(actorId:string,id:string,language:'zh'|'en'|'ja'='zh') {
      return input.repository.transaction(actorId,async tx=>{const row=await tx.get(id);if(!row)throw new InboxRecordError('NOT_FOUND','Notification not found');return present(row.notification,language,tx);});
    },
    async list(actorId:string,query:InboxListQuery):Promise<InboxNotificationListDTO> {
      const limit=query.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new InboxRecordError('VALIDATION_ERROR','Invalid page limit');
      const scope=digest([actorId,query.kind??null,query.history??false]);
      let cursor:{scope:string;asOf:string;at:string;id:string}|null=null;
      if(query.cursor)try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(!cursor||cursor.scope!==scope||!Number.isFinite(Date.parse(cursor.asOf))||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.id!=='string')throw new Error();}catch{throw new InboxRecordError('VALIDATION_ERROR','Invalid inbox cursor');}
      const asOf=cursor?.asOf??now(),items:InboxNotificationDTO[]=[];
      // Read-side permission checks apply to every returned row and unread count.
      // Keyset batches avoid contact scans and offset drift when new rows arrive.
      let before:{at:string;id:string}|undefined,unreadCount=0,hasMore=false;
      while(true) {
        const rows=await input.repository.page({actorId,asOf,limit:50,...(before?{before}:{})});
        for(const row of rows) {
          const n=await present(row,query.language);
          const active=n.disposition==='open' && (n.kind==='reminder'||Date.parse(n.occurredAt)>=Date.parse(asOf)-30*86400000);
          const visible=(query.history || active)&&(!query.kind||n.kind===query.kind);
          if(active && n.target.status==='available' && !n.readAt)unreadCount++;
          const afterCursor=!cursor || row.occurredAt<cursor.at || (row.occurredAt===cursor.at && row.id<cursor.id);
          if(visible&&afterCursor) {if(items.length<limit)items.push(n);else hasMore=true;}
        }
        if(rows.length<50)break;const last=rows.at(-1)!;before={at:last.occurredAt,id:last.id};
      }
      const last=items.at(-1);
      return {enabled:true,items,unreadCount,asOf,nextCursor:hasMore&&last?Buffer.from(JSON.stringify({scope,asOf,at:last.occurredAt,id:last.id})).toString('base64url'):null};
    },
    async action(actorId:string,id:string,raw:InboxNotificationActionInput):Promise<InboxNotificationActionReceipt> {
      const parsed=inboxNotificationActionSchema.safeParse(raw);if(!parsed.success)throw new InboxRecordError('VALIDATION_ERROR','Invalid notification action');const request=parsed.data;
      return input.repository.transaction(actorId,async tx=>{
        const row=await tx.get(id);if(!row)throw new InboxRecordError('NOT_FOUND','Notification not found');
        const visible=await present(row.notification,'zh',tx);
        if(visible.target.status==='unavailable')throw new InboxRecordError('SOURCE_UNAVAILABLE','Notification source unavailable');
        if(visible.target.status==='changed')throw new InboxRecordError('CONFLICT','Notification source changed; refresh');
        const fingerprint=digest(request),replay=row.operations[request.idempotencyKey];
        if(replay) {if(replay.fingerprint!==fingerprint)throw new InboxRecordError('CONFLICT','Idempotency conflict');return {...replay.receipt,notification:await present(replay.receipt.notification,'zh',tx)};}
        if(row.notification.revision!==request.expectedRevision)throw new InboxRecordError('CONFLICT','Revision conflict');
        if(!visible.actions.includes(request.action))throw new InboxRecordError('CONFLICT','Notification action unavailable');
        let notification={...row.notification,revision:row.notification.revision+1,updatedAt:now()};
        if(request.action==='read')notification.readAt=notification.readAt??now();
        else if(request.action==='dismiss')notification.disposition='dismissed';
        else if(request.action==='handle')notification.disposition='handled';
        else if(request.action==='accept') {notification.createdTaskId=await input.effects.accept(notification,`inbox:${id}:accept`,tx);notification.disposition='accepted';}
        else {
          if(!request.scheduledFor||Date.parse(request.scheduledFor)<=Date.parse(now()))throw new InboxRecordError('VALIDATION_ERROR','Snooze requires a future time');
          await input.effects.snooze(notification,request.scheduledFor,request.idempotencyKey,tx);notification.scheduledFor=request.scheduledFor;
        }
        const receipt={notification,...(notification.createdTaskId?{createdTaskId:notification.createdTaskId}:{})};
        await tx.save({notification,operations:{...row.operations,[request.idempotencyKey]:{fingerprint,receipt}}});return receipt;
      });
    },
    async readBatch(actorId:string,raw:InboxNotificationReadBatchInput) {
      const parsed=inboxNotificationReadBatchSchema.safeParse(raw);if(!parsed.success)throw new InboxRecordError('VALIDATION_ERROR','Invalid read snapshot');
      const results:({id:string;notification:InboxNotificationDTO}|{id:string;error:string})[]=[];
      for(const item of parsed.data.items)try{const result=await service.action(actorId,item.id,{action:'read',expectedRevision:item.expectedRevision,idempotencyKey:`${parsed.data.idempotencyKey}:${item.id}`});results.push({id:item.id,notification:result.notification});}catch(error){if(!(error instanceof InboxRecordError))throw error;results.push({id:item.id,error:error.code});}
      return {results};
    },
  };return service;
}
export type InboxRecordService=ReturnType<typeof createInboxRecordService>;
