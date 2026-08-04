import { createHash } from "node:crypto";

import type { EventOperationsSqlExecutor } from "../../event-operations/storage/postgres-client";
import { withCanonicalMembershipMigrationSnapshot } from "../canonical-migration/snapshot-runner";
import {
  PROFILE_CONTRACT_REPAIR_EVENT_TYPE,
  parseProfileContractRepairAuditOutboxPayload,
  type ProfileContractRepairAuditOutboxPayload,
} from "./audit-outbox-contract";
import {
  type ApplyProfileContractRepairResult,
  parseApplyProfileContractRepairCommand,
  ProfileContractRepairApplyError,
} from "./apply-contract";
import {
  profileRepairHash,
  profileRepairToken,
  stableProfileRepairValue,
  type ProfileContractRepairTargetFact,
} from "./contract";
import {
  PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
  PROFILE_CONTRACT_REPAIR_TYPE,
  type ProfileContractRepairRemovedPath,
} from "./ledger-contract";
import { buildProfileContractRepairPlan } from "./planner";
import { readProfileContractRepairSource } from "./source-reader";
import { transformCanonicalProfileAnswerMaps } from "./transform";

type Row = Record<string, unknown>;
interface AppliedItem {
  auditId: string;
  auditPayload: ProfileContractRepairAuditOutboxPayload;
  afterMembershipHash: string;
  afterProfileHash: string;
  beforeMembershipHash: string;
  outboxId: string;
  payload: Record<string, unknown>;
  row: Row;
  responseCount: number;
  target: ProfileContractRepairTargetFact;
  token: string;
}

function storedHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableProfileRepairValue(value)))
    .digest("hex");
}

function timestamp(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.valueOf())) fail("PROFILE_CONTRACT_REPAIR_SOURCE_DRIFT");
  return parsed.toISOString();
}

function positive(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail("PROFILE_CONTRACT_REPAIR_SOURCE_DRIFT");
  return parsed;
}

function membershipProvenance(row: Row): {
  admissionApplicationVersion: number | null;
  origin: "admission_application" | "legacy_registration";
} {
  if (row.origin === "legacy_registration" && row.admission_application_version === null) {
    return { admissionApplicationVersion: null, origin: "legacy_registration" };
  }
  if (row.origin === "admission_application") {
    return {
      admissionApplicationVersion: positive(row.admission_application_version),
      origin: "admission_application",
    };
  }
  fail("PROFILE_CONTRACT_REPAIR_SOURCE_DRIFT");
}

function fail(code: string): never {
  throw new ProfileContractRepairApplyError(code);
}

function sqlState(error: unknown): string | null {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

async function existingRun(executor: EventOperationsSqlExecutor, workspaceId: string, repairId: string) {
  return (await executor.query<Row>(
    `select repair_type, schema_version, plan_hash, expected_count, result_hash
       from event_ops_data_repair_runs
      where workspace_id = $1 and repair_id = $2`,
    [workspaceId, repairId],
  )).rows[0] ?? null;
}

function replayResult(row: Row, expectedCount: number, expectedPlanHash: string): ApplyProfileContractRepairResult {
  if (
    row.repair_type !== PROFILE_CONTRACT_REPAIR_TYPE ||
    Number(row.schema_version) !== PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION ||
    Number(row.expected_count) !== expectedCount ||
    row.plan_hash !== expectedPlanHash ||
    typeof row.result_hash !== "string"
  ) fail("PROFILE_CONTRACT_REPAIR_REPLAY_MISMATCH");
  return Object.freeze({
    count: expectedCount,
    planHash: expectedPlanHash,
    resultHash: row.result_hash,
    status: "already_applied" as const,
  });
}

async function lockScope(executor: EventOperationsSqlExecutor, workspaceId: string, repairId: string) {
  const actors = await executor.query<{ actor_id: string; event_id: string }>(
    `select membership.actor_id, membership.event_id
       from event_ops_membership_heads membership
       join event_ops_events event_row using (workspace_id, event_id)
      where membership.workspace_id = $1
        and event_row.registration_migration_state = 'canonical'
      order by membership.event_id collate "C", membership.actor_id collate "C"`,
    [workspaceId],
  );
  for (const actor of actors.rows) {
    await executor.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `event-operations-registration:${workspaceId}:${actor.event_id}:${actor.actor_id}`,
    ]);
  }
  await executor.query(
    `select event_id from event_ops_events
      where workspace_id = $1 and registration_migration_state = 'canonical'
      order by event_id collate "C" for update`, [workspaceId],
  );
  await executor.query(
    `select event_id from event_ops_configuration_heads where workspace_id = $1
      order by event_id collate "C" for update`, [workspaceId],
  );
  await executor.query(
    `select configuration.event_id, configuration.configuration_version
       from event_ops_configurations configuration
       join event_ops_configuration_heads head
         on head.workspace_id=configuration.workspace_id
        and head.event_id=configuration.event_id
        and head.configuration_version=configuration.configuration_version
      where configuration.workspace_id=$1
      order by configuration.event_id collate "C" for update of configuration`, [workspaceId],
  );
  await executor.query(
    `select event_id, actor_id from event_ops_membership_heads where workspace_id = $1
      order by event_id collate "C", actor_id collate "C" for update`, [workspaceId],
  );
  await executor.query(
    `select event_id, participant_id from event_ops_profile_heads where workspace_id = $1
      order by event_id collate "C", participant_id collate "C" for update`, [workspaceId],
  );
}

async function targetRows(executor: EventOperationsSqlExecutor, workspaceId: string) {
  return (await executor.query<Row>(
    `select mh.event_id, mh.actor_id, mh.participant_id, mh.membership_version,
            mh.profile_version, mh.status, mh.revision as membership_head_revision,
            ph.revision as profile_head_revision, pv.profile_payload, pv.profile_hash,
            mv.registered_at, mv.cancelled_at, mv.reactivated_at,
            mv.effective_at as membership_effective_at,
            mv.late_registration, mv.source_registration_id,
            mv.origin, mv.admission_application_version
       from event_ops_membership_heads mh
       join event_ops_profile_heads ph on ph.workspace_id=mh.workspace_id
        and ph.event_id=mh.event_id and ph.participant_id=mh.participant_id
       join event_ops_profile_versions pv on pv.workspace_id=ph.workspace_id
        and pv.event_id=ph.event_id and pv.participant_id=ph.participant_id
        and pv.profile_version=ph.profile_version
       join event_ops_membership_versions mv on mv.workspace_id=mh.workspace_id
        and mv.event_id=mh.event_id and mv.actor_id=mh.actor_id
        and mv.membership_version=mh.membership_version
       join event_ops_events e on e.workspace_id=mh.workspace_id and e.event_id=mh.event_id
      where mh.workspace_id=$1 and e.registration_migration_state='canonical'
      order by mh.event_id collate "C", mh.actor_id collate "C"`, [workspaceId],
  )).rows;
}

async function applyTransaction(
  executor: EventOperationsSqlExecutor,
  snapshot: Parameters<typeof readProfileContractRepairSource>[0]["snapshot"],
  command: ReturnType<typeof parseApplyProfileContractRepairCommand>,
): Promise<ApplyProfileContractRepairResult> {
  await executor.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `event-profile-contract-repair:${command.workspaceId}:${command.repairId}`,
  ]);
  const prior = await existingRun(executor, command.workspaceId, command.repairId);
  if (prior) return replayResult(prior, command.expectedCount, command.expectedPlanHash);
  await executor.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `event-profile-contract-repair-plan:${command.workspaceId}:${PROFILE_CONTRACT_REPAIR_TYPE}:${command.expectedPlanHash}`,
  ]);
  const duplicate = (await executor.query<Row>(
    `select repair_id from event_ops_data_repair_runs
      where workspace_id=$1 and repair_type=$2 and plan_hash=$3`,
    [command.workspaceId, PROFILE_CONTRACT_REPAIR_TYPE, command.expectedPlanHash],
  )).rows[0];
  if (duplicate) fail("PROFILE_CONTRACT_REPAIR_PLAN_ALREADY_APPLIED");
  await lockScope(executor, command.workspaceId, command.repairId);

  const source = await readProfileContractRepairSource({ snapshot, workspaceId: command.workspaceId });
  const plan = buildProfileContractRepairPlan(source);
  if (!plan.applyEligible || plan.applyPlanHash !== command.expectedPlanHash || plan.targetCount !== command.expectedCount) {
    fail("PROFILE_CONTRACT_REPAIR_PLAN_DRIFT");
  }
  const eventEvidence = new Map(plan.events.map((event) => [event.eventId, event]));
  const planned = new Map(plan.targets.map((target) => [target.targetToken, target]));
  const rows = await targetRows(executor, command.workspaceId);
  const selected = rows.flatMap((row) => {
    const eventId = String(row.event_id);
    const participantId = String(row.participant_id);
    const token = profileRepairToken("profile-target", `${command.workspaceId}\0${eventId}\0${participantId}`);
    const target = planned.get(token);
    return target ? [{ row, target, token }] : [];
  });
  if (selected.length !== command.expectedCount) fail("PROFILE_CONTRACT_REPAIR_TARGET_DRIFT");
  const now = timestamp((await executor.query<Row>(`select statement_timestamp() as value`)).rows[0]?.value);

  const items: AppliedItem[] = [];
  for (const { row, target, token } of selected) {
    const provenance = membershipProvenance(row);
    const payload = structuredClone(row.profile_payload) as Record<string, unknown>;
    const participant = payload.participant as Record<string, unknown>;
    const registration = payload.registrationProfile as Record<string, unknown>;
    const transformed = transformCanonicalProfileAnswerMaps({
      participantAnswers: participant.profileAnswers,
      registrationAnswers: registration.answers,
    });
    if (transformed.kind !== "candidate") fail("PROFILE_CONTRACT_REPAIR_TARGET_DRIFT");
    if (transformed.afterParticipantAnswers !== null) participant.profileAnswers = transformed.afterParticipantAnswers;
    registration.answers = transformed.afterRegistrationAnswers;
    const afterPlanHash = profileRepairHash("canonical-profile-contract-repair:profile-payload-after:v1", payload);
    const beforePlanHash = profileRepairHash("canonical-profile-contract-repair:profile-payload-before:v1", row.profile_payload);
    const lifecycleHash = profileRepairHash("canonical-profile-contract-repair:lifecycle:v2", {
      admissionApplicationVersion: provenance.admissionApplicationVersion,
      cancelledAt: row.cancelled_at ? timestamp(row.cancelled_at) : null,
      effectiveAt: timestamp(row.membership_effective_at), lateRegistration: row.late_registration,
      origin: provenance.origin,
      reactivatedAt: row.reactivated_at ? timestamp(row.reactivated_at) : null,
      registeredAt: timestamp(row.registered_at), sourceRegistrationId: row.source_registration_id,
      status: row.status,
    });
    if (
      target.profileVersion !== positive(row.profile_version) ||
      target.membershipVersion !== positive(row.membership_version) ||
      target.profileHeadRevision !== positive(row.profile_head_revision) ||
      target.membershipHeadRevision !== positive(row.membership_head_revision) ||
      target.beforeProfilePayloadHash !== beforePlanHash ||
      target.lifecycleHash !== lifecycleHash ||
      target.afterProfilePayloadHash !== afterPlanHash ||
      JSON.stringify(target.deletionPaths) !== JSON.stringify(transformed.deletionPaths)
    ) fail("PROFILE_CONTRACT_REPAIR_TARGET_DRIFT");
    const afterProfileHash = storedHash(payload);
    const beforeMembershipHash = profileRepairHash("canonical-profile-contract-repair:membership-before:v1", {
      membershipVersion: target.membershipVersion, profileVersion: target.profileVersion,
      status: row.status, registeredAt: timestamp(row.registered_at), cancelledAt: row.cancelled_at ? timestamp(row.cancelled_at) : null,
      reactivatedAt: row.reactivated_at ? timestamp(row.reactivated_at) : null, lateRegistration: row.late_registration,
      sourceRegistrationId: row.source_registration_id, origin: provenance.origin,
      admissionApplicationVersion: provenance.admissionApplicationVersion,
    });
    const afterMembershipHash = profileRepairHash("canonical-profile-contract-repair:membership-after:v1", {
      membershipVersion: target.membershipVersion + 1, profileVersion: target.profileVersion + 1,
      status: row.status, registeredAt: timestamp(row.registered_at), cancelledAt: row.cancelled_at ? timestamp(row.cancelled_at) : null,
      reactivatedAt: row.reactivated_at ? timestamp(row.reactivated_at) : null, lateRegistration: row.late_registration,
      sourceRegistrationId: row.source_registration_id, origin: provenance.origin,
      admissionApplicationVersion: provenance.admissionApplicationVersion,
    });
    const responseRows = (await executor.query<Row>(
      `select response_id,field_key,visibility,question_source,response_payload,
              answered_at,created_at as response_created_at
         from event_ops_profile_response_versions
        where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4
        order by response_id collate "C" for share`,
      [command.workspaceId,row.event_id,row.participant_id,target.profileVersion],
    )).rows;
    const responseHash = profileRepairHash("canonical-profile-contract-repair:responses:v1", responseRows.map((response) => ({
      answeredAt: timestamp(response.answered_at), createdAt: timestamp(response.response_created_at),
      field: response.field_key, payload: response.response_payload,
      questionSource: response.question_source, responseId: response.response_id, visibility: response.visibility,
    })));
    if (responseHash !== target.responsesHash) fail("PROFILE_CONTRACT_REPAIR_RESPONSE_DRIFT");
    const event = eventEvidence.get(target.eventId);
    if (!event) fail("PROFILE_CONTRACT_REPAIR_EVENT_EVIDENCE_MISSING");
    const auditId = `audit:profile-repair:${encodeURIComponent(command.repairId)}:${token}`;
    const outboxId = `outbox:profile-repair:${encodeURIComponent(command.repairId)}:${token}`;
    const auditPayload: ProfileContractRepairAuditOutboxPayload = {
      activationAuditFingerprint:event.activationAuditFingerprint,afterMembershipHash,afterProfileHash,
      beforeMembershipHash,beforeProfileHash:String(row.profile_hash),configurationVersion:event.configurationVersion,
      eventContentHash:event.contentHash,eventId:String(row.event_id),eventVersion:event.eventVersion,occurredAt:now,
      planHash:command.expectedPlanHash,preservedStatus:row.status as "cancelled"|"rsvped",
      profileEditDeadlineAt:event.profileEditDeadlineAt,removedPaths:target.deletionPaths as readonly ProfileContractRepairRemovedPath[],
      repairId:command.repairId,repairType:PROFILE_CONTRACT_REPAIR_TYPE,schemaVersion:PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
      sourceMembershipVersion:target.membershipVersion,sourceProfileVersion:target.profileVersion,
      targetMembershipVersion:target.membershipVersion+1,targetProfileVersion:target.profileVersion+1,targetToken:token,
    };
    if (!parseProfileContractRepairAuditOutboxPayload(auditPayload).ok) fail("PROFILE_CONTRACT_REPAIR_AUDIT_CONTRACT_INVALID");
    items.push({ row,target,token,payload,afterProfileHash,beforeMembershipHash,afterMembershipHash,
      auditId,auditPayload,outboxId,responseCount:responseRows.length });
  }
  items.sort((left,right) => left.target.eventId < right.target.eventId ? -1 : left.target.eventId > right.target.eventId ? 1 : left.token < right.token ? -1 : left.token > right.token ? 1 : 0);
  const resultHash = profileRepairHash("canonical-profile-contract-repair:apply-result:v1", items.map((item) => ({
    auditId: item.auditId,
    eventId: item.target.eventId,
    outboxId: item.outboxId,
    targetToken: item.token,
    sourceProfileVersion: item.target.profileVersion, targetProfileVersion: item.target.profileVersion + 1,
    sourceMembershipVersion: item.target.membershipVersion, targetMembershipVersion: item.target.membershipVersion + 1,
    beforeProfileHash: item.row.profile_hash, afterProfileHash: item.afterProfileHash,
    beforeMembershipHash: item.beforeMembershipHash, afterMembershipHash: item.afterMembershipHash,
    removedPaths: item.target.deletionPaths,
  })));
  await executor.query(
    `insert into event_ops_data_repair_runs (workspace_id,repair_id,repair_type,schema_version,plan_hash,expected_count,result_hash,applied_at,created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [command.workspaceId, command.repairId, PROFILE_CONTRACT_REPAIR_TYPE, PROFILE_CONTRACT_REPAIR_LEDGER_SCHEMA_VERSION,
      command.expectedPlanHash, command.expectedCount, resultHash, now],
  );
  for (const item of items) await writeItem(executor, command, item, now);
  return Object.freeze({ count: command.expectedCount, planHash: command.expectedPlanHash, resultHash, status: "applied" as const });
}

async function writeItem(
  executor: EventOperationsSqlExecutor,
  command: ReturnType<typeof parseApplyProfileContractRepairCommand>,
  item: AppliedItem,
  now: string,
) {
  const { row, target, token, payload } = item;
  const profileVersion = target.profileVersion + 1;
  const membershipVersion = target.membershipVersion + 1;
  await executor.query(
    `insert into event_ops_profile_versions (workspace_id,event_id,participant_id,profile_version,actor_id,profile_payload,profile_hash,source_registration_id,effective_at,created_at)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$9)`,
    [command.workspaceId,row.event_id,row.participant_id,profileVersion,row.actor_id,JSON.stringify(payload),item.afterProfileHash,row.source_registration_id,now],
  );
  const copiedResponses = await executor.query(
    `insert into event_ops_profile_response_versions (workspace_id,event_id,participant_id,profile_version,response_id,field_key,visibility,question_source,response_payload,answered_at,created_at)
     select workspace_id,event_id,participant_id,$5,response_id,field_key,visibility,question_source,response_payload,answered_at,created_at
       from event_ops_profile_response_versions where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4`,
    [command.workspaceId,row.event_id,row.participant_id,target.profileVersion,profileVersion],
  );
  if (copiedResponses.rowCount !== item.responseCount) fail("PROFILE_CONTRACT_REPAIR_RESPONSE_COPY_FAILED");
  const ph = await executor.query(
    `update event_ops_profile_heads set profile_version=$5,revision=revision+1,updated_at=$6
      where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4 and revision=$7`,
    [command.workspaceId,row.event_id,row.participant_id,target.profileVersion,profileVersion,now,target.profileHeadRevision],
  );
  if (ph.rowCount !== 1) fail("PROFILE_CONTRACT_REPAIR_HEAD_DRIFT");
  await executor.query(
    `insert into event_ops_membership_versions (workspace_id,event_id,actor_id,membership_version,participant_id,profile_version,status,registered_at,cancelled_at,reactivated_at,late_registration,source_registration_id,effective_at,created_at,origin,admission_application_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15)`,
    [command.workspaceId,row.event_id,row.actor_id,membershipVersion,row.participant_id,profileVersion,row.status,row.registered_at,row.cancelled_at,row.reactivated_at,row.late_registration,row.source_registration_id,now,row.origin,row.admission_application_version],
  );
  const mh = await executor.query(
    `update event_ops_membership_heads set membership_version=$5,profile_version=$6,revision=revision+1,updated_at=$7
      where workspace_id=$1 and event_id=$2 and actor_id=$3 and membership_version=$4 and revision=$8`,
    [command.workspaceId,row.event_id,row.actor_id,target.membershipVersion,membershipVersion,profileVersion,now,target.membershipHeadRevision],
  );
  if (mh.rowCount !== 1) fail("PROFILE_CONTRACT_REPAIR_HEAD_DRIFT");
  await executor.query(
    `insert into event_ops_audit_log (workspace_id,audit_id,event_id,actor_id,action,aggregate_type,aggregate_id,before_payload,after_payload,evidence_ids,occurred_at)
     values ($1,$2,$3,null,$4,'event_participant_profile',$5,null,$6::jsonb,'{}',$7)`,
    [command.workspaceId,item.auditId,row.event_id,PROFILE_CONTRACT_REPAIR_EVENT_TYPE,token,JSON.stringify(item.auditPayload),now],
  );
  await executor.query(
    `insert into event_ops_outbox (workspace_id,outbox_id,event_id,aggregate_type,aggregate_id,event_type,payload,status,attempts,available_at,created_at,updated_at)
     values ($1,$2,$3,'event_participant_profile',$4,$5,$6::jsonb,'pending',0,$7,$7,$7)`,
    [command.workspaceId,item.outboxId,row.event_id,token,PROFILE_CONTRACT_REPAIR_EVENT_TYPE,JSON.stringify(item.auditPayload),now],
  );
  await executor.query(
    `insert into event_ops_data_repair_items (workspace_id,repair_id,event_id,actor_id,participant_id,source_profile_version,target_profile_version,source_membership_version,target_membership_version,before_profile_hash,after_profile_hash,before_membership_hash,after_membership_hash,removed_paths,created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [command.workspaceId,command.repairId,row.event_id,row.actor_id,row.participant_id,target.profileVersion,profileVersion,target.membershipVersion,membershipVersion,row.profile_hash,item.afterProfileHash,item.beforeMembershipHash,item.afterMembershipHash,target.deletionPaths,now],
  );
}

export async function applyProfileContractRepair(input: unknown): Promise<ApplyProfileContractRepairResult> {
  const command = parseApplyProfileContractRepairCommand(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await withCanonicalMembershipMigrationSnapshot({
        connectionString: command.connectionString,
        isolation: "serializable",
        operation: async (snapshot) => applyTransaction(snapshot.executor, snapshot, command),
      });
    } catch (error) {
      if (error instanceof ProfileContractRepairApplyError) throw error;
      if ((sqlState(error) === "40001" || sqlState(error) === "40P01") && attempt < 2) continue;
      throw new ProfileContractRepairApplyError(
        sqlState(error) === "40001" || sqlState(error) === "40P01"
          ? "PROFILE_CONTRACT_REPAIR_RETRY_EXHAUSTED"
          : "PROFILE_CONTRACT_REPAIR_DATABASE_FAILED",
      );
    }
  }
  fail("PROFILE_CONTRACT_REPAIR_RETRY_EXHAUSTED");
}
