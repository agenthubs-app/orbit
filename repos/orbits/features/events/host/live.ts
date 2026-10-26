/**
 * R17 主催的 live 实现（Postgres + 现有 admission / operations / access）。Owner: 甲 (R17). DESIGN §2–§4。
 * - 授权：每个读写都按 `canAccessEventCapability`（owner 来自 Event Core；角色来自 event-access），与 `requireEventCapability` 同一判定。
 * - 数字：来自参加者私人记录的（会後フォロー、名刺交換、立場分布）按 §2.9 做 <5 抑制与差分保护。
 * - 不调付费 AI（编组生成走现有 event-ops worker，与之前相同）；不发自由文本通知。
 */
import { randomUUID } from "node:crypto";

import { hostNextSteps, hostTodoItems, type HostTodoEventFacts } from "../../../shared/compute/host-todo";
import { suggestQuestions } from "../../../shared/compute/question-suggest";
import { suppressCells, suppressedDistribution, suppressedRate, suppressSmall } from "../../../shared/compute/small-cell";
import type { HostCenterEventRow, HostCenterResponse, HostEventStatus, HostEventView, HostEventWriteResult, HostRole } from "../../../shared/contract/host-events";
import type { HostKioskRow, HostMatchingResponse, HostPeopleBucket, HostPeopleRow, HostReportResponse, HostSetupQuestion, HostSetupResponse } from "../../../shared/contract/host-console";
import type { HostCohostRole } from "../../../shared/contract/host-cohosts";
import { createPostgresEventAdmissionRepository } from "../admission/storage/postgres-repository";
import { canAccessEventCapability } from "../event-access/capability-policy";
import { EVENT_ACCESS_CAPABILITIES, type EventAccessCapability } from "../event-access/contract";
import { createPostgresEventAccessRepository } from "../event-access/storage/postgres-repository";
import type { EventOperationsParticipant } from "../event-operations/contract";
import { createConfiguredEventOperationsPostgresRuntime, type EventOperationsPostgresClient } from "../event-operations/storage/postgres-client";
import { eventOrganizerKey } from "../journey/live-mapping";
import { createHostLiveReads, type HostEventFacts } from "./live-reads";
import { HostError, type HostService } from "./service";
import { enqueueHostNotice } from "./storage/admission-hooks";
import { actorNames, createHostCohosts } from "./storage/cohosts";
import { createHostKiosk } from "./storage/kiosk";
import { createHostLifecycle } from "./storage/lifecycle";
import { GENERATIONS_PER_EVENT, createHostMatchingStore, draftTables, composeGrouping, memberFor } from "./storage/matching";
import { createHostProfiles } from "./storage/profiles";
import { HOST_QUESTION_LIBRARY, hostNoticeTemplates } from "./templates";

/** 现有 event-ops 能力（编组生成 / 发布 / 代签 / 任务产物），测试可注入。 */
export interface HostOperationsPort {
  checkInParticipant(input: { actorId: string; eventId: string; participantId: string }): Promise<unknown>;
  startGeneration(input: { actorId: string; eventId: string; idempotencyKey: string }): Promise<{ generationId: string }>;
  publishGeneration(input: { actorId: string; eventId: string; generationId: string; composeGrouping: Parameters<typeof composeGrouping>[0] extends infer G ? (grouping: G & object) => G : never }): Promise<unknown>;
  latestGeneration(eventId: string): Promise<{ generationId: string; status: string; participants: readonly EventOperationsParticipant[]; grouping: { roundOne: readonly unknown[]; roundTwo: readonly unknown[] } | null; tableSize: number } | null>;
}

export interface HostLiveDeps {
  client: EventOperationsPostgresClient;
  workspaceId: string;
  operations: HostOperationsPort | null;
  revertPlanAttendance?: (input: { actorId: string; eventId: string }) => Promise<void>;
  now?: () => Date;
}

const ROLE_LABEL: Record<string, HostRole> = { check_in: "check_in", manager: "manager", operations: "operations", read_only_analyst: "read_only_analyst", reviewer: "reviewer" };
const ANSWER_KEYS = ["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"] as const;

/** R17-11：名簿照合每人每场每小时的上限。 */
const ROSTER_MATCH_PER_HOUR = 10;

function statusOf(facts: HostEventFacts, now: Date): HostEventStatus {
  if (facts.lifecycle !== "published") return facts.lifecycle;
  const start = facts.startsAt ? Date.parse(facts.startsAt) : Number.NaN;
  const end = facts.endsAt ? Date.parse(facts.endsAt) : Number.NaN;
  if (Number.isFinite(end) && now.getTime() >= end) return "ended";
  if (Number.isFinite(start) && now.getTime() >= start) return "live";
  return "upcoming";
}

/**
 * プロフィール完成度：与 R27 参加登録 的カバー率同一口径（会社・役職 44 + 目的 / 話題 / 会いたい人 / 提供 各 14）。
 * 有访谈回答（R27 的 ≤5 问）时按回答到的字段算；只有完整资料（8 项都填）时为 100。
 */
const COVERAGE_OF_FIELD: Readonly<Record<string, number>> = { desiredOutcome: 14, experienceHighlight: 14, targetAttendees: 14, valueOffered: 14 };
export function profileScore(payload: { answers?: Record<string, string>; interviewResponses?: ReadonlyArray<{ field?: string; answer?: { displayText?: string } }> } | undefined): number {
  const responses = payload?.interviewResponses;
  if (responses && responses.length > 0) {
    const fields = new Set(responses.filter((item) => (item.answer?.displayText ?? "").trim()).map((item) => item.field ?? ""));
    return 44 + Object.entries(COVERAGE_OF_FIELD).reduce((sum, [field, weight]) => sum + (fields.has(field) ? weight : 0), 0);
  }
  return ANSWER_KEYS.every((key) => (payload?.answers?.[key] ?? "").trim().length > 0) ? 100 : 44;
}
const splitPositioning = (value: string | undefined) => {
  const [role, org] = (value ?? "").split(/\s*[@＠]\s*/u);
  return { org: org?.trim() || null, role: role?.trim() || null };
};

export function createHostLiveService(deps: HostLiveDeps): HostService {
  const { client, workspaceId } = deps;
  const now = deps.now ?? (() => new Date());
  const access = createPostgresEventAccessRepository({ client, workspaceId });
  const admission = createPostgresEventAdmissionRepository({ client, workspaceId });
  const reads = createHostLiveReads({ client, workspaceId });
  const lifecycle = createHostLifecycle({ client, workspaceId });
  const profiles = createHostProfiles({ client, now, workspaceId });
  const matching = createHostMatchingStore({ client, workspaceId });

  async function capabilities(actorId: string, eventId: string): Promise<EventAccessCapability[]> {
    const view = await access.get({ eventId, subjectActorId: actorId }).catch(() => null);
    if (!view) return [];
    return EVENT_ACCESS_CAPABILITIES.filter((capability) => canAccessEventCapability({ capability, owner: view.owner, role: view.role, state: view.state }));
  }
  async function require(actorId: string, eventId: string, capability: EventAccessCapability): Promise<EventAccessCapability[]> {
    const caps = await capabilities(actorId, eventId);
    if (!caps.includes(capability)) throw new HostError(caps.length ? "FORBIDDEN" : "NOT_FOUND");
    return caps;
  }

  const cohosts = createHostCohosts({ access, client, now, workspaceId });
  const kiosk = createHostKiosk({
    admission,
    checkInParticipant: (input) => {
      if (!deps.operations) throw new HostError("NOT_CONFIGURED");
      return deps.operations.checkInParticipant(input);
    },
    client,
    now,
    requireCapability: async (actorId, eventId, capability) => { await require(actorId, eventId, capability); },
    revertPlanAttendance: deps.revertPlanAttendance,
    workspaceId,
  });

  async function view(actorId: string, facts: HostEventFacts, caps?: EventAccessCapability[]): Promise<HostEventView> {
    const mine = caps ?? await capabilities(actorId, facts.eventId);
    const profile = facts.organizerProfileId ? (await client.query<{ display_name: string; emoji: string | null; slug: string }>(`select display_name, emoji, slug from organizer_profiles where workspace_id = $1 and profile_id = $2`, [workspaceId, facts.organizerProfileId])).rows[0] : undefined;
    const members = await cohosts.members(facts.eventId);
    const names = await actorNames(client, workspaceId, members.map((member) => member.actorId));
    const cohostList = members.filter((member) => member.role !== "owner").map((member) => ({ actorId: member.actorId, initial: (names.get(member.actorId) ?? "?").trim().charAt(0), name: names.get(member.actorId) ?? "" }));
    return {
      admissionMode: facts.admissionMode,
      appliedCount: facts.applied,
      approvedCount: facts.admitted,
      archivedAt: facts.archivedAt,
      cancelledAt: facts.cancelledAt,
      capabilities: mine,
      capacity: facts.capacity,
      cohostCount: cohostList.length,
      cohosts: cohostList.slice(0, 5),
      description: facts.description,
      emoji: facts.payload.emoji ?? null,
      endsAt: facts.endsAt,
      eventId: facts.eventId,
      feeAmountYen: facts.payload.feeAmountYen ?? null,
      feeKind: facts.payload.feeKind ?? "free",
      feeUrl: facts.payload.feeUrl ?? null,
      followerCount: await reads.followerCount(eventOrganizerKey(facts.organizerActorId, facts.organizerProfileId)!),
      lifecycle: facts.lifecycle,
      myRole: facts.organizerActorId === actorId ? "owner" : ROLE_LABEL[facts.role ?? ""] ?? "read_only_analyst",
      online: facts.payload.online ?? false,
      organizerEmoji: profile?.emoji ?? null,
      organizerName: profile?.display_name ?? null,
      organizerProfileId: facts.organizerProfileId,
      organizerSlug: profile?.slug ?? null,
      participationCode: facts.lifecycle === "published" ? facts.publicCode : null,
      publicSlug: facts.lifecycle === "published" ? facts.publicSlug : null,
      registrationClosesAt: facts.registrationClosesAt,
      startsAt: facts.startsAt,
      status: statusOf(facts, now()),
      timezone: facts.timezone,
      title: facts.title,
      venueArea: facts.payload.venueArea ?? null,
      venueName: facts.venue,
      version: facts.version,
      waitlistedCount: facts.waitlisted,
    };
  }

  async function factsOrThrow(actorId: string, eventId: string): Promise<HostEventFacts> {
    const facts = await reads.eventFacts(actorId, eventId);
    if (!facts) throw new HostError("NOT_FOUND");
    return facts;
  }

  async function viewFor(actorId: string, eventId: string): Promise<HostEventView> {
    const caps = await require(actorId, eventId, "event.center.read");
    return view(actorId, await factsOrThrow(actorId, eventId), caps);
  }

  async function writeResult(actorId: string, eventId: string, notified = 0): Promise<HostEventWriteResult> {
    return { changePreview: null, event: await viewFor(actorId, eventId), notified };
  }

  function todoFacts(facts: HostEventFacts, profileIncomplete = 0): HostTodoEventFacts {
    const start = facts.startsAt ? Date.parse(facts.startsAt) : Number.NaN;
    return {
      applied: facts.applied,
      daysToStart: Number.isFinite(start) ? Math.ceil((start - now().getTime()) / 86_400_000) : null,
      eventId: facts.eventId,
      formPublished: Boolean(facts.formPublishedAt) || facts.lifecycle === "published",
      formPublishedAt: facts.formPublishedAt,
      matchingState: facts.matched !== null ? "published" : facts.generations > 0 ? "draft" : "none",
      pendingReview: facts.pending,
      profileIncomplete,
      status: statusOf(facts, now()),
      title: facts.title,
    };
  }

  function centerRow(facts: HostEventFacts): HostCenterEventRow {
    const status = statusOf(facts, now());
    const followupRate = facts.checkedIn >= 5 ? suppressedRate(facts.followedUp, facts.checkedIn) : null;
    const note: HostCenterEventRow["note"] =
      status === "draft" ? { kind: "draft" }
      : status === "cancelled" ? { at: facts.cancelledAt, count: facts.applied, kind: "cancelled" }
      : status === "archived" ? { kind: "archived" }
      : status === "live" ? { count: Math.max(0, facts.admitted - facts.checkedIn), kind: "check_in_open" }
      : status === "ended" ? { kind: "followup", rate: followupRate }
      : facts.pending > 0 ? { count: facts.pending, kind: "review_pending" }
      : facts.matched === null && facts.generations === 0 ? { kind: "matching_missing" }
      : { kind: "none" };
    return { action: status === "live" ? "open_check_in" : "open_console", applied: facts.applied, capacity: facts.capacity, checkedIn: status === "live" || status === "ended" || status === "archived" || facts.checkedIn > 0 ? facts.checkedIn : null, emoji: facts.payload.emoji ?? null, endsAt: facts.endsAt, eventId: facts.eventId, matched: facts.matched, note, role: ROLE_LABEL[facts.role ?? ""] ?? "owner", startsAt: facts.startsAt, status, title: facts.title, venue: facts.venue };
  }

  async function setupView(actorId: string, eventId: string): Promise<HostSetupResponse> {
    const caps = await require(actorId, eventId, "experience.configure");
    const facts = await factsOrThrow(actorId, eventId);
    const set = await reads.questionSet(eventId);
    const draft = (set?.draft ?? {}) as { description?: string; questions?: HostSetupQuestion[]; capacity?: number | null; registrationClosesAt?: string | null; admissionMode?: "first_come" | "review" };
    const published = set?.published as typeof draft | null;
    const questions = draft.questions ?? published?.questions ?? [];
    const diff = published ? ([JSON.stringify(published.questions ?? []) !== JSON.stringify(draft.questions ?? []), (published.description ?? "") !== (draft.description ?? ""), (published.capacity ?? null) !== (draft.capacity ?? null), (published.registrationClosesAt ?? null) !== (draft.registrationClosesAt ?? null), (published.admissionMode ?? "review") !== (draft.admissionMode ?? "review")].filter(Boolean).length) : 0;
    const suggestions = questions.length === 0 ? suggestQuestions({ existing: [], library: HOST_QUESTION_LIBRARY, past: [] }) : [];
    return {
      admissionMode: draft.admissionMode ?? facts.admissionMode,
      applyPath: facts.publicSlug ? `/e/${facts.publicSlug}` : null,
      capacity: draft.capacity !== undefined ? draft.capacity : facts.capacity,
      description: draft.description ?? facts.description ?? "",
      event: await view(actorId, facts, caps),
      formPublished: Boolean(set?.publishedAt),
      hostNote: await reads.hostNote(eventId),
      notices: hostNoticeTemplates(facts.title),
      questions,
      registrationClosesAt: draft.registrationClosesAt !== undefined ? draft.registrationClosesAt : facts.registrationClosesAt,
      revision: set?.revision ?? 0,
      savedAt: set?.savedAt ?? null,
      suggestion: suggestions.length ? { basisCount: 0, basisTitle: null, count: suggestions.length, questions: suggestions } : null,
      unpublishedChanges: diff,
    };
  }

  async function applyPolicy(actorId: string, eventId: string, settings: { capacity: number | null; registrationClosesAt: string | null; admissionMode: "first_come" | "review" }): Promise<void> {
    const facts = await factsOrThrow(actorId, eventId);
    if (facts.lifecycle !== "published" || !facts.startsAt) return;
    // Registration never stays open past the start (the operations configuration clamps the same way, and the two must match).
    const closes = settings.registrationClosesAt && Date.parse(settings.registrationClosesAt) < Date.parse(facts.startsAt) ? settings.registrationClosesAt : facts.startsAt;
    const current = await admission.getPolicy(eventId);
    await admission.configurePolicy({
      admissionMode: settings.admissionMode === "first_come" ? "instant" : "approval_required",
      capacity: settings.capacity,
      eventId,
      ...(current ? { expectedPolicyVersion: current.policyVersion } : {}),
      profileEditDeadlineAt: closes,
      registrationClosesAt: closes,
      registrationOpensAt: current?.registrationOpensAt ?? new Date(Math.min(now().getTime(), Date.parse(closes) - 60_000)).toISOString(),
      updatedByActorId: actorId,
      waitlistEnabled: true,
    } as Parameters<typeof admission.configurePolicy>[0]);
  }

  // 参加者端的「テーブル編成を公開しました」：给已报名的人写定型通知。发布另开事务，失败时同一 generation 重试会走这里补写。
  async function enqueueMatchingPublished(actorId: string, eventId: string, notifyCohosts: boolean): Promise<void> {
    await client.transaction(async (executor) => {
      for (const row of await reads.kioskRoster(eventId)) if (row.status !== "waitlisted") await enqueueHostNotice(executor, { actorId: row.actorId, eventId, kind: "matching_published", workspaceId });
      if (notifyCohosts) for (const member of await cohosts.members(eventId)) if (member.role !== "owner" && member.actorId !== actorId) await enqueueHostNotice(executor, { actorId: member.actorId, eventId, idempotencyKey: `notice:${eventId}:matching_published:cohost:${member.actorId}`, kind: "matching_published", workspaceId });
    });
  }

  async function matchingView(actorId: string, eventId: string, round: number): Promise<HostMatchingResponse> {
    const caps = await require(actorId, eventId, "operations.read_sensitive");
    const facts = await factsOrThrow(actorId, eventId);
    const latest = deps.operations ? await deps.operations.latestGeneration(eventId) : null;
    const conditions = await matching.conditions(eventId, latest?.tableSize ?? 5);
    const base: HostMatchingResponse = {
      applied: facts.applied, conditions, event: await view(actorId, facts, caps), generationId: latest?.generationId ?? null, generationsLimit: GENERATIONS_PER_EVENT, generationsUsed: facts.generations,
      minimumApplied: 20, overridesVersion: 0, participantCount: 0, profileComplete: facts.admitted, round: 1, rounds: [], state: facts.matched !== null ? "published" : latest ? (latest.status === "completed" ? "draft" : "generating") : "none",
      tableCount: 0, tableSizeMax: conditions.tableSize, tableSizeMin: conditions.tableSize, tables: [], unplaced: [], unsatisfiedTables: 0,
    };
    if (!latest?.grouping) return base;
    const directory = new Map(latest.participants.map((participant) => [participant.participantId, participant]));
    const { moves, version } = await matching.overrides(eventId, latest.generationId);
    const snapshotActors = new Set(latest.participants.map((participant) => participant.actorId));
    const roster = await reads.kioskRoster(eventId);
    // 生成之后才承认的人：首字与名字取自同一行（原来用过滤后的下标取未过滤的 roster，首字会对错人）。
    const extraUnplaced = roster.filter((row) => row.participantId && !snapshotActors.has(row.actorId)).map((row) => ({ ...memberFor(undefined, row.participantId!), initial: (row.name ?? "").trim().charAt(0), name: row.name ?? "" }));
    const draft = draftTables({ actorOf: (id) => directory.get(id)?.actorId ?? id, conditions, directory, extraUnplaced, grouping: latest.grouping as never, moves, previousPairs: conditions.avoidPreviousTablemates ? await matching.previousPairs(eventId, facts.organizerActorId) : new Set() });
    const selected = Math.min(Math.max(round, 1), conditions.roundCount);
    const tables = draft.tables.filter((table) => table.round === selected);
    const sizes = tables.map((table) => table.members.length);
    return { ...base, overridesVersion: version, participantCount: latest.participants.length, round: selected, tableCount: tables.length, tableSizeMax: sizes.length ? Math.max(...sizes) : 0, tableSizeMin: sizes.length ? Math.min(...sizes) : 0, tables, unplaced: draft.unplaced, unsatisfiedTables: draft.unsatisfiedTables };
  }

  return {
    async center(actorId, query) {
      const all = await reads.accessibleEvents(actorId);
      const rows = all.map(centerRow);
      const t = now();
      const month = t.toISOString().slice(0, 7);
      const lastMonth = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
      const inMonth = (iso: string | null, m: string) => (iso ?? "").slice(0, 7) === m;
      const active = rows.filter((row) => row.status === "upcoming" || row.status === "live");
      const ended = all.filter((facts) => statusOf(facts, t) === "ended");
      const rated = ended.filter((facts) => facts.checkedIn >= 5);
      const filterCounts = { all: rows.filter((row) => !["draft", "cancelled", "archived"].includes(row.status)).length, ended: rows.filter((row) => row.status === "ended").length, inactive: rows.filter((row) => ["draft", "cancelled", "archived"].includes(row.status)).length, live: rows.filter((row) => row.status === "live").length, upcoming: rows.filter((row) => row.status === "upcoming").length };
      const filtered = rows.filter((row) => (query.filter === "all" ? !["draft", "cancelled", "archived"].includes(row.status) : query.filter === "inactive" ? ["draft", "cancelled", "archived"].includes(row.status) : row.status === query.filter)).filter((row) => !query.q || row.title.includes(query.q) || (row.venue ?? "").includes(query.q));
      const pageSize = 20;
      const appliedThisMonth = all.filter((facts) => inMonth(facts.startsAt, month)).reduce((sum, facts) => sum + facts.applied, 0);
      const appliedLastMonth = all.filter((facts) => inMonth(facts.startsAt, lastMonth)).reduce((sum, facts) => sum + facts.applied, 0);
      const firstUpcoming = all.find((facts) => statusOf(facts, t) === "upcoming");
      const followRates = rated.map((facts) => suppressedRate(facts.followedUp, facts.checkedIn)).filter((value): value is number => value !== null);
      const checkRates = ended.filter((facts) => facts.admitted > 0).map((facts) => Math.round((facts.checkedIn / facts.admitted) * 100));
      return {
        events: filtered.slice((query.page - 1) * pageSize, query.page * pageSize),
        filterCounts,
        kpi: all.length === 0 ? null : { appliedDeltaVsLastMonth: appliedLastMonth > 0 ? appliedThisMonth - appliedLastMonth : null, appliedThisMonth, averageCheckInRate: checkRates.length ? Math.round(checkRates.reduce((a, b) => a + b, 0) / checkRates.length) : null, followupEndedCount: followRates.length, followupRate: followRates.length ? Math.round(followRates.reduce((a, b) => a + b, 0) / followRates.length) : null, upcoming: active.length, upcomingThisMonth: active.filter((row) => inMonth(row.startsAt, month)).length },
        next: rows.length === 1 && firstUpcoming ? { eventId: firstUpcoming.eventId, eventTitle: firstUpcoming.title, steps: hostNextSteps(todoFacts(firstUpcoming)) } : null,
        page: query.page,
        pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
        spotlight: rows.length === 1 && firstUpcoming ? { applied: firstUpcoming.applied, capacity: firstUpcoming.capacity, cohosts: (await cohosts.members(firstUpcoming.eventId)).length - 1, eventId: firstUpcoming.eventId, pendingReview: firstUpcoming.pending, startsAt: firstUpcoming.startsAt } : null,
        summary: { activeCount: active.length, appliedThisMonth, eventCount: all.length },
        todo: hostTodoItems(all.map((facts) => todoFacts(facts))),
      } satisfies HostCenterResponse;
    },
    async centerSummary(actorId) {
      const all = await reads.accessibleEvents(actorId);
      const t = now();
      const month = t.toISOString().slice(0, 7);
      return { activeCount: all.filter((facts) => ["upcoming", "live"].includes(statusOf(facts, t))).length, appliedThisMonth: all.filter((facts) => (facts.startsAt ?? "").startsWith(month)).reduce((sum, facts) => sum + facts.applied, 0), eventCount: all.length };
    },
    async event(actorId, eventId) {
      return (await reads.eventFacts(actorId, eventId)) ? viewFor(actorId, eventId) : null;
    },
    async createEvent(actorId, input) {
      const created = await lifecycle.create(actorId, input);
      return writeResult(actorId, created.eventId);
    },
    async updateEvent(actorId, eventId, input) {
      await require(actorId, eventId, "event.edit");
      const result = await lifecycle.update(actorId, eventId, input);
      if (result.needsDecision) {
        const facts = await factsOrThrow(actorId, eventId);
        return { changePreview: { afterStartsAt: input.startsAt ?? result.before.startsAt, afterVenue: input.venueName !== undefined ? input.venueName : result.before.venue, approvedCount: facts.admitted, beforeStartsAt: result.before.startsAt, beforeVenue: result.before.venue, timeChanged: input.startsAt !== undefined && input.startsAt !== result.before.startsAt, venueChanged: input.venueName !== undefined && input.venueName !== result.before.venue, waitlistedCount: facts.waitlisted }, event: await viewFor(actorId, eventId), notified: 0 };
      }
      return writeResult(actorId, eventId, result.notified);
    },
    async publishEvent(actorId, eventId, input) {
      await require(actorId, eventId, "event.edit");
      const set = await reads.questionSet(eventId);
      const draft = (set?.draft ?? {}) as { capacity?: number | null; registrationClosesAt?: string | null; admissionMode?: "first_come" | "review" };
      const facts = await factsOrThrow(actorId, eventId);
      const followers = await client.query<{ user_id: string }>(`select user_id from orbit_records where workspace_id = $1 and collection_name = 'organizerFollows' and lifecycle_state <> 'deleted' and payload ->> 'organizerId' = $2 limit 2000`, [workspaceId, eventOrganizerKey(facts.organizerActorId, facts.organizerProfileId)]);
      const published = await lifecycle.publish(actorId, eventId, input.expectedVersion, { followerActorIds: followers.rows.map((row) => row.user_id), registrationClosesAt: draft.registrationClosesAt ?? null });
      await applyPolicy(actorId, eventId, { admissionMode: draft.admissionMode ?? "review", capacity: draft.capacity !== undefined ? draft.capacity : facts.payload.capacity ?? null, registrationClosesAt: draft.registrationClosesAt ?? null });
      return writeResult(actorId, eventId, published.notified);
    },
    async cancelEvent(actorId, eventId, input) {
      await require(actorId, eventId, "event.cancel");
      const result = await lifecycle.cancel(actorId, eventId, input.expectedVersion, input.hostNote ?? null);
      return writeResult(actorId, eventId, result.notified);
    },
    async archiveEvent(actorId, eventId, input) {
      await require(actorId, eventId, "event.edit");
      await lifecycle.archive(eventId, input.expectedVersion, input.archived, now());
      return writeResult(actorId, eventId);
    },
    async reissueCode(actorId, eventId, input) {
      await require(actorId, eventId, "event.edit");
      await lifecycle.reissueCode(eventId, input.expectedVersion);
      return writeResult(actorId, eventId);
    },

    async overview(actorId, eventId) {
      const caps = await capabilities(actorId, eventId);
      if (!caps.includes("operations.read_summary") && !caps.includes("operations.read_sensitive")) throw new HostError(caps.length ? "FORBIDDEN" : "NOT_FOUND");
      const facts = await factsOrThrow(actorId, eventId);
      const applicants = await reads.applicants(eventId, facts.organizerActorId, ["pending_review", "admitted", "waitlisted"]);
      const incomplete = applicants.filter((item) => profileScore(item.payload as never) < 100).length;
      const matchable = applicants.filter((item) => item.status === "admitted" && profileScore(item.payload as never) === 100).length;
      const status = statusOf(facts, now());
      const steps = ["registration", "generation", "review_groups", "publish", "check_in"] as const;
      const reached = facts.matched !== null ? (status === "live" || status === "ended" ? 5 : 4) : facts.generations > 0 ? 2 : facts.lifecycle === "published" ? 1 : 0;
      const exchanges = facts.checkedIn > 0 ? await reads.exchanges(eventId) : null;
      return {
        applied: facts.applied,
        arrivalRate: facts.applied > 0 && facts.checkedIn > 0 ? Math.round((facts.checkedIn / facts.applied) * 100) : null,
        capacity: facts.capacity,
        checkedIn: facts.checkedIn,
        completedSteps: steps.slice(0, reached),
        currentStep: steps[Math.min(reached, steps.length - 1)]!,
        doorsOpenAt: facts.startsAt,
        event: await view(actorId, facts, caps),
        matchable,
        matching: { roundCount: 2, state: facts.matched !== null ? "published" : facts.generations > 0 ? "draft" : "none", tableCount: 0, unplaced: 0 },
        pendingReview: facts.pending,
        recommendationRate: null,
        recommendationsPerPerson: 5,
        reportSummary: facts.checkedIn > 0 ? { asOf: now().toISOString(), checkInRate: facts.admitted >= 5 ? suppressedRate(facts.checkedIn, facts.admitted) : null, checkedIn: facts.checkedIn, exchangeRate: exchanges ? suppressedRate(exchanges.people, facts.checkedIn) : null, exchanges: exchanges ? suppressSmall(exchanges.pairs) : null, followupRate: suppressedRate(facts.followedUp, facts.checkedIn), total: facts.applied } : null,
        todos: [...(facts.pending > 0 ? [{ count: facts.pending, kind: "review_pending" as const, walkInSlots: facts.waitlisted }] : []), ...(incomplete > 0 ? [{ count: incomplete, kind: "profile_incomplete" as const }] : [])],
        trend: await reads.trend(eventId, now()),
      };
    },
    async matching(actorId, eventId, round) {
      return matchingView(actorId, eventId, round);
    },
    async generateMatching(actorId, eventId, input) {
      await require(actorId, eventId, "generation.run");
      const facts = await factsOrThrow(actorId, eventId);
      if (facts.generations >= GENERATIONS_PER_EVENT) throw new HostError("GENERATION_LIMIT");
      if (facts.matched !== null) throw new HostError("INVALID_STATE", "ALREADY_PUBLISHED");
      if (!deps.operations) throw new HostError("NOT_CONFIGURED");
      await matching.saveConditions(actorId, eventId, input.conditions);
      await deps.operations.startGeneration({ actorId, eventId, idempotencyKey: input.idempotencyKey });
      return matchingView(actorId, eventId, 1);
    },
    async saveOverrides(actorId, eventId, input) {
      await require(actorId, eventId, "generation.publish");
      const facts = await factsOrThrow(actorId, eventId);
      if (facts.matched !== null) throw new HostError("INVALID_STATE", "ALREADY_PUBLISHED");
      // generationId 必须是本活动的最新生成（否则有 A 活动权限的人可以改写 B 活动的下書き）。
      const latest = deps.operations ? await deps.operations.latestGeneration(eventId) : null;
      if (!latest || latest.generationId !== input.generationId) throw new HostError("INVALID_STATE", "GENERATION_NOT_READY");
      await matching.saveOverrides(actorId, eventId, input.generationId, input.expectedVersion, input.moves);
      return matchingView(actorId, eventId, input.moves[0]?.round ?? 1);
    },
    async publishMatching(actorId, eventId, input) {
      await require(actorId, eventId, "generation.publish");
      if (!deps.operations) throw new HostError("NOT_CONFIGURED");
      const current = await matchingView(actorId, eventId, 1);
      if (current.overridesVersion !== input.overridesVersion) throw new HostError("VERSION_CONFLICT");
      const latest = await deps.operations.latestGeneration(eventId);
      if (!latest?.grouping || latest.generationId !== input.generationId) throw new HostError("INVALID_STATE", "GENERATION_NOT_READY");
      // 同一 generation 已发布（上次发布成功、通知那一步失败后重试）：不再发布，只补写通知（幂等键保证不重复）。
      if (latest.status === "published") {
        await enqueueMatchingPublished(actorId, eventId, input.notifyCohosts === true);
        return matchingView(actorId, eventId, 1);
      }
      const directory = new Map(latest.participants.map((participant) => [participant.participantId, participant]));
      const facts = await factsOrThrow(actorId, eventId);
      const { moves } = await matching.overrides(eventId, latest.generationId);
      const conditions = await matching.conditions(eventId, latest.tableSize);
      const previousPairs = conditions.avoidPreviousTablemates ? await matching.previousPairs(eventId, facts.organizerActorId) : new Set<string>();
      await deps.operations.publishGeneration({
        actorId,
        composeGrouping: ((grouping: never) => composeGrouping(grouping, draftTables({ actorOf: (id) => directory.get(id)?.actorId ?? id, conditions: { ...conditions, roundCount: 2 }, directory, extraUnplaced: [], grouping, moves, previousPairs }).tables, latest.tableSize)) as never,
        eventId,
        generationId: input.generationId,
      });
      await enqueueMatchingPublished(actorId, eventId, input.notifyCohosts === true);
      return matchingView(actorId, eventId, 1);
    },

    async people(actorId, eventId, query) {
      const caps = await require(actorId, eventId, "admission.read");
      const facts = await factsOrThrow(actorId, eventId);
      const statusOfBucket: Record<HostPeopleBucket, string> = { approved: "admitted", pending: "pending_review", rejected: "rejected", waitlisted: "waitlisted" };
      const bucketOf: Record<string, HostPeopleBucket> = { admitted: "approved", pending_review: "pending", rejected: "rejected", waitlisted: "waitlisted" };
      const applicants = await reads.applicants(eventId, facts.organizerActorId, [statusOfBucket[query.bucket]]);
      // 申込回答一栏：主办方问题里问「話したい…」的那一问（没有就用第 2 问 / 资料里的目的）。
      const questions = (((await reads.questionSet(eventId))?.published ?? {}) as { questions?: HostSetupQuestion[] }).questions ?? [];
      const answerQuestion = questions.find((question) => question.prompt.includes("話したい")) ?? questions[1] ?? null;
      const rows: HostPeopleRow[] = applicants.map((item) => {
        const answers: Record<string, string> = { ...(item.payload.answers ?? {}), ...(answerQuestion && item.hostAnswers[answerQuestion.id] ? { desiredOutcome: item.hostAnswers[answerQuestion.id]! } : {}) };
        const { org, role } = splitPositioning(answers.positioning);
        const score = profileScore(item.payload as never);
        const name = item.payload.displayName ?? "";
        return { actorId: item.actorId, answer: answers.desiredOutcome?.trim() || null, applicationVersion: item.version, attendCount: item.attendCount, initial: name.trim().charAt(0), name, org, profileIncomplete: score < 100, profileScore: score, role, status: bucketOf[item.status] ?? "pending" };
      }).filter((row) => !query.incomplete || row.profileIncomplete).filter((row) => !query.q || [row.name, row.org ?? "", row.answer ?? ""].some((text) => text.includes(query.q)));
      const offset = Math.max(0, Number(query.cursor ?? "0") || 0);
      const page = rows.slice(offset, offset + 50);
      return { answerLabel: answerQuestion ? answerQuestion.prompt.replace(/[（(].*$/u, "").replace(/^今回/u, "").slice(0, 20) : "いちばん話したいこと", applyPath: facts.publicSlug ? `/e/${facts.publicSlug}` : null, bucket: query.bucket, capacity: facts.capacity, counts: { approved: facts.admitted, pending: facts.pending, rejected: facts.rejected, waitlisted: facts.waitlisted }, event: await view(actorId, facts, caps), more: Math.max(0, rows.length - offset - page.length), nextCursor: offset + page.length < rows.length ? String(offset + page.length) : null, questionCount: ((await reads.questionSet(eventId))?.draft?.questions as unknown[] | undefined)?.length ?? 0, remaining: facts.capacity === null ? null : Math.max(0, facts.capacity - facts.admitted), rows: page };
    },
    async decide(actorId, eventId, applicantActorId, input) {
      await require(actorId, eventId, "admission.decide");
      try {
        const next = await admission.decideApplication({ actorId: applicantActorId, decision: input.decision, decisionActorId: actorId, eventId, expectedApplicationVersion: input.expectedVersion });
        const number = next.status === "admitted" ? (await client.query<{ reception_no: string }>(`select reception_no from event_reception_numbers where workspace_id = $1 and event_id = $2 and actor_id = $3`, [workspaceId, eventId, applicantActorId])).rows[0]?.reception_no ?? null : null;
        const bucket: Record<string, HostPeopleBucket> = { admitted: "approved", pending_review: "pending", rejected: "rejected", waitlisted: "waitlisted" };
        return { actorId: applicantActorId, applicationVersion: next.applicationVersion, notified: 1, receptionNumber: number, status: bucket[next.status] ?? "pending" };
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "INVALID_TRANSITION" || code === "VERSION_CONFLICT") throw new HostError("VERSION_CONFLICT");
        if (code === "CAPACITY_FULL") throw new HostError("CAPACITY_FULL");
        throw error;
      }
    },

    // R17-11（用户 2026-10-17「做，知道也没关系」）：名簿照合。只收邮箱哈希；只回状态与计数；每人每场每小时 10 次。
    async rosterMatch(actorId, eventId, input) {
      await require(actorId, eventId, "admission.read");
      const hashes = [...new Set(input.emailHashes)];
      const at = now().toISOString();
      const recent = await client.query<{ n: number }>(`select count(*)::int as n from event_host_roster_match_requests where workspace_id = $1 and event_id = $2 and actor_id = $3 and requested_at > $4::timestamptz - interval '1 hour'`, [workspaceId, eventId, actorId, at]);
      if (Number(recent.rows[0]?.n ?? 0) >= ROSTER_MATCH_PER_HOUR) throw new HostError("RATE_LIMITED");
      await client.query(`insert into event_host_roster_match_requests (workspace_id, event_id, actor_id, requested_at, row_count) values ($1, $2, $3, $4, $5)`, [workspaceId, eventId, actorId, at, hashes.length]);
      // auth_users 的 record_id = `auth_user:<trim + 小写的邮箱>`（normalizeAuthEmail），与浏览器端的规范化一致。
      const accounts = await client.query<{ hash: string; actor_id: string }>(
        `select hash, actor_id from (
           select encode(sha256(convert_to(substr(record_id, 11), 'UTF8')), 'hex') as hash, payload ->> 'id' as actor_id
             from orbit_records where workspace_id = $1 and collection_name = 'auth_users' and record_id like 'auth\_user:%' and lifecycle_state <> 'deleted'
         ) accounts where hash = any($2::text[])`,
        [workspaceId, hashes],
      );
      const actorIds = [...new Set(accounts.rows.map((row) => row.actor_id).filter(Boolean))];
      const applied = actorIds.length ? await client.query<{ actor_id: string }>(
        `select actor_id from event_ops_admission_application_heads where workspace_id = $1 and event_id = $2 and actor_id = any($3::text[]) and status in ('pending_review', 'admitted', 'waitlisted')
         union select actor_id from event_ops_membership_heads where workspace_id = $1 and event_id = $2 and actor_id = any($3::text[]) and status = 'rsvped'`,
        [workspaceId, eventId, actorIds],
      ) : { rows: [] as Array<{ actor_id: string }> };
      const appliedActors = new Set(applied.rows.map((row) => row.actor_id));
      const statusOf = new Map(accounts.rows.map((row) => [row.hash, appliedActors.has(row.actor_id) ? "applied" as const : "registered" as const]));
      const results = input.emailHashes.map((emailHash) => ({ emailHash, status: statusOf.get(emailHash) ?? "unregistered" as const }));
      const counts = { applied: 0, registered: 0, unregistered: 0 };
      for (const row of results) counts[row.status] += 1;
      return { counts, eventId, results };
    },

    async kiosk(actorId, eventId, q) {
      const caps = await require(actorId, eventId, "check_in.roster.read_limited");
      const facts = await factsOrThrow(actorId, eventId);
      const roster = await reads.kioskRoster(eventId);
      const grouping = await reads.publishedGrouping(eventId);
      const tableOf = new Map((grouping?.roundOne ?? []).flatMap((table) => table.members.map((member) => [member.participantId, String.fromCharCode(64 + Math.min(26, table.tableNumber))] as const)));
      const t = now();
      const rows: HostKioskRow[] = roster.map((row) => {
        const { org, role } = splitPositioning(row.answers.positioning);
        return { actorId: row.actorId, checkedInAt: row.checkedInAt, initial: row.name.trim().charAt(0), kana: null, name: row.name, org, participantId: row.participantId ?? `waitlist:${row.actorId}`, receptionNumber: row.receptionNumber, role, status: row.status, table: row.participantId ? tableOf.get(row.participantId) ?? null : null, undoable: row.status === "checked_in" && row.checkedInAt !== null && t.getTime() - Date.parse(row.checkedInAt) <= 30 * 60_000 };
      });
      const query = q.trim();
      const recent = (await reads.recentCheckIns(eventId)).map((item) => rows.find((row) => row.participantId === item.participantId)).filter((row): row is HostKioskRow => Boolean(row));
      const names = await actorNames(client, workspaceId, [actorId]);
      const members = rows.filter((row) => row.status !== "waitlisted").length;
      const checkedIn = rows.filter((row) => row.status === "checked_in").length;
      return {
        cacheUntil: new Date(Date.parse(facts.endsAt ?? t.toISOString()) + 12 * 3_600_000).toISOString(),
        canWalkIn: caps.includes("check_in.walk_in"),
        checkedIn,
        devices: await kiosk.devices(eventId),
        doorsOpenAt: facts.startsAt,
        eventId,
        now: t.toISOString(),
        overCapacity: facts.capacity !== null && facts.admitted >= facts.capacity,
        approved: facts.admitted,
        capacity: facts.capacity,
        rate: members > 0 ? Math.round((checkedIn / members) * 100) : 0,
        recent: recent.map((row) => ({ at: row.checkedInAt!, initial: row.initial, name: row.name, org: row.org, participantId: row.participantId, receptionNumber: row.receptionNumber, table: row.table })),
        rows: query ? rows.filter((row) => [row.name, row.kana ?? "", row.org ?? ""].some((text) => text.includes(query))).slice(0, 20) : [],
        staffName: names.get(actorId) ?? "",
        staffRole: facts.organizerActorId === actorId ? "主催" : "受付",
        title: facts.title,
        total: members,
        venue: facts.venue,
      };
    },
    async kioskRoster(actorId, eventId) {
      const response = await this.kiosk(actorId, eventId, "");
      const roster = await reads.kioskRoster(eventId);
      const rows = roster.map((row) => ({ actorId: row.actorId, checkedInAt: row.checkedInAt, initial: row.name.trim().charAt(0), kana: null, name: row.name, org: splitPositioning(row.answers.positioning).org, participantId: row.participantId ?? `waitlist:${row.actorId}`, receptionNumber: row.receptionNumber, role: splitPositioning(row.answers.positioning).role, status: row.status, table: null, undoable: false }));
      return response ? { cacheUntil: response.cacheUntil, eventId, rows } : null;
    },
    async scanCheckIn(actorId, eventId, input) {
      await require(actorId, eventId, "check_in.roster.write");
      return kiosk.scan(actorId, eventId, input.payload, input.idempotencyKey);
    },
    async checkIn(actorId, eventId, participantId, idempotencyKey) {
      await require(actorId, eventId, "check_in.roster.write");
      return kiosk.checkIn(actorId, eventId, participantId, idempotencyKey);
    },
    async undoCheckIn(actorId, eventId, participantId, input) {
      return kiosk.undo(actorId, eventId, participantId, input.idempotencyKey);
    },
    async admitOnSite(actorId, eventId, participantId, input) {
      const subject = participantId.startsWith("waitlist:") ? participantId.slice("waitlist:".length) : participantId;
      return kiosk.admitOnSite(actorId, eventId, subject, input);
    },
    async heartbeat(actorId, eventId, input) {
      return kiosk.heartbeat(actorId, eventId, input.deviceId);
    },

    async setup(actorId, eventId) {
      return setupView(actorId, eventId);
    },
    async saveSetup(actorId, eventId, input) {
      await require(actorId, eventId, "experience.configure");
      if (input.registrationClosesAt) {
        const facts = await factsOrThrow(actorId, eventId);
        if (facts.startsAt && Date.parse(input.registrationClosesAt) > Date.parse(facts.startsAt)) throw new HostError("VALIDATION", "REGISTRATION_CLOSES_AFTER_START");
      }
      const draft = { admissionMode: input.admissionMode, capacity: input.capacity, description: input.description, questions: input.questions, registrationClosesAt: input.registrationClosesAt };
      const result = await client.query(
        `insert into event_host_question_sets (workspace_id, event_id, draft, revision, saved_at, updated_by) values ($1, $2, $3::jsonb, 1, now(), $4)
         on conflict (workspace_id, event_id) do update set draft = excluded.draft, revision = event_host_question_sets.revision + 1, saved_at = now(), updated_by = excluded.updated_by
         where event_host_question_sets.revision = $5`,
        [workspaceId, eventId, JSON.stringify(draft), actorId, input.expectedRevision],
      );
      if ((result.rowCount ?? 0) === 0) throw new HostError("VERSION_CONFLICT");
      return setupView(actorId, eventId);
    },
    async publishSetup(actorId, eventId, input) {
      await require(actorId, eventId, "experience.publish");
      const result = await client.query(`update event_host_question_sets set published = draft, published_at = now(), revision = revision + 1, updated_by = $3 where workspace_id = $1 and event_id = $2 and revision = $4`, [workspaceId, eventId, actorId, input.expectedRevision]);
      if ((result.rowCount ?? 0) === 0) throw new HostError("VERSION_CONFLICT");
      const draft = ((await reads.questionSet(eventId))?.draft ?? {}) as { capacity?: number | null; registrationClosesAt?: string | null; admissionMode?: "first_come" | "review"; description?: string };
      await applyPolicy(actorId, eventId, { admissionMode: draft.admissionMode ?? "review", capacity: draft.capacity ?? null, registrationClosesAt: draft.registrationClosesAt ?? null });
      return setupView(actorId, eventId);
    },
    async saveHostNote(actorId, eventId, input) {
      await require(actorId, eventId, "experience.configure");
      await client.query(`insert into event_host_notice_extras (workspace_id, event_id, host_note, updated_by) values ($1, $2, $3, $4) on conflict (workspace_id, event_id) do update set host_note = excluded.host_note, updated_by = excluded.updated_by, updated_at = now()`, [workspaceId, eventId, input.hostNote, actorId]);
      return setupView(actorId, eventId);
    },

    async report(actorId, eventId, viewKind): Promise<HostReportResponse> {
      const caps = await require(actorId, eventId, "analytics.read_aggregate");
      const facts = await factsOrThrow(actorId, eventId);
      const event = await view(actorId, facts, caps);
      if (viewKind === "mine") {
        // 自分の視点：只读主办方本人的记录（与谁交换、跟进），不经主办权限读别人。
        const mine = await client.query<{ n: number }>(`select count(*)::int as n from event_ops_contact_requests where workspace_id = $1 and event_id = $2 and status = 'accepted' and (requester_actor_id = $3 or target_actor_id = $3)`, [workspaceId, eventId, actorId]);
        const exchanged = Number(mine.rows[0]?.n ?? 0);
        return { all: null, event, mine: { contributionDelta: null, contributionDetail: null, contributionGoal: null, contributionHave: null, contributionLabel: null, contributionScore: null, contributionTarget: null, daysSinceExchange: null, exchanged, followTotal: exchanged, followed: 0, logSuggestion: null, met: exchanged, unfollowed: [] }, view: "mine" };
      }
      const status = statusOf(facts, now());
      const start = facts.startsAt ? Date.parse(facts.startsAt) : Number.NaN;
      const trend = await reads.trend(eventId, now(), 21);
      if (status === "upcoming" || status === "draft") {
        return { all: { applied: facts.applied, capacity: facts.capacity, checkInRate: null, checkedIn: null, daysPublishToEvent: null, daysSincePublish: null, daysToStart: Number.isFinite(start) ? Math.ceil((start - now().getTime()) / 86_400_000) : null, exchangeRate: null, exchanges: null, exchangesPerPerson: null, followupRate: null, followupWindowDays: 7, followups: null, funnel: { drafted: null, exchanged: null, followed: null, meetings: null }, standing: [], standingQuestion: null, state: "before", suppressedBelow: 5, tableNote: null, tables: [], trend, trendLabels: [] }, event, mine: null, view: "all" };
      }
      const exchanges = await reads.exchanges(eventId);
      const grouping = await reads.publishedGrouping(eventId);
      const perTable = (grouping?.roundOne ?? []).map((table) => table.members.reduce((sum, member) => sum + (exchanges.byParticipant.get(member.participantId) ?? 0), 0));
      const tableValues = suppressCells(perTable);
      const applicants = await reads.applicants(eventId, facts.organizerActorId, ["admitted"]);
      const firstQuestion = ((((await reads.questionSet(eventId))?.published ?? {}) as { questions?: HostSetupQuestion[] }).questions ?? [])[0];
      const q1 = new Map<string, number>();
      for (const item of applicants) {
        const label = firstQuestion ? item.hostAnswers[firstQuestion.id]?.split(" · ")[0] : undefined;
        if (label) q1.set(label, (q1.get(label) ?? 0) + 1);
      }
      const standingCounts = [...q1.entries()];
      const standingPercents = suppressedDistribution(standingCounts.map(([, n]) => n));
      return {
        all: {
          applied: facts.applied, capacity: facts.capacity,
          checkInRate: facts.admitted >= 5 ? suppressedRate(facts.checkedIn, facts.admitted) : null,
          checkedIn: suppressSmall(facts.checkedIn),
          daysPublishToEvent: null, daysSincePublish: null, daysToStart: null,
          exchangeRate: suppressedRate(exchanges.people, facts.checkedIn),
          exchanges: suppressSmall(exchanges.pairs),
          exchangesPerPerson: facts.checkedIn >= 5 && exchanges.pairs >= 5 ? Math.round(((exchanges.pairs * 2) / facts.checkedIn) * 10) / 10 : null,
          followupRate: suppressedRate(facts.followedUp, facts.checkedIn),
          followupWindowDays: 7,
          followups: suppressSmall(facts.followedUp),
          funnel: { drafted: null, exchanged: suppressSmall(exchanges.people), followed: suppressSmall(facts.followedUp), meetings: null },
          standing: standingCounts.map(([label], index) => ({ label, percent: standingPercents[index] ?? null })),
          standingQuestion: standingCounts.length ? "申込回答 Q1" : null,
          state: "after", suppressedBelow: 5, tableNote: null,
          tables: (grouping?.roundOne ?? []).map((table, index) => ({ exchanges: tableValues[index] ?? null, round: 1, table: String.fromCharCode(64 + Math.min(26, table.tableNumber)) })),
          trend, trendLabels: [],
        },
        event, mine: null, view: "all",
      };
    },

    async cohosts(actorId, eventId) {
      await require(actorId, eventId, "event.center.read");
      const facts = await factsOrThrow(actorId, eventId);
      const members = await cohosts.members(eventId);
      const history = await cohosts.history(eventId);
      const names = await actorNames(client, workspaceId, [...members.map((member) => member.actorId), ...history.flatMap((item) => [item.subjectActorId, item.byActorId])]);
      const canManage = facts.organizerActorId === actorId;
      return {
        canManage,
        eventId,
        eventTitle: facts.title,
        history: history.map((item) => ({ action: item.action, at: item.at, byName: names.get(item.byActorId) ?? "", reason: item.reason, role: item.role, subjectName: names.get(item.subjectActorId) ?? "" })),
        invites: canManage ? await cohosts.pendingInvites(eventId) : [],
        members: members.map((member) => ({ actorId: member.actorId, initial: (names.get(member.actorId) ?? "?").trim().charAt(0), isMe: member.actorId === actorId, name: names.get(member.actorId) ?? "", org: null, revision: member.revision, role: (member.role === "owner" ? "owner" : (member.role as HostCohostRole)) })),
      };
    },
    async inviteCohost(actorId, eventId, input) {
      return cohosts.invite(actorId, eventId, input);
    },
    async revokeInvite(actorId, eventId, inviteId) {
      await cohosts.revoke(actorId, eventId, inviteId);
      return (await this.cohosts(actorId, eventId))!;
    },
    async changeCohostRole(actorId, eventId, subjectActorId, input) {
      await cohosts.changeRole(actorId, eventId, subjectActorId, input);
      return (await this.cohosts(actorId, eventId))!;
    },
    async removeCohost(actorId, eventId, subjectActorId, input) {
      await cohosts.remove(actorId, eventId, subjectActorId, input);
      return (await this.cohosts(actorId, eventId))!;
    },
    async invitePreview(_actorId, code, clientKey) {
      const preview = await cohosts.preview(code, clientKey);
      if (!preview) return { eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, valid: false };
      const event = await client.query<{ title: string | null; display_name: string | null }>(`select e.title, p.display_name from event_ops_events e left join organizer_profiles p on p.workspace_id = e.workspace_id and p.profile_id = e.organizer_profile_id where e.workspace_id = $1 and e.event_id = $2`, [workspaceId, preview.eventId]);
      const names = await actorNames(client, workspaceId, [preview.invitedBy]);
      return { eventId: preview.eventId, eventTitle: event.rows[0]?.title ?? null, expiresAt: preview.expiresAt, inviterName: names.get(preview.invitedBy) ?? null, organizerName: event.rows[0]?.display_name ?? null, role: preview.role, valid: true };
    },
    async acceptInvite(actorId, code, clientKey) {
      const accepted = await cohosts.accept(actorId, code, clientKey);
      return { eventId: accepted.eventId, href: accepted.role === "check_in" ? `/app/events/${encodeURIComponent(accepted.eventId)}/operations/check-in` : `/app/events/${encodeURIComponent(accepted.eventId)}/operations`, role: accepted.role };
    },
    async checkInEvents(actorId) {
      return { events: await cohosts.checkInEvents(actorId) };
    },

    async noticePreview(actorId, eventId, kind) {
      await require(actorId, eventId, kind === "event_cancelled" ? "event.cancel" : "event.edit");
      const facts = await factsOrThrow(actorId, eventId);
      const recipients = kind === "profile_incomplete"
        ? (await reads.applicants(eventId, facts.organizerActorId, ["admitted", "pending_review", "waitlisted"])).filter((item) => profileScore(item.payload as never) < 100).length
        : kind === "event_cancelled" ? facts.applied + facts.waitlisted : facts.admitted + facts.waitlisted;
      const template = { text: hostNoticeTemplates(facts.title).find((item) => item.kind === "profile_incomplete")!.text };
      const sent = await reads.sendCount(eventId, kind);
      return { body: kind === "profile_incomplete" ? template.text : `${facts.title}`, channels: ["inbox", "email"], hostNote: null, kind, recipients, remainingSends: kind === "profile_incomplete" ? Math.max(0, 2 - sent) : 1, title: kind === "profile_incomplete" ? "プロフィールを完成させてください" : facts.title };
    },
    async sendNotice(actorId, eventId, input) {
      // 中止 / 日時变更的通知在写入时已经发（lifecycle）；这里只发资料未完成提醒（每场 ≤2 次，同人同日 1 次）。
      if (input.kind !== "profile_incomplete") throw new HostError("VALIDATION", "SEND_VIA_EDIT_OR_CANCEL");
      await require(actorId, eventId, "event.edit");
      const facts = await factsOrThrow(actorId, eventId);
      if ((await reads.sendCount(eventId, "profile_incomplete")) >= 2) throw new HostError("RATE_LIMITED");
      const targets = (await reads.applicants(eventId, facts.organizerActorId, ["admitted", "pending_review", "waitlisted"])).filter((item) => profileScore(item.payload as never) < 100);
      const day = now().toISOString().slice(0, 10);
      let queued = 0;
      await client.transaction(async (executor) => {
        for (const target of targets) if (await enqueueHostNotice(executor, { actorId: target.actorId, eventId, idempotencyKey: `notice:${eventId}:profile_incomplete:${target.actorId}:${day}`, kind: "profile_incomplete", workspaceId })) queued += 1;
        await executor.query(`insert into event_host_notice_sends (workspace_id, event_id, send_id, kind, recipients, sent_by) values ($1, $2, $3, 'profile_incomplete', $4, $5)`, [workspaceId, eventId, `send_${randomUUID()}`, queued, actorId]);
      });
      return { kind: input.kind, queued, skipped: targets.length - queued };
    },
    async desktopLink(actorId, path) {
      await client.transaction(async (executor) => {
        await enqueueHostNotice(executor, { actorId, eventId: "host-center", idempotencyKey: `notice:host-center:desktop_link:${actorId}:${now().toISOString().slice(0, 16)}`, kind: "desktop_link", payload: { href: path }, workspaceId });
      });
      return { href: path, sent: true };
    },

    async profiles(actorId) {
      return { profiles: await profiles.list(actorId) };
    },
    async createProfile(actorId, input) {
      return profiles.create(actorId, input);
    },
    async updateProfile(actorId, profileId, input) {
      return profiles.update(actorId, profileId, input);
    },
    async organizerPublic(viewerActorId, slug) {
      return profiles.publicPage(slug, viewerActorId);
    },
    async organizerSlugForEvent(alias) {
      return profiles.slugForEventAlias(alias);
    },
    async eventIdForSlug(slug) {
      return profiles.eventIdForSlug(slug);
    },
  };
}

/** 路由用：本机 / 生产的 live 服务（数据库没配 → null，路由 503 HOST_UNCONFIGURED）。 */
export async function createConfiguredHostLiveService(): Promise<HostService | null> {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) return null;
  const { createConfiguredEventOperationsService } = await import("../event-operations/runtime");
  const { createConfiguredEventOperationsRepository } = await import("../event-operations/repository");
  const operationsService = createConfiguredEventOperationsService();
  const repository = createConfiguredEventOperationsRepository();
  const { revertPlanEventAttendanceForActor } = await import("../../plans/event-attribution-runtime");
  return createHostLiveService({
    client: runtime.client,
    operations: operationsService && repository ? {
      checkInParticipant: (input) => operationsService.checkInParticipant(input),
      async latestGeneration(eventId) {
        const generations = await repository.listGenerations(eventId);
        const latest = [...generations].filter((generation) => generation.status !== "superseded").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (!latest) return null;
        const configuration = await repository.getConfiguration(eventId);
        const tasks = latest.status === "completed" || latest.status === "published" ? await repository.listTasks(latest.generationId) : [];
        const outputs = tasks.flatMap((task) => (task.output?.kind === "table_content_shard" ? [task.output] : []));
        const grouping = outputs.length ? { roundOne: outputs.filter((output) => output.roundNumber === 1).map((output) => output.table).sort((a, b) => a.tableNumber - b.tableNumber), roundTwo: outputs.filter((output) => output.roundNumber === 2).map((output) => output.table).sort((a, b) => a.tableNumber - b.tableNumber) } : null;
        return { generationId: latest.generationId, grouping, participants: latest.snapshot.participants, status: latest.status, tableSize: configuration?.tableSize ?? 5 };
      },
      publishGeneration: (input) => operationsService.publishGeneration(input as never),
      startGeneration: async (input) => operationsService.startGeneration(input),
    } : null,
    revertPlanAttendance: (input) => revertPlanEventAttendanceForActor(input),
    workspaceId: runtime.workspaceId,
  });
}
