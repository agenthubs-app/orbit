import type {
  ManualProfile,
  ProfileCompletenessField,
  ProfileResult,
} from "../../../../../features/profile/contract";
import type { ProfileDocumentExtractionResult } from "../../../../../features/profile/extraction-contract";
import {
  createProfileDocumentExtractionService,
  createProfileService,
  createProfileSignalReviewQueueService,
} from "../../../../../features/profile/service-factory";
import type {
  ProfileSignalProfileField,
  ProfileSignalReviewQueueResult,
} from "../../../../../features/profile/signal-contract";
import { createAppProfileRouteServices } from "./profile-service-factory";

export type AppProfileSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppProfileRouteScenario = "empty" | "pending" | "failure";

type EvidenceResult =
  | ProfileResult
  | ProfileDocumentExtractionResult
  | ProfileSignalReviewQueueResult;

interface RouteFailure {
  code: string;
  evidenceIds: readonly string[];
  message: string;
  recovery: string;
}

export interface AppProfileRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly {
    id: string;
    href: string;
    label: string;
    recoveryCopy: string;
  }[];
  scenario: AppProfileRouteScenario;
}

export interface AppProfileDraftViewModel {
  displayName: string;
  evidenceExcerpt: string;
  evidenceIds: readonly string[];
  headline: string;
  nextAction: string;
  ready: boolean;
}

export interface AppProfileSuggestionViewModel {
  evidenceExcerpt: string | null;
  fieldLabel: string;
  suggestedValue: string;
}

export interface AppProfileActionViewModel {
  actionSourceEvidence: string;
  preferredChannels: string;
  preferredChannelsChineseSentence: string;
  preferredChannelsSentence: string;
  requested: boolean;
}

export interface AppProfileIntroChoiceViewModel {
  checked: boolean;
  label: string;
  value: string;
}

export interface AppProfileSuccessViewModel {
  action: AppProfileActionViewModel;
  completenessScore: number;
  documentSummary: string;
  introChoices: readonly AppProfileIntroChoiceViewModel[];
  nextProfileFieldLabel: string;
  profile: Pick<
    ManualProfile,
    | "displayName"
    | "headline"
    | "homeMarket"
    | "organization"
    | "preferredIntroChannels"
    | "relationshipGoal"
    | "role"
    | "targetRelationshipTypes"
  >;
  profileEvidenceIds: readonly string[];
  resumeDraft: AppProfileDraftViewModel;
  reviewSummary: string;
  suggestionCount: number;
  firstSuggestion: AppProfileSuggestionViewModel | null;
}

export type AppProfileRouteViewModel =
  | {
      state: "success";
      profile: AppProfileSuccessViewModel;
    }
  | {
      state: "route-state";
      routeState: AppProfileRouteStateViewModel;
    }
  | {
      state: "failure";
      failure: AppProfileRouteStateViewModel["copy"] & {
        evidenceIds: readonly string[];
      };
    };

function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

function readSearchParam(
  searchParams: AppProfileSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readSearchParamList(
  searchParams: AppProfileSearchParams | undefined,
  key: string,
): readonly string[] | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    const values = value.map((item) => item.trim()).filter(Boolean);

    return values.length ? Array.from(new Set(values)) : null;
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return null;
}

function readRouteScenario(
  searchParams: AppProfileSearchParams | undefined,
): AppProfileRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function evidenceFromResult(result: EvidenceResult): string {
  if (result.success === false) {
    return result.error.code;
  }

  return firstEvidence(result.data.provenance.evidenceIds);
}

function routeFailureFromResult(result: EvidenceResult): RouteFailure | null {
  if (result.success === false) {
    return {
      code: result.error.code,
      evidenceIds: result.error.evidenceIds,
      message: result.error.message,
      recovery: result.error.recovery,
    };
  }

  return null;
}

function firstRouteFailure(
  results: readonly EvidenceResult[],
): RouteFailure | null {
  for (const result of results) {
    const failure = routeFailureFromResult(result);

    if (failure) {
      return failure;
    }
  }

  return null;
}

function profileFieldLabel(
  field: ProfileCompletenessField | ProfileSignalProfileField | string | null,
): string {
  const labels: Partial<Record<ProfileSignalProfileField, string>> &
    Record<ProfileCompletenessField, string> = {
    displayName: bilingualText("显示名称", "display name"),
    headline: bilingualText("标题", "headline"),
    homeMarket: bilingualText("所在市场", "home market"),
    preferredIntroChannels: bilingualText("介绍偏好", "preferred intro channels"),
    relationshipGoal: bilingualText("关系目标", "relationship goal"),
    targetRelationshipTypes: bilingualText(
      "目标关系类型",
      "target relationship types",
    ),
  };

  return field && field in labels
    ? labels[field as ProfileCompletenessField]
    : bilingualText("个人资料细节", "profile details");
}

function formatNaturalList(items: readonly string[] | undefined): string {
  if (!items?.length) {
    return "not selected";
  }

  if (items.length === 1) {
    return items[0] ?? "not selected";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatIntroChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    "event follow-up": bilingualText("活动后跟进", "event follow-up"),
    "warm intro": bilingualText("暖介绍", "warm intro"),
  };

  return labels[channel] ?? channel;
}

function formatIntroChannelList(items: readonly string[] | undefined): string {
  return items?.length
    ? items.map(formatIntroChannelLabel).join(", ")
    : bilingualText("未选择", "not selected");
}

function formatNaturalChineseList(items: readonly string[] | undefined): string {
  const labels =
    items?.map((item) => formatIntroChannelLabel(item).split(" / ")[0] ?? item) ??
    [];

  if (!labels.length) {
    return "未选择";
  }

  if (labels.length === 1) {
    return labels[0] ?? "未选择";
  }

  return labels.join("和");
}

function personalizeReviewSummary(summary: string, displayName: string): string {
  return summary.replace("operator review", `${displayName} review`);
}

function displayValue(value: string | readonly string[]): string {
  return typeof value === "string" ? value : value.join(", ");
}

async function routeStateViewModel(
  scenario: AppProfileRouteScenario,
  failure?: RouteFailure,
): Promise<AppProfileRouteStateViewModel> {
  const profileService = createProfileService("mock");
  const extractionService = createProfileDocumentExtractionService("mock");
  const signalService = createProfileSignalReviewQueueService("mock");

  if (scenario === "empty") {
    const emptyProfile = await profileService.getProfile({ scenario: "empty" });

    return {
      copy: {
        description: bilingualText(
          "还没有足够的来源上下文，无法用个人资料来指导关系工作。",
          "No relationship profile has enough sourced context for profile-informed relationship work.",
        ),
        emptyState: bilingualText(
          "手动资料、文档草稿和复核建议都还没有准备好。",
          "No manual profile, document draft, or review suggestion is ready.",
        ),
        eyebrow: bilingualText("还没有资料来源", "No profile source yet"),
        guardrail: bilingualText(
          "Orbit 可以提示设置资料，但没有资料上下文时不能创建关系动作。",
          "Orbit can invite profile setup, but it cannot create relationship actions without profile context.",
        ),
        nextStep: bilingualText(
          "来源详情会说明为什么在可复核上下文准备好之前，资料设置保持不变。",
          "Source details explain why profile setup stays unchanged until reviewed context is ready.",
        ),
        purpose: bilingualText(
          "从已复核的来源检查开始设置个人资料。",
          "Start profile setup from reviewed source checks.",
        ),
        title: bilingualText("资料准备度为空", "Profile readiness is empty"),
      },
      errorCode: null,
      evidenceIds: [evidenceFromResult(emptyProfile)],
      recoveryActions: [
        {
          id: "profile-empty-open-setup",
          href: "/app/profile",
          label: bilingualText("打开资料设置", "Open profile setup"),
          recoveryCopy: bilingualText(
            "打开资料设置，添加已复核的个人资料上下文。",
            "Open profile setup to add reviewed profile context.",
          ),
        },
      ],
      scenario,
    };
  }

  if (scenario === "pending") {
    const pendingProfile = await profileService.getProfile({ scenario: "pending" });
    const pendingExtraction = extractionService.extractBusinessCardDraft({
      scenario: "pending",
    });
    const pendingSuggestions = await signalService.listUpdateSuggestions({
      scenario: "pending",
    });

    return {
      copy: {
        description: bilingualText(
          "资料编辑、导入的名片草稿和资料修改建议正在等待人工复核。",
          "Manual review is pending for profile edits, an imported business-card draft, and suggested profile changes.",
        ),
        emptyState: bilingualText(
          "手动编辑、名片草稿和建议修改会暂缓，直到资料所有者复核证据。",
          "Manual edits, the business-card draft, and suggested changes are held until the profile owner reviews their evidence.",
        ),
        eyebrow: bilingualText("正在检查资料来源", "Checking profile sources"),
        guardrail: bilingualText(
          "被暂缓的资料不能更新关系评分、接受建议或触发外部工作。",
          "Held profile material cannot update relationship scoring, accept suggestions, or trigger outside work.",
        ),
        nextStep: bilingualText(
          "来源详情会显示哪些资料来源仍在等待复核。",
          "Source details show which profile sources are still held for review.",
        ),
        purpose: bilingualText(
          "本地资料来源复核状态未完成时，保持资料设置可见。",
          "Keep profile setup visible while local profile-source review states resolve.",
        ),
        title: bilingualText("资料准备度正在加载", "Profile readiness is loading"),
      },
      errorCode: null,
      evidenceIds: [
        evidenceFromResult(pendingProfile),
        evidenceFromResult(pendingExtraction),
        evidenceFromResult(pendingSuggestions),
      ],
      recoveryActions: [
        {
          id: "profile-pending-review-sources",
          href: "/app/profile",
          label: bilingualText(
            "检查暂缓的资料来源",
            "Review held profile sources",
          ),
          recoveryCopy: bilingualText(
            "检查暂缓的资料来源，同时手动编辑、名片草稿和建议修改继续保持暂缓。",
            "Review held profile sources while manual edits, business-card draft, and suggested changes stay held.",
          ),
        },
      ],
      scenario,
    };
  }

  const failureState =
    failure ??
    routeFailureFromResult(
      await signalService.listUpdateSuggestions({
        scenario: "failure",
      }),
    );

  return {
    copy: {
      description: bilingualText(
        "资料来源复核无法加载，因此建议修改暂不可用。",
        "Suggested profile changes are unavailable because profile-source review could not load.",
      ),
      emptyState: bilingualText(
        "没有接受任何建议修改，没有保存资料记录，也没有联系外部工具。",
        "No suggested profile change was accepted, no profile record was saved, and no outside tool was contacted.",
      ),
      eyebrow: bilingualText("需要处理", "Needs attention"),
      guardrail: bilingualText(
        "返回只会读取资料来源复核；不会接受建议，也不会联系外部工具。",
        "Returning only reads the profile source review; it does not accept suggestions or contact any outside tool.",
      ),
      nextStep: bilingualText(
        "来源详情会说明为什么在来源复核可用前，Ari 当前资料保持不变。",
        "Source details explain why Ari's current profile stays unchanged until source review is available.",
      ),
      purpose: bilingualText(
        "展示无副作用的资料来源恢复路径。",
        "Show a profile-source recovery path without side effects.",
      ),
      title: bilingualText(
        "资料准备度无法加载",
        "Profile readiness could not load",
      ),
    },
    errorCode: failureState?.code ?? "PROFILE_ROUTE_FAILURE",
    evidenceIds: failureState
      ? [failureState.code, firstEvidence(failureState.evidenceIds)]
      : ["profile-route-expected-failure-not-returned"],
    recoveryActions: [
      {
        id: "profile-failure-return",
        href: "/app/profile",
        label: bilingualText(
          "返回资料来源复核",
          "Return to profile source review",
        ),
        recoveryCopy: bilingualText(
          "返回资料来源复核，不接受建议，也不更改 Ari 的个人资料。",
          "Return to profile source review without accepting suggestions or changing Ari's profile.",
        ),
      },
    ],
    scenario,
  };
}

const suggestedIntroChannels = ["warm intro", "event follow-up"] as const;

function successViewModel(input: {
  actionRequested: boolean;
  profileState: Extract<ProfileResult, { success: true }>;
  requestedIntroChannels: readonly string[] | null;
  resumeState: Extract<ProfileDocumentExtractionResult, { success: true }>;
  suggestionState: Extract<ProfileSignalReviewQueueResult, { success: true }>;
}): AppProfileSuccessViewModel {
  const profile = input.profileState.data.profile;

  if (!profile) {
    throw new Error("profile success state requires a profile payload");
  }

  const resumeDraft = input.resumeState.data.draft;
  const selectedIntroChannels =
    input.actionRequested && input.requestedIntroChannels
      ? input.requestedIntroChannels
      : suggestedIntroChannels;
  const editorProfile: ManualProfile = {
    ...profile,
    preferredIntroChannels: selectedIntroChannels,
  };

  return {
    action: {
      actionSourceEvidence:
        input.actionRequested
          ? "evidence:profile-editor-preview"
          : firstEvidence(input.profileState.data.provenance.evidenceIds),
      preferredChannels: formatIntroChannelList(
        editorProfile.preferredIntroChannels,
      ),
      preferredChannelsChineseSentence: formatNaturalChineseList(
        editorProfile.preferredIntroChannels,
      ),
      preferredChannelsSentence: formatNaturalList(
        editorProfile.preferredIntroChannels,
      ),
      requested: input.actionRequested,
    },
    completenessScore: input.profileState.data.completeness.score,
    documentSummary: resumeDraft
      ? bilingualText("简历草稿已准备", "Resume draft ready")
      : input.resumeState.data.nextAction,
    firstSuggestion: input.suggestionState.data.suggestions[0]
      ? {
          evidenceExcerpt:
            input.suggestionState.data.suggestions[0].evidence[0]?.excerpt ??
            null,
          fieldLabel: profileFieldLabel(
            input.suggestionState.data.suggestions[0].targetProfileField,
          ),
          suggestedValue: displayValue(
            input.suggestionState.data.suggestions[0].suggestedValue,
          ),
        }
      : null,
    introChoices: [
      {
        checked: selectedIntroChannels.includes("warm intro"),
        label: formatIntroChannelLabel("warm intro"),
        value: "warm intro",
      },
      {
        checked: selectedIntroChannels.includes("event follow-up"),
        label: formatIntroChannelLabel("event follow-up"),
        value: "event follow-up",
      },
    ],
    nextProfileFieldLabel: profileFieldLabel(
      input.profileState.data.completeness.nextBestField,
    ),
    profile: {
      displayName: profile.displayName,
      headline: profile.headline,
      homeMarket: profile.homeMarket,
      organization: profile.organization,
      preferredIntroChannels: profile.preferredIntroChannels,
      relationshipGoal: profile.relationshipGoal,
      role: profile.role,
      targetRelationshipTypes: profile.targetRelationshipTypes,
    },
    profileEvidenceIds: input.profileState.data.provenance.evidenceIds,
    resumeDraft: {
      displayName: resumeDraft?.displayName ?? "",
      evidenceExcerpt:
        resumeDraft?.evidence[0]?.excerpt ??
        bilingualText("没有加载摘录。", "No excerpt loaded."),
      evidenceIds: input.resumeState.data.provenance.evidenceIds,
      headline: resumeDraft?.headline ?? "",
      nextAction: input.resumeState.data.nextAction,
      ready: Boolean(resumeDraft),
    },
    reviewSummary: personalizeReviewSummary(
      input.suggestionState.data.summary,
      profile.displayName,
    ),
    suggestionCount: input.suggestionState.data.suggestions.length,
  };
}

export async function loadAppProfileRouteViewModel(
  searchParams?: AppProfileSearchParams,
): Promise<AppProfileRouteViewModel> {
  const requestedScenario = readRouteScenario(searchParams);

  if (requestedScenario) {
    return {
      state: "route-state",
      routeState: await routeStateViewModel(requestedScenario),
    };
  }

  const services = createAppProfileRouteServices();
  const [profileState, resumeState, suggestionState] = await Promise.all([
    services.profileService.getProfile(),
    services.extractionService.extractResumeDraft(),
    services.signalService.listUpdateSuggestions(),
  ]);
  const serviceFailure = firstRouteFailure([
    profileState,
    resumeState,
    suggestionState,
  ]);

  if (
    serviceFailure ||
    profileState.success === false ||
    resumeState.success === false ||
    suggestionState.success === false
  ) {
    return {
      state: "route-state",
      routeState: await routeStateViewModel(
        "failure",
        serviceFailure ?? {
          code: "PROFILE_ROUTE_FAILURE",
          evidenceIds: ["evidence:profile-route-unexpected-failure"],
          message: "A profile page service returned an unexpected failure.",
          recovery: "Reload the profile page after the service is available.",
        },
      ),
    };
  }

  if (!profileState.data.profile) {
    return {
      state: "route-state",
      routeState: await routeStateViewModel("failure", {
        code: "PROFILE_REQUIRED",
        evidenceIds: profileState.data.provenance.evidenceIds,
        message: "No profile payload was available for the profile page.",
        recovery: "Load a profile record before rendering the profile success state.",
      }),
    };
  }

  return {
    state: "success",
    profile: successViewModel({
      actionRequested:
        readSearchParam(searchParams, "action") === "complete-profile-field",
      profileState,
      requestedIntroChannels: readSearchParamList(
        searchParams,
        "preferredIntroChannels",
      ),
      resumeState,
      suggestionState,
    }),
  };
}
