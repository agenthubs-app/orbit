import type {InboxNotificationSource} from '../../../shared/contract/inbox-notifications';
import type {TransactionalSqlExecutor} from '../../../shared/storage/transactional-postgres';

type Access='available'|'changed'|'unavailable';
const collections:Partial<Record<InboxNotificationSource['sourceKind'],string>>={task:'tasks',schedule:'personal_schedule_items',note:'notes',contact:'contacts',goal:'profiles',batch:'businessCardBatches'};
interface StateRow {collection:string;id:string;supported:boolean;status:unknown;version:unknown;entity_updated_at:unknown;updated_at:Date|string}

/** null delegates complex or legacy-encoded payloads to the canonical checker.
 * This is a request-local batch, never a cache of authorization decisions. */
export async function readSimpleInboxSourceStates(input:{client:TransactionalSqlExecutor;workspaceId:string;actorId:string;sources:readonly InboxNotificationSource[]}):Promise<(Access|null)[]> {
  const keys=input.sources.map(source=>source.objectId==='discovery'||(source.sourceKind==='batch'&&source.objectId==='v2')?null:collections[source.sourceKind]??null);
  const unique=new Map<string,{collection:string;id:string}>();
  input.sources.forEach((source,index)=>{const collection=keys[index];if(collection)unique.set(JSON.stringify([collection,source.sourceId]),{collection,id:source.sourceId});});
  const requests=[...unique.values()],found=new Map<string,StateRow>();
  for(let start=0;start<requests.length;start+=100) {
    const result=await input.client.query<StateRow>(`with requested as (
      select * from jsonb_to_recordset($3::jsonb) as q(collection text,id text)
    ), owned as (
      select r.collection_name,r.record_id,r.updated_at,r.payload,
        coalesce(nullif(r.payload->'note','null'::jsonb),nullif(r.payload->'task','null'::jsonb),
          nullif(r.payload->'entity','null'::jsonb),nullif(r.payload->'batch','null'::jsonb),r.payload) as entity
      from requested q join orbit_records r on r.collection_name=q.collection and r.record_id=q.id
      where r.workspace_id=$1 and r.user_id=$2 and r.lifecycle_state not in ('archived','deleted')
    ) select collection_name as collection,record_id as id,updated_at,
      jsonb_typeof(payload)='object' as supported,entity->'status' as status,
      entity->'version' as version,entity->'updatedAt' as entity_updated_at from owned`,
      [input.workspaceId,input.actorId,JSON.stringify(requests.slice(start,start+100))]);
    for(const row of result.rows)found.set(JSON.stringify([row.collection,row.id]),row);
  }
  return input.sources.map((source,index)=>{
    const collection=keys[index];if(!collection)return null;
    const row=found.get(JSON.stringify([collection,source.sourceId]));
    if(!row)return 'unavailable';if(!row.supported)return null;
    if(['deleted','cancelled','expired'].includes(String(row.status)))return 'unavailable';
    const updatedAt=row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at;
    return String(row.version??row.entity_updated_at??updatedAt)===source.sourceRevision?'available':'changed';
  });
}
