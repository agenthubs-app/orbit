// R08 mock route handlers for the redesign contracts; each app/api/**/route.ts
// re-exports one of these. See app/api/_shared/redesign-contract-route.ts.
import { z } from "zod";

import { accountDeletionRequestSchema, accountExportSchema, appVersionSchema } from "../../shared/api-schema/account";
import { contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../shared/api-schema/contact-completion";
import { eventAssessmentCreateInputSchema, eventAssessmentPatchInputSchema, eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { eventRecommendationDismissInputSchema, eventRecommendationDismissResultSchema } from "../../shared/api-schema/event-recommendation-feedback";
import { homeLayoutSchema, homeLayoutUpdateInputSchema } from "../../shared/api-schema/home-layout";
import { inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema } from "../../shared/api-schema/invite-codes";
import { planV2SummaryResponseSchema } from "../../shared/api-schema/plan-v2";
import { AppError } from "../../shared/errors/app-error";
import { readBody, redesignContractRoute } from "../../app/api/_shared/redesign-contract-route";
import { redesignMock } from "./mock-service";

const notFound = () => ({ error: new AppError("NOT_FOUND", "Not found.") });
const answerInput = z.object({ answer: z.string().trim().min(1).max(200), idempotencyKey: z.string().min(1) }).strict();
const keyOnly = z.object({ idempotencyKey: z.string().min(1) }).strict();

// 1 home layout
export const getHomeLayout = redesignContractRoute("home-layout", homeLayoutSchema, () => ({ data: redesignMock.homeLayout() }));
export const putHomeLayout = redesignContractRoute("home-layout", homeLayoutSchema, async (request) => {
  const body = await readBody(request, homeLayoutUpdateInputSchema);
  if (body.ok === false) return body.reply;
  const result = redesignMock.putHomeLayout(body.value);
  return result.conflict === true
    ? { error: new AppError("CONFLICT", "The layout was changed on another device."), context: { currentRevision: String(result.current.revision) } }
    : { data: result.layout };
});

// 3 contact completion
export const getCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionQuestionSchema.nullable(), () => ({ data: redesignMock.completionQuestion() }));
export const answerCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionResultSchema, async (request, params) => {
  const body = await readBody(request, answerInput);
  if (body.ok === false) return body.reply;
  return params.id === redesignMock.completionQuestion().id ? { data: { questionId: params.id, status: "answered", next: null } } : notFound();
});
export const skipCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionResultSchema, async (request, params) => {
  const body = await readBody(request, keyOnly);
  if (body.ok === false) return body.reply;
  return params.id === redesignMock.completionQuestion().id ? { data: { questionId: params.id, status: "skipped", next: null } } : notFound();
});

// 4 invite codes
export const createInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema, () => ({ data: redesignMock.inviteCode(), status: 201 }));
export const getCurrentInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema.nullable(), () => ({ data: redesignMock.inviteCode() }));
export const revokeInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema, (_request, params) =>
  params.code === redesignMock.inviteCode().code ? { data: { ...redesignMock.inviteCode(), revokedAt: new Date().toISOString() } } : notFound());
export const previewInviteCode = redesignContractRoute("invite-codes", inviteCodePreviewSchema, (_request, params) => {
  const preview = redesignMock.invitePreview(params.code ?? "");
  return preview ? { data: preview } : notFound();
});
export const redeemInviteCode = redesignContractRoute("invite-codes", inviteCodeRedeemResultSchema, (_request, params) => {
  const result = redesignMock.inviteRedeem(params.code ?? "");
  return result ? { data: result } : notFound();
});

// 8 event assessment
export const listAssessments = redesignContractRoute("event-assessment", z.array(eventAssessmentSchema), () => ({ data: redesignMock.assessments() }));
export const createAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, async (request) => {
  const body = await readBody(request, eventAssessmentCreateInputSchema);
  if (body.ok === false) return body.reply;
  return { data: redesignMock.createAssessment(body.value.sourceKind), status: 202 };
});
export const getAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, (_request, params) => {
  const found = redesignMock.assessment(params.id ?? "");
  return found ? { data: found } : notFound();
});
export const patchAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, async (request, params) => {
  const body = await readBody(request, eventAssessmentPatchInputSchema);
  if (body.ok === false) return body.reply;
  const found = redesignMock.assessment(params.id ?? "");
  return found ? { data: { ...found, facts: { ...found.facts, ...body.value.facts }, missingFields: found.missingFields.filter((field) => !(field in body.value.facts)) } } : notFound();
});
export const addAssessmentToPlan = redesignContractRoute("event-assessment", z.object({ assessmentId: z.string(), addedToPlan: z.literal(true) }), (_request, params) =>
  redesignMock.assessment(params.id ?? "") ? { data: { assessmentId: params.id, addedToPlan: true } } : notFound());

// 9 recommendation feedback
export const dismissEventRecommendation = redesignContractRoute("event-recommendation-feedback", eventRecommendationDismissResultSchema, async (request, params) => {
  const body = await readBody(request, eventRecommendationDismissInputSchema);
  if (body.ok === false) return body.reply;
  return { data: redesignMock.dismiss(params.id ?? "", body.value.reason) };
});

// 11 account
export const listAccountExports = redesignContractRoute("account-lifecycle", z.array(accountExportSchema), () => ({ data: [redesignMock.accountExport()] }));
export const createAccountExport = redesignContractRoute("account-lifecycle", accountExportSchema, () => ({ data: { ...redesignMock.accountExport(), status: "queued", downloadUrl: undefined, expiresAt: undefined }, status: 202 }));
export const getAccountExport = redesignContractRoute("account-lifecycle", accountExportSchema, (_request, params) =>
  params.id === redesignMock.accountExport().id ? { data: redesignMock.accountExport() } : notFound());
export const getDeletionRequest = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema.nullable(), () => ({ data: redesignMock.deletionRequest() }));
export const requestAccountDeletion = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema, () => ({ data: redesignMock.requestDeletion(), status: 202 }));
export const cancelAccountDeletion = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema.nullable(), () => ({ data: redesignMock.cancelDeletion() }));
export const getAppVersion = redesignContractRoute("account-lifecycle", appVersionSchema, () => ({ data: redesignMock.appVersion() }));

// 12 plan v2 (draft)
export const getPlanV2Summary = redesignContractRoute("plan-v2-summary", planV2SummaryResponseSchema, () => ({ data: redesignMock.planSummary() }));
