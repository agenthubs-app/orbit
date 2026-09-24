import type { InboxNotificationActionReceipt, InboxNotificationDTO, InboxNotificationKind, InboxNotificationSource } from '../../../shared/contract/inbox-notifications';
import { createPostgresInboxReadWindow } from './inbox-read-window';
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';
import { createPostgresLiveRecordStore } from '../../../shared/storage/postgres-live-record-store';

export const INBOX_RECORD_COLLECTION = 'inboxNotifications';
export interface InboxStoredRecord {
  notification: InboxNotificationDTO;
  operations: Record<string, { fingerprint: string; receipt: InboxNotificationActionReceipt }>;
}
export interface InboxRecordTransaction {
  get(id:string):Promise<InboxStoredRecord|null>;
  save(record:InboxStoredRecord):Promise<void>;
  executor:TransactionalSqlExecutor|undefined;
}
export interface InboxPageQuery {
  actorId:string; asOf:string; limit:number; kind?:InboxNotificationKind;
  before?:{at:string;id:string};
}
export interface InboxRecordRepository {
  transaction<T>(actorId:string,operation:(transaction:InboxRecordTransaction)=>Promise<T>):Promise<T>;
  page(query:InboxPageQuery):Promise<readonly InboxNotificationDTO[]>;
  /** Optional for in-memory adapters; configured PostgreSQL always supplies it. */
  readWindow?: InboxReadWindow;
}
export interface InboxReadWindow {
  invalidIds(actorId:string,asOf:string):Promise<readonly string[]>;
  page(query:InboxPageQuery & {history:boolean}):Promise<readonly InboxNotificationDTO[]>;
  unreadPage(query:InboxPageQuery & {now:string}):Promise<readonly {id:string;occurredAt:string;sources:readonly InboxNotificationSource[]}[]>;
}
export function createPostgresInboxRecordRepository(input:{client:TransactionalPostgresClient;workspaceId:string}):InboxRecordRepository {
  return {
    readWindow: createPostgresInboxReadWindow(input),
    async transaction(actorId,operation) {
      for(let attempt=0;;attempt++) {
        try { return await input.client.transaction(async executor=>{
          // One account lock covers receipt replay, notification and business mutations.
          await executor.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify([input.workspaceId,INBOX_RECORD_COLLECTION,actorId])]);
          const store=createPostgresLiveRecordStore({client:executor});
          return operation({ executor,
            async get(id) { const row=await store.getRecord({workspaceId:input.workspaceId,collectionName:INBOX_RECORD_COLLECTION,recordId:id}); return row?.userId===actorId ? row.payload as unknown as InboxStoredRecord:null; },
            async save(record) {
              const n=record.notification;if(n.actorId!==actorId)throw new Error('Inbox owner mismatch');
              await store.upsertRecord({workspaceId:input.workspaceId,collectionName:INBOX_RECORD_COLLECTION,recordId:n.id,userId:actorId,sourceType:'system',sourceId:n.semanticKey,evidenceIds:n.sources.map(s=>s.sourceId),lifecycleState:'active',payload:record as unknown as Record<string,unknown>,createdAt:n.occurredAt,updatedAt:n.updatedAt,occurredAt:n.occurredAt});
            },
          });
        }); } catch(error) { if(attempt>=2 || !['40001','40P01'].includes(String((error as {code?:string}).code)))throw error; }
      }
    },
    async page(query) {
      const rows=await input.client.query<{payload:InboxStoredRecord}>(`select payload from orbit_records
        where workspace_id=$1 and collection_name=$2 and user_id=$3 and lifecycle_state='active'
        and occurred_at <= $4::timestamptz
        and ($5::text is null or payload->'notification'->>'kind'=$5)
        and ($6::timestamptz is null or (occurred_at,record_id)<($6::timestamptz,$7::text))
        order by occurred_at desc, record_id desc limit $8`,[input.workspaceId,INBOX_RECORD_COLLECTION,query.actorId,query.asOf,query.kind??null,query.before?.at??null,query.before?.id??null,query.limit]);
      return rows.rows.map(row=>row.payload.notification);
    },
  };
}
