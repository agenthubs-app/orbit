/**
 * Backfill profile matching fields by AI inference (2026-11-28).
 *
 *   npx tsx scripts/backfill-profile-match-fields.ts [--event <eventId>] [--limit N] [--offset N] [--force] [--apply]
 *
 * Reads profiles (all active ones, or those registered for one event), asks the model for identity / business /
 * sells-to / customers / invest stages, and writes them as "inferred" under publicProfile.matchFields. Fields the
 * person already confirmed are never touched; a field the model cannot support is left empty (the person is asked).
 * Without --apply nothing is written (the model is still called, so the run costs tokens and shows its results).
 * Profiles that already have an inference are skipped unless --force.
 * Each write is guarded by the row's updated_at: a profile saved meanwhile is skipped, not overwritten.
 * Output: one line per profile (name, title, result, evidence) for review, then a usage summary.
 */
import { Pool } from "pg";

import { mergeInferredMatchFields, readMatchFields } from "../features/profile/match-fields";
import { createMatchFieldsInferenceService, type MatchFieldsInferenceInput } from "../features/profile/match-fields-inference";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

const tag = "[mf]";
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  loadLocalEnv();
  const apply = flag("apply");
  const force = flag("force");
  const eventId = arg("event");
  const limit = Number(arg("limit") ?? "20");
  const offset = Number(arg("offset") ?? "0");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });
  const workspaceId = config.workspaceId;
  const who = await pool.query("select current_database() as db");
  console.info(`${tag} db=${who.rows[0].db} vercelEnv=${process.env.VERCEL_ENV ?? "none"} apply=${apply} event=${eventId ?? "all"} limit=${limit} offset=${offset} force=${force}`);

  const rows = await pool.query<{ record_id: string; updated_at: string; payload: Record<string, any> }>(
    `select r.record_id, r.updated_at::text as updated_at, r.payload
       from orbit_records r
      where r.workspace_id = $1 and r.collection_name = 'profiles' and r.lifecycle_state <> 'deleted'
        and ($2::text is null or exists (
          select 1 from event_ops_membership_heads h
           where h.workspace_id = r.workspace_id and h.event_id = $2 and h.status = 'rsvped'
             and (h.actor_id = r.payload->>'accountId' or h.actor_id = r.user_id)))
      order by r.created_at, r.record_id`,
    [workspaceId, eventId ?? null],
  );
  const candidates = rows.rows.filter((row) => {
    const fields = readMatchFields(row.payload?.publicProfile?.matchFields);
    if (!force && fields?.inferredAt) return false;
    const sources = fields?.sources ?? {};
    return !(sources.identity === "confirmed" && sources.businessCategoryIds === "confirmed" && sources.sellsTo === "confirmed");
  });
  const batch = candidates.slice(offset, offset + limit);
  console.info(`${tag} profiles=${rows.rows.length} candidates=${candidates.length} batch=${batch.length}`);

  const service = createMatchFieldsInferenceService();
  let inputTokens = 0;
  let outputTokens = 0;
  const counts = { conflict: 0, inferred: 0, insufficient: 0, unavailable: 0, written: 0 };
  const queue = [...batch];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const payload = row.payload ?? {};
      const pub = payload.publicProfile ?? {};
      const input: MatchFieldsInferenceInput = {
        bio: pub.bio ?? pub.selfIntroduction ?? null,
        headline: payload.headline ?? null,
        industry: pub.industry ?? null,
        offering: pub.offering ?? [],
        organization: payload.organization ?? null,
        primaryIndustryId: pub.primaryIndustryId ?? null,
        role: payload.role ?? null,
        secondaryIndustryId: pub.secondaryIndustryId ?? null,
        seeking: pub.seeking ?? [],
        seniorityLevel: pub.seniorityLevel ?? null,
      };
      const result = await service.infer(input);
      counts[result.status] += 1;
      inputTokens += result.usage?.inputTokens ?? 0;
      outputTokens += result.usage?.outputTokens ?? 0;
      const name = String(payload.displayName ?? "").slice(0, 20);
      const title = [payload.role, payload.headline].filter(Boolean).join(" | ").slice(0, 60);
      console.info(`${tag} P ${JSON.stringify({ name, title, status: result.status, ...result.fields })}`);
      if (!apply || result.status !== "inferred") continue;
      const now = new Date().toISOString();
      const next = mergeInferredMatchFields(readMatchFields(pub.matchFields), result.fields, now);
      const written = await pool.query(
        `update orbit_records
            set payload = jsonb_set(jsonb_set(payload, '{publicProfile}', coalesce(payload->'publicProfile', '{}'::jsonb)),
                                    '{publicProfile,matchFields}', $4::jsonb) || jsonb_build_object('updatedAt', $5::text),
                updated_at = $5::timestamptz
          where workspace_id = $1 and collection_name = 'profiles' and record_id = $2 and updated_at = $3::timestamptz`,
        [workspaceId, row.record_id, row.updated_at, JSON.stringify(next ?? {}), now],
      );
      if (written.rowCount === 1) counts.written += 1;
      else counts.conflict += 1;
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  console.info(`${tag} DONE ${JSON.stringify({ ...counts, inputTokens, outputTokens })}`);
  await pool.end();
}

main().catch((error) => {
  console.error(`${tag} FAILED ${(error as Error).message.slice(0, 200)}`);
  process.exitCode = 1;
});
