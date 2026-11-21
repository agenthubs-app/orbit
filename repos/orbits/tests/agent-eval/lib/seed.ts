/**
 * Writes a fixture world through the product's own write services (PLANNER 易错边界 4):
 * accounts (auth user + account provisioning), contacts (the acquisition write provider, contact + connection),
 * notes, tasks, personal schedule, host-lifecycle platform events with canonical registrations,
 * agent memory, agent automations and stored chat sessions. Nothing here calls `upsertRecord` directly.
 *
 * Fields the current product has no place for are listed in the seed report's `gaps` instead of being forced in.
 */
import { createHash } from "node:crypto";

import { createStorageAuthAccountProvisioningProvider } from "../../../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider, toAuthUserDTO } from "../../../features/auth/storage/auth-user-live-record-provider";
import { createStorageBusinessCardContactWriteProvider } from "../../../features/contacts/storage/contact-write-live-record-provider";
import { createConfiguredNoteService } from "../../../features/notes/service-factory";
import { readNoteInteraction } from "../../../features/notes/interaction";
import { createNoteRepository } from "../../../features/notes/repository";
import { createConfiguredTaskService } from "../../../features/tasks/service-factory";
import { createPrivateEventService } from "../../../features/events/private-events/service";
import { createAttendanceService } from "../../../features/events/attendance-notes/service";
import { createPersonalScheduleService } from "../../../features/personal-schedule/service";
import { createPersonalScheduleAssociationReader } from "../../../features/personal-schedule/association-reader";
import { createStorageAgentMemoryService } from "../../../features/agent/memory/service";
import { createStorageAgentAutomationService } from "../../../features/agent/automations/service";
import { createPostgresAutomationStorage } from "../../../features/agent/automations/due-index";
import { setTaskReminder } from "../../../features/agent/automations/reminder";
import { createPushDeviceService } from "../../../features/notifications/push-device-service";
import { webPushTokenOf } from "../../../features/notifications/web-push-adapter";
import { RULE_CAPABILITY_OF } from "../../../features/agent-v1/domains/rule/apply";
import { domainSaidIn, replanSaidIn, scopeSaidIn } from "../../../features/agent-v1/rule/parse";
import { fieldSaidIn } from "../../../features/agent-v1/functions/basis";
import { INDUSTRY_WORDS, PLACE_WORDS } from "../../../features/agent-v1/graph/nodes/functions";
import { scopeWordsOf } from "../../../features/agent-v1/graph/nodes/rule";
import { loadWorld } from "./world";
import { createConfiguredStorageOrbitAgentChatSessionProvider } from "../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createLiveAgentSessionStateStore } from "../../../features/agent-v1/context/session-state";
import { createConfiguredEventOperationsPostgresRuntime } from "../../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../../features/events/event-operations/storage/postgres-repository";
import { createHostLifecycle, readHostEvent } from "../../../features/events/host/storage/lifecycle";
import { createHostProfiles } from "../../../features/events/host/storage/profiles";
import { eventRegistrationId } from "../../../features/events/registration/service";
import type { EventRegistration } from "../../../features/events/registration/contract";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { ContactDTO, ConnectionDTO } from "../../../shared/domain/contracts";
import type { FixtureRecord } from "./world";

export interface AccountIdentity {
  label: string;
  userId: string;
  email: string;
  displayName: string;
}

export const EVAL_ORGANIZER: AccountIdentity = { displayName: "评测平台活动主办方", email: "agent-eval-host@orbit.test", label: "HOST", userId: "user_agent_eval_host" };

export function accountIdentity(label: string, displayName: string): AccountIdentity {
  const slug = label.toLowerCase();
  return { displayName, email: `agent-eval-${slug}@orbit.test`, label, userId: `user_agent_eval_${slug}` };
}

export interface SeedReport {
  world: string;
  accounts: Record<string, { userId: string; email: string }>;
  /** fixture id → product id */
  ids: Record<string, string>;
  counts: Record<string, Record<string, number>>;
  gaps: { record: string; field: string; reason: string }[];
}

function productId(prefix: string, world: string, fixtureId: string): string {
  return `${prefix}:${createHash("sha256").update(`agent-eval\u0000${world}\u0000${fixtureId}`).digest("hex").slice(0, 24)}`;
}

const REGIONS: Record<string, { countryCode: string; city: string | null }> = {
  东京: { city: "Tokyo", countryCode: "JP" },
  大阪: { city: "Osaka", countryCode: "JP" },
  横滨: { city: "Yokohama", countryCode: "JP" },
  京都: { city: "Kyoto", countryCode: "JP" },
  栃木: { city: "Tochigi", countryCode: "JP" },
  神奈川: { city: "Kanagawa", countryCode: "JP" },
  茨城: { city: "Ibaraki", countryCode: "JP" },
  上海: { city: "Shanghai", countryCode: "CN" },
  杭州: { city: "Hangzhou", countryCode: "CN" },
  苏州: { city: "Suzhou", countryCode: "CN" },
  深圳: { city: "Shenzhen", countryCode: "CN" },
  北京: { city: "Beijing", countryCode: "CN" },
  台北: { city: "Taipei", countryCode: "TW" },
  新加坡: { city: "Singapore", countryCode: "SG" },
  槟城: { city: "Penang", countryCode: "MY" },
  波特兰: { city: "Portland", countryCode: "US" },
  伦敦: { city: "London", countryCode: "GB" },
  慕尼黑: { city: "Munich", countryCode: "DE" },
};

const INDUSTRIES: Record<string, ContactDTO["primaryIndustryId"]> = {
  软件: "technology_internet",
  工业软件: "technology_internet",
  贸易: "trade_logistics",
  物流: "trade_logistics",
  摄影: "media_creative",
  设计: "media_creative",
  出版: "media_creative",
  媒体: "media_creative",
  金融: "finance_investment",
  教育: "education_research",
  零售: "retail_consumer",
  餐饮: "food_hospitality",
  茶饮: "food_hospitality",
  陶艺: "manufacturing_supply_chain",
  半导体: "manufacturing_supply_chain",
  机器人: "manufacturing_supply_chain",
  汽车电子: "manufacturing_supply_chain",
  能源: "manufacturing_supply_chain",
  医疗器械: "healthcare_life_sciences",
  咨询: "professional_services",
  会展: "professional_services",
};

function jst(day: string, time = "09:00"): string {
  return new Date(`${day}T${time}:00+09:00`).toISOString();
}

function iso(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export interface SeedContext {
  world: string;
  clock: string;
  report: SeedReport;
  actorOf: (label: string) => string;
}

function count(report: SeedReport, account: string, kind: string, by = 1): void {
  report.counts[account] ??= {};
  report.counts[account][kind] = (report.counts[account][kind] ?? 0) + by;
}

function gap(report: SeedReport, record: string, field: string, reason: string): void {
  report.gaps.push({ field, reason, record });
}

/** Sequential writer with a bounded concurrency (domain services are safe to call in parallel per actor). */
async function inBatches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(work));
  }
}

export function createWorldWriter(world: string, clock: string) {
  const configured = createConfiguredPostgresLiveRecordStore();
  const runtime = createConfiguredTransactionalPostgresRuntime();
  const events = createConfiguredEventOperationsPostgresRuntime();
  if (!configured || !runtime || !events) throw new Error("The eval database is not configured (ORBIT_DATABASE_TARGET=local, ORBIT_LOCAL_DATABASE_URL).");
  const { store, workspaceId } = configured;
  const report: SeedReport = { accounts: {}, counts: {}, gaps: [], ids: {}, world };
  const actors = new Map<string, string>();
  const notes = createConfiguredNoteService();
  // AG05: the memo's interaction field (附录 E) has its contract and its read in AG05; the Agent's write path
  // is AG06. The fixture's interaction is stored through the note repository's compare-and-swap write.
  const noteRepository = createNoteRepository({ store, workspaceId });
  const tasks = createConfiguredTaskService();
  let scheduleNow = new Date().toISOString();
  const schedule = createPersonalScheduleService({
    associationReaderForStore: (transactionStore) => createPersonalScheduleAssociationReader({ store: transactionStore, workspaceId }),
    client: runtime.client,
    now: () => scheduleNow,
    store: createPostgresLiveRecordStore({ client: runtime.client }),
    workspaceId,
  });
  const contactWriter = createStorageBusinessCardContactWriteProvider({ recordProvider: "orbit-agent-eval-seed", store, workspaceId });
  // AG13: private events and «我去过» through their services (the same store).
  let privateNow = new Date().toISOString();
  const privateEvents = createPrivateEventService({ client: runtime.client, now: () => privateNow, store, workspaceId });
  const attendanceNotes = createAttendanceService({ client: runtime.client, now: () => privateNow, store, workspaceId });
  /** AG13: a fixture's event links ({ kind, id: fixture }) as product refs; links to records not seeded are dropped. */
  const eventRefsOf = (value: unknown) => ((value as { kind: string; id: string }[] | undefined) ?? [])
    .filter((ref) => (ref.kind === "platform" || ref.kind === "private") && idOf(ref.id))
    .map((ref) => ({ id: idOf(ref.id), kind: ref.kind as "platform" | "private" }));
  const hostLifecycle = createHostLifecycle({ client: events.client, workspaceId });
  const hostProfiles = createHostProfiles({ client: events.client, workspaceId });
  const eventRepository = createPostgresEventOperationsRepository({ client: events.client, workspaceId });
  let organizerProfileId: string | null = null;

  const actorOf = (label: string) => {
    const actor = actors.get(label);
    if (!actor) throw new Error(`account ${label} was not created`);
    return actor;
  };
  const idOf = (fixtureId: string) => report.ids[fixtureId];

  async function ensureAccount(identity: AccountIdentity): Promise<string> {
    const users = createStorageAuthUserProvider({ store, workspaceId });
    const existing = await users.getUserByEmail(identity.email);
    const timestamp = "2026-01-05T00:00:00.000Z";
    const user = existing ?? (await users.saveUser({
      createdAt: timestamp,
      displayName: identity.displayName,
      email: identity.email,
      id: identity.userId,
      passwordHash: null,
      provider: "credentials",
      providerAccountId: null,
      updatedAt: timestamp,
    }));
    await createStorageAuthAccountProvisioningProvider({ store, workspaceId }).ensureAccountForUser(toAuthUserDTO(user));
    actors.set(identity.label, user.id);
    report.accounts[identity.label] = { email: identity.email, userId: user.id };
    return user.id;
  }

  async function writeContact(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const id = productId("contact", world, record.id);
    const evidenceId = productId("evidence", world, record.id);
    const updatedAt = iso(data.updatedAt) ?? new Date(Date.parse(clock) - 30 * 86_400_000).toISOString();
    const industry = typeof data.industry === "string" ? data.industry : null;
    const region = typeof data.region === "string" ? data.region : null;
    const tags = [...((data.tags as string[] | undefined) ?? [])];
    if (industry) tags.push(`行业:${industry}`);
    const contact: ContactDTO = {
      createdAt: updatedAt,
      customTags: tags,
      displayName: String(data.name),
      evidenceIds: [evidenceId],
      id,
      lifecycleInitialization: "ready",
      ...(data.org ? { organization: String(data.org) } : {}),
      ...(data.role ? { role: String(data.role) } : {}),
      ...(region ? { location: region } : {}),
      ...(region && REGIONS[region] ? { region: REGIONS[region] } : {}),
      ...(data.email ? { primaryEmail: String(data.email) } : {}),
      ...(data.phone ? { primaryPhone: String(data.phone) } : {}),
      ...(industry && INDUSTRIES[industry] ? { primaryIndustryId: INDUSTRIES[industry] } : {}),
      ...(data.notes ? { notes: String(data.notes) } : {}),
      source: { id: `agent-eval:${world}`, label: "Agent eval fixture", type: "manual" },
      stage: "active",
      updatedAt,
    };
    const connection: ConnectionDTO = {
      accountId: actorId,
      contactId: id,
      createdAt: updatedAt,
      evidenceIds: [evidenceId],
      id: productId("connection", world, record.id),
      lifecycleInitialization: "ready",
      source: contact.source,
      stage: "active",
      summary: "",
      updatedAt,
      valueTypes: ["community_context"],
    };
    await contactWriter.saveEvidence({ confidence: 1, createdBy: actorId, id: evidenceId, occurredAt: updatedAt, sourceId: `agent-eval:${world}`, sourceType: "manual", summary: "Agent eval fixture contact." }, actorId);
    await contactWriter.initializeAcquiredRelationship!({ connection, contact }, actorId);
    report.ids[record.id] = id;
    count(report, record.account, "contacts");
    if (data.aliases) gap(report, record.id, "aliases", "contacts have no alias field");
    if (data.lastInteractionOn) gap(report, record.id, "lastInteractionOn", "最近互动 is derived from interactions (AG05); kept in the fixture only");
    if (data.version && Number(data.version) > 1) gap(report, record.id, "version", "contacts have no usable version yet (AG12)");
  }

  async function writeMemo(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const contactIds = ((data.contactIds as string[] | undefined) ?? []).map(idOf).filter(Boolean);
    const eventIds = ((data.eventRefs as { kind: string; id: string }[] | undefined) ?? [])
      .filter((ref) => ref.kind === "platform" && idOf(ref.id))
      .map((ref) => idOf(ref.id));
    const createdAt = iso(data.createdAt) ?? new Date(Date.parse(clock) - 86_400_000).toISOString();
    const input = { actorId, body: String(data.body), contactIds, idempotencyKey: `agent-eval:${world}:${record.id}`, now: createdAt, ...(data.title ? { title: String(data.title) } : {}) };
    let result = await notes.create({ ...input, ...(eventIds.length ? { eventIds } : {}) }).catch((error: unknown) => {
      if (!eventIds.length) throw error;
      gap(report, record.id, "eventRefs", `platform event link refused: ${error instanceof Error ? error.message : error}`);
      return notes.create(input);
    });
    const note = (result as { note?: { id: string; version: number } }).note ?? (result as unknown as { id: string; version: number });
    report.ids[record.id] = note.id;
    const targetVersion = Number(data.version ?? 1);
    let version = Number(note.version ?? 1);
    while (version < targetVersion) {
      const updated = await notes.update({ actorId, body: String(data.body), expectedVersion: version, idempotencyKey: `agent-eval:${world}:${record.id}:v${version + 1}`, noteId: note.id, now: createdAt } as never);
      const saved = (updated as { note?: { version: number } }).note ?? (updated as unknown as { version: number });
      if (!saved?.version || saved.version <= version) break;
      version = saved.version;
      result = updated;
    }
    count(report, record.account, "memos");
    if (data.interaction) {
      const raw = data.interaction as Record<string, unknown>;
      const mapped = { ...raw, actualContactIds: ((raw.actualContactIds as string[] | undefined) ?? []).map(idOf).filter(Boolean) };
      const stored = await noteRepository.get(actorId, note.id);
      const interaction = stored ? readNoteInteraction(mapped, stored.note.contactIds) : null;
      const saved = stored && interaction ? await noteRepository.saveIfVersion({ ...stored, note: { ...stored.note, interaction } }, { updatedAt: stored.note.updatedAt, version: stored.note.version }) : null;
      if (!saved) gap(report, record.id, "interaction", "the interaction could not be stored (not well formed, or the note changed)");
    }
    if (data.locale) gap(report, record.id, "locale", "notes have no locale field");
    // AG13: the typed event links (a private one cannot be added through the note service; the fixture stores it as is).
    const refs = eventRefsOf(data.eventRefs);
    if (refs.some((ref) => ref.kind === "private")) {
      const stored = await noteRepository.get(actorId, note.id);
      const saved = stored ? await noteRepository.saveIfVersion({ ...stored, note: { ...stored.note, eventRefs: refs } }, { updatedAt: stored.note.updatedAt, version: stored.note.version }) : null;
      if (!saved) gap(report, record.id, "eventRefs", "the event links could not be stored");
    }
  }

  async function writeTodo(record: FixtureRecord, formal: boolean): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const related = formal ? [data.contactId as string] : ((data.relatedContactIds as string[] | undefined) ?? (data.contactId ? [data.contactId as string] : []));
    const contactIds = related.filter(Boolean).map(idOf).filter(Boolean);
    const eventRef = ((data.relatedEventRefs as { kind: string; id: string }[] | undefined) ?? []).find((ref) => ref.kind === "platform" && idOf(ref.id));
    // AG13: every person and event (T48 writes its events as eventRefs).
    const eventRefs = eventRefsOf(data.relatedEventRefs ?? data.eventRefs);
    const multi = contactIds.length > 1 || eventRefs.some((ref) => ref.kind === "private") || eventRefs.length > 1;
    const completedAt = iso(data.completedAt);
    const updatedAt = iso(data.updatedAt) ?? completedAt ?? new Date(Date.parse(clock) - 3 * 86_400_000).toISOString();
    const createdAt = completedAt && Date.parse(completedAt) < Date.parse(updatedAt) ? new Date(Date.parse(completedAt) - 3_600_000).toISOString() : completedAt ? new Date(Date.parse(completedAt) - 3_600_000).toISOString() : updatedAt;
    const source = data.source as { memoId?: string; memoVersion?: number } | undefined;
    const created = await tasks.create({
      actorId,
      category: formal || contactIds.length ? "relationship" : "work",
      idempotencyKey: `agent-eval:${world}:${record.id}`,
      now: createdAt,
      source: formal ? "contact" : "manual",
      title: String(data.title),
      ...(data.plannedDate ? { plannedDate: String(data.plannedDate) } : {}),
      ...(data.dueAt ? { dueAt: iso(data.dueAt) } : {}),
      ...(multi ? { relatedContactIds: contactIds, relatedEventRefs: eventRefs } : {}),
      ...(!multi && contactIds[0] ? { relatedContactId: contactIds[0] } : {}),
      ...(!multi && eventRef ? { relatedEventId: idOf(eventRef.id) } : {}),
      ...(source?.memoId && idOf(source.memoId) ? { sourceNoteId: idOf(source.memoId), sourceNoteVersion: Number(source.memoVersion ?? 1) } : {}),
      ...(data.note ? { notes: String(data.note) } : {}),
    });
    const task = (created as { task?: { id: string } }).task ?? (created as unknown as { id: string });
    report.ids[record.id] = task.id;
    if (data.status === "completed") {
      await tasks.complete({ actorId, completedBy: actorId, completionSource: "user", idempotencyKey: `agent-eval:${world}:${record.id}:complete`, now: completedAt ?? updatedAt, taskId: task.id });
    }
    count(report, record.account, formal ? "formal_followups" : "todos");
    if (formal) gap(report, record.id, "formal", "seeded as a relationship task; the relationship-lifecycle follow-up stage needs a connection command (kept for later sprints)");

  }

  /** AG06 (a patch's `set`, e.g. todo-plan-and-due): change fields of a seeded to-do through the to-do service. */
  async function updateTodo(fixtureId: string, account: string, set: Record<string, unknown>): Promise<void> {
    const actorId = actorOf(account);
    const taskId = idOf(fixtureId);
    if (!taskId) throw new Error(`${fixtureId} was not seeded`);
    const current = await tasks.get({ actorId, taskId });
    if (!current) throw new Error(`${fixtureId} cannot be read`);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(set)) {
      if (key === "id" || key === "account") continue;
      // AG18 (CMP todo-multi-links): the multi-value links, set through the to-do service as a current client sets them.
      if (key === "relatedContactIds") {
        const ids = ((value as string[] | undefined) ?? []).map((id) => idOf(id));
        if (ids.some((id) => !id)) throw new Error(`a contact in ${fixtureId}.relatedContactIds was not seeded`);
        patch[key] = ids;
        continue;
      }
      if (key === "relatedEventRefs") {
        const refs = eventRefsOf(value);
        if (refs.length !== ((value as unknown[] | undefined) ?? []).length) throw new Error(`an event in ${fixtureId}.relatedEventRefs was not seeded`);
        patch[key] = refs;
        continue;
      }
      if (!["title", "plannedDate", "dueAt"].includes(key)) throw new Error(`field ${key} cannot be set by a patch yet`);
      patch[key] = key === "dueAt" && typeof value === "string" ? iso(value) ?? value : (value as string | null);
    }
    await tasks.update({ actorId, expectedUpdatedAt: current.updatedAt, idempotencyKey: `agent-eval:${world}:${fixtureId}:set:${JSON.stringify(patch)}`, now: current.updatedAt, patch: patch as Parameters<typeof tasks.update>[0]["patch"], taskId });
  }

  async function writeSchedule(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    scheduleNow = new Date(Math.min(Date.parse(String(data.startsAt)) - 7 * 86_400_000, Date.parse(clock) - 86_400_000)).toISOString();
    const contactIds = ((data.contactIds as string[] | undefined) ?? []).map(idOf).filter(Boolean);
    const noteIds = ((data.memoIds as string[] | undefined) ?? []).map(idOf).filter(Boolean);
    const created = await schedule.create(actorId, {
      idempotencyKey: `agent-eval:${world}:${record.id}`,
      startsAt: iso(data.startsAt)!,
      title: String(data.title),
      ...(data.endsAt ? { endsAt: iso(data.endsAt) } : {}),
      ...(data.timeZone ? { timeZone: String(data.timeZone) } : {}),
      ...(contactIds.length ? { contactIds } : {}),
      ...(noteIds.length ? { noteIds } : {}),
      ...(eventRefsOf(data.eventRefs).length ? { eventRefs: eventRefsOf(data.eventRefs) } : {}),
      ...(data.recurrence ? { recurrence: { frequency: "weekly" } } : {}),
    } as never);
    // AG13: the service answers { scheduleItem } (the id was not recorded before, so S10 had no product id).
    const item = (created as { scheduleItem?: { id: string } }).scheduleItem ?? (created as { item?: { id: string } }).item ?? (created as unknown as { id: string });
    report.ids[record.id] = item.id;
    count(report, record.account, "schedule");
  }

  /** AG13: a private event of the account, through its service (version as the fixture says, raised by edits). */
  async function writePrivateEvent(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    privateNow = new Date(Math.min(Date.parse(String(data.startsAt)) - 86_400_000, Date.parse(clock) - 86_400_000)).toISOString();
    const event = await privateEvents.create(actorId, { idempotencyKey: `agent-eval:${world}:${record.id}`, startsAt: iso(data.startsAt)!, title: String(data.title), ...(data.endsAt ? { endsAt: iso(data.endsAt) } : {}), ...(data.venue ? { venue: String(data.venue) } : {}) });
    report.ids[record.id] = event.id;
    count(report, record.account, "private_events");
  }

  /** AG13: «我去过» (the user's own note), through its service. */
  async function writeAttendance(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const ref = data.eventRef as { kind: "platform" | "private"; id: string } | undefined;
    const eventId = ref ? idOf(ref.id) : undefined;
    if (!ref || !eventId) {
      gap(report, record.id, "eventRef", "the event of this note was not seeded");
      return;
    }
    privateNow = new Date(Date.parse(`${String(data.attendedOn)}T23:00:00+09:00`)).toISOString();
    const note = await attendanceNotes.create(actorId, { attendedOn: String(data.attendedOn), eventRef: { id: eventId, kind: ref.kind }, idempotencyKey: `agent-eval:${world}:${record.id}`, ...(Array.isArray(data.dayParts) ? { dayParts: data.dayParts as never } : {}), ...(data.selfNote ? { selfNote: String(data.selfNote) } : {}) });
    report.ids[record.id] = note.id;
    count(report, record.account, "attendance");
  }

  let organizerPromise: Promise<string> | null = null;
  function ensureOrganizer(): Promise<string> {
    organizerPromise ??= (async () => {
      const actorId = await ensureAccount(EVAL_ORGANIZER);
      const existing = await hostProfiles.list(actorId);
      organizerProfileId = existing[0]?.profileId ?? (await hostProfiles.create(actorId, { displayName: EVAL_ORGANIZER.displayName, slug: "agent-eval-host" } as never)).profileId;
      return organizerProfileId;
    })();
    return organizerPromise;
  }

  async function writePlatformEvent(record: FixtureRecord): Promise<void> {
    const profileId = await ensureOrganizer();
    const organizerActor = actorOf(EVAL_ORGANIZER.label);
    const data = record.data;
    const topics = ((data.topics as string[] | undefined) ?? []).join("、");
    const fee = String(data.fee ?? "");
    const amount = Number(fee.match(/(\d[\d,]*)\s*日元/u)?.[1]?.replace(/,/gu, "") ?? Number.NaN);
    const startsAt = iso(data.startsAt);
    const description = [topics ? `主题：${topics}` : "", fee ? `费用：${fee}` : "", data.note && !startsAt ? String(data.note) : ""].filter(Boolean).join("\n");
    const created = await hostLifecycle.create(organizerActor, {
      description,
      endsAt: startsAt ? new Date(Date.parse(startsAt) + 3 * 3_600_000).toISOString() : "2027-12-31T12:00:00.000Z",
      feeKind: Number.isFinite(amount) ? "amount" : "free",
      ...(Number.isFinite(amount) ? { feeAmountYen: amount } : {}),
      organizerProfileId: profileId,
      startsAt: startsAt ?? "2027-12-31T09:00:00.000Z",
      timezone: "Asia/Tokyo",
      title: String(data.title),
      venueName: data.venue ? String(data.venue) : null,
    });
    report.ids[record.id] = created.eventId;
    if (startsAt) await hostLifecycle.publish(organizerActor, created.eventId, created.version);
    else gap(report, record.id, "startsAt", "an event without a start time cannot be published; left as an unpublished draft");
    count(report, "platform", "platform_events");
  }

  async function writeMyEvent(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const eventId = idOf(String(record.data.eventId));
    if (!eventId) {
      gap(report, record.id, "eventId", "event not seeded");
      return;
    }
    const registeredAt = new Date(Date.parse(clock) - 20 * 86_400_000).toISOString();
    const participantProfileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}`;
    const registration: EventRegistration = {
      cancelledAt: null,
      eventId,
      id: eventRegistrationId(eventId, actorId),
      participantProfile: { answers: {}, createdAt: registeredAt, displayName: "评测账号", eventId, id: participantProfileId, updatedAt: registeredAt, userId: actorId } as never,
      participantProfileId,
      reactivatedAt: null,
      registeredAt,
      sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false },
      status: "rsvped",
      updatedAt: registeredAt,
      userId: actorId,
    };
    await eventRepository.seedCanonicalRegistration(registration);
    report.ids[record.id] = registration.id;
    count(report, record.account, "my_events");
    if (record.data.status === "attended") gap(report, record.id, "status", "attended needs an on-site check-in; stored as registered");
  }

  async function writeMemory(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const service = createStorageAgentMemoryService({ actorId, now: () => new Date(Date.parse(clock) - 10 * 86_400_000).toISOString(), store: store as never, workspaceId });
    // AG14: the entry as the fixture writes it — its tasks, its values and its validity — through the memory service.
    const memory = await service.create({
      category: data.category as never,
      content: String(data.content),
      memoryId: productId("memory", world, record.id),
      source: "manual" as never,
      ...(Array.isArray(data.appliesTo) ? { appliesTo: data.appliesTo as never } : {}),
      ...(data.structured && typeof data.structured === "object" ? { structured: data.structured as never } : {}),
      ...(typeof data.validFrom === "string" ? { validFrom: data.validFrom } : {}),
      ...(typeof data.validUntil === "string" ? { validUntil: data.validUntil } : {}),
    });
    // A fixture at revision n was changed n − 1 times: the same words written again move the revision on.
    for (let revision = 1; revision < Number(data.revision ?? 1); revision += 1) await service.update(memory.memoryId, { content: memory.content, expectedRevision: revision });
    report.ids[record.id] = memory.memoryId;
    count(report, record.account, "memory");
  }

  /** AG14: the account's two memory switches as a case starts with them (`memory_use`, `memory_learn`). */
  async function setMemorySettings(account: string, settings: { memory_use?: unknown; memory_learn?: unknown }): Promise<void> {
    const service = createStorageAgentMemoryService({ actorId: actorOf(account), now: () => new Date(Date.parse(clock) - 10 * 86_400_000).toISOString(), store: store as never, workspaceId });
    await service.updateSettings({
      ...(settings.memory_use !== undefined ? { enabled: settings.memory_use === "on" || settings.memory_use === true } : {}),
      ...(settings.memory_learn !== undefined ? { allowConversationLearning: settings.memory_learn === "on" || settings.memory_learn === true } : {}),
    });
  }

  /**
   * AG15: a fixture rule is written through the automation service with the due index attached (the rule and its index
   * row in one transaction), carrying the fields of 设计稿 §5.3. The scope is read from the fixture's words by the
   * product's own reader (rule/parse.ts); a rule with no ranking basis in the fixture gets the domain's natural order.
   * `nextRunAt` in the fixture is what the product computes from the schedule when the rule is made at the world clock.
   */
  async function writeRule(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const data = record.data;
    const scheduleSpec = data.schedule as { kind: string; daysOfWeek?: number[]; time: string; timeZone: string };
    const storage = createPostgresAutomationStorage({ client: runtime.client, workspaceId });
    const service = createStorageAgentAutomationService({ actorId, now: () => new Date(Date.parse(clock) - 60_000).toISOString(), storage, store: store as never, workspaceId });
    const title = String(data.title);
    const schedule = scheduleSpec.kind === "weekly"
      ? { daysOfWeek: (scheduleSpec.daysOfWeek ?? []).map((day) => day % 7), kind: "weekly" as const, time: scheduleSpec.time, timeZone: scheduleSpec.timeZone }
      : { kind: "daily" as const, time: scheduleSpec.time, timeZone: scheduleSpec.timeZone };
    const scopeWords = String(data.candidateScope ?? title);
    const replan = replanSaidIn(title);
    const domain = replan ? "todo" : domainSaidIn(scopeWords) ?? "event";
    const scope = scopeSaidIn(scopeWords, { industries: INDUSTRY_WORDS, places: PLACE_WORDS }, domain)!;
    const titleOf = (fixtureId: string) => loadWorld(world).anchors.find((anchor) => anchor.id === fixtureId)?.data.title;
    const references = ((data.references as { type: string; id: string }[] | undefined) ?? []).map((reference) => ({ id: report.ids[reference.id] ?? reference.id, ...(typeof titleOf(reference.id) === "string" ? { title: String(titleOf(reference.id)) } : {}), type: "memo" as const }));
    const basisWords = data.rankingBasis ? String(data.rankingBasis) : null;
    const said = basisWords ? fieldSaidIn(basisWords, domain) : null;
    const natural = domain === "contact" ? "lastInteraction" : domain === "todo" ? "plannedDate" : "startsAt";
    const field = said ?? (!references.length && (!basisWords || replan) ? natural : null);
    const notify = (data.notify as { inApp?: boolean; push?: boolean } | undefined) ?? {};
    const locale = (loadWorld(world).accounts[record.account]?.locale ?? "zh") as "zh" | "en" | "ja";
    const rule = {
      action: replan ? ("replan" as const) : ("pick" as const),
      locale,
      maxItems: Number(data.maxItems ?? 3),
      notify: { inApp: true, push: notify.push === true },
      onEmpty: "silent" as const,
      ranking: { ...(field ? { field: { direction: "asc" as const, name: field } } : {}), ...(!field && !references.length && basisWords ? { topic: basisWords } : {}) },
      rankingBasis: basisWords ?? (locale === "en" ? "By start time, earliest first" : locale === "ja" ? "開始時間の早い順" : "按开始时间从早到晚"),
      references,
      scope,
      scopeText: data.candidateScope ? scopeWords : scopeWordsOf(scope, locale),
      validUntil: typeof data.validUntil === "string" ? data.validUntil : null,
    };
    const automation = await service.create({
      automationId: productId("rule", world, record.id),
      capabilityId: RULE_CAPABILITY_OF[domain],
      delivery: rule.notify.push ? "push" : "in_app",
      instruction: `${rule.scopeText} — ${rule.rankingBasis}`,
      rule,
      source: "manual",
      title,
      trigger: { kind: "schedule", schedule },
    });
    report.ids[record.id] = automation.automationId;
    count(report, record.account, "rules");
    const expected = iso(data.nextRunAt);
    const indexed = (await storage.direct.due.get({ key: automation.automationId, kind: "rule", ownerId: actorId }))?.nextRunAt ?? null;
    if (expected && indexed !== expected) gap(report, record.id, "nextRunAt", `the fixture says ${expected}; the schedule gives ${indexed}`);
    if (Number(data.version ?? 1) > 1) gap(report, record.id, "version", "a fixture rule is made at version 1; its earlier versions are not replayed");
    if (data.status === "paused") await service.update(automation.automationId, { status: "paused" });
  }

  /**
   * AG15 (SCH.yaml external_change of a platform event): the organizer announces the time, the place and the topics of
   * an event through the host's own update and publish — not a write of the tested system.
   */
  async function updatePlatformEvent(fixtureId: string, set: Record<string, unknown>): Promise<void> {
    const eventId = report.ids[fixtureId];
    if (!eventId) throw new Error(`unknown platform event ${fixtureId}`);
    await ensureOrganizer();
    const organizerActor = actorOf(EVAL_ORGANIZER.label);
    const current = await readHostEvent(events.client, workspaceId, eventId);
    if (!current) throw new Error(`platform event ${fixtureId} is not in the eval database`);
    const startsAt = iso(set.startsAt);
    const topics = Array.isArray(set.topics) ? (set.topics as string[]).join("、") : null;
    const description = topics ? [`主题：${topics}`, ...String(current.description ?? "").split("\n").filter((line) => !/^主题：/u.test(line) && !/时间未公布/u.test(line))].filter(Boolean).join("\n") : undefined;
    const updated = await hostLifecycle.update(organizerActor, eventId, {
      ...(description !== undefined ? { description } : {}),
      ...(startsAt ? { endsAt: new Date(Date.parse(startsAt) + 3 * 3_600_000).toISOString(), startsAt } : {}),
      expectedVersion: current.version,
      notify: false,
      ...(set.venue !== undefined ? { venueName: String(set.venue) } : {}),
      ...(typeof set.title === "string" ? { title: set.title } : {}),
    } as never);
    if (startsAt && updated.event.lifecycle !== "published") await hostLifecycle.publish(organizerActor, eventId, updated.event.version);
  }

  async function writeConversation(record: FixtureRecord): Promise<void> {
    const actorId = actorOf(record.account);
    const provider = createConfiguredStorageOrbitAgentChatSessionProvider({ actorId });
    if (!provider) throw new Error("chat session storage is not configured");
    const messages = (record.data.messages as { role: "user" | "assistant"; text: string; at?: string; recordRefs?: string[] }[]) ?? [];
    const id = productId("session", world, record.id).replace(":", "_");
    const createdAt = iso(messages[0]?.at) ?? iso(record.data.startedAt) ?? new Date(Date.parse(clock) - 86_400_000).toISOString();
    const updatedAt = iso(record.data.lastActivityAt) ?? iso(messages[messages.length - 1]?.at) ?? createdAt;
    // AG03: a message's record refs ("todo:T44") are kept as "<type>:<product id>" (设计稿 §3.10: old answers keep their ids).
    const productRef = (ref: string) => {
      const at = ref.indexOf(":");
      const product = at > 0 ? report.ids[ref.slice(at + 1)] : undefined;
      return product ? `${ref.slice(0, at)}:${product}` : null;
    };
    for (let index = 0; index < messages.length; index += 50) {
      await provider.upsertSession({
        createdAt,
        id,
        messages: messages.slice(index, index + 50).map((message, offset) => {
          const refs = (message.recordRefs ?? []).map(productRef).filter((ref): ref is string => Boolean(ref));
          return { id: `${id}:m${index + offset + 1}`, role: message.role, text: message.text, ...(message.at ? { createdAt: iso(message.at) } : {}), ...(refs.length ? { recordRefs: refs } : {}) };
        }),
        title: String(record.data.title ?? messages[0]?.text ?? "对话").slice(0, 120),
        updatedAt,
      } as never);
    }
    report.ids[record.id] = id;
    count(report, record.account, "conversations");
    await writeConversationState(record, actorId, id, updatedAt);
  }

  /**
   * AG03: the session state a fixture conversation carries (shown list, last mentioned, open items),
   * by id and name only, through the product's session-state store. Fixture ids become product ids.
   */
  async function writeConversationState(record: FixtureRecord, actorId: string, sessionId: string, updatedAt: string): Promise<void> {
    const state = (record.data.state ?? record.data) as { shownList?: unknown; lastMentioned?: unknown; openItems?: unknown };
    const shown = Array.isArray(state.shownList) ? state.shownList : (state.shownList as { items?: unknown[] } | undefined)?.items;
    const named = (items: unknown) => ((Array.isArray(items) ? items : []) as { type: string; id: string; name: string }[])
      .map((item) => ({ id: report.ids[item.id], name: String(item.name), type: String(item.type) }))
      .filter((item) => Boolean(item.id));
    const lastMentioned = named(state.lastMentioned);
    const shownList = named(shown);
    const openItems = Array.isArray(state.openItems) ? state.openItems : [];
    if (!lastMentioned.length && !shownList.length && !openItems.length) return;
    if (openItems.length) gap(report, record.id, "openItems", "open items in a fixture conversation are not seeded yet (none of the AG03 fixtures has any)");
    const store = createLiveAgentSessionStateStore();
    if (!store) throw new Error("session state storage is not configured");
    await store.put(actorId, { lastMentioned, openItems: [], sessionId, shownList: shownList.length ? { items: shownList, shownAt: updatedAt } : null, updatedAt });
  }

  async function writeAll(records: readonly FixtureRecord[], labels: Record<string, string>, onProgress?: (message: string) => void): Promise<SeedReport> {
    for (const [label, name] of Object.entries(labels)) await ensureAccount(accountIdentity(label, name));
    const byKind = (kind: FixtureRecord["kind"]) => records.filter((record) => record.kind === kind);
    const step = async (kind: FixtureRecord["kind"], size: number, work: (record: FixtureRecord) => Promise<void>) => {
      const list = byKind(kind);
      if (!list.length) return;
      const started = Date.now();
      await inBatches(list, size, async (record) => {
        try {
          // Serializable transactions may conflict under parallel writes; the idempotency keys make a retry safe.
          for (let attempt = 1; ; attempt += 1) {
            try {
              await work(record);
              break;
            } catch (error) {
              const serialization = /could not serialize|deadlock detected/u.test(error instanceof Error ? error.message : String(error));
              if (!serialization || attempt >= 6) throw error;
              await new Promise((resolve) => setTimeout(resolve, 30 * attempt + Math.floor(Math.random() * 40)));
            }
          }
        } catch (error) {
          throw new Error(`${record.id} (${kind}, account ${record.account}): ${error instanceof Error ? error.message : error}`, { cause: error });
        }
      });
      onProgress?.(`${kind}: ${list.length} in ${Math.round((Date.now() - started) / 100) / 10}s`);
    };
    await step("contact", 8, writeContact);
    await step("platform_event", 1, writePlatformEvent);
    await step("my_event", 1, writeMyEvent);
    // AG13: private events and «我去过» before the records that link to them.
    await step("private_event", 4, writePrivateEvent);
    await step("attendance", 4, writeAttendance);
    await step("memo", 8, writeMemo);
    await step("todo", 8, (record) => writeTodo(record, false));
    await step("followup", 8, (record) => writeTodo(record, true));
    await step("schedule", 1, writeSchedule);
    await step("memory", 1, writeMemory);
    await step("rule", 1, writeRule);
    await step("conversation", 4, writeConversation);
    for (const kind of ["connection", "card"] as const) {
      // AG17: an external connection is not seeded; the runner makes it through the product's authorization flow when a case uses it.
      for (const record of byKind(kind)) gap(report, record.id, kind, kind === "connection" ? "made by the runner through the product's authorization flow when a case uses it (AG17), not by the seed" : `${kind} cannot be written by the current product; arrives in a later sprint`);
      if (byKind(kind).length) count(report, byKind(kind)[0].account, `${kind}_not_seeded`, byKind(kind).length);
    }
    return report;
  }

  /**
   * AG16 (PSH.yaml push-device-app): a device registration through the product's device service. `client: app` is a
   * phone with an Expo token; `client: web` is a browser whose subscription points at this server's local simulator
   * (its keys are derived from the device id — tests/agent-eval/preload/web-push-sim.cjs). `permission` is stored as
   * the fixture says: a browser that said no is on record as denied, and the product must not send to it.
   */
  async function writePushDevice(record: FixtureRecord, port: number): Promise<void> {
    const actorId = actorOf(record.account);
    const client = String(record.data.client ?? "app");
    const permission = String(record.data.permission ?? "granted") as "granted" | "provisional" | "denied" | "undetermined";
    const deviceId = productId("push-device", world, record.id);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { evalWebPushSubscription } = require("../preload/web-push-sim.cjs") as { evalWebPushSubscription(deviceId: string, port: number): { endpoint: string; keys: { p256dh: string; auth: string } } };
    const token = client === "web" ? webPushTokenOf(evalWebPushSubscription(deviceId, port)) : `ExponentPushToken[agent-eval-${record.id}]`;
    await createPushDeviceService({ actorId }).register({ deviceId, permission, platform: client === "web" ? "web" : "ios", token });
    report.ids[record.id] = deviceId;
    count(report, record.account, "push_devices");
  }

  /** AG16 (PSH.yaml rule-push-on): a rule's reminder switch, set the way the task's own page sets it. */
  async function updateRule(fixtureId: string, account: string, set: Record<string, unknown>): Promise<void> {
    const actorId = actorOf(account);
    const automationId = idOf(fixtureId);
    if (!automationId) throw new Error(`${fixtureId} was not seeded`);
    const other = Object.keys(set).filter((key) => key !== "id" && key !== "account" && key !== "notify");
    if (other.length) throw new Error(`only a rule's notify can be changed in place (got ${other.join(", ")})`);
    const storage = createPostgresAutomationStorage({ client: runtime.client, workspaceId });
    const service = createStorageAgentAutomationService({ actorId, now: () => new Date(Date.parse(clock) - 30_000).toISOString(), storage, store: store as never, workspaceId });
    const updated = await setTaskReminder(service, automationId, { push: (set.notify as { push?: boolean } | undefined)?.push === true });
    if (!updated) throw new Error(`${fixtureId} is not a scheduled task`);
  }

  async function close(): Promise<void> {
    await Promise.allSettled([configured.client.close(), runtime.client.close(), events.client.close()]);
  }

  return { actorOf, close, ensureAccount, report, setMemorySettings, updatePlatformEvent, updateRule, updateTodo, writePushDevice, writeAll, writeAttendance, writeContact, writeConversation, writeMemo, writeMemory, writePrivateEvent, writeRule, writeSchedule, writeTodo };
}

export type WorldWriter = ReturnType<typeof createWorldWriter>;
