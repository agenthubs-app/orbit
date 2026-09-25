import {NextResponse} from 'next/server';
import {isTypedInboxEnabled} from '../../../../features/notifications/inbox-record-service-factory';
import {readLegacyNotificationUnreadSummary} from '../../../../features/notifications/legacy-unread-summary';
import {readRelationshipUnreadSummary} from '../../../../features/relationship-communication/unread-summary';
import {resolveSharedReadBudgetGate} from '../../../../features/sync/read-budget-gate';
import {inboxSummarySchema} from '../../../../shared/api-schema/inbox-summary';
import {failure,success} from '../../../../shared/api/envelope';
import type {InboxSummaryDTO} from '../../../../shared/contract/inbox-summary';
import type {ContractMatches} from '../../../../shared/contract-check';
import type {z} from 'zod';
import {AppError} from '../../../../shared/errors/app-error';
import {createConfiguredPostgresLiveRecordStore} from '../../../../shared/storage/configured-live-record-store';
import {createConfiguredInboxRuntime} from '../../../../features/notifications/inbox-record-service-factory';
import {authenticatedApiActorRequiredResponse,resolveAuthenticatedApiActor,type ResolveAuthenticatedApiActor} from '../../_shared/authenticated-actor';

type Actor=NonNullable<Awaited<ReturnType<ResolveAuthenticatedApiActor>>>;
const matches:ContractMatches<z.infer<typeof inboxSummarySchema>,InboxSummaryDTO>=true;
const headers={'Cache-Control':'private, no-store'};

export function createInboxSummaryGetHandler(options:{
  resolveActor?:ResolveAuthenticatedApiActor;
  typedEnabled?:(actorId:string)=>boolean;
  readMessages?:(actor:Actor)=>Promise<number>;
  readLegacy?:(actor:Actor)=>Promise<number>;
  readTyped?:(actor:Actor)=>Promise<number>;
  now?:()=>string;
}={}) {
  return async function GET():Promise<Response> {
    const actor=await(options.resolveActor??resolveAuthenticatedApiActor)();
    if(!actor)return authenticatedApiActorRequiredResponse('live');
    try {
      const actorId=actor.accountId??actor.id;
      const typed=(options.typedEnabled??isTypedInboxEnabled)(actorId);
      const gate=resolveSharedReadBudgetGate();
      gate?.assertAllowed({collectionName:'relationship_communication_messages'});
      if(!typed)gate?.assertAllowed({collectionName:'notifications'});
      let runtime:ReturnType<typeof createConfiguredPostgresLiveRecordStore>;
      const storage=()=>{
        runtime??=createConfiguredPostgresLiveRecordStore();
        if(!runtime || (actor.workspaceId && actor.workspaceId!==runtime.workspaceId))throw new Error('Storage scope unavailable');
        return {...runtime,actorId};
      };
      const [messagesUnread,notificationsUnread]=await Promise.all([
        options.readMessages?options.readMessages(actor):readRelationshipUnreadSummary(storage()).then(r=>r.unreadTotal),
        typed
          ? options.readTyped?options.readTyped(actor):Promise.resolve().then(()=>{
              const inbox=createConfiguredInboxRuntime();
              if(!inbox||inbox.workspaceId!==actor.workspaceId)throw new Error('Storage scope unavailable');
              return inbox.service.unreadCount(actorId);
            })
          : options.readLegacy?options.readLegacy(actor):readLegacyNotificationUnreadSummary(storage()).then(r=>r.unreadTotal),
      ]);
      const data=inboxSummarySchema.parse({actorId,messagesUnread,notificationsUnread,
        notificationMode:typed?'typed':'legacy',notificationRead:'ready',
        asOf:(options.now??(()=>new Date().toISOString()))()});
      if(!matches)throw new Error('Contract mismatch');
      return NextResponse.json(success(data),{headers});
    } catch {
      return NextResponse.json(failure(new AppError('SERVICE_UNAVAILABLE','Inbox counts are temporarily unavailable')),{status:503,headers});
    }
  };
}
