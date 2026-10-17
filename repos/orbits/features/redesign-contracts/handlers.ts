// R08 mock route handlers for the redesign contracts; each app/api/**/route.ts
// re-exports one of these. See ./route.ts.
import { after } from "next/server";
import { z } from "zod";

import { accountDeletionRequestSchema, accountExportCreateInputSchema, accountExportSchema, appVersionSchema } from "../../shared/api-schema/account";
import { contactCompletionAnswerInputSchema, contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../shared/api-schema/contact-completion";
import { eventAssessmentAddToPlanResultSchema, eventAssessmentAvailabilitySchema, eventAssessmentCreateInputSchema, eventAssessmentDismissResultSchema, eventAssessmentPatchInputSchema, eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { eventRecommendationDismissInputSchema, eventRecommendationDismissResultSchema } from "../../shared/api-schema/event-recommendation-feedback";
import { homeLayoutSchema, homeLayoutUpdateInputSchema } from "../../shared/api-schema/home-layout";
import {
  inviteCodeCreateInputSchema, inviteCodeHistoryResponseSchema, inviteCodePreviewSchema, inviteCodeRedeemInputSchema, inviteCodeRedeemResultSchema, inviteCodeSchema, inviteCodeShareUpdateInputSchema,
  inviteConnectionViewSchema, inviteMergeInputSchema, inviteShareUpdateInputSchema, inviteUnlinkInputSchema, inviteUnlinkResultSchema,
} from "../../shared/api-schema/invite-codes";
import { AppError } from "../../shared/errors/app-error";
import { contactCompletionLiveHandlers } from "../contacts/completion/handlers";
import { eventAssessmentLiveHandlers } from "../events/assessment/handlers";
import { redesignMock, type CompletionMockResult, type InviteFailure } from "./mock-service";
import { readBody, redesignContractRoute, type ContractReply } from "./route";

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

// 3 contact completion — R16: live goes to features/contacts/completion (the
// resolved service says which); mock / hybrid answer from the demo world with the
// same rules and the same failure shapes as live (review M5).
const completionReply = (outcome: CompletionMockResult): ContractReply => {
  if ("result" in outcome) return { data: outcome.result };
  switch (outcome.failure) {
    case "not_found":
      return { context: { reason: "NOT_FOUND" }, error: new AppError("NOT_FOUND", "The question was not found.") };
    case "invalid":
      return { context: { reason: "INVALID_ANSWER" }, error: new AppError("VALIDATION_ERROR", "The answer is not one of the choices.") };
    case "conflict":
      return { context: { reason: "CONFLICT" }, error: new AppError("CONFLICT", "This question was already answered or skipped.") };
  }
};
export const getCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionQuestionSchema.nullable(), (request, params, { service }) => {
  if (service.mode === "live") return contactCompletionLiveHandlers().get(request, params);
  return { data: redesignMock.completionQuestion() };
});
export const answerCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionResultSchema, async (request, params, { service }) => {
  if (service.mode === "live") return contactCompletionLiveHandlers().answer(request, params);
  const body = await readBody(request, contactCompletionAnswerInputSchema);
  if (body.ok === false) return body.reply;
  return completionReply(redesignMock.completionAnswer(params.id ?? "", body.value));
});
export const skipCompletionQuestion = redesignContractRoute("contact-completion", contactCompletionResultSchema, async (request, params, { service }) => {
  if (service.mode === "live") return contactCompletionLiveHandlers().skip(request, params);
  const body = await readBody(request, keyOnly);
  if (body.ok === false) return body.reply;
  return completionReply(redesignMock.completionSkip(params.id ?? "", body.value));
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
// R15 P1：改当前码的共享项目；没有当前码 404（与 live 同形）。
export const updateCurrentInviteShare = redesignContractRoute("invite-codes", inviteCodeSchema, async (request) => {
  const body = await readBody(request, inviteCodeShareUpdateInputSchema);
  if (body.ok === false) return body.reply;
  const updated = redesignMock.updateCurrentInviteShare(body.value);
  return updated ? { data: updated } : { error: new AppError("NOT_FOUND", "There is no current invite code.") };
});
// R15：失败与 live 同形——不可用一律 404 + reason INVITE_UNAVAILABLE（防枚举），过期 / 满员 / 自己的码是 409 + 各自的 reason。
const inviteFailure = (failed: InviteFailure): ContractReply => failed.failure === "unavailable"
  ? { error: new AppError("NOT_FOUND", "This invite code cannot be used."), context: { reason: failed.reason } }
  : { error: new AppError("CONFLICT", "This invite code cannot be used now."), context: { reason: failed.reason } };
export const previewInviteCode = redesignContractRoute("invite-codes", inviteCodePreviewSchema, (_request, params) => {
  const preview = redesignMock.invitePreview(params.code ?? "");
  return "failure" in preview ? inviteFailure(preview) : { data: preview };
});
export const redeemInviteCode = redesignContractRoute("invite-codes", inviteCodeRedeemResultSchema, async (request, params) => {
  const body = await readBody(request, inviteCodeRedeemInputSchema);
  if (body.ok === false) return body.reply;
  const result = redesignMock.inviteRedeem(params.code ?? "", body.value);
  return "failure" in result ? inviteFailure(result) : { data: result };
});
export const listInviteCodeHistory = redesignContractRoute("invite-codes", inviteCodeHistoryResponseSchema, () => ({ data: { items: redesignMock.inviteHistory() } }));
export const getInviteConnection = redesignContractRoute("invite-codes", inviteConnectionViewSchema, (_request, params) => {
  const found = redesignMock.inviteConnection(params.contactId ?? "");
  return found ? { data: found } : notFound();
});
export const updateInviteShare = redesignContractRoute("invite-codes", inviteConnectionViewSchema, async (request, params) => {
  const body = await readBody(request, inviteShareUpdateInputSchema);
  if (body.ok === false) return body.reply;
  const updated = redesignMock.updateInviteShare(params.contactId ?? "", body.value);
  return updated ? { data: updated } : notFound();
});
export const unlinkInviteConnection = redesignContractRoute("invite-codes", inviteUnlinkResultSchema, async (request, params) => {
  const body = await readBody(request, inviteUnlinkInputSchema);
  if (body.ok === false) return body.reply;
  const result = redesignMock.unlinkInvite(params.contactId ?? "", body.value);
  return result ? { data: result } : notFound();
});
// R15 复核 S1：可能是同一人的建议——我确认统合 / 不是同一人。
const resolveMerge = (action: "merge" | "dismiss") => redesignContractRoute("invite-codes", inviteConnectionViewSchema, async (request, params) => {
  const body = await readBody(request, inviteMergeInputSchema);
  if (body.ok === false) return body.reply;
  const updated = redesignMock.resolveInviteMerge(params.contactId ?? "", body.value, action);
  return updated ? { data: updated } : notFound();
});
export const mergeInviteConnection = resolveMerge("merge");
export const dismissInviteMerge = resolveMerge("dismiss");

// 8 event assessment — R26: live goes to features/events/assessment (registered live in service-factory.ts);
// mock / hybrid answer from the demo world (incl. the R26 failure-state fixtures and the design-board fixtures).
const scheduleAfter = (job: () => Promise<void>) => {
  try {
    after(job);
  } catch {
    // Outside a request scope (tests / scripts): run it now.
    void job().catch(() => undefined);
  }
};
const assessmentLive = () => eventAssessmentLiveHandlers(scheduleAfter);
export const listAssessments = redesignContractRoute("event-assessment", z.array(eventAssessmentSchema), (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().list(request, params);
  return { data: redesignMock.assessments() };
});
export const createAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, async (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().create(request, params);
  const body = await readBody(request, eventAssessmentCreateInputSchema);
  if (body.ok === false) return body.reply;
  return { data: redesignMock.createAssessment(body.value), status: 202 };
});
export const getAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().get(request, params);
  const found = redesignMock.assessment(params.id ?? "");
  return found ? { data: found } : notFound();
});
export const patchAssessment = redesignContractRoute("event-assessment", eventAssessmentSchema, async (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().patch(request, params);
  const body = await readBody(request, eventAssessmentPatchInputSchema);
  if (body.ok === false) return body.reply;
  const patched = redesignMock.patchAssessment(params.id ?? "", body.value.facts, body.value.unknownFields);
  return patched ? { data: patched } : notFound();
});
export const addAssessmentToPlan = redesignContractRoute("event-assessment", eventAssessmentAddToPlanResultSchema, (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().addToPlan(request, params);
  return redesignMock.addAssessmentToPlan(params.id ?? "") ? { data: { assessmentId: params.id, addedToPlan: true, planId: null, planItemId: null } } : notFound();
});
// R26: 見送る、入口可用性、海报上传。
export const dismissAssessment = redesignContractRoute("event-assessment", eventAssessmentDismissResultSchema, (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().dismiss(request, params);
  return redesignMock.dismissAssessment(params.id ?? "") ? { data: { assessmentId: params.id, userDecision: "dismissed" } } : notFound();
});
export const assessmentAvailability = redesignContractRoute("event-assessment", eventAssessmentAvailabilitySchema, (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().availability(request, params);
  return { data: redesignMock.assessmentAvailability() };
});
export const uploadAssessmentPoster = redesignContractRoute("event-assessment", z.object({ posterAssetId: z.string().min(1) }), (request, params, { service }) => {
  if (service.mode === "live") return assessmentLive().uploadPoster(request, params);
  return { data: { posterAssetId: `demo-poster-${Date.now().toString(36)}` }, status: 201 };
});

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
export { getTodoPage } from "../todo/handlers";
