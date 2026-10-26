import type {TransactionalSqlExecutor} from '../../shared/storage/transactional-postgres';
import {deliveryQuotaUsage,type DeliveryQuotaReservation} from './delivery-policy';

/**
 * Read-only view of today's automatic-push quota for the Web inbox rail (b5 #6 「今日のプッシュ」).
 * Reads the same reservations `reserve` writes and counts them with the same rule, without the
 * advisory lock: a display may lag one in-flight reservation, the dispatch decision never does.
 */
export async function readDeliveryQuotaToday(input:{client:Pick<TransactionalSqlExecutor,'query'>;workspaceId:string;now?:()=>string},actorId:string,preferences:{timeZone:string;dailyCap?:1|2|3}):Promise<{used:number;cap:number}> {
 const now=(input.now??(()=>new Date().toISOString()))();
 const rows=await input.client.query<{payload:DeliveryQuotaReservation}>(`select payload from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='notificationDeliveryReservations' and (payload->>'at')::timestamptz >= $3::timestamptz`,[input.workspaceId,actorId,new Date(Date.parse(now)-48*3600000).toISOString()]);
 const cap=preferences.dailyCap??3;
 return {used:Math.min(deliveryQuotaUsage(rows.rows.map(r=>r.payload),now,preferences.timeZone).total,cap),cap};
}
