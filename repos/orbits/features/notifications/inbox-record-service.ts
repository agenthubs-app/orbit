import { createHash } from 'node:crypto';
import type { InboxNotificationDTO, InboxNotificationKind, InboxNotificationActionInput, InboxNotificationActionReceipt, InboxNotificationReadBatchInput, InboxNotificationSource, InboxNotificationListDTO } from '../../shared/contract/inbox-notifications';
import { inboxNotificationSchema, inboxNotificationActionSchema, inboxNotificationReadBatchSchema } from '../../shared/api-schema/inbox-notifications';
import type { InboxRecordRepository, InboxRecordTransaction } from './storage/inbox-record-repository';
import { readBoundedInbox } from './inbox-bounded-list';

export class InboxRecordError extends Error {
  constructor(readonly code:'NOT_FOUND'|'CONFLICT'|'SOURCE_UNAVAILABLE'|'VALIDATION_ERROR'|'INTEGRITY_VIOLATION',message:string){super(message);}
}
export type InboxNotificationUpsert = Omit<InboxNotificationDTO,'id'|'revision'|'readAt'|'disposition'|'updatedAt'> & {readAt?:string|null;disposition?:InboxNotificationDTO['disposition']};
export interface InboxSourceAccess { (actorId:string,source:InboxNotificationSource,transaction?:InboxRecordTransaction):Promise<'available'|'changed'|'unavailable'>; }
export interface InboxSourceAccessBatch { (actorId:string,sources:readonly InboxNotificationSource[]):Promise<readonly ('available'|'changed'|'unavailable')[]>; }
export interface InboxBusinessEffects {
  accept(notification:InboxNotificationDTO,key:string,transaction:InboxRecordTransaction):Promise<string>;
  snooze(notification:InboxNotificationDTO,scheduledFor:string,key:string,transaction:InboxRecordTransaction):Promise<void>;
}
export interface InboxListQuery {cursor?:string;limit?:number;kind?:InboxNotificationKind;history?:boolean;language?:'zh'|'en'|'ja'}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable={zh:{title:'来源已不可用',reason:'来源已变更、不可访问，或此通知已不再适用。'},en:{title:'Source unavailable',reason:'The source changed, access is unavailable, or this notification no longer applies.'},ja:{title:'参照元を利用できません',reason:'参照元が変更されたか、アクセスできないか、この通知が対象外になりました。'}};
const KINDS=new Set<InboxNotificationKind>(['reminder','suggestion','update']);

/**
 * A notification that cannot be placed in one of the three categories, or that
 * carries no title, no reason or no source, is not something a reader can act on
 * — it is the "来源已不可用" row with nothing behind it. The product rule is that
 * such a record must not exist, so a read that meets one fails closed instead of
 * rendering a placeholder. The thrown error names the offending ids and nothing
 * from their content.
 */
export function assertInboxRecordsIntact(notifications:readonly InboxNotificationDTO[]):void {
  const offenders:string[]=[];
  for(const n of notifications) {
    const bad=!KINDS.has(n.kind) || !n.title?.trim() || !n.reason?.trim()
      || !Array.isArray(n.sources) || n.sources.length===0
      || n.sources.some(s=>!s?.sourceKind?.trim() || !s?.sourceId?.trim());
    if(bad)offenders.push(n.id);
  }
  if(offenders.length)throw new InboxRecordError('INTEGRITY_VIOLATION',`Inbox records are not classifiable: ${offenders.slice(0,20).join(', ')}`);
}

/** The producer merge is shared by ordinary requests and database-only work
 * consumers. The caller owns transaction lifetime; this never sends a push. */
export function createInboxRecordUpserter(input:{transaction:InboxRecordRepository['transaction'];now:()=>string}) {
  return async (raw:InboxNotificationUpsert)=>{
    const id=inboxNotificationId(raw.actorId,raw.semanticKey);
    const parsed=inboxNotificationSchema.safeParse({...raw,id,revision:1,readAt:raw.readAt??null,disposition:raw.disposition??'open',updatedAt:input.now()});
    if(!parsed.success || (raw.kind==='reminder' && !raw.dueAt && !raw.scheduledFor))throw new InboxRecordError('VALIDATION_ERROR','Notification needs valid sources, text and reminder time');
    return input.transaction(raw.actorId,async tx=>{
      const existing=await tx.get(id);
      if(existing) {
        // Producer replays never resurrect a disposition or reset reading.
        const old=existing.notification;
        const changed=digest([old.sources.map(s=>[s.sourceKind,s.sourceId,s.sourceRevision]),old.dueAt,old.scheduledFor,old.title,old.reason,old.copy])!==digest([raw.sources.map(s=>[s.sourceKind,s.sourceId,s.sourceRevision]),raw.dueAt,raw.scheduledFor,raw.title,raw.reason,raw.copy]);
        if(!changed)return old;
        const notification={...parsed.data,revision:old.revision+1,readAt:old.readAt,disposition:old.disposition,occurredAt:old.occurredAt,expiresAt:old.expiresAt??parsed.data.expiresAt};
        await tx.save({...existing,notification});return notification;
      }
      await tx.save({notification:parsed.data,operations:{}});return parsed.data;
    });
  };
}

/** Shared with transactional historical projection registration. */
export function inboxNotificationId(actorId:string,semanticKey:string):string {
  return 'inbox:'+digest([actorId,semanticKey]).slice(0,32);
}

export function createInboxRecordService(input:{repository:InboxRecordRepository;sourceAccess:InboxSourceAccess;sourceAccessBatch?:InboxSourceAccessBatch;effects:InboxBusinessEffects;now?:()=>string}) {
  const now=input.now??(()=>new Date().toISOString());
  async function present(n:InboxNotificationDTO,language:'zh'|'en'|'ja'='zh',transaction?:InboxRecordTransaction,checked?:readonly ('available'|'changed'|'unavailable')[]):Promise<InboxNotificationDTO> {
    const states=checked??await Promise.all(n.sources.map(s=>input.sourceAccess(n.actorId,s,transaction)));
    if(states.length!==n.sources.length)throw new InboxRecordError('INTEGRITY_VIOLATION','Incomplete source authorization');
    const access=states.includes('unavailable')?'unavailable':states.includes('changed')?'changed':'available';
    const expired=n.expiresAt && Date.parse(n.expiresAt)<=Date.parse(now()) && n.disposition==='open';
    if(access!=='available') {
      const {object:_object,copy:_copy,createdTaskId:_task,...safe}=n;
      return {...safe,...unavailable[language],target:{...n.target,href:null,status:access},sources:n.sources.map(({excerpt:_excerpt,authorId:_author,objectId:_object,...s})=>s),actions:[]};
    }
    return {...n,...n.copy?.[language],...(expired?{disposition:'expired' as const}:{}),actions:expired||n.disposition!=='open'?n.actions.filter(a=>a==='read'):n.actions};
  }
  const service={
    upsert:createInboxRecordUpserter({transaction:(actorId,operation)=>input.repository.transaction(actorId,operation),now}),
    async get(actorId:string,id:string,language:'zh'|'en'|'ja'='zh') {
      return input.repository.transaction(actorId,async tx=>{const row=await tx.get(id);if(!row)throw new InboxRecordError('NOT_FOUND','Notification not found');assertInboxRecordsIntact([row.notification]);return present(row.notification,language,tx);});
    },
    async list(actorId:string,query:InboxListQuery):Promise<InboxNotificationListDTO> {
      const limit=query.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new InboxRecordError('VALIDATION_ERROR','Invalid page limit');
      const scope=digest([actorId,query.kind??null,query.history??false]);
      let cursor:{scope:string;asOf:string;at:string;id:string}|null=null;
      if(query.cursor)try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(!cursor||cursor.scope!==scope||!Number.isFinite(Date.parse(cursor.asOf))||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.id!=='string')throw new Error();}catch{throw new InboxRecordError('VALIDATION_ERROR','Invalid inbox cursor');}
      const asOf=cursor?.asOf??now(),items:InboxNotificationDTO[]=[];
      if(input.repository.readWindow) {
        const invalid=await input.repository.readWindow.invalidIds(actorId,asOf);
        if(invalid.length)throw new InboxRecordError('INTEGRITY_VIOLATION',`Inbox records are not classifiable: ${invalid.join(', ')}`);
        const result=await readBoundedInbox({window:input.repository.readWindow,actorId,asOf,now:now(),limit,
          history:query.history??false,...(query.kind?{kind:query.kind}:{}),...(cursor?{before:{at:cursor.at,id:cursor.id}}:{}),
          present:row=>present(row,query.language),access:input.sourceAccess,
          ...(input.sourceAccessBatch?{accessBatch:input.sourceAccessBatch,presentBatch:async(rows:readonly InboxNotificationDTO[])=>{
            if(rows.some(row=>row.actorId!==actorId))throw new InboxRecordError('INTEGRITY_VIOLATION','Mismatched notification actor');
            const sources=rows.flatMap(row=>row.sources),states=await input.sourceAccessBatch!(actorId,sources);
            if(states.length!==sources.length)throw new InboxRecordError('INTEGRITY_VIOLATION','Incomplete source authorization');
            let offset=0;
            return Promise.all(rows.map(row=>{const checked=states.slice(offset,offset+row.sources.length);offset+=row.sources.length;return present(row,query.language,undefined,checked);}));
          }}:{})});
        const last=result.items.at(-1);
        return {enabled:true,items:result.items,unreadCount:result.unreadCount,asOf,
          nextCursor:result.hasMore&&last?Buffer.from(JSON.stringify({scope,asOf,at:last.occurredAt,id:last.id})).toString('base64url'):null};
      }
      // Read-side permission checks apply to every returned row and unread count.
      // Keyset batches avoid contact scans and offset drift when new rows arrive.
      let before:{at:string;id:string}|undefined,unreadCount=0,hasMore=false;
      while(true) {
        const rows=await input.repository.page({actorId,asOf,limit:50,...(before?{before}:{})});
        assertInboxRecordsIntact(rows);
        for(const row of rows) {
          const n=await present(row,query.language);
          // A row whose sources all vanished says nothing a reader can act on.
          // It keeps its history entry but leaves the default list and the unread
          // count; the detail view still explains the change when opened directly.
          if(n.target.status==='unavailable' && !query.history)continue;
          const active=n.disposition==='open' && (!n.scheduledFor||Date.parse(n.scheduledFor)<=Date.parse(asOf)) && (n.kind==='reminder'||Date.parse(n.occurredAt)>=Date.parse(asOf)-30*86400000);
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
