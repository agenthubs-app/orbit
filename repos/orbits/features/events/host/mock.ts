/**
 * R17 mock 模式（本机 `ORBIT_REDESIGN_MOCK` / 演示世界）：读 `shared/mock/demo-world/host-events.ts`。Owner: 甲 (R17).
 * - 不写库、不发邮件、不调 AI：审核决定 / 受付 / 拖动 / 草稿 / 邀请只进进程内存（同一语义，重启或切变体即清）。
 * - 变体挂在 globalThis 上（Next dev 各路由包各一份模块），由开发接口 `app/api/dev/event-design-fixture/route.dev.ts` 切换。
 */
import {
  DEFAULT_HOST_MOCK_STATE,
  HOST_EVENT_IDS,
  HOST_INVITE_SAMPLE_CODE,
  HOST_KIOSK_ROSTER,
  HOST_PROFILES,
  hostCenter,
  hostCheckInEvents,
  hostCohostInvitePreview,
  hostCohosts,
  hostEventView,
  hostKiosk,
  hostMatching,
  hostNoticePreview,
  hostOverview,
  hostPeople,
  hostReport,
  hostSetup,
  organizerProfiles,
  organizerPublic,
  type HostMockState,
} from "../../../shared/mock/demo-world/host-events";
import type { HostEventView, HostEventWriteResult } from "../../../shared/contract/host-events";
import type { HostKioskRow, HostMatchingResponse, HostPeopleBucket, HostSetupResponse } from "../../../shared/contract/host-console";
import type { OrganizerProfile } from "../../../shared/contract/organizer-profile";
import { applyMatchingMoves } from "../../../shared/compute/table-constraints";
import { parseCheckInToken } from "../../../shared/compute/checkin-token";
import { HostError, type HostService } from "./service";

interface HostMockMemory {
  state: HostMockState;
  decisions: Map<string, Map<string, HostPeopleBucket>>;
  kiosk: Map<string, Partial<HostKioskRow>>;
  matching: Map<string, { version: number; moves: HostMatchingResponse["tables"]; unplaced: HostMatchingResponse["unplaced"]; published: boolean }>;
  setup: Map<string, HostSetupResponse>;
  events: Map<string, HostEventView>;
  profiles: OrganizerProfile[];
  follows: Set<string>;
}

const holder = globalThis as typeof globalThis & { __orbitR17HostMock?: HostMockMemory };

function fresh(state: HostMockState): HostMockMemory {
  return { decisions: new Map(), events: new Map(), follows: new Set(), kiosk: new Map(), matching: new Map(), profiles: [], setup: new Map(), state };
}

function memory(): HostMockMemory {
  holder.__orbitR17HostMock ??= fresh({ ...DEFAULT_HOST_MOCK_STATE });
  return holder.__orbitR17HostMock;
}

/** 开发接口用：切换示例变体（`null` 恢复默认），并清空内存里的操作。 */
export function setHostMockState(patch: Partial<HostMockState> | null): HostMockState {
  const state = patch === null ? { ...DEFAULT_HOST_MOCK_STATE } : { ...memory().state, ...patch };
  holder.__orbitR17HostMock = fresh(state);
  return state;
}

export function hostMockState(): HostMockState {
  return memory().state;
}

const NOW = () => new Date("2026-10-07T03:00:00.000Z");
const write = (event: HostEventView, notified = 0): HostEventWriteResult => ({ changePreview: null, event, notified });

function eventOrThrow(eventId: string): HostEventView {
  const view = memory().events.get(eventId) ?? hostEventView(eventId, memory().state);
  if (!view) throw new HostError("NOT_FOUND");
  return view;
}

function matchingView(eventId: string, round: number): HostMatchingResponse | null {
  const base = hostMatching(eventId, memory().state);
  if (!base) return null;
  const saved = memory().matching.get(eventId);
  const view = saved ? { ...base, overridesVersion: saved.version, state: saved.published ? "published" as const : base.state, tables: saved.moves, unplaced: saved.unplaced } : base;
  return { ...view, round: Math.min(Math.max(round, 1), view.conditions.roundCount) };
}

export function createHostMockService(): HostService {
  const m = memory;
  return {
    async center(_actor, query) {
      const base = hostCenter(m().state, query.filter, query.q);
      const created = [...m().events.values()].filter((event) => !hostEventView(event.eventId)).map((event) => ({
        action: "open_console" as const, applied: 0, capacity: event.capacity, checkedIn: null, emoji: event.emoji, endsAt: event.endsAt, eventId: event.eventId, matched: null,
        note: { kind: event.lifecycle === "draft" ? "draft" as const : "none" as const }, role: "owner" as const, startsAt: event.startsAt, status: event.status, title: event.title, venue: event.venueName,
      }));
      return created.length ? { ...base, events: [...created, ...base.events], summary: { ...base.summary, eventCount: base.summary.eventCount + created.length } } : base;
    },
    async centerSummary() {
      return hostCenter(m().state).summary;
    },
    async event(_actor, eventId) {
      return m().events.get(eventId) ?? hostEventView(eventId, m().state);
    },
    async createEvent(_actor, input) {
      const template = hostEventView(HOST_EVENT_IDS.cfo18)!;
      const profile = HOST_PROFILES.find((item) => item.profileId === input.organizerProfileId) ?? HOST_PROFILES[0]!;
      const eventId = `demo-host-new-${m().events.size + 1}`;
      const view: HostEventView = {
        ...template, admissionMode: "review", appliedCount: 0, approvedCount: 0, archivedAt: null, cancelledAt: null, capacity: input.capacity ?? null, cohostCount: 0, cohosts: [],
        description: input.description ?? null, emoji: input.emoji ?? null, endsAt: input.endsAt, eventId, feeAmountYen: input.feeAmountYen ?? null, feeKind: input.feeKind, feeUrl: input.feeUrl ?? null,
        lifecycle: "draft", online: input.online ?? false, organizerEmoji: profile.emoji, organizerName: profile.displayName, organizerProfileId: profile.profileId, organizerSlug: profile.slug,
        participationCode: null, publicSlug: null, startsAt: input.startsAt, status: "draft", title: input.title, venueArea: input.venueArea ?? null, venueName: input.venueName ?? null, version: 1, waitlistedCount: 0,
      };
      m().events.set(eventId, view);
      return write(view);
    },
    async updateEvent(_actor, eventId, input) {
      const current = eventOrThrow(eventId);
      if (input.expectedVersion !== current.version) throw new HostError("VERSION_CONFLICT");
      if (current.lifecycle === "archived" || current.lifecycle === "cancelled") throw new HostError("INVALID_STATE");
      const timeChanged = input.startsAt !== undefined && input.startsAt !== current.startsAt;
      const venueChanged = input.venueName !== undefined && input.venueName !== current.venueName;
      if (current.lifecycle === "published" && (timeChanged || venueChanged) && input.notify === undefined) {
        return { changePreview: { afterStartsAt: input.startsAt ?? current.startsAt, afterVenue: input.venueName ?? current.venueName, approvedCount: current.approvedCount, beforeStartsAt: current.startsAt, beforeVenue: current.venueName, timeChanged, venueChanged, waitlistedCount: current.waitlistedCount }, event: current, notified: 0 };
      }
      const { expectedVersion: _v, notify, ...patch } = input;
      const next: HostEventView = { ...current, ...patch, version: current.version + 1 };
      m().events.set(eventId, next);
      return write(next, notify && (timeChanged || venueChanged) ? current.approvedCount + current.waitlistedCount : 0);
    },
    async publishEvent(_actor, eventId, input) {
      const current = eventOrThrow(eventId);
      if (current.lifecycle === "published") return write(current);
      if (input.expectedVersion !== current.version) throw new HostError("VERSION_CONFLICT");
      if (current.lifecycle !== "draft") throw new HostError("INVALID_STATE");
      const next: HostEventView = { ...current, lifecycle: "published", participationCode: "7QKM-H4TR", publicSlug: `new-event-${eventId.slice(-1)}`, status: "upcoming", version: current.version + 1 };
      m().events.set(eventId, next);
      return write(next, current.followerCount);
    },
    async cancelEvent(_actor, eventId, input) {
      const current = eventOrThrow(eventId);
      if (current.myRole !== "owner") throw new HostError("FORBIDDEN");
      if (input.expectedVersion !== current.version) throw new HostError("VERSION_CONFLICT");
      if (current.lifecycle !== "published") throw new HostError("INVALID_STATE");
      const next: HostEventView = { ...current, cancelledAt: NOW().toISOString(), lifecycle: "cancelled", participationCode: null, status: "cancelled", version: current.version + 1 };
      m().events.set(eventId, next);
      return write(next, current.appliedCount + current.waitlistedCount);
    },
    async archiveEvent(_actor, eventId, input) {
      const current = eventOrThrow(eventId);
      if (input.expectedVersion !== current.version) throw new HostError("VERSION_CONFLICT");
      const next: HostEventView = input.archived
        ? { ...current, archivedAt: NOW().toISOString(), lifecycle: "archived", status: "archived", version: current.version + 1 }
        : { ...current, archivedAt: null, lifecycle: current.cancelledAt ? "cancelled" : "published", status: current.cancelledAt ? "cancelled" : "ended", version: current.version + 1 };
      m().events.set(eventId, next);
      return write(next);
    },
    async reissueCode(_actor, eventId, input) {
      const current = eventOrThrow(eventId);
      if (input.expectedVersion !== current.version) throw new HostError("VERSION_CONFLICT");
      const next = { ...current, participationCode: "R2MK-8TQV", version: current.version + 1 };
      m().events.set(eventId, next);
      return write(next);
    },
    async overview(_actor, eventId) {
      const base = hostOverview(eventId, m().state);
      const custom = m().events.get(eventId);
      return base && custom ? { ...base, event: custom } : base;
    },
    async matching(_actor, eventId, round) {
      return matchingView(eventId, round);
    },
    async generateMatching(_actor, eventId, input) {
      const view = matchingView(eventId, 1);
      if (!view) throw new HostError("NOT_FOUND");
      if (view.generationsUsed >= view.generationsLimit) throw new HostError("GENERATION_LIMIT");
      const sample = hostMatching(HOST_EVENT_IDS.cfo18)!;
      return { ...view, conditions: input.conditions, generationId: `demo-generation-${eventId}-${view.generationsUsed + 1}`, generationsUsed: view.generationsUsed + 1, participantCount: view.applied, state: "draft", tableCount: sample.tables.length, tables: sample.tables };
    },
    async saveOverrides(_actor, eventId, input) {
      const view = matchingView(eventId, 1);
      if (!view) throw new HostError("NOT_FOUND");
      if (view.state === "published") throw new HostError("INVALID_STATE");
      if (input.expectedVersion !== view.overridesVersion) throw new HostError("VERSION_CONFLICT");
      const moved = applyMatchingMoves({ tables: view.tables, unplaced: view.unplaced }, input.moves);
      m().matching.set(eventId, { moves: moved.tables, published: false, unplaced: moved.unplaced, version: view.overridesVersion + 1 });
      return matchingView(eventId, 1)!;
    },
    async publishMatching(_actor, eventId, input) {
      const view = matchingView(eventId, 1);
      if (!view) throw new HostError("NOT_FOUND");
      if (input.overridesVersion !== view.overridesVersion) throw new HostError("VERSION_CONFLICT");
      m().matching.set(eventId, { moves: view.tables, published: true, unplaced: view.unplaced, version: view.overridesVersion });
      return matchingView(eventId, 1)!;
    },
    async people(_actor, eventId, query) {
      return hostPeople(eventId, query.bucket, { decided: m().decisions.get(eventId), incomplete: query.incomplete, q: query.q }, m().state);
    },
    async decide(_actor, eventId, applicantActorId, input) {
      const view = hostPeople(eventId, "pending", { decided: m().decisions.get(eventId) }, m().state);
      if (!view) throw new HostError("NOT_FOUND");
      const decided = m().decisions.get(eventId) ?? new Map<string, HostPeopleBucket>();
      if (decided.has(applicantActorId) && input.expectedVersion === 1) throw new HostError("VERSION_CONFLICT");
      const status: HostPeopleBucket = input.decision === "approve" ? "approved" : input.decision === "waitlist" ? "waitlisted" : "rejected";
      decided.set(applicantActorId, status);
      m().decisions.set(eventId, decided);
      return { actorId: applicantActorId, applicationVersion: input.expectedVersion + 1, notified: 1, receptionNumber: status === "approved" ? "A-105" : null, status };
    },
    async kiosk(_actor, eventId, q) {
      return hostKiosk(eventId, q, m().state, m().kiosk);
    },
    async kioskRoster(_actor, eventId) {
      const view = hostKiosk(eventId, "", m().state, m().kiosk);
      if (!view) return null;
      return { cacheUntil: view.cacheUntil, eventId, rows: HOST_KIOSK_ROSTER.map((row) => ({ ...row, ...(m().kiosk.get(row.participantId) ?? {}) })), sample: true };
    },
    async scanCheckIn(actor, eventId, input) {
      // mock 不验签（没有密钥）；结构不对（含旧明文）或跨活动一律拒绝，同 live。
      const parts = parseCheckInToken(input.payload);
      if (!parts || parts.eventId !== eventId) throw new HostError("TOKEN_INVALID");
      return this.checkIn(actor, eventId, parts.participantId, input.idempotencyKey);
    },
    async checkIn(_actor, eventId, participantId) {
      const row = HOST_KIOSK_ROSTER.find((item) => item.participantId === participantId);
      if (eventId !== HOST_EVENT_IDS.cfo18 || !row) throw new HostError("NOT_FOUND");
      const current = { ...row, ...(m().kiosk.get(participantId) ?? {}) };
      if (current.status === "waitlisted") throw new HostError("INVALID_STATE", "WAITLISTED");
      if (current.status === "checked_in") return { checkedInAt: current.checkedInAt, duplicate: true, name: current.name, overCapacity: false, participantId, receptionNumber: current.receptionNumber, status: "checked_in", table: current.table };
      const patch = { checkedInAt: "2026-10-07T10:46:30.000Z", receptionNumber: "A-087", status: "checked_in" as const, table: "B", undoable: true };
      m().kiosk.set(participantId, patch);
      return { ...patch, duplicate: false, name: current.name, overCapacity: false, participantId };
    },
    async undoCheckIn(_actor, eventId, participantId) {
      const row = HOST_KIOSK_ROSTER.find((item) => item.participantId === participantId);
      if (eventId !== HOST_EVENT_IDS.cfo18 || !row) throw new HostError("NOT_FOUND");
      const current = { ...row, ...(m().kiosk.get(participantId) ?? {}) };
      if (current.status !== "checked_in") throw new HostError("INVALID_STATE");
      m().kiosk.set(participantId, { checkedInAt: null, receptionNumber: current.receptionNumber, status: "not_arrived", table: null, undoable: false });
      return { checkedInAt: null, duplicate: false, name: current.name, overCapacity: false, participantId, receptionNumber: current.receptionNumber, status: "not_arrived", table: null };
    },
    async admitOnSite(_actor, eventId, participantId, input) {
      const row = HOST_KIOSK_ROSTER.find((item) => item.participantId === participantId);
      if (eventId !== HOST_EVENT_IDS.cfo18 || !row) throw new HostError("NOT_FOUND");
      const overCapacity = true;
      if (overCapacity && !input.confirmOverCapacity) throw new HostError("CAPACITY_FULL");
      const patch = { checkedInAt: "2026-10-07T10:46:30.000Z", receptionNumber: "A-151", status: "checked_in" as const, table: null, undoable: true };
      m().kiosk.set(participantId, patch);
      return { ...patch, duplicate: false, name: row.name, overCapacity, participantId };
    },
    async heartbeat() {
      return { devices: m().state.kiosk === "before" ? 1 : 3 };
    },
    async setup(_actor, eventId) {
      return m().setup.get(eventId) ?? hostSetup(eventId, m().state);
    },
    async saveSetup(_actor, eventId, input) {
      const current = m().setup.get(eventId) ?? hostSetup(eventId, m().state);
      if (!current) throw new HostError("NOT_FOUND");
      if (input.expectedRevision !== current.revision) throw new HostError("VERSION_CONFLICT");
      const next: HostSetupResponse = { ...current, admissionMode: input.admissionMode, capacity: input.capacity, description: input.description, questions: input.questions, registrationClosesAt: input.registrationClosesAt, revision: current.revision + 1, savedAt: NOW().toISOString(), unpublishedChanges: current.formPublished ? current.unpublishedChanges + 1 : 0 };
      m().setup.set(eventId, next);
      return next;
    },
    async publishSetup(_actor, eventId, input) {
      const current = m().setup.get(eventId) ?? hostSetup(eventId, m().state);
      if (!current) throw new HostError("NOT_FOUND");
      if (input.expectedRevision !== current.revision) throw new HostError("VERSION_CONFLICT");
      const next = { ...current, formPublished: true, revision: current.revision + 1, unpublishedChanges: 0 };
      m().setup.set(eventId, next);
      return next;
    },
    async saveHostNote(_actor, eventId, input) {
      const current = m().setup.get(eventId) ?? hostSetup(eventId, m().state);
      if (!current) throw new HostError("NOT_FOUND");
      const next = { ...current, hostNote: input.hostNote };
      m().setup.set(eventId, next);
      return next;
    },
    async report(_actor, eventId, view) {
      return hostReport(eventId, view, m().state);
    },
    async cohosts(_actor, eventId) {
      return hostCohosts(eventId, m().state);
    },
    async inviteCohost(_actor, eventId) {
      eventOrThrow(eventId);
      return { expiresAt: "2026-10-14T14:59:00.000Z", inviteId: "demo-invite-1", link: "/app/host/join/demo-invite-token-0000000000000000", shortCode: HOST_INVITE_SAMPLE_CODE };
    },
    async revokeInvite(_actor, eventId) {
      return hostCohosts(eventId, m().state)!;
    },
    async changeCohostRole(_actor, eventId, subjectActorId, input) {
      const view = hostCohosts(eventId, m().state);
      if (!view) throw new HostError("NOT_FOUND");
      const target = view.members.find((item) => item.actorId === subjectActorId);
      if (!target) throw new HostError("NOT_FOUND");
      if (target.role === "owner") throw new HostError("FORBIDDEN");
      return { ...view, members: view.members.map((item) => (item.actorId === subjectActorId ? { ...item, revision: item.revision + 1, role: input.role } : item)) };
    },
    async removeCohost(_actor, eventId, subjectActorId) {
      const view = hostCohosts(eventId, m().state);
      if (!view) throw new HostError("NOT_FOUND");
      const target = view.members.find((item) => item.actorId === subjectActorId);
      if (!target) throw new HostError("NOT_FOUND");
      if (target.role === "owner") throw new HostError("FORBIDDEN");
      return { ...view, members: view.members.filter((item) => item.actorId !== subjectActorId) };
    },
    async invitePreview(_actor, code) {
      return hostCohostInvitePreview(code);
    },
    async acceptInvite(_actor, code) {
      const preview = hostCohostInvitePreview(code);
      if (!preview.valid || !preview.eventId || !preview.role) throw new HostError("TOKEN_INVALID");
      return { eventId: preview.eventId, href: preview.role === "check_in" ? `/app/events/${preview.eventId}/operations/check-in` : `/app/events/${preview.eventId}/operations`, role: preview.role };
    },
    async checkInEvents() {
      return hostCheckInEvents();
    },
    async noticePreview(_actor, eventId, kind) {
      return hostNoticePreview(eventId, kind, m().state);
    },
    async sendNotice(_actor, eventId, input) {
      const preview = hostNoticePreview(eventId, input.kind, m().state);
      if (!preview) throw new HostError("NOT_FOUND");
      return { kind: input.kind, queued: preview.recipients, skipped: 0 };
    },
    async desktopLink(_actor, path) {
      return { href: path, sent: true };
    },
    async profiles() {
      const base = organizerProfiles();
      return { ...base, profiles: [...base.profiles, ...m().profiles] };
    },
    async createProfile(_actor, input) {
      const profile: OrganizerProfile = { bio: input.bio ?? null, displayName: input.displayName, emoji: input.emoji ?? null, eventCount: 0, profileId: `demo-org-new-${m().profiles.length + 1}`, sample: true, slug: input.slug ?? `organizer-${m().profiles.length + 1}`, updatedAt: NOW().toISOString(), visibility: input.visibility ?? "public" };
      m().profiles.push(profile);
      return profile;
    },
    async updateProfile(_actor, profileId, input) {
      const current = [...organizerProfiles().profiles, ...m().profiles].find((item) => item.profileId === profileId);
      if (!current) throw new HostError("NOT_FOUND");
      return { ...current, bio: input.bio ?? current.bio, displayName: input.displayName, emoji: input.emoji ?? current.emoji, visibility: input.visibility ?? current.visibility };
    },
    async organizerPublic(viewer, slug) {
      return organizerPublic(slug, m().state, viewer ? m().follows.has(slug) : null);
    },
    async organizerSlugForEvent(alias) {
      const view = hostEventView(alias) ?? hostEventView(HOST_EVENT_IDS.cfo18);
      return view?.organizerSlug ?? null;
    },
    async eventIdForSlug(slug) {
      const ids = Object.values(HOST_EVENT_IDS);
      return ids.find((id) => hostEventView(id)?.publicSlug === slug) ?? null;
    },
  };
}
