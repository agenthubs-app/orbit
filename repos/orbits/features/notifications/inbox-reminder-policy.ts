import type {TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';

// Resolve the canonical schedule association instead of assuming its record ID.
// Read and projection share this rule so a later user choice also overrides an
// already materialized automatic reminder.
export async function hasExplicitAppointmentReminder(client:TransactionalSqlExecutor,workspaceId:string,actorId:string,appointmentId:string):Promise<boolean> {
 const result=await client.query<{present:boolean}>(`select exists(select 1 from orbit_records p where p.workspace_id=$1 and p.user_id=$2 and p.collection_name='reminderPlans' and p.lifecycle_state='active' and p.payload->'entity'->>'status'<>'cancelled'
   and exists(select 1 from orbit_records s where s.workspace_id=p.workspace_id and s.user_id=p.user_id and s.collection_name='personal_schedule_items' and s.lifecycle_state='active' and s.record_id=p.payload->'entity'->>'targetId' and s.payload->>'meetingId'=$3)) as present`,[workspaceId,actorId,appointmentId]);
 return result.rows[0]?.present===true;
}
