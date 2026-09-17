import { createHash } from "node:crypto";
import type { EventOperationsPostgresClient, EventOperationsSqlExecutor } from "../event-operations/storage/postgres-client";

export const REPAIR_DATABASE = "orbit_phoneweb_20260916";
export const REPAIR_WORKSPACE = "workspace:phoneweb-demo";
export const REPAIR_EVENT_IDS = [
  ...Array.from({ length: 10 }, (_, index) => `event_${String(index + 1).padStart(2, "0")}`),
  "event_signup_01", "event_signup_02", "event_signup_03",
] as const;

const configurationFields = [
  "check_in_opens_at", "event_starts_at", "event_ends_at", "profile_edit_deadline_at",
  "registration_cutoff_at", "results_available_at", "round_one_starts_at", "round_two_starts_at",
  "recommendation_count", "table_size", "shard_size", "max_attempts_per_task",
] as const;

export interface RepairEvent {
  workspace_id: string;
  event_id: string;
  organizer_actor_id: string;
  event_version: string;
  starts_at: string;
  ends_at: string;
  registration_migration_state: string;
  lifecycle_v2: string;
}

export interface RepairConfiguration {
  workspace_id: string;
  event_id: string;
  configuration_version: string;
  check_in_opens_at: string;
  event_starts_at: string;
  event_ends_at: string;
  profile_edit_deadline_at: string;
  registration_cutoff_at: string;
  results_available_at: string;
  round_one_starts_at: string;
  round_two_starts_at: string;
  recommendation_count: number;
  table_size: number;
  shard_size: number;
  max_attempts_per_task: number;
  created_at: string;
  updated_at: string;
}

export interface RepairHead {
  workspace_id: string;
  event_id: string;
  configuration_version: string;
  revision: string;
  updated_at: string;
}

export interface RepairSource {
  database: string;
  workspaceId: string;
  events: RepairEvent[];
  configurations: RepairConfiguration[];
  heads: RepairHead[];
  policies: { event_id: string; policy_version: string }[];
  maxVersions: { event_id: string; version: string }[];
}

export interface RepairChange {
  eventId: string;
  beforeHead: RepairHead | null;
  before: RepairConfiguration | null;
  after: RepairConfiguration;
  changedFields: readonly string[];
}

export interface RepairPlan {
  format: "phoneweb-registration-window-repair-v1";
  source: RepairSource;
  sourceHash: string;
  changes: RepairChange[];
  planHash: string;
}

export function repairDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    }
    return item;
  })).digest("hex");
}

export function requireRepairTarget(database: string, workspaceId: string): void {
  if (database !== REPAIR_DATABASE || workspaceId !== REPAIR_WORKSPACE) {
    throw new Error("Repair target database or workspace scope is not allowed.");
  }
}

function validateRepairSource(source: RepairSource): void {
  requireRepairTarget(source.database, source.workspaceId);
  if (source.events.length !== 13 || new Set(source.events.map((row) => row.event_id)).size !== 13) {
    throw new Error("Repair target set must contain exactly thirteen unique events.");
  }
  for (const event of source.events) {
    const index = REPAIR_EVENT_IDS.indexOf(event.event_id);
    const day = index < 10 ? index === 5 ? 16 : 17 + index % 6 : 25 + index - 10;
    const hour = index < 11 ? 1 : index === 11 ? 5 : 9;
    const startsAt = `2026-10-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
    const endsAt = `2026-10-${day}T${String(hour + 2).padStart(2, "0")}:00:00.000Z`;
    const expectedOwner = event.event_id === "event_signup_01" ? "user_mu3lykrb_sv4h84" : "user_orbit_primary_qa";
    if (index < 0 || event.workspace_id !== REPAIR_WORKSPACE || event.organizer_actor_id !== expectedOwner ||
        event.registration_migration_state !== "canonical" || event.lifecycle_v2 !== "published" ||
        event.starts_at !== startsAt || event.ends_at !== endsAt || !/^[1-9]\d*$/u.test(event.event_version)) {
      throw new Error("Repair catalogue target, dates, owner, or version do not match.");
    }
  }
  if (source.policies.length !== 0) throw new Error("Repair admission policy override is unsupported.");
  for (const rows of [source.heads, source.configurations, source.maxVersions]) {
    if (new Set(rows.map((row) => row.event_id)).size !== rows.length || rows.some((row) => !REPAIR_EVENT_IDS.includes(row.event_id))) {
      throw new Error("Repair configuration target set contains duplicates or unknown events.");
    }
  }
  for (const maximum of source.maxVersions) {
    if (!/^[1-9]\d*$/u.test(maximum.version) || !Number.isSafeInteger(Number(maximum.version)) || Number(maximum.version) >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Repair maximum configuration version is invalid.");
    }
  }
  for (const head of source.heads) {
    const configuration = source.configurations.find((row) => row.event_id === head.event_id);
    const maximum = source.maxVersions.find((row) => row.event_id === head.event_id);
    if (head.workspace_id !== REPAIR_WORKSPACE || !/^[1-9]\d*$/u.test(head.revision) ||
        !configuration || configuration.configuration_version !== head.configuration_version || !maximum ||
        Number(maximum.version) < Number(head.configuration_version)) {
      throw new Error("Repair configuration head or version is inconsistent.");
    }
  }
  for (const configuration of source.configurations) {
    if (configuration.workspace_id !== REPAIR_WORKSPACE || !source.heads.some((head) => head.event_id === configuration.event_id) ||
        !/^[1-9]\d*$/u.test(configuration.configuration_version) ||
        configurationFields.slice(0, 8).some((field) => !Number.isFinite(Date.parse(String(configuration[field])))) ||
        !Number.isInteger(configuration.recommendation_count) || configuration.recommendation_count < 1 ||
        !Number.isInteger(configuration.table_size) || configuration.table_size < 2 ||
        !Number.isInteger(configuration.shard_size) || configuration.shard_size < 1 ||
        !Number.isInteger(configuration.max_attempts_per_task) || configuration.max_attempts_per_task < 1) {
      throw new Error("Repair configuration values or version are invalid.");
    }
  }
  if (!source.configurations.some((row) => row.event_id === "event_signup_01")) {
    throw new Error("Repair configuration template is missing.");
  }
}

function configurationEquals(left: RepairConfiguration, right: RepairConfiguration): boolean {
  return configurationFields.every((field) => left[field] === right[field]);
}

function projectRepairConfiguration(event: RepairEvent, before: RepairConfiguration): RepairConfiguration {
  const after = { ...before, event_id: event.event_id };
  const start = Date.parse(event.starts_at);
  const oldStart = Date.parse(before.event_starts_at);
  for (const field of ["check_in_opens_at", "results_available_at", "round_one_starts_at", "round_two_starts_at"] as const) {
    after[field] = new Date(start + Date.parse(before[field]) - oldStart).toISOString();
  }
  after.event_starts_at = event.starts_at;
  after.event_ends_at = event.ends_at;
  after.profile_edit_deadline_at = new Date(start - 600_000).toISOString();
  after.registration_cutoff_at = new Date(start - 300_000).toISOString();
  if (Date.parse(after.check_in_opens_at) > Date.parse(after.event_ends_at) ||
      Date.parse(after.registration_cutoff_at) > Date.parse(after.results_available_at) ||
      Date.parse(after.results_available_at) > Date.parse(after.round_one_starts_at) ||
      start > Date.parse(after.round_one_starts_at) ||
      Date.parse(after.round_one_starts_at) >= Date.parse(after.round_two_starts_at) ||
      Date.parse(after.round_two_starts_at) > Date.parse(after.event_ends_at)) {
    throw new Error("Repair configuration relative timing cannot align safely.");
  }
  return after;
}

export function buildPhonewebRegistrationWindowRepairPlan(input: RepairSource): RepairPlan {
  validateRepairSource(input);
  const source = structuredClone(input);
  const template = source.configurations.find((row) => row.event_id === "event_signup_01")!;
  const changes: RepairChange[] = [];
  for (const eventId of REPAIR_EVENT_IDS) {
    const event = source.events.find((row) => row.event_id === eventId)!;
    const before = source.configurations.find((row) => row.event_id === eventId) ?? null;
    const after = projectRepairConfiguration(event, before ?? template);
    if (before && configurationEquals(before, after)) continue;
    after.configuration_version = String(Number(source.maxVersions.find((row) => row.event_id === eventId)?.version ?? 0) + 1);
    changes.push({ eventId, beforeHead: source.heads.find((row) => row.event_id === eventId) ?? null, before, after,
      changedFields: configurationFields.filter((field) => !before || before[field] !== after[field]),
    });
  }
  const plan = { format: "phoneweb-registration-window-repair-v1" as const, source, sourceHash: repairDigest(source), changes };
  return { ...plan, planHash: repairDigest(plan) };
}

export interface RepairReceipt {
  plan: RepairPlan;
  applied: RepairHead[];
  alreadyApplied: boolean;
}

export async function readPhonewebRegistrationWindowRepairSource(client: EventOperationsSqlExecutor): Promise<RepairSource> {
  const result = await client.query<RepairSource & { host: string; port: number; schema: string }>(`
    select current_database() as database, $1::text as "workspaceId",
      host(inet_server_addr()) as host, inet_server_port() as port,current_schema() as schema,
      coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('event_version',e.event_version::text,'lifecycle_v2',e.lifecycle_state_v2) order by e.event_id)
        from event_ops_events e where workspace_id=$1 and event_id=any($2::text[])), '[]') as events,
      coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('configuration_version',c.configuration_version::text) order by c.event_id)
        from event_ops_configurations c join event_ops_configuration_heads h using(workspace_id,event_id,configuration_version)
        where c.workspace_id=$1 and c.event_id=any($2::text[])), '[]') as configurations,
      coalesce((select jsonb_agg(to_jsonb(h) || jsonb_build_object('configuration_version',h.configuration_version::text,'revision',h.revision::text) order by h.event_id)
        from event_ops_configuration_heads h where workspace_id=$1 and event_id=any($2::text[])), '[]') as heads,
      coalesce((select jsonb_agg(jsonb_build_object('event_id',event_id,'policy_version',policy_version::text) order by event_id)
        from event_ops_admission_policy_heads where workspace_id=$1 and event_id=any($2::text[])), '[]') as policies,
      coalesce((select jsonb_agg(to_jsonb(v) order by event_id) from
        (select event_id,max(configuration_version)::text as version from event_ops_configurations
         where workspace_id=$1 and event_id=any($2::text[]) group by event_id) v), '[]') as "maxVersions"
  `, [REPAIR_WORKSPACE, REPAIR_EVENT_IDS]);
  const row = result.rows[0];
  if (!row || row.host !== "127.0.0.1" || ![5432, 35434].includes(row.port)) throw new Error("Repair database target must be the approved local PostgreSQL server.");
  requireRepairTarget(row.database, row.workspaceId);
  if ((row.port === 5432 && row.schema !== "public") || (row.port === 35434 && !/^sprint0064_[a-f0-9]{32}$/u.test(row.schema))) {
    throw new Error("Repair database schema target is not approved.");
  }
  if (row.port === 35434) {
    const identity = await client.query<{ actor: string; directory: string; marker: string }>(
      "select current_user as actor,current_setting('data_directory') as directory,(select marker from public.root_sprint0064_test_marker) as marker");
    if (identity.rows.length !== 1 || identity.rows[0]!.actor !== "orbit_registration_repair" ||
        identity.rows[0]!.directory !== "/Volumes/ORICO/Dev/cache/orbit-sprint0064-pg.lQhm4Z/data" ||
        identity.rows[0]!.marker !== "ROOT-owned-0064-lQhm4Z") throw new Error("Repair isolated database identity is not ROOT-attested.");
  }
  // Normalize only actual timestamp columns, not text content that resembles a date.
  const source: RepairSource = JSON.parse(JSON.stringify({ database: row.database, workspaceId: row.workspaceId,
    events: row.events, configurations: row.configurations, heads: row.heads, policies: row.policies, maxVersions: row.maxVersions,
  }, (key, value: unknown) => key.endsWith("_at") && typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value));
  return source;
}

async function withRepairTransaction<T>(client: EventOperationsPostgresClient, operation: (transaction: EventOperationsSqlExecutor) => Promise<T>): Promise<T> {
  return client.transaction(async (transaction) => {
    const identity = await transaction.query<{ database: string }>("select current_database() as database");
    requireRepairTarget(identity.rows[0]?.database ?? "", REPAIR_WORKSPACE);
    await transaction.query("set local lock_timeout='5s'");
    await transaction.query("set local statement_timeout='30s'");
    // Missing heads/policies need a phantom-safe boundary, not only existing-row locks.
    await transaction.query("select event_id from event_ops_events where workspace_id=$1 and event_id=any($2::text[]) order by event_id for update", [REPAIR_WORKSPACE, REPAIR_EVENT_IDS]);
    // Existing saveConfiguration locks the event before its head: retain that order.
    await transaction.query("lock table event_ops_configuration_heads,event_ops_configurations,event_ops_admission_policy_heads in share row exclusive mode");
    return operation(transaction);
  });
}

export async function applyPhonewebRegistrationWindowRepair(client: EventOperationsPostgresClient, input: RepairPlan): Promise<RepairReceipt> {
  const plan = structuredClone(input);
  if (repairDigest(buildPhonewebRegistrationWindowRepairPlan(plan.source)) !== repairDigest(plan)) throw new Error("Repair reviewed configuration plan hash is invalid.");
  return withRepairTransaction(client, async (transaction) => {
    const source = await readPhonewebRegistrationWindowRepairSource(transaction);
    validateRepairSource(source);
    const audits = await transaction.query<{ event_id: string; after_payload: { planHash: string; head: RepairHead } }>(
      "select event_id,after_payload from event_ops_audit_log where workspace_id=$1 and audit_id=any($2::text[]) order by event_id",
      [REPAIR_WORKSPACE, plan.changes.map((change) => `audit:phoneweb-registration-repair:${plan.planHash}:${change.eventId}`)],
    );
    if (audits.rows.length) {
      if (audits.rows.length !== plan.changes.length || repairDigest(source.events) !== repairDigest(plan.source.events) ||
          plan.changes.some((change) => {
            const audit = audits.rows.find((row) => row.event_id === change.eventId);
            const head = source.heads.find((row) => row.event_id === change.eventId);
            const configuration = source.configurations.find((row) => row.event_id === change.eventId);
            const maximum = source.maxVersions.find((row) => row.event_id === change.eventId);
            return !audit || audit.after_payload.planHash !== plan.planHash || repairDigest(head) !== repairDigest(audit.after_payload.head) ||
              !configuration || configuration.configuration_version !== change.after.configuration_version || !configurationEquals(configuration, change.after) ||
              maximum?.version !== change.after.configuration_version;
          }) || plan.source.configurations.some((configuration) => !plan.changes.some((change) => change.eventId === configuration.event_id) &&
            repairDigest(source.configurations.find((row) => row.event_id === configuration.event_id)) !== repairDigest(configuration))) {
        throw new Error("Repair idempotency version conflict; another update must not be overwritten.");
      }
      return { plan, applied: audits.rows.map((row) => row.after_payload.head), alreadyApplied: true };
    }
    if (repairDigest(source) !== plan.sourceHash) throw new Error("Repair source version conflict; regenerate and review the preview.");
    const applied: RepairHead[] = [];
    for (const change of plan.changes) {
      const after = change.after;
      await transaction.query(`insert into event_ops_configurations (
        workspace_id,event_id,configuration_version,${configurationFields.join(",")},created_at,updated_at
        ) values ($1,$2,$3,${configurationFields.map((_field, index) => `$${index + 4}`).join(",")},date_trunc('milliseconds',statement_timestamp()),date_trunc('milliseconds',statement_timestamp()))`,
        [REPAIR_WORKSPACE, change.eventId, after.configuration_version, ...configurationFields.map((field) => after[field])]);
      const headResult = change.beforeHead ? await transaction.query<RepairHead>(`
        update event_ops_configuration_heads set configuration_version=$3,revision=revision+1,updated_at=date_trunc('milliseconds',statement_timestamp())
         where workspace_id=$1 and event_id=$2 and configuration_version=$4 and revision=$5 and updated_at=$6::timestamptz
         returning workspace_id,event_id,configuration_version::text,revision::text,updated_at`,
        [REPAIR_WORKSPACE, change.eventId, after.configuration_version, change.beforeHead.configuration_version, change.beforeHead.revision, change.beforeHead.updated_at]) :
        await transaction.query<RepairHead>(`insert into event_ops_configuration_heads(workspace_id,event_id,configuration_version,revision,updated_at)
          values($1,$2,$3,1,date_trunc('milliseconds',statement_timestamp())) on conflict do nothing
          returning workspace_id,event_id,configuration_version::text,revision::text,updated_at`, [REPAIR_WORKSPACE, change.eventId, after.configuration_version]);
      if (headResult.rowCount !== 1) throw new Error("Repair configuration head version conflict.");
      const head: RepairHead = JSON.parse(JSON.stringify(headResult.rows[0]));
      await transaction.query(`insert into event_ops_audit_log(workspace_id,audit_id,event_id,actor_id,action,aggregate_type,aggregate_id,before_payload,after_payload,evidence_ids,occurred_at)
        values($1,$2,$3,null,'phoneweb_registration_window_repair','event_configuration',$3,$4::jsonb,$5::jsonb,'{}',statement_timestamp())`,
        [REPAIR_WORKSPACE, `audit:phoneweb-registration-repair:${plan.planHash}:${change.eventId}`, change.eventId,
          JSON.stringify({ head: change.beforeHead }), JSON.stringify({ planHash: plan.planHash, head })]);
      applied.push(head);
    }
    return { plan, applied, alreadyApplied: plan.changes.length === 0 };
  });
}

export async function rollbackPhonewebRegistrationWindowRepair(client: EventOperationsPostgresClient, input: RepairReceipt): Promise<void> {
  const receipt = structuredClone(input);
  const plan = receipt.plan;
  if (repairDigest(buildPhonewebRegistrationWindowRepairPlan(plan.source)) !== repairDigest(plan) || receipt.applied.length !== plan.changes.length ||
      new Set(receipt.applied.map((head) => head.event_id)).size !== receipt.applied.length) throw new Error("Repair rollback configuration receipt is invalid.");
  await withRepairTransaction(client, async (transaction) => {
    const source = await readPhonewebRegistrationWindowRepairSource(transaction);
    if (source.policies.length || repairDigest(source.events) !== repairDigest(plan.source.events)) throw new Error("Repair rollback catalogue or policy conflict.");
    // Check every head before altering any: one mismatch aborts the whole rollback.
    for (const change of plan.changes) {
      const expected = receipt.applied.find((head) => head.event_id === change.eventId);
      const current = source.heads.find((head) => head.event_id === change.eventId);
      const configuration = source.configurations.find((row) => row.event_id === change.eventId);
      const audit = await transaction.query<{ after_payload: { planHash: string; head: RepairHead } }>(
        "select after_payload from event_ops_audit_log where workspace_id=$1 and audit_id=$2", [REPAIR_WORKSPACE, `audit:phoneweb-registration-repair:${plan.planHash}:${change.eventId}`]);
      if (!expected || repairDigest(expected) !== repairDigest(current) || audit.rows.length !== 1 ||
          audit.rows[0]!.after_payload.planHash !== plan.planHash || repairDigest(audit.rows[0]!.after_payload.head) !== repairDigest(expected) ||
          !configuration || !configurationEquals(configuration, change.after)) throw new Error("Repair rollback exact head version conflict.");
      if (change.before) {
        const historical = await transaction.query<RepairConfiguration>("select * from event_ops_configurations where workspace_id=$1 and event_id=$2 and configuration_version=$3",
          [REPAIR_WORKSPACE, change.eventId, change.before.configuration_version]);
        const stored: RepairConfiguration | undefined = historical.rows[0] && JSON.parse(JSON.stringify(historical.rows[0]));
        if (historical.rows.length !== 1 || repairDigest(stored) !== repairDigest(change.before)) throw new Error("Repair rollback historical configuration version conflict.");
      }
    }
    for (const change of plan.changes) {
      const expected = receipt.applied.find((head) => head.event_id === change.eventId)!;
      const before = change.beforeHead;
      const result = before ? await transaction.query(`update event_ops_configuration_heads set configuration_version=$3,revision=$4,updated_at=$5
        where workspace_id=$1 and event_id=$2 and configuration_version=$6 and revision=$7 and updated_at=$8`,
        [REPAIR_WORKSPACE, change.eventId, before.configuration_version, before.revision, before.updated_at, expected.configuration_version, expected.revision, expected.updated_at]) :
        await transaction.query("delete from event_ops_configuration_heads where workspace_id=$1 and event_id=$2 and configuration_version=$3 and revision=$4 and updated_at=$5",
          [REPAIR_WORKSPACE, change.eventId, expected.configuration_version, expected.revision, expected.updated_at]);
      if (result.rowCount !== 1) throw new Error("Repair rollback head CAS conflict.");
      // Remove newly introduced pointers only; immutable configuration/audit history is retained.
      await transaction.query(`insert into event_ops_audit_log(workspace_id,audit_id,event_id,actor_id,action,aggregate_type,aggregate_id,before_payload,after_payload,evidence_ids,occurred_at)
        values($1,$2,$3,null,'phoneweb_registration_window_repair_rollback','event_configuration',$3,$4::jsonb,$5::jsonb,'{}',statement_timestamp())`,
        [REPAIR_WORKSPACE, `audit:phoneweb-registration-repair:${plan.planHash}:rollback:${change.eventId}`, change.eventId, JSON.stringify({ head: expected }), JSON.stringify({ head: before })]);
    }
  });
}
