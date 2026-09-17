import { createAuthUserService } from "../../features/auth/auth-user-service";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { createLiveManualContactCreationService } from "../../features/acquisition/live-manual-service";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { buildEventCoreBackfillPlan } from "../../features/events/core/backfill";
import { assessRelationshipLifecycleMigration } from "../../features/connections/lifecycle/migration-preflight";

export const STAGING_WORKSPACE = "workspace:orbit-small-staging-20260917";
export const STAGING_HOST = "ep-blue-forest-azwt71sw-pooler.c-3.ap-southeast-1.aws.neon.tech";
export const STAGING_LIMITS = Object.freeze({ records: 80, seedBytes: 128 * 1024, queries: 800, returnedBytes: 2 * 1024 * 1024 });
export const STAGING_IDENTITIES = [
  { key: "organizer", email: "organizer@orbit.example.test", displayName: "测试主办方·林" },
  { key: "participantA", email: "participant.a@orbit.example.test", displayName: "测试参与者·陈" },
  { key: "participantB", email: "participant.b@orbit.example.test", displayName: "测试参与者·周" },
  { key: "empty", email: "empty@orbit.example.test", displayName: "测试空白账号" },
] as const;

/** Fail closed: no ambient DATABASE_URL, no other remote project, no local user's existing DB. */
export function validateStagingTarget(connectionString: string, cloud: boolean): void {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("STAGING_TARGET_PROTOCOL");
  if (url.searchParams.has("options") || url.searchParams.has("host")) throw Error("STAGING_TARGET_OVERRIDE");
  if (cloud) {
    if (url.hostname !== STAGING_HOST || url.pathname !== "/neondb" || !url.password || (url.port && url.port !== "5432")) throw Error("STAGING_TARGET_DENIED");
  } else if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/orbit_staging_20260917") {
    throw Error("STAGING_LOCAL_TARGET_DENIED");
  }
}

export function assertSmallSeed(records: readonly LiveRecord[], events: unknown): number {
  const bytes = Buffer.byteLength(JSON.stringify({ records, events }));
  const keys = records.map(r => `${r.workspaceId}/${r.collectionName}/${r.recordId}`);
  if (new Set(keys).size !== keys.length || records.some(r => r.workspaceId !== STAGING_WORKSPACE)) throw Error("STAGING_SEED_IDENTITY_INVALID");
  if (records.length > STAGING_LIMITS.records || bytes > STAGING_LIMITS.seedBytes) throw Error("STAGING_SEED_BUDGET_EXCEEDED");
  return bytes;
}

/** Use actual registration and manual-contact services, not sliced bulk fixtures. No model or network calls. */
export async function buildMinimalStagingSeed(password: string, now: string) {
  if (password.length < 16 || !Number.isFinite(Date.parse(now))) throw Error("STAGING_INPUT_INVALID");
  const store = createMemoryLiveRecordStore();
  const provider = createStorageAuthUserProvider({ store, workspaceId: STAGING_WORKSPACE });
  const auth = createAuthUserService({ provider, accountProvisioner: createStorageAuthAccountProvisioningProvider({store,workspaceId:STAGING_WORKSPACE}), now: () => new Date(now) });
  const accounts: Record<string, {id:string;email:string;displayName:string}> = {};
  for (const identity of STAGING_IDENTITIES) {
    const result = await auth.registerUser({...identity,password});
    if (result.state !== "success") throw Error("STAGING_ACCOUNT_CREATION_FAILED");
    accounts[identity.key] = {id:result.data.user.id,email:identity.email,displayName:identity.displayName};
    if ((await auth.verifyCredentials({email:identity.email,password})).state !== "success") throw Error("STAGING_LOGIN_FAILED");
  }
  for (const [owner, person, organization, note] of [
    ["organizer", "陈·设计协作", "演示设计工作室", "合成测试数据：交流活动视觉设计，待确认下一次沟通时间。"],
    ["organizer", "周·技术协作", "演示软件团队", "合成测试数据：讨论报名工具的集成，准备发送技术说明。"],
    ["participantA", "林·活动组织", "演示活动社区", "合成测试数据：认识活动主办方，后续询问场地信息。"],
  ]) {
    const actorId = accounts[owner]!.id;
    const service = createLiveManualContactCreationService({ actorId, now: () => now,
      provider: createStorageContactAcquisitionDraftProvider({actorId,store,workspaceId:STAGING_WORKSPACE}),
      contactProvider:createStorageBusinessCardContactWriteProvider({store,workspaceId:STAGING_WORKSPACE}),
    });
    const draft = await service.createManualContactDraft({displayName:person,organization,note,tags:["合成测试"],source:{id:`small-staging:${owner}:${person}`,type:"manual",label:"小型测试数据"}});
    if (!draft.success || !draft.data.draft) throw Error("STAGING_CONTACT_DRAFT_FAILED");
    const confirmed = await service.confirmManualContactDraft({draftId:draft.data.draft.id});
    if (!confirmed.success || !confirmed.data.contactCandidate.contactWriteExecuted) throw Error("STAGING_CONTACT_CONFIRM_FAILED");
    const writer = createStorageBusinessCardContactWriteProvider({store,workspaceId:STAGING_WORKSPACE});
    const contact = await writer.getContact(confirmed.data.contactCandidate.contactId!,actorId);
    if (!contact || !writer.initializeAcquiredRelationship) throw Error("STAGING_CONTACT_MISSING");
    const stage: "archived" | "needs_follow_up" | "active" = owner === "participantA" ? "archived" : person.startsWith("陈") ? "needs_follow_up" : "active";
    const readyContact = {...contact,stage,version:1,lifecycleInitialization:"ready" as const};
    await writer.saveContact(readyContact,actorId);
    const connectionId = `connection:${contact.id}`;
    await writer.initializeAcquiredRelationship({contact:readyContact,connection:{id:connectionId,accountId:actorId,contactId:contact.id,version:1,lifecycleInitialization:"ready",stage,valueTypes:[],summary:note,source:contact.source,evidenceIds:contact.evidenceIds,createdAt:now,updatedAt:now}},actorId);
    const connectionRecord = store.getRecord({workspaceId:STAGING_WORKSPACE,collectionName:"connections",recordId:connectionId})!;
    store.upsertRecord({...connectionRecord,payload:{...connectionRecord.payload,activeGoal:stage==="active" ? "合成测试目标：确认报名工具的集成方案" : null}});
    for (const id of contact.evidenceIds) await writer.saveEvidence({id,sourceType:"manual",sourceId:contact.source.id,summary:note,occurredAt:now,confidence:1,createdBy:actorId},actorId);
    if (stage === "needs_follow_up") {
      const taskId = `task:${contact.id}`;
      store.upsertRecord({workspaceId:STAGING_WORKSPACE,collectionName:"tasks",recordId:taskId,userId:actorId,sourceType:"manual",sourceId:contact.source.id,evidenceIds:contact.evidenceIds,lifecycleState:"active",createdAt:now,updatedAt:now,payload:{id:taskId,accountId:actorId,contactId:contact.id,connectionId,title:"确认测试交流会视觉需求",dueAt:new Date(Date.parse(now)+3*86400000).toISOString(),relationshipPurpose:"follow_up",status:"open",version:1,source:contact.source,evidenceIds:contact.evidenceIds,createdAt:now,updatedAt:now}});
    }
  }
  const startsAt = new Date(Date.parse(now) + 14 * 86400000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 2 * 3600000).toISOString();
  const events = buildEventCoreBackfillPlan([
    {eventId:"10000000-0000-4000-8000-000000000001",publicCode:"SMALL-STAGING",title:"小型测试交流会（合成数据）",lifecycleState:"published" as const},
    {eventId:"10000000-0000-4000-8000-000000000002",publicCode:"SMALL-DRAFT",title:"主办方编辑草稿（合成数据）",lifecycleState:"draft" as const},
  ].map(event=>({...event,organizerActorId:accounts.organizer!.id,description:"仅用于独立测试，不是真实活动；不自动运行 AI 或发送通知。",venue:"线上测试会场",timezone:"Asia/Shanghai",startsAt,endsAt,source:"minimal-staging-v1",sourcePayload:{synthetic:true,evidenceIds:["evidence:small-staging:event"]}})),{schemaVersion:1,migrationId:"minimal-staging-v1",resolutions:[]});
  const records = store.listRecords({workspaceId:STAGING_WORKSPACE});
  for (const account of Object.values(accounts)) {
    if (!assessRelationshipLifecycleMigration({actorId:account.id,workspaceId:STAGING_WORKSPACE,records}).readyForCutover) throw Error("STAGING_RELATIONSHIP_INVALID");
  }
  const seedBytes = assertSmallSeed(records,events);
  return {accounts,events,records,seedBytes,now};
}
