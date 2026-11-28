/**
 * Rule-based recommendations and grouping features (2026-11-28). Wraps an AI provider: who is recommended to whom,
 * and why, comes from match-rules.ts (no model call); only the table text (themes, icebreakers per table) still comes
 * from the wrapped provider. Candidate retrieval already ranks each person's shortlist by the same rules with a
 * room-wide cap, so the first `recommendationCount` positive candidates are the picks.
 */
import type {
  EventOperationsAiProvider,
  EventOperationsGroupingFeature,
  EventOperationsParticipantRecommendations,
} from "./contract";
import { participantSummary, recommendationText, ruleMatch } from "./match-rules";

export const RULE_MATCHING_VERSION = "rules-2026-11-28";

/** The wrapped provider's fingerprint (a JSON document) with the rule version added, so cached work is not reused across versions. */
function fingerprintWithRules(fingerprint: string | undefined): string {
  try {
    const parsed = JSON.parse(fingerprint ?? "{}") as Record<string, unknown>;
    return JSON.stringify({ ...parsed, matching: RULE_MATCHING_VERSION });
  } catch {
    return `${fingerprint ?? "event-operations-ai-provider"}+${RULE_MATCHING_VERSION}`;
  }
}

export function withRuleMatching(base: EventOperationsAiProvider): EventOperationsAiProvider {
  const picksFor = (source: Parameters<EventOperationsAiProvider["generateRecommendations"]>[0]["sources"][number], count: number) =>
    source.candidateParticipants
      .map((target) => ({ match: ruleMatch(source.sourceParticipant, target), target }))
      .filter((entry) => entry.match.value > 0)
      .slice(0, count);

  return {
    ...base,
    generateGroupingFeatures: async (input) => {
      const data: EventOperationsGroupingFeature[] = input.sources.map((source) => {
        const summary = participantSummary(source.sourceParticipant);
        return {
          affinityParticipantIds: source.recommendations.recommendations
            .slice(0, input.maxAffinityCount)
            .map((recommendation) => recommendation.targetParticipantId),
          facilitationHint: `${summary.primary}；这次想${summary.secondary}`,
          participantId: source.sourceParticipant.participantId,
          primaryTopic: summary.primary,
          secondaryTopic: summary.secondary,
        };
      });
      return { data, model: RULE_MATCHING_VERSION, provider: "rules", success: true } as Awaited<ReturnType<EventOperationsAiProvider["generateGroupingFeatures"]>>;
    },
    generateRecommendations: async (input) => {
      const data: EventOperationsParticipantRecommendations[] = input.sources.map((source) => {
        const picks = picksFor(source, input.recommendationCount);
        if (!picks.length) {
          return {
            noMatchReason: "这次的参加者里暂时没有和你的目标直接对口的人，可以在现场多和同桌的人聊聊。",
            noMatchReasonI18n: {
              en: "No one here matches your goals directly yet — talk to your tablemates on the day.",
              ja: "今回の参加者には、目的に直接合う方がまだいません。当日は同じテーブルの方とぜひ話してみてください。",
              zh: "这次的参加者里暂时没有和你的目标直接对口的人，可以在现场多和同桌的人聊聊。",
            },
            recommendations: [],
            sourceParticipantId: source.sourceParticipant.participantId,
          };
        }
        return {
          noMatchReason: null,
          recommendations: picks.map(({ match, target }, index) => {
            const i18n = recommendationText(source.sourceParticipant, target, match);
            return {
              icebreakers: i18n.zh.icebreakers,
              i18n,
              memberHint: i18n.zh.memberHint,
              rank: index + 1,
              reasons: i18n.zh.reasons,
              score: Math.max(1, Math.min(99, Math.round(20 + match.value * 9))),
              targetParticipantId: target.participantId,
            };
          }),
          sourceParticipantId: source.sourceParticipant.participantId,
        };
      });
      return { data, model: RULE_MATCHING_VERSION, provider: "rules", success: true } as Awaited<ReturnType<EventOperationsAiProvider["generateRecommendations"]>>;
    },
    requestFingerprint: fingerprintWithRules(base.requestFingerprint),
  };
}
