import { authUserRecordId } from "../auth/storage/auth-user-live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";

const MIGRATION_SOURCE = "party-app:chinichi-2026";

/** Check the real Auth.js principal as well as its email, never a client-supplied account id. */
export async function isLegacyProfileRepairEligible(actor: { email?: string | null; userId?: string }): Promise<boolean> {
  if (!actor.email?.trim() || !actor.userId) return false;
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return false;
  const { rows } = await configured.client.query<{ eligible: boolean }>(
    `select exists (
       select 1 from orbit_records where workspace_id=$1 and collection_name='auth_users'
         and record_id=$2 and lifecycle_state='active' and payload ->> 'id'=$3 and payload ->> 'migratedFrom'=$4
     ) as eligible`,
    [configured.workspaceId, authUserRecordId(actor.email), actor.userId, MIGRATION_SOURCE],
  );
  return rows[0]?.eligible === true;
}
