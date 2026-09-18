import {
  PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS,
  type ProfileSignalEvidence,
  type ProfileSignalProfileField,
  type ProfileSignalReviewQueueErrorCode,
  type ProfileSignalReviewQueueFailure,
  type ProfileSignalReviewQueuePayload,
  type ProfileSignalReviewQueueProvenance,
  type ProfileSignalReviewQueueResult,
  type ProfileSignalReviewQueueService,
  type ProfileSignalReviewQueueState,
  type ProfileSignalSourceKind,
  type ProfileSignalSuggestionAcceptedPayload,
  type ProfileSignalSuggestionAcceptedSuccess,
  type ProfileSignalSuggestionAcceptResult,
  type ProfileSignalSuggestionDismissedPayload,
  type ProfileSignalSuggestionDismissResult,
  type ProfileUpdateSuggestion,
} from "./signal-contract";
import type {
  LiveProfileSignalDecision,
  LiveProfileSignalGraph,
  LiveProfileSignalProfileRecord,
  LiveProfileSignalProvider,
} from "./storage/profile-signal-live-record-provider";

export interface LiveProfileSignalReviewQueueServiceOptions {
  now?: () => string;
  provider: LiveProfileSignalProvider | null;
}

const emptyEvidenceId = "evidence:profile-signal-live-empty";
const unconfiguredEvidenceId = "evidence:profile-signal-live-unconfigured";

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function stableProfile(
  graph: LiveProfileSignalGraph,
  actorId: string,
): LiveProfileSignalProfileRecord | null {
  return (
    graph.profiles.find((profile) => profile.accountId === actorId) ??
    null
  );
}

function evidenceSummary(
  graph: LiveProfileSignalGraph,
  evidenceId: string,
  fallback: string,
): string {
  return (
    graph.evidence.find((evidence) => evidence.id === evidenceId)?.summary ??
    fallback
  );
}

function truncateExcerpt(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function sourceEvidence(input: {
  collectedAt: string;
  evidenceId: string;
  excerpt: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
}): ProfileSignalEvidence {
  return {
    evidenceId: input.evidenceId,
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    excerpt: truncateExcerpt(input.excerpt),
    collectedAt: input.collectedAt,
  };
}

function provenance(input: {
  collectedAt: string;
  evidenceIds: readonly string[];
  provider: LiveProfileSignalProvider | null;
  source?: string;
  sourceLabel?: string;
}): ProfileSignalReviewQueueProvenance {
  return {
    source:
      input.source ??
      input.provider?.source ??
      "live-record-store:profile-signals:unconfigured",
    sourceLabel:
      input.sourceLabel ??
      input.provider?.sourceLabel ??
      "Profile signal live storage is not configured",
    evidenceIds: input.evidenceIds,
    collectedAt: input.collectedAt,
    privacy: "actor-scoped-profile-signals",
    generationMethod: "rule-based-signal-match",
  };
}

function failure(
  code: ProfileSignalReviewQueueErrorCode,
  input: {
    evidenceIds?: readonly string[];
    now: string;
    provider: LiveProfileSignalProvider | null;
  },
): ProfileSignalReviewQueueFailure {
  const failureProvenance = provenance({
    collectedAt: input.now,
    evidenceIds: input.evidenceIds ?? [`evidence:${code.toLowerCase()}`],
    provider: input.provider,
  });

  return {
    success: false,
    error: {
      ...PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: failureProvenance,
      evidenceIds: failureProvenance.evidenceIds,
    },
  };
}

function success(data: ProfileSignalReviewQueuePayload): {
  success: true;
  data: ProfileSignalReviewQueuePayload;
} {
  return {
    success: true,
    data,
  };
}

function accepted(
  data: ProfileSignalSuggestionAcceptedPayload,
): ProfileSignalSuggestionAcceptedSuccess {
  return {
    success: true,
    data,
  };
}

function profileCurrentValue(
  profile: LiveProfileSignalProfileRecord | null,
  field: ProfileSignalProfileField,
): string | readonly string[] {
  if (!profile) {
    return "";
  }

  const value = field === "bio" || field === "offering" || field === "seeking"
    ? profile.publicProfile?.[field]
    : profile[field];

  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === "string" && value.trim() ? value : "";
}

function createSuggestion(input: {
  confidence: ProfileUpdateSuggestion["confidence"];
  createdAt: string;
  currentValue: string | readonly string[];
  evidence: ProfileSignalEvidence;
  id: string;
  provenance: ProfileSignalReviewQueueProvenance;
  rationale: string;
  sourceKind: ProfileSignalSourceKind;
  sourceLabel: string;
  suggestedValue: string | readonly string[];
  targetProfileField: ProfileSignalProfileField;
}): ProfileUpdateSuggestion {
  return {
    id: input.id,
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    targetProfileField: input.targetProfileField,
    currentValue: input.currentValue,
    suggestedValue: input.suggestedValue,
    rationale: input.rationale,
    confidence: input.confidence,
    status: "pending",
    createdAt: input.createdAt,
    evidence: [input.evidence],
    provenance: input.provenance,
  };
}

/**
 * Rule copy is composed here, so it must exist in every account language.
 * Evidence excerpts are source data and stay in their original wording; the
 * UI labels them as such rather than translating a quotation.
 */
export type ProfileSignalLanguage = "zh" | "ja" | "en";

export function profileSignalLanguage(value: unknown): ProfileSignalLanguage {
  return value === "ja" || value === "en" ? value : "zh";
}

const SIGNAL_COPY = {
  chat: {
    rationale: {
      zh: "最近的沟通记录反复围绕具体的跟进决定，适合写进你想寻找的对象。",
      ja: "最近のやり取りは具体的なフォローアップの判断を繰り返し話題にしています。",
      en: "Recent chat notes repeatedly frame Orbit's value around concrete follow-up decisions.",
    },
    sourceLabel: { zh: "沟通信号", ja: "コミュニケーション信号", en: "Chat signal" },
    value: { zh: "能一起推进跟进的伙伴", ja: "フォローアップを一緒に進める相手", en: "follow-up collaborators" },
  },
  activity: {
    rationale: {
      zh: "最近的互动记忆里出现多次跟进请求，建议复核更短的跟进周期。",
      ja: "最近のやり取りの記録にフォローアップ依頼が複数あり、より短い間隔の見直しを提案します。",
      en: "Recent interaction memory includes follow-up requests, so the operator should review a shorter follow-up window.",
    },
    sourceLabel: { zh: "活动信号", ja: "アクティビティ信号", en: "Activity signal" },
    value: {
      zh: "搭建有据可查的关系跟进流程。",
      ja: "根拠の残る関係フォローアップの仕組みづくり。",
      en: "Building sourced relationship follow-up workflows.",
    },
  },
  contact: {
    rationale: {
      zh: "关系最强的几条连接集中在运营者、创业者和社群引荐路径上。",
      ja: "つながりの強い相手は運営者・創業者・コミュニティ紹介の経路に集中しています。",
      en: "The strongest generated relationship graph edges cluster around operators, founders, and community introduction paths.",
    },
    sourceLabel: { zh: "人脉信号", ja: "人脈信号", en: "Contact signal" },
    value: { zh: "以活动为由的引荐", ja: "イベントを起点とした紹介", en: "event-grounded introductions" },
  },
  empty: {
    summary: {
      zh: "暂时没有可复核的资料建议。",
      ja: "確認できるプロフィール提案はまだありません。",
      en: "No sourced profile suggestions are ready for review.",
    },
    nextAction: {
      zh: "在出现有来源的信号之前，资料保持不变。",
      ja: "根拠のある信号が出るまで、プロフィールは変更しません。",
      en: "Keep the profile unchanged until a sourced signal creates a suggestion.",
    },
  },
  ready: {
    summary: {
      zh: "有 {count} 条有来源的资料建议待你复核。",
      ja: "根拠のあるプロフィール提案が {count} 件、確認待ちです。",
      en: "{count} sourced profile suggestions are waiting for operator review.",
    },
    nextAction: {
      zh: "逐条复核后再决定是否写入资料。",
      ja: "1 件ずつ確認してからプロフィールに反映してください。",
      en: "Review each suggestion before applying any change to the profile.",
    },
  },
  accepted: {
    nextAction: {
      zh: "确认保存资料后，这条修改才会生效。",
      ja: "プロフィールの保存を確認してから反映されます。",
      en: "Apply this patch only after the operator confirms the profile save.",
    },
  },
  dismissed: {
    nextAction: {
      zh: "资料保持不变，继续复核其余建议。",
      ja: "プロフィールは変更せず、残りの提案を確認します。",
      en: "Keep the profile unchanged and continue reviewing pending suggestions.",
    },
  },
} as const;

function copy(
  group: keyof typeof SIGNAL_COPY,
  key: string,
  language: ProfileSignalLanguage,
): string {
  const entry = (SIGNAL_COPY[group] as Record<string, Record<ProfileSignalLanguage, string>>)[key];
  if (!entry) throw new Error(`Missing profile signal copy for ${group}.${key}`);
  return entry[language];
}

function buildSuggestions(input: {
  graph: LiveProfileSignalGraph;
  now: string;
  profile: LiveProfileSignalProfileRecord | null;
  provider: LiveProfileSignalProvider;
  language: ProfileSignalLanguage;
}): readonly ProfileUpdateSuggestion[] {
  const language = input.language;
  const latestMessage = [...input.graph.messages].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  )[0];
  const latestFollowUpMemory =
    [...input.graph.interactionMemories]
      .filter((memory) => memory.memoryType === "follow_up_request")
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0] ??
    [...input.graph.interactionMemories].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt),
    )[0];
  const strongestConnection = [...input.graph.connections].sort(
    (left, right) =>
      (right.businessRelevanceScore ?? 0) - (left.businessRelevanceScore ?? 0),
  )[0];
  const contactForConnection = input.graph.contacts.find(
    (contact) => contact.id === strongestConnection?.contactId,
  );
  const suggestions: ProfileUpdateSuggestion[] = [];

  if (latestMessage) {
    const evidenceId = latestMessage.evidenceIds[0] ?? latestMessage.id;
    const suggestionProvenance = provenance({
      collectedAt: latestMessage.occurredAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "high",
        createdAt: input.now,
        currentValue: profileCurrentValue(input.profile, "seeking"),
        evidence: sourceEvidence({
          collectedAt: latestMessage.occurredAt,
          evidenceId,
          excerpt: evidenceSummary(input.graph, evidenceId, latestMessage.body),
          sourceKind: "chat",
          sourceLabel: latestMessage.source.label,
        }),
        id: `live-profile-suggestion-chat-${latestMessage.id}`,
        provenance: suggestionProvenance,
        rationale: copy("chat", "rationale", language),
        sourceKind: "chat",
        sourceLabel: copy("chat", "sourceLabel", language),
        suggestedValue: [copy("chat", "value", language)],
        targetProfileField: "seeking",
      }),
    );
  }

  if (latestFollowUpMemory) {
    const evidenceId =
      latestFollowUpMemory.evidenceIds[0] ?? latestFollowUpMemory.id;
    const suggestionProvenance = provenance({
      collectedAt: latestFollowUpMemory.occurredAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "medium",
        createdAt: input.now,
        currentValue: profileCurrentValue(
          input.profile,
          "bio",
        ),
        evidence: sourceEvidence({
          collectedAt: latestFollowUpMemory.occurredAt,
          evidenceId,
          excerpt: evidenceSummary(
            input.graph,
            evidenceId,
            latestFollowUpMemory.summary,
          ),
          sourceKind: "activity",
          sourceLabel: latestFollowUpMemory.source.label,
        }),
        id: `live-profile-suggestion-activity-${latestFollowUpMemory.id}`,
        provenance: suggestionProvenance,
        rationale: copy("activity", "rationale", language),
        sourceKind: "activity",
        sourceLabel: copy("activity", "sourceLabel", language),
        suggestedValue: copy("activity", "value", language),
        targetProfileField: "bio",
      }),
    );
  }

  if (strongestConnection && contactForConnection) {
    const evidenceId =
      strongestConnection.evidenceIds[0] ??
      contactForConnection.evidenceIds[0] ??
      strongestConnection.id;
    const suggestionProvenance = provenance({
      collectedAt: strongestConnection.updatedAt,
      evidenceIds: [evidenceId],
      provider: input.provider,
    });

    suggestions.push(
      createSuggestion({
        confidence: "medium",
        createdAt: input.now,
        currentValue: profileCurrentValue(
          input.profile,
          "offering",
        ),
        evidence: sourceEvidence({
          collectedAt: strongestConnection.updatedAt,
          evidenceId,
          excerpt: evidenceSummary(
            input.graph,
            evidenceId,
            `${contactForConnection.displayName}: ${strongestConnection.summary}`,
          ),
          sourceKind: "contact",
          sourceLabel: contactForConnection.source.label,
        }),
        id: `live-profile-suggestion-contact-${strongestConnection.id}`,
        provenance: suggestionProvenance,
        rationale: copy("contact", "rationale", language),
        sourceKind: "contact",
        sourceLabel: copy("contact", "sourceLabel", language),
        suggestedValue: [copy("contact", "value", language)],
        targetProfileField: "offering",
      }),
    );
  }

  return suggestions.slice(0, 3);
}

function payload(input: {
  actorId: string;
  forceEmpty?: boolean;
  graph: LiveProfileSignalGraph;
  now: string;
  provider: LiveProfileSignalProvider;
  state?: ProfileSignalReviewQueueState;
  language: ProfileSignalLanguage;
}): ProfileSignalReviewQueuePayload {
  const profile = stableProfile(input.graph, input.actorId);
  const generatedSuggestions = buildSuggestions({
    graph: input.graph,
    now: input.now,
    profile,
    provider: input.provider,
    language: input.language,
  });
  const decisions = new Map(
    (input.graph.suggestionDecisions ?? []).map(decision => [decision.suggestionId, decision]),
  );
  const suggestions = generatedSuggestions.map(suggestion => {
    const decision = decisions.get(suggestion.id);
    return decision ? { ...suggestion, status: decision.status } : suggestion;
  });
  const visibleSuggestions =
    input.forceEmpty === true
      ? []
      : input.state === "pending"
        ? suggestions.slice(0, 1)
        : suggestions;
  const evidenceIds =
    visibleSuggestions.flatMap((suggestion) => suggestion.provenance.evidenceIds);
  const signalProvenance = provenance({
    collectedAt: input.graph.generatedAt,
    evidenceIds: evidenceIds.length > 0 ? evidenceIds : [emptyEvidenceId],
    provider: input.provider,
  });

  if (visibleSuggestions.length === 0) {
    return {
      state: "empty",
      suggestions: [],
      summary: copy("empty", "summary", input.language),
      provenance: signalProvenance,
      nextAction: copy("empty", "nextAction", input.language),
    };
  }

  return {
    state: input.state ?? "success",
    suggestions: visibleSuggestions,
    summary: copy("ready", "summary", input.language).replace("{count}", String(visibleSuggestions.length)),
    provenance: signalProvenance,
    nextAction: copy("ready", "nextAction", input.language),
  };
}

function acceptSuggestion(input: {
  id: string;
  now: string;
  payload: ProfileSignalReviewQueuePayload;
  provider: LiveProfileSignalProvider;
  mutationId?: string;
  acceptedAt?: string;
  language: ProfileSignalLanguage;
}): ProfileSignalSuggestionAcceptResult {
  const suggestion = input.payload.suggestions.find(
    (candidate) => candidate.id === input.id,
  );

  if (!suggestion) {
    return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND", {
      evidenceIds: [`evidence:profile-signal-suggestion-not-found:${input.id}`],
      now: input.now,
      provider: input.provider,
    });
  }

  if (suggestion.status !== "pending") {
    return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
      evidenceIds: [
        `evidence:profile-signal-suggestion-already-resolved:${input.id}`,
      ],
      now: input.now,
      provider: input.provider,
    });
  }

  return accepted({
    state: "accepted",
    acceptedSuggestion: {
      ...suggestion,
      status: "accepted",
    },
    profilePatch: {
      [suggestion.targetProfileField]: suggestion.suggestedValue,
    },
    appliedFields: [suggestion.targetProfileField],
    acceptedAt: input.acceptedAt ?? input.now,
    ...(input.mutationId ? { mutationId: input.mutationId } : {}),
    provenance: suggestion.provenance,
    nextAction: copy("accepted", "nextAction", input.language),
  });
}

function dismissedSuggestion(input: {
  suggestion: ProfileUpdateSuggestion;
  dismissedAt: string;
  mutationId: string;
  language: ProfileSignalLanguage;
}): { success: true; data: ProfileSignalSuggestionDismissedPayload } {
  return {
    success: true,
    data: {
      state: "dismissed",
      dismissedSuggestion: { ...input.suggestion, status: "dismissed" },
      dismissedAt: input.dismissedAt,
      mutationId: input.mutationId,
      provenance: input.suggestion.provenance,
      nextAction: copy("dismissed", "nextAction", input.language),
    },
  };
}

function decisionMutationId(
  suggestionId: string,
  status: LiveProfileSignalDecision["status"],
  mutationId?: string | null,
): string {
  return mutationId?.trim() || `legacy:${status}:${suggestionId}`;
}

export function createLiveProfileSignalReviewQueueService({
  now = () => new Date().toISOString(),
  provider,
}: LiveProfileSignalReviewQueueServiceOptions): ProfileSignalReviewQueueService {
  async function readPayload(
    actorId: string,
    language: ProfileSignalLanguage,
    state?: ProfileSignalReviewQueueState,
  ): Promise<ProfileSignalReviewQueueResult> {
    const capturedNow = now();

    if (!provider) {
      return failure("PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED", {
        evidenceIds: [unconfiguredEvidenceId],
        now: capturedNow,
        provider,
      });
    }

    const graph = await provider.readSignalGraph(actorId);

    return success(
      payload({
        actorId,
        graph,
        forceEmpty: state === "empty",
        now: capturedNow,
        provider,
        state: state === "empty" ? undefined : state,
        language,
      }),
    );
  }

  return {
    async listUpdateSuggestions(input = {}) {
      const actorId = input.actorId?.trim();
      const language = profileSignalLanguage(input.language);

      if (!actorId) {
        return failure("PROFILE_SIGNAL_ACTOR_REQUIRED", {
          now: now(),
          provider,
        });
      }

      switch (input.scenario) {
        case "empty":
          return readPayload(actorId, language, "empty");
        case "pending":
          return readPayload(actorId, language, "pending");
        case "failure":
          return failure("PROFILE_SIGNAL_REVIEW_QUEUE_FAILED", {
            now: now(),
            provider,
          });
        case "success":
        default:
          return readPayload(actorId, language);
      }
    },

    async acceptUpdateSuggestion(id, options = {}) {
      const capturedNow = now();
      const actorId = options.actorId?.trim();
      const language = profileSignalLanguage(options.language);

      if (!actorId) {
        return failure("PROFILE_SIGNAL_ACTOR_REQUIRED", {
          now: capturedNow,
          provider,
        });
      }

      if (!provider) {
        return failure("PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED", {
          evidenceIds: [unconfiguredEvidenceId],
          now: capturedNow,
          provider,
        });
      }

      const graphResult = provider.readSignalGraph(actorId);
      const graph = isThenable(graphResult) ? await graphResult : graphResult;
      const queuePayload = payload({
        actorId,
        graph,
        now: capturedNow,
        provider,
        language,
      });
      const mutationId = decisionMutationId(id, "accepted", options.mutationId);
      const responseMutationId = options.mutationId?.trim() || undefined;
      const suggestion = queuePayload.suggestions.find(candidate => candidate.id === id);
      if (!suggestion) {
        return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND", {
          evidenceIds: [`evidence:profile-signal-suggestion-not-found:${id}`],
          now: capturedNow,
          provider,
        });
      }
      const existing = graph.suggestionDecisions?.find(decision => decision.suggestionId === id);
      if (existing) {
        if (existing.status === "accepted" && existing.mutationId === mutationId) {
          return acceptSuggestion({
            id,
            language,
            now: capturedNow,
            acceptedAt: existing.decidedAt,
            mutationId: responseMutationId,
            payload: { ...queuePayload, suggestions: queuePayload.suggestions.map(item =>
              item.id === id ? { ...item, status: "pending" } : item) },
            provider,
          });
        }
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
          evidenceIds: [`evidence:profile-signal-suggestion-already-resolved:${id}`],
          now: capturedNow,
          provider,
        });
      }
      const savedDecision = await provider.saveSuggestionDecision({
        actorId,
        suggestionId: id,
        status: "accepted",
        mutationId,
        decidedAt: capturedNow,
      }, actorId);
      if (savedDecision.status !== "accepted" || savedDecision.mutationId !== mutationId) {
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
          evidenceIds: [`evidence:profile-signal-suggestion-already-resolved:${id}`],
          now: capturedNow,
          provider,
        });
      }
      return acceptSuggestion({
        id,
        language,
        now: capturedNow,
        acceptedAt: savedDecision.decidedAt,
        mutationId: responseMutationId,
        payload: queuePayload,
        provider,
      });
    },

    async dismissUpdateSuggestion(id, options = {}): Promise<ProfileSignalSuggestionDismissResult> {
      const capturedNow = now();
      const actorId = options.actorId?.trim();
      const language = profileSignalLanguage(options.language);
      if (!actorId) return failure("PROFILE_SIGNAL_ACTOR_REQUIRED", { now: capturedNow, provider });
      if (!provider) return failure("PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED", {
        evidenceIds: [unconfiguredEvidenceId], now: capturedNow, provider,
      });
      const graphResult = provider.readSignalGraph(actorId);
      const graph = isThenable(graphResult) ? await graphResult : graphResult;
      const queuePayload = payload({ actorId, graph, now: capturedNow, provider, language });
      const suggestion = queuePayload.suggestions.find(candidate => candidate.id === id);
      if (!suggestion) return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND", {
        evidenceIds: [`evidence:profile-signal-suggestion-not-found:${id}`], now: capturedNow, provider,
      });
      const mutationId = decisionMutationId(id, "dismissed", options.mutationId);
      const existing = graph.suggestionDecisions?.find(decision => decision.suggestionId === id);
      if (existing) {
        if (existing.status === "dismissed" && existing.mutationId === mutationId) {
          return dismissedSuggestion({ suggestion, dismissedAt: existing.decidedAt, mutationId, language });
        }
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
          evidenceIds: [`evidence:profile-signal-suggestion-already-resolved:${id}`], now: capturedNow, provider,
        });
      }
      const savedDecision = await provider.saveSuggestionDecision({
        actorId, suggestionId: id, status: "dismissed", mutationId, decidedAt: capturedNow,
      }, actorId);
      if (savedDecision.status !== "dismissed" || savedDecision.mutationId !== mutationId) {
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED", {
          evidenceIds: [`evidence:profile-signal-suggestion-already-resolved:${id}`], now: capturedNow, provider,
        });
      }
      return dismissedSuggestion({ suggestion, dismissedAt: savedDecision.decidedAt, mutationId, language });
    },
  };
}
