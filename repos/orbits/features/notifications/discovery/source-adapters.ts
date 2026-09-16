import type { LiveRecordStoreLike } from '../../../shared/storage/live-record-store';
import type { TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';
import { noteRecordFromLiveRecord } from '../../notes/note-record';
import { taskRecordFromLiveRecord } from '../../tasks/task-record';
import { canonicalScheduleItemSchema } from '../../personal-schedule/authority-contract';
import type { AppointmentAggregate } from '../../appointments/contract';
import type { DiscoveryCursor, DiscoveryEvidence, DiscoveryPreferences, DiscoverySourceRef } from './contract';
import { DISCOVERY_LIMITS } from './contract';

const collections = {note:'notes',task:'tasks',schedule:'personal_schedule_items',contact:'contacts',goal:'profiles',message:'relationship_communication_messages'} as const;
const text = (v:unknown) => typeof v==='string'?v:'';
const strings = (v:unknown) => Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'):[];
export function createDiscoverySourceAdapters(input:{store:LiveRecordStoreLike<Record<string,unknown>>;client:TransactionalSqlExecutor;workspaceId:string;preferences:(actorId:string)=>Promise<DiscoveryPreferences>;now?:()=>string}) {
  const now=input.now??(()=>new Date().toISOString());
  const get=(collectionName:string,recordId:string)=>input.store.getRecord({workspaceId:input.workspaceId,collectionName,recordId});
  async function objects(actorId:string,ids:string[]) {
    const result:{id:string;name:string}[]=[];
    for(const id of [...new Set(ids)].slice(0,10)) {const row=await get('contacts',id);if(row?.userId===actorId&&row.lifecycleState==='active'&&text(row.payload.displayName))result.push({id,name:text(row.payload.displayName)});}
    return result;
  }
  const adapters={
    async read(actorId:string,ref:DiscoverySourceRef,forExtraction=true):Promise<DiscoveryEvidence|null> {
      const prefs=await input.preferences(actorId);
      if(prefs.actorId!==actorId||(forExtraction&&(!prefs.enabled||ref.at<prefs.enabledSince)))return null;
      let body='',authorId=actorId,revision='',occurredAt=ref.at,ids:string[]=[],links:string[]=[],boundObjects:{id:string;name:string}[]=[],href='',explicitDueAt:string|undefined,plannedDate:string|undefined;
      if(ref.kind==='appointment') {
        const rows=await input.client.query<{payload:AppointmentAggregate}>(`select payload from appointment_aggregates where workspace_id=$1 and appointment_id=$2 and (owner_actor_id=$3 or invitee_actor_id=$3)`,[input.workspaceId,ref.id,actorId]);
        const a=rows.rows[0]?.payload;
        if(!a||['cancelled','completed'].includes(a.status))return null;
        revision='discovery:'+a.version;body=a.details??'';authorId=a.detailsUpdatedByActorId??a.createdByActorId;occurredAt=a.detailsUpdatedAt??a.updatedAt;
        ids=[a.contactIdsByActor[actorId]].filter(Boolean);href=`/contacts/${encodeURIComponent(ids[0]??'')}?appointmentId=${encodeURIComponent(a.appointmentId)}`;
      } else {
        const collection=collections[ref.kind as keyof typeof collections];if(!collection)return null;
        const row=await get(collection,ref.id);if(!row||row.lifecycleState!=='active')return null;
        if(ref.kind!=='message'&&row.userId!==actorId)return null;
        const p=row.payload;
        if(ref.kind==='note') {
          const note=noteRecordFromLiveRecord(row,actorId)?.note;if(!note)return null;
          body=note.title+'\n'+note.body;revision=String(note.version);occurredAt=note.updatedAt;ids=[...note.contactIds];href=`/notes/${encodeURIComponent(note.id)}`;
        } else if(ref.kind==='task') {
          const task=taskRecordFromLiveRecord(row,actorId)?.task;if(!task||task.status!=='open')return null;
          explicitDueAt=task.dueAt;plannedDate=task.plannedDate;body=[task.title,task.notes].filter(Boolean).join('\n');revision=task.updatedAt;occurredAt=task.updatedAt;ids=task.relatedContactId?[task.relatedContactId]:[];
          links=task.sourceNoteId?[`note:${task.sourceNoteId}`]:[];href=`/tasks/${encodeURIComponent(task.id)}`;
        } else if(ref.kind==='schedule') {
          const parsed=canonicalScheduleItemSchema.safeParse(p);if(!parsed.success)return null;const s=parsed.data;
          if(s.accountId!==actorId||s.ownerUserId!==actorId||['ended','cancelled'].includes(s.state))return null;
          body=[s.title,s.details].filter(Boolean).join('\n');revision=s.updatedAt;occurredAt=s.updatedAt;ids=s.contactId?[s.contactId]:[];
          links=s.meetingId?[`appointment:${s.meetingId}`]:[];href=`/schedule/personal/${encodeURIComponent(s.id)}`;
        } else if(ref.kind==='contact') {
          if(!text(p.displayName))return null;
          body=[p.displayName,p.organization,p.role,p.headline,p.location,p.profileSnippet,p.relationshipContext,...strings(p.tags)].filter(v=>typeof v==='string').join('\n');ids=[ref.id];revision=text(p.updatedAt)||row.updatedAt;href=`/contacts/${encodeURIComponent(ref.id)}`;
        } else if(ref.kind==='goal') {
          if(p.accountId!==actorId||!text(p.relationshipGoal))return null;
          body=text(p.relationshipGoal);revision=text(p.updatedAt)||row.updatedAt;href='/profile';
        } else {
          if(!prefs.messageAnalysisEnabled||(forExtraction&&ref.at<prefs.messageEnabledSince))return null;
          const conversation=await get('relationship_communication_conversations',text(p.conversationId));
          if(!conversation||conversation.lifecycleState!=='active'||conversation.payload.status!=='active'||!strings(conversation.payload.participantAccountIds).includes(actorId))return null;
          const v=conversation.payload,binding=await get('relationship_communication_bindings',text(v.bindingId)),b=binding?.payload;
          if(!binding||binding.lifecycleState!=='active'||b?.status!=='confirmed'||![b.inviterAccountId,b.remoteAccountId].includes(actorId)||b.qualificationVersion!==v.qualificationVersion||p.qualificationVersion!==v.qualificationVersion||b.contactId!==v.contactId||b.conversationId!==v.conversationId||!strings(v.participantAccountIds).includes(text(b.inviterAccountId))||!strings(v.participantAccountIds).includes(text(b.remoteAccountId)))return null;
          authorId=text(p.senderAccountId);if(!strings(v.participantAccountIds).includes(authorId))return null;
          body=text(p.body);revision=row.updatedAt;occurredAt=text(p.sentAt);ids=b.inviterAccountId===actorId?[text(b.contactId)]:[];
          if(!ids.length){const remoteId=text(b.inviterAccountId===actorId?b.remoteAccountId:b.inviterAccountId);const names=v.participantDisplayNames as Record<string,unknown>|undefined;const name=text(names?.[remoteId]);if(name)boundObjects=[{id:remoteId,name}];}
          href=`/inbox/${encodeURIComponent(text(v.conversationId))}`;
        }
      }
      if(revision!==ref.revision||!body.trim()||!Number.isFinite(Date.parse(occurredAt)))return null;
      const objectList=await objects(actorId,ids);
      return {key:ref.key,actorId,authorId,text:body.slice(0,DISCOVERY_LIMITS.excerptCharacters),objects:[...objectList,...boundObjects],links,status:'active',href,...(explicitDueAt?{explicitDueAt}:{}),...(plannedDate?{plannedDate}:{}),source:{sourceKind:ref.kind,sourceId:ref.id,sourceRevision:revision,occurredAt,readAt:now(),authorId}};
    },
    async scan(actorId:string,cursor:DiscoveryCursor,asOf:string):Promise<{refs:DiscoverySourceRef[];cursor:DiscoveryCursor;hasMore:boolean}> {
      const table=await input.client.query<{name:string|null}>("select to_regclass('appointment_aggregates')::text as name");
      const appointments=table.rows[0]?.name?`union all select 'appointment' as kind,appointment_id as id,'discovery:'||version::text as revision,updated_at as at from appointment_aggregates where workspace_id=$1 and (owner_actor_id=$2 or invitee_actor_id=$2)`:'';
      const rows=await input.client.query<{kind:DiscoverySourceRef['kind'];id:string;revision:string;at:Date|string;key:string}>(`with sources as (
        select case r.collection_name when 'notes' then 'note' when 'tasks' then 'task' when 'personal_schedule_items' then 'schedule' when 'contacts' then 'contact' when 'profiles' then 'goal' else 'message' end as kind,
        r.record_id as id,case when r.collection_name='notes' then r.payload->'note'->>'version' else coalesce(r.payload->'task'->>'updatedAt',r.payload->>'updatedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end as revision,r.updated_at as at
        from orbit_records r where r.workspace_id=$1 and ((r.user_id=$2 and r.collection_name in ('notes','tasks','personal_schedule_items','contacts','profiles')) or (r.collection_name='relationship_communication_messages' and exists (select 1 from orbit_records c where c.workspace_id=$1 and c.collection_name='relationship_communication_conversations' and c.record_id=r.payload->>'conversationId' and c.payload->'participantAccountIds' ? $2))) ${appointments})
        select *,kind||':'||id as key from sources where (at,kind||':'||id)>($3::timestamptz,$4::text) and at<=$5::timestamptz order by at,kind||':'||id limit $6`,[input.workspaceId,actorId,cursor.at,cursor.key,asOf,DISCOVERY_LIMITS.page]);
      const refs=rows.rows.map(r=>({...r,at:r.at instanceof Date?r.at.toISOString():r.at}));
      const last=refs.at(-1);return {refs,cursor:last?{at:last.at,key:last.key}:cursor,hasMore:refs.length===DISCOVERY_LIMITS.page};
    },
    async context(actorId:string,evidence:DiscoveryEvidence):Promise<DiscoveryEvidence[]> {
      const rows=await input.client.query<{record_id:string;payload:Record<string,unknown>;updated_at:Date|string}>(`select record_id,payload,updated_at from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='profiles' and lifecycle_state='active' and coalesce(payload->>'relationshipGoal','')<>'' order by updated_at desc,record_id limit 1`,[input.workspaceId,actorId]);
      const result:DiscoveryEvidence[]=[];
      for(const row of rows.rows){const at=text(row.payload.updatedAt)||(row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at);const item=await adapters.read(actorId,{kind:'goal',id:row.record_id,revision:at,at,key:'goal:'+row.record_id},false);if(item)result.push(item);}
      // Add only explicitly linked records, not a search through all contacts.
      for(const object of evidence.objects.slice(0,10)){const row=await get('contacts',object.id);if(!row)continue;const at=text(row.payload.updatedAt)||row.updatedAt;const item=await adapters.read(actorId,{kind:'contact',id:object.id,revision:at,at,key:'contact:'+object.id},false);if(item)result.push(item);}
      return result;
    },
    async externalAvailability(_actorId:string) {return {email:'unavailable' as const,calendar:'unavailable' as const};},
  };
  return adapters;
}
export type DiscoverySourceAdapters=ReturnType<typeof createDiscoverySourceAdapters>;
