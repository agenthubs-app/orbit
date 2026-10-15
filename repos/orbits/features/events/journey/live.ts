/**
 * R27 活动参加者整条路的 live 端口（`ports.ts` 的实现；纯映射在 `live-mapping.ts`）。Owner: 甲 (R27).
 * - 装配约定同 `getConfiguredEventAssessmentRuntime()`：非 live / 库未配置 → null（路由回 503 或走示例世界）。
 * - 判定只走 R26 同一条路：`plan.context` → `orbitEvents.facts` → `judgeEvent`（与评估页 / 计划页同一数字）；一次最多 40 场。
 * - 可选读取（政策、人数、互动、计划、产物…）失败时记 `console.warn` JSON 并降级为空，从不静默吞掉。
 * - 只读别人的公开资料；关系只用我自己的联系人；主办方 actor id 只换成 `organizerKey`，从不外传。
 */
import { AppError } from "../../../shared/errors/app-error";
import { myAssessmentIdsByEvent } from "../assessment/ids-by-event";
import { typeOfPerson } from "../../../shared/compute/event-attendee-typing";
import type { EventAfterConfirmResult } from "../../../shared/contract/event-after";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { applyContactFieldValues } from "../../contacts/contact-field-write";
import { createInboxRecordUpserter } from "../../notifications/inbox-record-service";
import { createPostgresInboxRecordTransaction } from "../../notifications/storage/inbox-record-repository";
import { resolvePlanV2Service } from "../../plans/v2/service-factory";
import { getSelfProfileForAi } from "../../profile/self-profile-reader";
import { createConfiguredTaskService } from "../../tasks/service-factory";
import { createPostgresActorRecordStore } from "../actor-records/store";
import { getConfiguredEventAssessmentRuntime } from "../assessment/configured";
import { judgeEvent } from "../assessment/judge";
import type { PublishedCanonicalEvent } from "../core/contract";
import { createConfiguredEventCoreService } from "../core/runtime";
import { readEventOperationsCatalogueSummaries } from "../event-operations/catalogue-summary";
import { createConfiguredEventOperationsRepository } from "../event-operations/repository";
import { createConfiguredEventOperationsService } from "../event-operations/runtime";
import { createPostgresMyEventsReader, mergeMyEvents } from "../mine/service";
import { createConfiguredAttendeePostEventAiArtifactReader } from "../post-event-artifact/runtime";
import { createEventRegistrationPortraitRuntime } from "../registration/portrait/runtime";
import {
  afterConfirmationIds,
  afterDraftFrom,
  afterMetFrom,
  afterPlanFrom,
  contactHistoryFrom,
  followupDueAt,
  followupTaskTitle,
  inboxUpsertFor,
  journeyEventFromCanonical,
  judgeEntryFrom,
  linkedTypeByContactFrom,
  organizerHistory,
  organizerKeyFor,
  payloadSpeakerNames,
  publicAttendeesFromRegistrations,
  type AdmissionFacts,
  type AfterConfirmationEventRecord,
  type AfterConfirmationKeyRecord,
  type AfterConfirmationRowRecord,
  type PlanTypeLite,
  venueWorkspaceFrom,
} from "./live-mapping";
import type { JourneyContact, JourneyEvent, JourneyLivePorts, MyEventStatus } from "./ports";

type Query = (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const DAY = 86_400_000;
export const CATALOGUE_DAYS = 120;
export const CATALOGUE_LIMIT = 200;
export const JUDGE_LIMIT = 40;
export const CONTACTS_LIMIT = 500;
const ORGANIZER_EVENTS_LIMIT = 200;

/** 可选读取失败：记日志并返回缺省（复核：不能静默）。 */
function warned<T>(event: string, fallback: T, extra: Record<string, unknown> = {}): (error: unknown) => T {
  return (error) => {
    console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event, ...extra }));
    return fallback;
  };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index]!);
    }
  }));
  return out;
}

const iso = (value: unknown): string | null => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString() : String(value));
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export function createJourneyLivePorts(): JourneyLivePorts | null {
  const runtime = getConfiguredEventAssessmentRuntime();
  if (!runtime) return null;
  const core = createConfiguredEventCoreService();
  const operations = createConfiguredEventOperationsRepository();
  if (!core || !operations) return null;
  const workspaceId = runtime.workspaceId;
  const query: Query = (sql, values) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  const store = createPostgresActorRecordStore({ query, workspaceId });
  let operationsService: ReturnType<typeof createConfiguredEventOperationsService> | undefined;
  const opsService = () => (operationsService ??= createConfiguredEventOperationsService());

  // ── 活动事实 ────────────────────────────────────────────────────────────
  async function countsFor(eventIds: readonly string[]): Promise<Map<string, number>> {
    if (!eventIds.length) return new Map();
    const summaries = await readEventOperationsCatalogueSummaries(eventIds).catch(warned("r27_journey_counts_failed", [] as Awaited<ReturnType<typeof readEventOperationsCatalogueSummaries>>));
    return new Map(summaries.map((summary) => [summary.eventId, summary.activeRegistrationCount]));
  }

  /** 报名政策（定员 / 审核 / 截止）：一次批量读当前版本。 */
  async function policiesFor(eventIds: readonly string[]): Promise<Map<string, AdmissionFacts>> {
    if (!eventIds.length) return new Map();
    const result = await query(
      `/* events:r27-journey:policies */ select head.event_id, policy.capacity, policy.admission_mode, policy.registration_closes_at
         from event_ops_admission_policy_heads head
         join event_ops_admission_policy_versions policy on policy.workspace_id = head.workspace_id and policy.event_id = head.event_id and policy.policy_version = head.policy_version
        where head.workspace_id = $1 and head.event_id = any($2::text[]) limit $3`,
      [workspaceId, [...eventIds], eventIds.length],
    ).catch(warned("r27_journey_policies_failed", { rows: [] as Array<Record<string, unknown>> }));
    return new Map(result.rows.map((row) => {
      const capacity = row.capacity === null || row.capacity === undefined ? null : Number(row.capacity);
      return [String(row.event_id), { admissionMode: str(row.admission_mode), capacity: capacity !== null && Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null, registrationClosesAt: iso(row.registration_closes_at) }];
    }));
  }

  async function toJourneyEvents(events: readonly PublishedCanonicalEvent[]): Promise<JourneyEvent[]> {
    const ids = events.map((event) => event.eventId);
    const [counts, policies] = await Promise.all([countsFor(ids), policiesFor(ids)]);
    return events.map((event) => journeyEventFromCanonical(event, { policy: policies.get(event.eventId) ?? null, registrationCount: counts.get(event.eventId) ?? 0 }));
  }

  async function publishedEvent(eventId: string): Promise<PublishedCanonicalEvent | null> {
    const event = await core!.getPublishedEvent(eventId);
    return event && event.publicCode?.trim() ? event : null;
  }

  // ── 计划（当前目标）────────────────────────────────────────────────────
  async function currentPlan(actorId: string) {
    const resolved = resolvePlanV2Service({ actorId });
    if (!resolved.success) return null;
    const service = resolved.service;
    const summary = await service.summary().catch(warned("r27_journey_plan_summary_failed", null));
    const current = summary?.current;
    if (!current) return null;
    const detail = await service.detail(current.planId).catch(warned("r27_journey_plan_detail_failed", null));
    if (!detail) return null;
    const types: PlanTypeLite[] = detail.content.personTypes.map((type) => ({ allocation: type.allocation, itemId: type.itemId, key: type.key, roleSituation: type.roleSituation ?? null, shortLabel: type.shortLabel, skipped: type.skipped, targetCount: type.targetCount }));
    const needs = await service.activeTypeNeeds().catch(warned("r27_journey_plan_needs_failed", null));
    const links = (needs?.needs ?? []).filter((need) => need.planId === current.planId);
    return { before: current.score.total, detail, goal: current.goal, links, planId: current.planId, service, types };
  }

  // ── 会場 / 会後 共用 ──────────────────────────────────────────────────
  async function attendeeWorkspace(actorId: string, eventId: string) {
    const service = opsService();
    if (!service) return null;
    return service.attendeeWorkspace({ actorId, eventId }).catch(warned("r27_journey_workspace_failed", null, { eventId }));
  }

  return {
    async catalogue(now) {
      const from = now.getTime();
      const until = from + CATALOGUE_DAYS * DAY;
      const events = (await core.listPublishedEvents(now))
        .filter((event) => event.publicCode?.trim() && Date.parse(event.endsAt) > from && Date.parse(event.startsAt) < until)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.eventId.localeCompare(b.eventId))
        .slice(0, CATALOGUE_LIMIT);
      return toJourneyEvents(events);
    },

    async event(eventId) {
      const event = await publishedEvent(eventId);
      return event ? (await toJourneyEvents([event]))[0] ?? null : null;
    },

    async organizerStats(organizerKey) {
      const now = new Date();
      const mine = (await core.listPublishedEvents(now))
        .filter((event) => organizerKeyFor(event.organizerActorId) === organizerKey)
        .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
        .slice(0, ORGANIZER_EVENTS_LIMIT);
      if (!mine.length) return null;
      const counts = await countsFor(mine.map((event) => event.eventId));
      return organizerHistory(mine.map((event) => ({ registrationCount: counts.get(event.eventId) ?? 0, startsAt: event.startsAt })), now);
    },

    async eventIdByCode(code) {
      const trimmed = code.trim();
      if (!trimmed) return null;
      for (const candidate of [...new Set([trimmed, trimmed.toUpperCase()])]) {
        const event = await core.getPublishedEvent(candidate);
        if (event?.publicCode && event.publicCode.trim().toLowerCase() === trimmed.toLowerCase()) return event.eventId;
      }
      return null;
    },

    async publicAttendees(eventId) {
      const event = await publishedEvent(eventId).catch(warned("r27_journey_event_read_failed", null, { eventId }));
      if (!event) return { attendees: [], total: 0 };
      const registrations = await operations.listCanonicalRegistrations(event.eventId);
      return publicAttendeesFromRegistrations(registrations, payloadSpeakerNames(event.sourcePayload ?? {}));
    },

    async myEvents(actorId) {
      const now = Date.now();
      const reader = createPostgresMyEventsReader({ query, workspaceId });
      const rows = mergeMyEvents((await reader.rows(actorId, { from: new Date(now - 180 * DAY).toISOString(), limit: 200, until: new Date(now + 365 * DAY).toISOString() })).filter((row) => !row.external));
      const ids = rows.map((row) => row.eventId);
      const organizers = ids.length
        ? await query(`/* events:r27-journey:organizers */ select event_id, organizer_actor_id from event_ops_events where workspace_id = $1 and event_id = any($2::text[]) limit $3`, [workspaceId, ids, ids.length])
          .catch(warned("r27_journey_organizers_failed", { rows: [] as Array<Record<string, unknown>> }))
        : { rows: [] };
      const byEvent = new Map(organizers.rows.map((row) => [String(row.event_id), organizerKeyFor(str(row.organizer_actor_id))]));
      return rows.map((row) => ({ eventId: row.eventId, organizerKey: byEvent.get(row.eventId) ?? null, status: row.status as MyEventStatus }));
    },

    async contacts(actorId) {
      const [result, plan] = await Promise.all([
        query(
          `/* events:r27-journey:contacts */ select c.record_id, coalesce(c.payload->>'displayName', c.payload->>'name', '') as name,
                  coalesce(c.payload->>'organization', c.payload->>'company') as organization, c.payload->>'role' as role,
                  (select d.payload->'lastInteraction' from orbit_records d
                    where d.workspace_id = c.workspace_id and d.collection_name = 'contact_detail_states' and d.lifecycle_state <> 'deleted'
                      and d.user_id = $2 and d.payload->>'contactId' = c.record_id order by d.updated_at desc limit 1) as last_interaction
             from orbit_records c
            where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'
            order by c.updated_at desc limit $3`,
          [workspaceId, actorId, CONTACTS_LIMIT],
        ),
        currentPlan(actorId).catch(warned("r27_journey_plan_failed", null)),
      ]);
      const linked = plan ? linkedTypeByContactFrom(plan.types, plan.links) : new Map<string, string>();
      return result.rows.flatMap((row): JourneyContact[] => {
        const name = str(row.name);
        if (!name) return [];
        const id = String(row.record_id);
        return [{ history: contactHistoryFrom(row.last_interaction), id, linkedTypeKey: linked.get(id) ?? null, name, org: str(row.organization), role: str(row.role) }];
      });
    },

    async judge(actorId, eventIds, language) {
      const context = await runtime.plan.context(actorId, language);
      const hasPlan = Boolean(context.planId) && context.types.length > 0;
      if (!hasPlan) return { goal: null, hasPlan: false, results: {} };
      const ids = [...new Set(eventIds.filter(Boolean))].slice(0, JUDGE_LIMIT);
      const assessmentByEvent = await myAssessmentIdsByEvent(query, workspaceId, actorId, ids).catch(warned("r27_journey_assessment_ids_failed", new Map<string, string>()));
      const results: Awaited<ReturnType<JourneyLivePorts["judge"]>>["results"] = {};
      await mapLimit(ids, 4, async (eventId) => {
        let loaded: Awaited<ReturnType<typeof runtime.orbitEvents.facts>>;
        try {
          loaded = await runtime.orbitEvents.facts(actorId, eventId, context);
        } catch {
          console.warn(JSON.stringify({ event: "r27_judge_failed", eventId }));
          return;
        }
        if (!loaded) return;
        const result = judgeEvent({ context, eventId, facts: loaded.facts, orbit: loaded.extras });
        results[eventId] = judgeEntryFrom(result, { assessmentId: assessmentByEvent.get(eventId) ?? null, goal: context.goalLabel, language, planFitNames: loaded.meetNames ?? [] });
      });
      return { goal: context.goalLabel, hasPlan: true, results };
    },

    async planTypesFor(actorId, attendees) {
      const plan = await currentPlan(actorId).catch(warned("r27_journey_plan_failed", null));
      const types = (plan?.types ?? []).filter((type) => !type.skipped);
      const label = new Map<string, string>(types.map((type) => [type.key, type.shortLabel]));
      return Object.fromEntries(attendees.map((attendee) => {
        const key = types.length ? typeOfPerson({ name: attendee.name, org: attendee.org, role: attendee.role }, types) : null;
        return [attendee.attendeeId, key ? { key, label: label.get(key)! } : null];
      }));
    },

    async selfIntro(actorId, eventId) {
      const portrait = createEventRegistrationPortraitRuntime();
      const saved = portrait ? await portrait.repository.read({ actorId, eventId }).catch(warned("r27_journey_portrait_failed", null, { eventId })) : null;
      // E4 会在 persona 上加 `selfIntroDraft`；现在没有就退到个人资料。
      const draft = str((saved?.persona as { selfIntroDraft?: unknown } | undefined)?.selfIntroDraft);
      if (draft) return { source: "registration_draft", text: draft };
      const profile = await getSelfProfileForAi({ actorId, mode: "live" }, { locale: "ja" }).catch(warned("r27_journey_profile_failed", null));
      const bio = profile?.status === "ok" ? str(profile.profile.bio) : null;
      return bio ? { source: "profile", text: bio } : null;
    },

    async registered(actorId, eventId) {
      const registration = await operations.getCanonicalRegistration(eventId, actorId);
      return registration?.status === "rsvped" && registration.userId === actorId;
    },

    async venueWorkspace(actorId, eventId) {
      const workspace = await attendeeWorkspace(actorId, eventId);
      if (!workspace) return null;
      const published = workspace.resultsState === "ready"
        ? await operations.getPublishedResultForAttendee(eventId).catch(warned("r27_journey_published_result_failed", null, { eventId }))
        : null;
      return venueWorkspaceFrom(workspace, published);
    },

    async afterInputs(actorId, eventId) {
      const [workspace, plan, artifact, confirmed] = await Promise.all([
        attendeeWorkspace(actorId, eventId),
        currentPlan(actorId).catch(warned("r27_journey_plan_failed", null)),
        readArtifact(actorId, eventId),
        store.get<AfterConfirmationEventRecord>("eventAfterConfirmations", actorId, afterConfirmationIds.event(actorId, eventId)).catch(warned("r27_journey_confirmation_read_failed", null, { eventId })),
      ]);
      const types = (plan?.types ?? []).filter((type) => !type.skipped);
      const linked = plan ? linkedTypeByContactFrom(plan.types, plan.links) : new Map<string, string>();
      const people = workspace ? afterMetFrom(workspace, { linkedTypeByContact: linked, types }) : { met: [], wantedTotal: 0 };
      const remaining = plan ? await plan.service.planRemainingTargets().catch(warned("r27_journey_plan_remaining_failed", [] as Awaited<ReturnType<typeof plan.service.planRemainingTargets>>)) : [];
      const afterPlan = plan
        ? afterPlanFrom({ before: plan.before, goal: plan.goal, links: plan.links, remaining: remaining.find((item) => item.planId === plan.planId)?.types ?? [], segments: plan.detail.score.segments, types: plan.types })
        : null;
      const draft = afterDraftFrom(artifact);
      return { ai: draft.ai, confirmedAt: confirmed && !confirmed.deleted ? confirmed.payload.confirmedAt : null, legacy: draft.legacy, meetings: 0, met: people.met, plan: afterPlan, wantedTotal: people.wantedTotal };
    },

    async confirmAfter(actorId, eventId, input) {
      const keyId = afterConfirmationIds.key(actorId, eventId, input.idempotencyKey);
      const replay = await store.get<AfterConfirmationKeyRecord>("eventAfterConfirmations", actorId, keyId);
      if (replay && !replay.deleted) return replay.payload.result;

      const [workspace, plan, event] = await Promise.all([
        attendeeWorkspace(actorId, eventId),
        currentPlan(actorId).catch(warned("r27_journey_plan_failed", null)),
        core.getPublishedEvent(eventId).catch(warned("r27_journey_event_read_failed", null, { eventId })),
      ]);
      // 读不到运营工作区就什么都确认不了：不写整场记录（否则确定按钮永久锁死），让调用方重试。
      if (!workspace) throw new AppError("SERVICE_UNAVAILABLE", "The event workspace is temporarily unavailable; nothing was confirmed.");
      const linked = plan ? linkedTypeByContactFrom(plan.types, plan.links) : new Map<string, string>();
      const met = workspace ? afterMetFrom(workspace, { linkedTypeByContact: linked, types: [] }).met : [];
      const directory = new Map<string, string>((workspace?.directory ?? []).map((participant) => [participant.participantId, participant.displayName]));
      const tasks = taskService();
      const contactStore = contactsStore();
      let tasksCreated = 0;
      let contactsLinked = 0;
      let confirmedRows = 0;
      const at = new Date().toISOString();
      for (const item of input.items) {
        const dueAt = followupDueAt(item.followupDate);
        const person = met.find((entry) => entry.attendeeId === item.attendeeId);
        const name = person?.name ?? directory.get(item.attendeeId) ?? null;
        if (!dueAt || !name) continue;
        const contactId = person?.contactId ?? null;
        const rowId = afterConfirmationIds.row(actorId, eventId, item.attendeeId);
        const existing = await store.get<AfterConfirmationRowRecord>("eventAfterConfirmations", actorId, rowId);
        confirmedRows += 1;
        let taskId = existing && !existing.deleted ? existing.payload.taskId : null;
        // 同一参加者已确定过：不再建第二条 To-do（任务本身也按确定性的幂等键去重）。
        if (!(existing && !existing.deleted) && tasks) {
          const created = await tasks.create({
            actorId,
            category: "relationship",
            dueAt,
            idempotencyKey: afterConfirmationIds.taskKey(eventId, item.attendeeId),
            now: at,
            plannedDate: item.followupDate,
            relatedEventId: eventId,
            source: "event",
            title: followupTaskTitle(name),
            ...(contactId ? { relatedContactId: contactId } : {}),
          }).catch(warned("r27_after_task_failed", null, { eventId }));
          if (created) { taskId = created.task.id; tasksCreated += 1; }
        }
        if (contactId && contactStore) {
          const linkedResult = await applyContactFieldValues({ actorId, contactId, fillMetEvent: { eventId, title: event?.title ?? null }, source: "manual", store: contactStore.store, values: {}, workspaceId: contactStore.workspaceId })
            .catch(warned("r27_after_contact_link_failed", null, { eventId }));
          if (linkedResult?.written) contactsLinked += 1;
        }
        const type = item.planTypeKey && plan ? plan.types.find((entry) => entry.key === item.planTypeKey) : undefined;
        if (type && contactId && plan) {
          // 计划自己按「同人同类型一次」去重（already_counted）。
          await plan.service.award({ itemId: type.itemId, planId: plan.planId, request: { basis: "talked", contactId, idempotencyKey: afterConfirmationIds.awardKey(eventId, type.key, contactId) } })
            .catch(warned("r27_after_award_failed", null, { eventId }));
        }
        if (!(existing && !existing.deleted)) {
          await store.put<AfterConfirmationRowRecord>("eventAfterConfirmations", actorId, rowId, { attendeeId: item.attendeeId, confirmedAt: at, contactId, followupDate: item.followupDate, taskId }, at);
        }
      }
      const after = plan ? await plan.service.summary().catch(warned("r27_journey_plan_summary_failed", null)) : null;
      const result: EventAfterConfirmResult = { confirmed: confirmedRows, confirmedAt: at, contactsLinked, eventId, scoreAfter: after?.current?.score.total ?? null, tasksCreated };
      // 一行都没确认成（名单里找不到这些人）时不写整场 / 幂等记录：页面不会被锁成「確定済み」，可以改了再提交。
      if (confirmedRows > 0) {
        await store.put<AfterConfirmationEventRecord>("eventAfterConfirmations", actorId, afterConfirmationIds.event(actorId, eventId), { confirmedAt: at, eventId }, at);
        await store.put<AfterConfirmationKeyRecord>("eventAfterConfirmations", actorId, keyId, { result }, at);
      }
      return result;
    },

    async upsertInbox(actorId, input) {
      const nowIso = new Date().toISOString();
      const upsert = createInboxRecordUpserter({
        now: () => nowIso,
        transaction: (owner, operation) => runtime.client.transaction(async (executor) => operation(await createPostgresInboxRecordTransaction({ actorId: owner, executor, workspaceId }))),
      });
      const saved = await upsert(inboxUpsertFor(actorId, input, nowIso)).catch(warned("r27_journey_inbox_failed", null, { eventId: input.eventId }));
      return Boolean(saved);
    },
  };

  function readArtifact(actorId: string, eventId: string) {
    const reader = createConfiguredAttendeePostEventAiArtifactReader();
    return reader ? reader.read({ attendeeActorId: actorId, eventId }).catch(warned("r27_journey_artifact_failed", null, { eventId })) : Promise.resolve(null);
  }
}

let taskServiceHolder: ReturnType<typeof createConfiguredTaskService> | null | undefined;
function taskService() {
  if (taskServiceHolder !== undefined) return taskServiceHolder;
  try {
    taskServiceHolder = createConfiguredTaskService();
  } catch (error) {
    warned("r27_journey_tasks_unconfigured", null)(error);
    taskServiceHolder = null;
  }
  return taskServiceHolder;
}

function contactsStore() {
  return createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
}
