// R08 mock behaviour of the redesign contracts, over the demo-world fixtures.
// In memory only: the state is shared by everyone using one dev server and resets
// when the process restarts; nothing is written to the database. The semantics
// follow the contracts — retries with the same mutation id / idempotency key give
// the first answer back, revoked codes stop working, PATCH and create persist.
import type { AccountDeletionRequestContract, AccountExportContract, AccountExportCreateInput } from "../../shared/contract/account";
import type { EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentFacts } from "../../shared/contract/event-assessment";
import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../shared/contract/event-recommendation-feedback";
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../shared/contract/home-layout";
import type { InviteCodeContract, InviteCodeCreateInput } from "../../shared/contract/invite-codes";
import { DEMO_EVENTS } from "../../shared/mock/demo-world";
import {
  demoAccountExport, demoAppVersion, demoCompletionQuestion, demoDeletionRequest, demoEventAssessment, demoHomeLayout,
  demoInviteCode, demoInviteRedeem, demoPlanSummary,
} from "../../shared/mock/demo-world/fixtures";

type LayoutResult = { conflict: true; current: HomeLayoutContract } | { conflict: false; layout: HomeLayoutContract };

function freshState() {
  return {
    layout: demoHomeLayout as HomeLayoutContract,
    layoutMutations: new Map<string, LayoutResult>(),
    invite: demoInviteCode as InviteCodeContract,
    inviteCreates: new Map<string, InviteCodeContract>(),
    assessments: new Map<string, EventAssessmentContract>([[demoEventAssessment.id, demoEventAssessment]]),
    assessmentCreates: new Map<string, EventAssessmentContract>(),
    exports: new Map<string, AccountExportContract>([[demoAccountExport.id, demoAccountExport]]),
    exportCreates: new Map<string, AccountExportContract>(),
    deletion: null as AccountDeletionRequestContract | null,
  };
}
let state = freshState();
const nowIso = () => new Date().toISOString();

export const redesignMock = {
  homeLayout: () => state.layout,
  /** 409 when the expected revision is stale; the same mutationId again returns the first result. */
  putHomeLayout(input: HomeLayoutUpdateInput): LayoutResult {
    const replay = state.layoutMutations.get(input.mutationId);
    if (replay) return replay;
    const result: LayoutResult = input.expectedRevision !== state.layout.revision
      ? { conflict: true, current: state.layout }
      : { conflict: false, layout: { revision: state.layout.revision + 1, app: input.app, web: input.web, ...(input.hintDismissedAt ? { hintDismissedAt: input.hintDismissedAt } : {}) } };
    if (result.conflict === false) state.layout = result.layout;
    state.layoutMutations.set(input.mutationId, result);
    return result;
  },
  completionQuestion: () => demoCompletionQuestion,
  /** The active code, or null after it was revoked. */
  currentInvite: () => (state.invite.revokedAt ? null : state.invite),
  createInvite(input: InviteCodeCreateInput): InviteCodeContract {
    const replay = state.inviteCreates.get(input.idempotencyKey);
    if (replay) return replay;
    state.invite = { ...demoInviteCode, shared: input.shared, maxUses: input.maxUses, usedCount: 0, createdAt: nowIso() };
    state.inviteCreates.set(input.idempotencyKey, state.invite);
    return state.invite;
  },
  revokeInvite(code: string): InviteCodeContract | null {
    if (code !== state.invite.code) return null;
    state.invite = { ...state.invite, revokedAt: state.invite.revokedAt ?? nowIso() };
    return state.invite;
  },
  /** Only an active code previews or redeems (a revoked or unknown one is a 404 either way). */
  invitePreview(code: string) {
    const invite = this.currentInvite();
    return invite && invite.code === code ? { code: invite.code, expiresAt: invite.expiresAt, shared: invite.shared, sample: true as const } : null;
  },
  inviteRedeem(code: string) {
    const invite = this.currentInvite();
    return invite && invite.code === code ? demoInviteRedeem : null;
  },
  assessments: () => [...state.assessments.values()],
  assessment: (id: string) => state.assessments.get(id) ?? null,
  createAssessment(input: EventAssessmentCreateInput): EventAssessmentContract {
    const replay = state.assessmentCreates.get(input.idempotencyKey);
    if (replay) return replay;
    const facts: EventAssessmentFacts = input.sourceKind === "url" ? { url: input.url } : {};
    const created: EventAssessmentContract = { ...demoEventAssessment, id: `demo-assessment-${state.assessments.size + 1}`, sourceKind: input.sourceKind, status: "reading", facts, scoreBreakdown: [], total: 0, verdict: "conditional", missingFields: ["startsAt"], createdAt: nowIso() };
    state.assessments.set(created.id, created);
    state.assessmentCreates.set(input.idempotencyKey, created);
    return created;
  },
  patchAssessment(id: string, facts: EventAssessmentFacts): EventAssessmentContract | null {
    const found = state.assessments.get(id);
    if (!found) return null;
    const next = { ...found, facts: { ...found.facts, ...facts }, missingFields: found.missingFields.filter((field) => !(field in facts)) };
    state.assessments.set(id, next);
    return next;
  },
  /** Only the demo events can be dismissed. */
  dismiss(eventId: string, reason: EventRecommendationDismissReason): EventRecommendationDismissResult | null {
    return DEMO_EVENTS.some((event) => event.id === eventId) ? { eventId, reason, dismissedAt: nowIso() } : null;
  },
  accountExports: () => [...state.exports.values()],
  accountExport: (id: string) => state.exports.get(id) ?? null,
  createAccountExport(input: AccountExportCreateInput): AccountExportContract {
    const replay = state.exportCreates.get(input.idempotencyKey);
    if (replay) return replay;
    const created: AccountExportContract = { id: `demo-export-${state.exports.size + 1}`, scope: input.scope, status: "queued", requestedAt: nowIso() };
    state.exports.set(created.id, created);
    state.exportCreates.set(input.idempotencyKey, created);
    return created;
  },
  deletionRequest: () => state.deletion,
  requestDeletion() { state.deletion = state.deletion && !state.deletion.cancelledAt ? state.deletion : demoDeletionRequest; return state.deletion; },
  /** DELETE is idempotent: with no request it answers null. */
  cancelDeletion() { state.deletion = state.deletion ? { ...state.deletion, cancelledAt: state.deletion.cancelledAt ?? nowIso() } : null; return state.deletion; },
  appVersion: () => demoAppVersion,
  planSummary: () => demoPlanSummary,
  /** Tests only. */
  reset() { state = freshState(); },
};
