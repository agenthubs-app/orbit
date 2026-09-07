import { Pool } from "pg";
import { runBusinessCardIngestV2Migrations } from "../business-card-ingest-v2/migrations";

export async function prepareV1CardImageJournal(pool: Pick<Pool, "connect">): Promise<void> {
  const client = await pool.connect();
  try {
    await runBusinessCardIngestV2Migrations(client);
    await client.query(`DO $install$
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtextextended('orbit:v1-image-journal-trigger', 0));
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'orbit_records'::regclass AND tgname = 'bc_v1_attach_image_write_trigger') THEN
        CREATE FUNCTION bc_v1_attach_image_write() RETURNS trigger LANGUAGE plpgsql AS $body$
        DECLARE write_state text; image_key text;
        BEGIN
          image_key := new.payload->'item'->>'imagePath';
          IF image_key IS NULL THEN RETURN new; END IF;
          SELECT state INTO write_state FROM bc_ingest_image_writes
            WHERE workspace_id = new.workspace_id AND object_key = image_key AND pipeline = 'v1' FOR UPDATE;
          IF write_state IN ('deleting', 'deleted') THEN
            RAISE EXCEPTION 'Image write has expired; upload a new image' USING errcode = '23514';
          END IF;
          UPDATE bc_ingest_image_writes SET state = 'attached', updated_at = now()
            WHERE workspace_id = new.workspace_id AND object_key = image_key AND pipeline = 'v1' AND state = 'pending';
          RETURN new;
        END;
        $body$;
        CREATE TRIGGER bc_v1_attach_image_write_trigger BEFORE INSERT OR UPDATE OF payload ON orbit_records
          FOR EACH ROW WHEN (new.collection_name = 'businessCardBatchItems' AND new.lifecycle_state <> 'deleted')
          EXECUTE FUNCTION bc_v1_attach_image_write();
      END IF;
    END;
    $install$;`);
  } finally { client.release(); }
}

const runtimes = new Map<string, { pool: Pool; prepare(): Promise<void> }>();

export function configuredV1CardImageJournal(connectionString: string) {
  let runtime = runtimes.get(connectionString);
  if (!runtime) {
    // Separate from the V1 transaction pool: waiting batch transactions must
    // never exhaust the connections needed to commit the pre-upload intent.
    const pool = new Pool({ connectionString, max: 2, allowExitOnIdle: true });
    let ready: Promise<void> | undefined;
    runtime = { pool, prepare() {
      return ready ??= prepareV1CardImageJournal(pool).catch(() => {
        ready = undefined;
        throw new Error("V1 card image journal unavailable.");
      });
    } };
    runtimes.set(connectionString, runtime);
  }
  return runtime;
}
