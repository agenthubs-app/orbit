// R08 mock behaviour of the redesign contracts, over the demo-world fixtures. In
// memory only (resets with the process); never written to the database.
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../shared/contract/home-layout";
import type { EventAssessmentContract } from "../../shared/contract/event-assessment";
import type { AccountDeletionRequestContract } from "../../shared/contract/account";
import {
  demoAccountExport, demoAppVersion, demoCompletionQuestion, demoDeletionRequest, demoDismissResult, demoEventAssessment, demoHomeLayout,
  demoInviteCode, demoInvitePreview, demoInviteRedeem, demoPlanSummary,
} from "../../shared/mock/demo-world/fixtures";

let layout: HomeLayoutContract = demoHomeLayout;
let deletion: AccountDeletionRequestContract | null = null;
const assessments = new Map<string, EventAssessmentContract>([[demoEventAssessment.id, demoEventAssessment]]);

export const redesignMock = {
  homeLayout: () => layout,
  /** 409 when the expected revision is stale (another device saved first). */
  putHomeLayout(input: HomeLayoutUpdateInput): { conflict: true; current: HomeLayoutContract } | { conflict: false; layout: HomeLayoutContract } {
    if (input.expectedRevision !== layout.revision) return { conflict: true, current: layout };
    layout = { revision: layout.revision + 1, app: input.app, web: input.web, ...(input.hintDismissedAt ? { hintDismissedAt: input.hintDismissedAt } : {}) };
    return { conflict: false, layout };
  },
  completionQuestion: () => demoCompletionQuestion,
  inviteCode: () => demoInviteCode,
  invitePreview: (code: string) => (code === demoInviteCode.code ? demoInvitePreview : null),
  inviteRedeem: (code: string) => (code === demoInviteCode.code ? demoInviteRedeem : null),
  assessments: () => [...assessments.values()],
  assessment: (id: string) => assessments.get(id) ?? null,
  createAssessment(sourceKind: EventAssessmentContract["sourceKind"]): EventAssessmentContract {
    const created: EventAssessmentContract = { ...demoEventAssessment, id: `demo-assessment-${assessments.size + 1}`, sourceKind, status: "reading", scoreBreakdown: [], total: 0, verdict: "conditional", missingFields: ["startsAt"] };
    assessments.set(created.id, created);
    return created;
  },
  dismiss: (eventId: string, reason: typeof demoDismissResult.reason) => ({ ...demoDismissResult, eventId, reason }),
  accountExport: () => demoAccountExport,
  deletionRequest: () => deletion,
  requestDeletion() { deletion = demoDeletionRequest; return deletion; },
  cancelDeletion() { deletion = deletion ? { ...deletion, cancelledAt: new Date().toISOString() } : null; return deletion; },
  appVersion: () => demoAppVersion,
  planSummary: () => demoPlanSummary,
  /** Tests only. */
  reset() { layout = demoHomeLayout; deletion = null; assessments.clear(); assessments.set(demoEventAssessment.id, demoEventAssessment); },
};
