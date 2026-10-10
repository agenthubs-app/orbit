// R08 mock route handlers for the redesign contracts; each app/api/**/route.ts
// re-exports one of these. See ./route.ts.
import { z } from "zod";

import { accountDeletionRequestSchema, accountExportCreateInputSchema, accountExportSchema, appVersionSchema } from "../../shared/api-schema/account";
import { contactCompletionAnswerInputSchema, contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../shared/api-schema/contact-completion";
import { eventAssessmentAddToPlanResultSchema, eventAssessmentCreateInputSchema, eventAssessmentPatchInputSchema, eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { eventRecommendationDismissInputSchema, eventRecommendationDismissResultSchema } from "../../shared/api-schema/event-recommendation-feedback";
import { homeLayoutSchema, homeLayoutUpdateInputSchema } from "../../shared/api-schema/home-layout";
import { inviteCodeCreateInputSchema, inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema } from "../../shared/api-schema/invite-codes";
import { AppError } from "../../shared/errors/app-error";
import { redesignMock } from "./mock-service";
import { readBody, redesignContractRoute } from "./route";

const notFound = () => ({ error: new AppError("NOT_FOUND", "Not found.") });
const keyOnly = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();

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
  const body = await readBody(request, contactCompletionAnswerInputSchema);
  if (body.ok === false) return body.reply;
  return params.id === redesignMock.completionQuestion().id ? { data: { questionId: params.id, status: "answered", next: null } } : notFound();
});
export const skipCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionResultSchema, async (request, params) => {
  const body = await readBody(request, keyOnly);
  if (body.ok === false) return body.reply;
  return params.id === redesignMock.completionQuestion().id ? { data: { questionId: params.id, status: "skipped", next: null } } : notFound();
});

// 4 invite codes
export const createInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema, async (request) => {
  const body = await readBody(request, inviteCodeCreateInputSchema);
  if (body.ok === false) return body.reply;
  return { data: redesignMock.createInvite(body.value), status: 201 };
});
export const getCurrentInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema.nullable(), () => ({ data: redesignMock.currentInvite() }));
export const revokeInviteCode = redesignContractRoute("invite-codes", inviteCodeSchema, (_request, params) => {
  const revoked = redesignMock.revokeInvite(params.code ?? "");
  return revoked ? { data: revoked } : notFound();
});
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
  return { data: redesignMock.createAssessment(body.value), status: 202 };
});
export const getAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, (_request, params) => {
  const found = redesignMock.assessment(params.id ?? "");
  return found ? { data: found } : notFound();
});
export const patchAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, async (request, params) => {
  const body = await readBody(request, eventAssessmentPatchInputSchema);
  if (body.ok === false) return body.reply;
  const patched = redesignMock.patchAssessment(params.id ?? "", body.value.facts);
  return patched ? { data: patched } : notFound();
});
export const addAssessmentToPlan = redesignContractRoute("event-assessment", eventAssessmentAddToPlanResultSchema, (_request, params) =>
  redesignMock.assessment(params.id ?? "") ? { data: { assessmentId: params.id, addedToPlan: true } } : notFound());

// 9 recommendation feedback
export const dismissEventRecommendation = redesignContractRoute("event-recommendation-feedback", eventRecommendationDismissResultSchema, async (request, params) => {
  const body = await readBody(request, eventRecommendationDismissInputSchema);
  if (body.ok === false) return body.reply;
  const result = redesignMock.dismiss(params.id ?? "", body.value.reason);
  return result ? { data: result } : notFound();
});

// 11 account
export const listAccountExports = redesignContractRoute("account-lifecycle", z.array(accountExportSchema), () => ({ data: redesignMock.accountExports() }));
export const createAccountExport = redesignContractRoute("account-lifecycle", accountExportSchema, async (request) => {
  const body = await readBody(request, accountExportCreateInputSchema);
  if (body.ok === false) return body.reply;
  return { data: redesignMock.createAccountExport(body.value), status: 202 };
});
export const getAccountExport = redesignContractRoute("account-lifecycle", accountExportSchema, (_request, params) => {
  const found = redesignMock.accountExport(params.id ?? "");
  return found ? { data: found } : notFound();
});
export const getDeletionRequest = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema.nullable(), () => ({ data: redesignMock.deletionRequest() }));
export const requestAccountDeletion = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema, () => ({ data: redesignMock.requestDeletion(), status: 202 }));
export const cancelAccountDeletion = redesignContractRoute("account-lifecycle", accountDeletionRequestSchema.nullable(), () => ({ data: redesignMock.cancelDeletion() }));
export const getAppVersion = redesignContractRoute("account-lifecycle", appVersionSchema, () => ({ data: redesignMock.appVersion() }));

// 12 plan v2：R22 起由 features/plans/v2/handlers.ts 实现（mock 读演示世界，live 读真实计划）；
// capability id「plan-v2-summary」仍用于 ORBIT_REDESIGN_MOCK 把这组接口切回 mock。
