import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createLiveManualContactCreationService } from "../../features/acquisition/live-manual-service";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { buildEventCoreBackfillPlan, applyEventCoreBackfillPlan } from "../../features/events/core/backfill";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";
import { createPostgresRelationshipLifecycleRepository } from "../../features/connections/lifecycle/postgres-repository";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";
import type { RelationshipStageCommand } from "../../features/connections/lifecycle/contract";
import { createPostgresEventAccessRepository } from "../../features/events/event-access/storage/postgres-repository";
import { createEventAccessService } from "../../features/events/event-access/service";
import { requireEventCapability } from "../../features/events/event-access/guard";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createEventAdmissionService } from "../../features/events/admission/service";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { activateCanonicalRegistrationsWithExecutor } from "../../features/events/event-operations/storage/canonical-registration-repository";
import type { EventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { STAGING_WORKSPACE } from "./minimal-staging";

export const RICH_STAGING_ID = "rich-staging-30-10-v1";
export const RICH_STAGING_LIMITS = Object.freeze({ records: 400, seedBytes: 512 * 1024, queries: 900, returnedBytes: 2 * 1024 * 1024 });
export const PRIMARY_STAGING_EMAIL = "organizer@orbit.example.test";
const markerCollection = "staging_seed_manifests";
const names = [
  "顾言", "许清", "宋知远", "沈禾", "陆川", "叶青", "方宁",
  "唐悦", "温岚", "程越", "乔安", "苏澄", "白鹿", "何墨",
  "孟知夏", "罗嘉", "谢雨", "高朗", "林棠", "郑熙", "周予",
  "吴桐", "蒋宁", "韩曦", "邵文", "杜若", "江禾", "夏澜",
];
const themes = [
  { topic: "产品与设计", organization: "星桥产品工作室", role: "产品设计师", offer: "用户访谈与可用性评估", need: "寻找早期产品试用团队", action: "确认产品试用与访谈安排" },
  { topic: "软件与AI", organization: "远山软件实验室", role: "技术负责人", offer: "API集成与工作流开发", need: "寻找有明确需求的试点伙伴", action: "确认API集成需求与试点范围" },
  { topic: "品牌与增长", organization: "青禾品牌咨询", role: "品牌顾问", offer: "品牌定位与内容策划", need: "寻找联合内容和活动合作方", action: "确认联合内容合作主题" },
  { topic: "社区与创业", organization: "共创社区", role: "社区运营负责人", offer: "活动策划与场地协作", need: "寻找分享嘉宾及社区合作伙伴", action: "确认分享主题与场地协作安排" },
];
const eventTitles = [
  "产品探索与用户访谈工作坊", "API集成与AI应用圆桌",
  "品牌定位与内容共创沙龙", "社区主理人与创业者交流会",
  "产品原型与可用性评审夜", "小团队自动化实践分享",
  "品牌增长实验复盘沙龙", "跨团队协作与资源对接会",
];
const key = (r: LiveRecord) => r.collectionName + "/" + r.recordId;

export function primaryStagingActor(records: readonly LiveRecord[]): string {
  const auth = records.filter(r => r.collectionName === "auth_users" && r.payload.email === PRIMARY_STAGING_EMAIL && r.lifecycleState !== "deleted");
  const actor = auth[0]?.userId;
  if (auth.length !== 1 || !actor || !records.some(r => r.collectionName === "accounts" && r.recordId === actor)
    || !records.some(r => r.collectionName === "profiles" && r.userId === actor)) throw Error("RICH_STAGING_PRIMARY_IDENTITY_INVALID");
  return actor;
}

/** Pure local construction through the real manual acquisition service; no provider/model calls. */
export async function buildRichStagingExpansion(base: readonly LiveRecord[], now: string) {
  if (!Number.isFinite(Date.parse(now)) || base.some(r => r.workspaceId !== STAGING_WORKSPACE)) throw Error("RICH_STAGING_INPUT_INVALID");
  const actorId = primaryStagingActor(base);
  if (base.filter(r => r.collectionName === "contacts" && r.userId === actorId && r.lifecycleState !== "deleted").length !== 2
    || base.some(r => r.collectionName === markerCollection && r.recordId === RICH_STAGING_ID)) throw Error("RICH_STAGING_BASELINE_CHANGED");
  const store = createMemoryLiveRecordStore(base);
  const writer = createStorageBusinessCardContactWriteProvider({store, workspaceId: STAGING_WORKSPACE});
  const manual = createLiveManualContactCreationService({actorId, now: () => now, contactProvider: writer,
    provider: createStorageContactAcquisitionDraftProvider({actorId, store, workspaceId: STAGING_WORKSPACE})});
  const commands: RelationshipStageCommand[] = [];
  for (let index = 0; index < names.length; index++) {
    const theme = themes[index % themes.length]!;
    const person = names[index]!;
    const sourceId = RICH_STAGING_ID + ":person:" + (index + 1);
    const note = "合成测试人物：" + person + "。可提供" + theme.offer + "；希望" + theme.need + "。主办方计划邀请其参加相关主题交流，尚未声称实际报名、出席或交换名片。";
    const draft = await manual.createManualContactDraft({displayName: person, organization: theme.organization, role: theme.role,
      note, followUpHint: theme.action, tags: ["合成测试", theme.topic], source: {id: sourceId, type: "manual", label: "主账号30人测试场景"}});
    if (!draft.success || !draft.data.draft) throw Error("RICH_STAGING_DRAFT_FAILED");
    const confirmed = await manual.confirmManualContactDraft({draftId: draft.data.draft.id});
    if (!confirmed.success || !confirmed.data.contactCandidate.contactWriteExecuted) throw Error("RICH_STAGING_CONTACT_FAILED");
    const contact = await writer.getContact(confirmed.data.contactCandidate.contactId!, actorId);
    if (!contact || !writer.initializeAcquiredRelationship) throw Error("RICH_STAGING_CONTACT_MISSING");
    // Curated synthetic baseline; never masquerades as an accepted event exchange.
    const ready = {...contact, stage: "archived" as const, version: 1, lifecycleInitialization: "ready" as const};
    await writer.saveContact(ready, actorId);
    const connectionId = "connection:" + contact.id;
    await writer.initializeAcquiredRelationship({contact: ready, connection: {id: connectionId, accountId: actorId,
      contactId: contact.id, version: 1, lifecycleInitialization: "ready", stage: "archived", valueTypes: [],
      summary: note, source: contact.source, evidenceIds: contact.evidenceIds, createdAt: now, updatedAt: now}}, actorId);
    for (const id of contact.evidenceIds) await writer.saveEvidence({id, sourceType: "manual", sourceId, summary: note,
      occurredAt: now, confidence: 1, createdBy: actorId}, actorId);
    const identity = {actorId, connectionId, expectedVersion: 1, idempotencyKey: sourceId + ":lifecycle",
      source: {id: sourceId, type: "manual" as const}};
    const stage = index < 8 ? "active" : index < 16 ? "needs_follow_up" : index < 22 ? "nurture" : "archived";
    const dueAt = new Date(Date.parse(now) + (stage === "nurture" ? 21 + index : 1 + index % 7) * 86400000);
    dueAt.setUTCHours(1, 0, 0, 0); // 09:00 Asia/Shanghai, not the seed command's arbitrary clock time.
    commands.push(stage === "active" ? {...identity, stage, activeGoal: person + "：" + theme.action}
      : stage === "archived" ? {...identity, stage, dismissTaskIds: [], reason: "合成场景：当前合作方向不匹配，保留联系记录"}
      : {...identity, stage, nextTask: {taskId: "task:" + sourceId,
        title: (stage === "nurture" ? "定期交流：" : "跟进：") + person + "·" + theme.action,
        dueAt: dueAt.toISOString()}});
  }
  const events = buildEventCoreBackfillPlan(eventTitles.map((title, index) => {
    const start = new Date(Date.parse(now) + (7 + index * 4) * 86400000);
    start.setUTCHours(10, 30, 0, 0); // 18:30–20:30 Asia/Shanghai.
    const startsAt = start.toISOString();
    return {eventId: "10000000-0000-4000-8000-" + String(index + 3).padStart(12, "0"),
      publicCode: "STAGING-" + String(index + 3).padStart(2, "0"), title: title + "（合成测试）",
      organizerActorId: actorId, lifecycleState: "published" as const, timezone: "Asia/Shanghai",
      startsAt, endsAt: new Date(Date.parse(startsAt) + 2 * 3600000).toISOString(),
      description: "主办方林组织的合成测试活动。主题：" + themes[index % themes.length]!.topic
        + "；流程：20分钟介绍、60分钟专题讨论、40分钟自由交流。适合相关领域的合作伙伴。可测试真实报名、资料编辑及取消；尚未生成匹配或发送通知。",
      venue: index % 2 ? "线上交流室·" + (index + 1) : "演示共创空间·" + (index + 1),
      source: RICH_STAGING_ID, sourcePayload: {synthetic: true, theme: themes[index % themes.length]!.topic}};
  }), {schemaVersion: 1, migrationId: RICH_STAGING_ID, resolutions: []});
  const all = store.listRecords({workspaceId: STAGING_WORKSPACE});
  const originalKeys = new Set(base.map(key));
  for (const original of base) {
    if (JSON.stringify(all.find(r => key(r) === key(original))) !== JSON.stringify(original)) throw Error("RICH_STAGING_EXISTING_RECORD_CHANGED");
  }
  const records = all.filter(r => !originalKeys.has(key(r)));
  const seedBytes = Buffer.byteLength(JSON.stringify({records, commands, events}));
  if (records.length + base.length > RICH_STAGING_LIMITS.records || seedBytes > RICH_STAGING_LIMITS.seedBytes) throw Error("RICH_STAGING_SEED_BUDGET_EXCEEDED");
  return {actorId, records, commands, events, seedBytes, now};
}

/** Caller owns one outer transaction; only insert-only additions and their real lifecycle commands. */
export async function applyRichStagingExpansion(client: EventOperationsPostgresClient, password: string, now: string) {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [RICH_STAGING_ID + ":" + STAGING_WORKSPACE]);
  const size = await client.query<{count: number; bytes: string}>("select count(*)::int as count, coalesce(sum(pg_column_size(payload)),0)::text as bytes from orbit_records where workspace_id=$1", [STAGING_WORKSPACE]);
  if (!size.rows[0] || size.rows[0].count > RICH_STAGING_LIMITS.records || Number(size.rows[0].bytes) > RICH_STAGING_LIMITS.seedBytes) throw Error("RICH_STAGING_EXISTING_BUDGET_EXCEEDED");
  const store = createPostgresLiveRecordStore({client});
  const base = await store.listRecords({workspaceId: STAGING_WORKSPACE, includeDeleted: true});
  const actorId = primaryStagingActor(base);
  const auth = createAuthUserService({provider: createStorageAuthUserProvider({store: createMemoryLiveRecordStore(base), workspaceId: STAGING_WORKSPACE})});
  if ((await auth.verifyCredentials({email: PRIMARY_STAGING_EMAIL, password})).state !== "success") throw Error("RICH_STAGING_PASSWORD_INVALID");
  const count = async () => (await client.query<{contacts: number; events: number}>("select (select count(*) from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='contacts' and lifecycle_state <> 'deleted')::int as contacts, (select count(*) from event_ops_events where workspace_id=$1 and organizer_actor_id=$2)::int as events", [STAGING_WORKSPACE, actorId])).rows[0]!;
  if (base.some(r => r.collectionName === markerCollection && r.recordId === RICH_STAGING_ID)) return {replayed: true, actorId, email: PRIMARY_STAGING_EMAIL, ...await count()};
  const before = await count();
  if (before.contacts !== 2 || before.events !== 2) throw Error("RICH_STAGING_BASELINE_CHANGED");
  const plan = await buildRichStagingExpansion(base, now);
  const eventIds = plan.events.events.map(e => e.eventId);
  if ((await client.query("select event_id from event_ops_events where workspace_id=$1 and event_id=any($2::text[])", [STAGING_WORKSPACE, eventIds])).rows.length) throw Error("RICH_STAGING_EVENT_COLLISION");
  await runRelationshipLifecycleMigrations(client);
  for (const record of plan.records) {
    if (!store.insertRecordIfAbsent || !await store.insertRecordIfAbsent(record)) throw Error("RICH_STAGING_RECORD_COLLISION");
  }
  const lifecycle = createRelationshipLifecycleService(createPostgresRelationshipLifecycleRepository({client, workspaceId: STAGING_WORKSPACE}), () => now);
  for (const command of plan.commands) await lifecycle.changeStage(command);
  await applyEventCoreBackfillPlan({client, workspaceId: STAGING_WORKSPACE, plan: plan.events, now});
  const access = createEventAccessService(createPostgresEventAccessRepository({client, workspaceId: STAGING_WORKSPACE}));
  const admission = createEventAdmissionService({repository: createPostgresEventAdmissionRepository({client, workspaceId: STAGING_WORKSPACE}),
    requireCapability: (actorId, eventId, capability) => requireEventCapability({actorId, eventId, capability, service: access})});
  const ops = createPostgresEventOperationsRepository({client, workspaceId: STAGING_WORKSPACE});
  const outsider = base.find(r => r.collectionName === "auth_users" && r.payload.email === "participant.a@orbit.example.test")?.userId;
  if (!outsider || outsider === actorId) throw Error("RICH_STAGING_ISOLATION_ACCOUNT_MISSING");
  for (const [index, event] of plan.events.events.entries()) {
    const at = (hours: number) => new Date(Date.parse(event.startsAt) + hours * 3600000).toISOString();
    await requireEventCapability({actorId, eventId: event.eventId, capability: "operations.configure", service: access});
    let denied = false;
    try {await requireEventCapability({actorId: outsider, eventId: event.eventId, capability: "operations.configure", service: access});} catch {denied = true;}
    if (!denied) throw Error("RICH_STAGING_OWNER_ISOLATION_FAILED");
    await ops.saveConfigurationAsOperator({actorId, capability: "operations.configure", configuration: {
      eventId: event.eventId, organizerActorId: actorId, checkInOpensAt: at(-1), eventStartsAt: event.startsAt, eventEndsAt: event.endsAt,
      profileEditDeadlineAt: at(-2), registrationCutoffAt: at(-2), resultsAvailableAt: at(0),
      roundOneStartsAt: at(0), roundTwoStartsAt: at(1), recommendationCount: 1, tableSize: 2, shardSize: 4, maxAttemptsPerTask: 1, updatedAt: now}});
    await admission.configurePolicy(actorId, {eventId: event.eventId, admissionMode: "instant", capacity: [12,16,20,24][index % 4]!,
      waitlistEnabled: true, registrationOpensAt: now, registrationClosesAt: at(-2), profileEditDeadlineAt: at(-2)});
    await activateCanonicalRegistrationsWithExecutor({executor: client, workspaceId: STAGING_WORKSPACE, eventId: event.eventId, registrations: []});
  }
  const after = await store.listRecords({workspaceId: STAGING_WORKSPACE, includeDeleted: true});
  const assessment = assessRelationshipLifecycleMigration({actorId, workspaceId: STAGING_WORKSPACE, records: after});
  if (!assessment.readyForCutover) throw Error("RICH_STAGING_LIFECYCLE_INVALID");
  for (const original of base) {
    if (JSON.stringify(after.find(r => key(r) === key(original))) !== JSON.stringify(original)) throw Error("RICH_STAGING_EXISTING_RECORD_CHANGED");
  }
  const totals = await count();
  if (totals.contacts !== 30 || totals.events !== 10 || after.length >= RICH_STAGING_LIMITS.records) throw Error("RICH_STAGING_COUNTS_INVALID");
  await store.insertRecordIfAbsent!({workspaceId: STAGING_WORKSPACE, collectionName: markerCollection, recordId: RICH_STAGING_ID,
    userId: actorId, sourceType: "manual", sourceId: RICH_STAGING_ID, evidenceIds: [], createdAt: now, updatedAt: now, lifecycleState: "active",
    payload: {id: RICH_STAGING_ID, actorId, contactIds: plan.records.filter(r => r.collectionName === "contacts").map(r => r.recordId), eventIds, createdAt: now}});
  return {replayed: false, actorId, email: PRIMARY_STAGING_EMAIL, ...totals, seedBytes: plan.seedBytes, records: after.length + 1, lifecycleIssues: assessment.issues.length};
}
