import type { CanonicalArtifact, CanonicalOperations, CanonicalRegistration } from "../api/canonical-event-detail-contract";
import { eventRegistrationToView } from "./event-registration";
import type { OrbitLanguage } from "../api/contract/language";

export function canonicalRegistrationToView(data: CanonicalRegistration, endsAt: string, language: OrbitLanguage = "zh") {
  const footer = eventRegistrationToView(data, language);
  const activeRegistration = data.registration?.status === "rsvped" &&
    data.eligibility.state !== "unavailable" && data.eligibility.state !== "event_cancelled";
  const canNavigate = data.eligibility.state !== "unavailable" && data.eligibility.allowedActions.some(
    action => action === "apply" || action === "register" || action === "reactivate" || action === "update" || action === "cancel" || action === "withdraw"
  );
  const profileAnswers = data.registration?.participantProfile.answers;
  return {
    footer,
    activeRegistration,
    canNavigate,
    eventEnded: Date.parse(endsAt) <= Date.parse(data.eligibility.evaluatedAt),
    status: footer.statusLabel,
    detail: footer.statusDetail,
    goal: profileAnswers?.desiredOutcome?.trim() || null,
    profileFacts: activeRegistration ? [
      { label: "想认识的人", value: profileAnswers?.targetAttendees?.trim() || "尚未填写" },
      { label: "可以提供的资源", value: profileAnswers?.valueOffered?.trim() || "尚未填写" }
    ] : []
  };
}

export function canonicalRecommendationsToView(data: CanonicalOperations) {
  const statuses = { locked: "推荐结果尚未开放", not_generated: "推荐结果尚未生成", processing: "推荐结果生成中", failed: "推荐结果生成失败", ready: "已发布的推荐结果" };
  const people = data.resultsState === "ready" ? data.recommendations?.recommendations.map(recommendation => {
    const attendee = data.directory.find(value => value.participantId === recommendation.targetParticipantId)!;
    return {
      participantId: recommendation.targetParticipantId, name: attendee.displayName,
      context: [attendee.company, attendee.role].filter(Boolean).join(" · "),
      score: recommendation.score, reasons: recommendation.reasons,
      memberHint: recommendation.memberHint, icebreakers: recommendation.icebreakers
    };
  }) ?? [] : [];
  return {
    status: statuses[data.resultsState], people,
    detail: data.resultsState === "ready" && people.length === 0
      ? data.recommendations?.noMatchReason || "已发布结果中没有本人的推荐对象记录。"
      : data.resultsState === "failed" ? "主办方发布可用结果后，可在这里重新读取。" : null
  };
}

export function canonicalArtifactToView(data: CanonicalArtifact) {
  const statuses = { queued: "会后总结排队中", running: "会后总结生成中", ready: "已保存的会后总结", failed: "会后总结生成失败", unconfigured: "会后总结服务尚未配置" };
  const failureMessages: Record<string, string> = {
    SOURCE_HASH_CHANGED: "会后记录已更新，已有总结暂不可用。",
    AI_ARTIFACT_POLICY_REJECTED: "已保存的总结未通过数据校验，暂时无法展示。",
    AI_EVIDENCE_REQUIRED: "尚无可用于会后总结的已确认会谈记录。",
    AI_PROVIDER_UNCONFIGURED: "会后总结服务尚未配置。",
    AI_ARTIFACT_SERVICE_UNAVAILABLE: "会后总结读取服务暂不可用。"
  };
  return {
    status: data.failureCode === "EVENT_NOT_ENDED" ? "活动结束后可用"
      : data.failureCode === "SOURCE_HASH_CHANGED" || data.failureCode === "AI_ARTIFACT_POLICY_REJECTED"
        ? "会后总结暂不可用" : statuses[data.status],
    summary: data.status === "ready" ? data.artifact?.summary ?? null : null,
    failureDetail: data.failureCode === "EVENT_NOT_ENDED" ? null
      : data.failureCode || data.status === "failed"
        ? failureMessages[data.failureCode ?? ""] ?? "暂时无法读取可用的会后总结，请稍后重新读取。" : null
  };
}
