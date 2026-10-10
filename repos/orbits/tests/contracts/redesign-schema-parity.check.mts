// R08 review M4 (checked by tests/contracts/redesign-schema-parity.test.ts under
// tsconfig.parity.json: the project tsconfig is not strict, and without
// strictNullChecks `T | null` collapses). The zod schemas are exported cast to their contract types
// (`as z.ZodType<Contract>`), so a mismatch between the TS contract and the
// runtime schema would never show up. This file compares the uncast *Object
// schemas with the contracts in both directions; the check fails when
// they drift (a field required in one and optional in the other, a missing or
// extra field, a different enum).
import type { z } from "zod";

import type { AccountDeletionRequestContract, AccountExportContract, AccountExportCreateInput, AppVersionContract } from "../../shared/contract/account";
import type { ContactCompletionAnswerInput, ContactCompletionQuestion, ContactCompletionResult } from "../../shared/contract/contact-completion";
import type { EventAssessmentAddToPlanResult, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../../shared/contract/event-assessment";
import type { EventRecommendationDismissInput, EventRecommendationDismissResult } from "../../shared/contract/event-recommendation-feedback";
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../shared/contract/home-layout";
import type { InviteCodeContract, InviteCodeCreateInput, InviteCodePreview, InviteCodeRedeemResult } from "../../shared/contract/invite-codes";
import type { PlanAwardRequest, PlanAwardResult, PlanCommandResult, PlanSkipRequest, PlanStepRequest, PlanUndoRequest, PlanV2Detail, PlanV2SummaryResponse } from "../../shared/contract/plan-v2";
import type { accountDeletionRequestObject, accountExportCreateInputObject, accountExportObject, appVersionObject } from "../../shared/api-schema/account";
import type { contactCompletionAnswerInputObject, contactCompletionQuestionObject, contactCompletionResultObject } from "../../shared/api-schema/contact-completion";
import type { eventAssessmentAddToPlanResultObject, eventAssessmentCreateInputObject, eventAssessmentObject, eventAssessmentPatchInputObject } from "../../shared/api-schema/event-assessment";
import type { eventRecommendationDismissInputObject, eventRecommendationDismissResultObject } from "../../shared/api-schema/event-recommendation-feedback";
import type { homeLayoutObject, homeLayoutUpdateInputObject } from "../../shared/api-schema/home-layout";
import type { inviteCodeCreateInputObject, inviteCodeObject, inviteCodePreviewObject, inviteCodeRedeemResultObject } from "../../shared/api-schema/invite-codes";
import type { planAwardRequestObject, planAwardResultObject, planCommandResultObject, planSkipRequestObject, planStepRequestObject, planUndoRequestObject, planV2DetailObject, planV2SummaryResponseObject } from "../../shared/api-schema/plan-v2";

// Contracts use readonly arrays; zod infers mutable ones. Compare structure, not mutability.
type DeepMutable<T> = T extends readonly (infer U)[] ? DeepMutable<U>[] : T extends object ? { -readonly [K in keyof T]: DeepMutable<T[K]> } : T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Parity<Contract, Schema extends z.ZodTypeAny> = Same<DeepMutable<Contract>, z.infer<Schema>>;
function expectParity<T extends true>(): T | undefined { return undefined; }

expectParity<Parity<HomeLayoutContract, typeof homeLayoutObject>>();
expectParity<Parity<HomeLayoutUpdateInput, typeof homeLayoutUpdateInputObject>>();
expectParity<Parity<ContactCompletionQuestion, typeof contactCompletionQuestionObject>>();
expectParity<Parity<ContactCompletionAnswerInput, typeof contactCompletionAnswerInputObject>>();
expectParity<Parity<ContactCompletionResult, typeof contactCompletionResultObject>>();
expectParity<Parity<InviteCodeContract, typeof inviteCodeObject>>();
expectParity<Parity<InviteCodePreview, typeof inviteCodePreviewObject>>();
expectParity<Parity<InviteCodeRedeemResult, typeof inviteCodeRedeemResultObject>>();
expectParity<Parity<InviteCodeCreateInput, typeof inviteCodeCreateInputObject>>();
expectParity<Parity<EventAssessmentContract, typeof eventAssessmentObject>>();
expectParity<Parity<EventAssessmentCreateInput, typeof eventAssessmentCreateInputObject>>();
expectParity<Parity<EventAssessmentPatchInput, typeof eventAssessmentPatchInputObject>>();
expectParity<Parity<EventAssessmentAddToPlanResult, typeof eventAssessmentAddToPlanResultObject>>();
expectParity<Parity<EventRecommendationDismissInput, typeof eventRecommendationDismissInputObject>>();
expectParity<Parity<EventRecommendationDismissResult, typeof eventRecommendationDismissResultObject>>();
expectParity<Parity<AccountExportContract, typeof accountExportObject>>();
expectParity<Parity<AccountExportCreateInput, typeof accountExportCreateInputObject>>();
expectParity<Parity<AccountDeletionRequestContract, typeof accountDeletionRequestObject>>();
expectParity<Parity<AppVersionContract, typeof appVersionObject>>();
expectParity<Parity<PlanV2SummaryResponse, typeof planV2SummaryResponseObject>>();
expectParity<Parity<PlanV2Detail, typeof planV2DetailObject>>();
expectParity<Parity<PlanAwardRequest, typeof planAwardRequestObject>>();
expectParity<Parity<PlanAwardResult, typeof planAwardResultObject>>();
expectParity<Parity<PlanUndoRequest, typeof planUndoRequestObject>>();
expectParity<Parity<PlanSkipRequest, typeof planSkipRequestObject>>();
expectParity<Parity<PlanStepRequest, typeof planStepRequestObject>>();
expectParity<Parity<PlanCommandResult, typeof planCommandResultObject>>();
