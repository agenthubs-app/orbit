import { contactLabelsSchema } from "../../shared/api-schema/contact-labels";
import type { ContactLabelsContract } from "../../shared/contract/contact-labels";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";

export function validateContactLabelIds(ids:readonly string[]):void {
  if(ids.length>30||ids.some(id=>!id.trim()||id.length>2048)||Buffer.byteLength(JSON.stringify(ids))>8192)throw Error("CONTACT_LABEL_INPUT_INVALID");
}

export function createContactLabelsReader(input:{workspaceId:string;client:LiveRecordSqlClient}) {
  return {async read(actorId:string,ids:readonly string[]):Promise<ContactLabelsContract>{
    if(!actorId.trim()||actorId.length>2048)throw Error("CONTACT_LABEL_INPUT_INVALID");
    validateContactLabelIds(ids);
    if(!ids.length)return {actorId,items:[],asOf:new Date().toISOString()};
    const result=await input.client.query(`select record_id as id,left(payload->>'displayName',120) as "namePreview",
      left(case when jsonb_typeof(payload->'organization')='string' then payload->>'organization' else '' end,120) as "organizationPreview"
      from orbit_records where workspace_id=$1 and collection_name='contacts' and record_id=any($3::text[])
        and user_id=$2 and lifecycle_state<>'deleted' and payload->'id'=to_jsonb(record_id)
        and (payload->'accountId' is null or payload->'accountId'='null'::jsonb or payload->'accountId'=to_jsonb($2::text))
        and jsonb_typeof(payload->'displayName')='string' order by record_id collate "C" limit 30`,[input.workspaceId,actorId,[...new Set(ids)]]);
    return contactLabelsSchema.parse({actorId,items:result.rows,asOf:new Date().toISOString()});
  }};
}

export function createConfiguredContactLabelsReader(workspaceId?:string) {
  const runtime=createConfiguredPostgresLiveRecordStore();
  if(!runtime||(workspaceId&&runtime.workspaceId!==workspaceId))throw Error("CONTACT_LABEL_STORAGE_UNAVAILABLE");
  const reader=createContactLabelsReader(runtime);
  return {read(actorId:string,ids:readonly string[]){resolveSharedReadBudgetGate()?.assertAllowed({collectionName:"contacts"});return reader.read(actorId,ids);}};
}
