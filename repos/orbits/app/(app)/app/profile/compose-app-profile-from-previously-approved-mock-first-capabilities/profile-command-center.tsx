/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { createProfileDocumentExtractionService } from "../../../../../features/profile/service-factory";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { createProfileSignalReviewQueueService } from "../../../../../features/profile/service-factory";
import type { ProfileCompletenessField } from "../../../../../features/profile/contract";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";

const appProfileStyles = `
.app-profile-route {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-profile-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-profile-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-profile-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-profile-route,
.app-profile-route .workbench-surface,
.app-profile-route .relationship-meta,
.app-profile-route .chip-row,
.app-profile-route .app-profile-ledger,
.app-profile-route .app-profile-columns,
.app-profile-route .app-profile-readiness-split {
  min-width: 0;
}

.app-profile-route .app-profile-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-profile-route .app-profile-ledger,
.app-profile-route .app-profile-columns,
.app-profile-route .app-profile-readiness-split {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-profile-route .app-profile-ledger div,
.app-profile-route .app-profile-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-profile-route .app-profile-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-profile-route .app-profile-readiness-split {
  border-block: 1px solid var(--orbit-color-border);
  padding-block: var(--orbit-space-sm);
}

.app-profile-route .app-profile-readiness-split article {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.app-profile-route .app-profile-readiness-split h3,
.app-profile-route .app-profile-readiness-split p {
  margin: 0;
}

.app-profile-route .app-profile-readiness-split h3 {
  font-size: 0.95rem;
  line-height: 1.25;
}

.app-profile-route .app-profile-action-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
}

.app-profile-route .app-profile-action-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

.app-profile-route .app-profile-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: 6px;
}

.app-profile-route .app-profile-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-profile-route .app-profile-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  padding: 6px 10px;
  text-decoration: none;
}

.app-profile-route .app-profile-task {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-sm);
}

.app-profile-route .app-profile-task-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-profile-route .app-profile-task-options label {
  align-items: center;
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  gap: 6px;
  padding: 6px 10px;
}
`;

const capabilityLabels = [
  bilingualText("个人资料基础", "profile basics"),
  bilingualText("介绍偏好", "intro preferences"),
  bilingualText("资料草稿", "profile draft"),
  bilingualText("建议修改", "suggested changes"),
] as const;

const routeStateChecks = [
  {
    href: "/app/profile?scenario=empty",
    label: bilingualText("检查设置缺口", "Review setup gap"),
  },
  {
    href: "/app/profile?scenario=pending",
    label: bilingualText("检查暂缓的资料来源", "Review held profile sources"),
  },
  {
    href: "/app/profile?scenario=failure",
    label: bilingualText("检查资料来源恢复", "Review profile source recovery"),
  },
] as const;

const suggestedIntroChannels = ["warm intro", "event follow-up"] as const;

type AppProfileSearchParams = Record<string, string | string[] | undefined>;
type RouteScenario = "empty" | "pending" | "failure";
type EvidenceResult =
  | {
      success: true;
      data: {
        provenance: {
          evidenceIds: readonly string[];
        };
      };
    }
  | {
      success: false;
      error: {
        code: string;
      };
    };

export interface AppProfileCommandCenterProps {
  searchParams?: AppProfileSearchParams;
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
): RouteScenario | null {
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
  if ("error" in result) {
    return result.error.code;
  }

  return firstEvidence(result.data.provenance.evidenceIds);
}

function formatList(items: readonly string[] | undefined): string {
  return items?.length ? items.join(", ") : "not selected";
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

function personalizeReviewSummary(summary: string, displayName: string): string {
  return summary.replace("operator review", `${displayName} review`);
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

function formatProfileFieldLabel(
  field: ProfileCompletenessField | string | null,
): string {
  const labels: Record<ProfileCompletenessField, string> = {
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

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <details aria-label={`${label} source details`}>
      <summary>{bilingualText("来源详情", "Source details")}</summary>
      <div aria-label={label} className="chip-row">
        {evidenceIds.slice(0, 5).map((evidenceId) => (
          <Chip key={evidenceId} tone="evidence">
            {evidenceId}
          </Chip>
        ))}
      </div>
    </details>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: RouteScenario;
}) {
  const routeStateUrl = `/app/profile?scenario=${scenario}`;

  return (
    <div data-route-state-url={routeStateUrl}>
      {children}
    </div>
  );
}

function RouteStateBoundary({
  scenario,
}: {
  scenario: RouteScenario;
}) {
  const profileService = createProfileService();
  const extractionService = createProfileDocumentExtractionService();
  const signalService = createProfileSignalReviewQueueService();

  if (scenario === "empty") {
    const emptyProfile = profileService.getProfile({ scenario: "empty" });

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description={bilingualText(
            "还没有足够的来源上下文，无法用个人资料来指导关系工作。",
            "No relationship profile has enough sourced context for profile-informed relationship work.",
          )}
          emptyState={bilingualText(
            "手动资料、文档草稿和复核建议都还没有准备好。",
            "No manual profile, document draft, or review suggestion is ready.",
          )}
          evidence={[evidenceFromResult(emptyProfile)]}
          eyebrow={bilingualText("还没有资料来源", "No profile source yet")}
          guardrail={bilingualText(
            "Orbit 可以提示设置资料，但没有资料上下文时不能创建关系动作。",
            "Orbit can invite profile setup, but it cannot create relationship actions without profile context.",
          )}
          nextStep={bilingualText(
            "来源详情会说明为什么在可复核上下文准备好之前，资料设置保持不变。",
            "Source details explain why profile setup stays unchanged until reviewed context is ready.",
          )}
          purpose={bilingualText(
            "从已复核的来源检查开始设置个人资料。",
            "Start profile setup from reviewed source checks.",
          )}
          recoveryActions={[
            {
              id: "profile-empty-open-setup",
              href: "/app/profile",
              label: bilingualText("打开资料设置", "Open profile setup"),
              recoveryCopy:
                bilingualText(
                  "打开资料设置，添加已复核的个人资料上下文。",
                  "Open profile setup to add reviewed profile context.",
                ),
            },
          ]}
          title={bilingualText("资料准备度为空", "Profile readiness is empty")}
        />
      </RouteStateMarker>
    );
  }

  if (scenario === "pending") {
    const pendingProfile = profileService.getProfile({ scenario: "pending" });
    const pendingExtraction = extractionService.extractBusinessCardDraft({
      scenario: "pending",
    });
    const pendingSuggestions = signalService.listUpdateSuggestions({
      scenario: "pending",
    });
    const evidence = [
      evidenceFromResult(pendingProfile),
      evidenceFromResult(pendingExtraction),
      evidenceFromResult(pendingSuggestions),
    ];

    return (
      <RouteStateMarker scenario={scenario}>
        <StateView
          description={bilingualText(
            "资料编辑、导入的名片草稿和资料修改建议正在等待人工复核。",
            "Manual review is pending for profile edits, an imported business-card draft, and suggested profile changes.",
          )}
          emptyState={bilingualText(
            "手动编辑、名片草稿和建议修改会暂缓，直到资料所有者复核证据。",
            "Manual edits, the business-card draft, and suggested changes are held until the profile owner reviews their evidence.",
          )}
          evidence={evidence}
          eyebrow={bilingualText("正在检查资料来源", "Checking profile sources")}
          guardrail={bilingualText(
            "被暂缓的资料不能更新关系评分、接受建议或触发外部工作。",
            "Held profile material cannot update relationship scoring, accept suggestions, or trigger outside work.",
          )}
          nextStep={bilingualText(
            "来源详情会显示哪些资料来源仍在等待复核。",
            "Source details show which profile sources are still held for review.",
          )}
          purpose={bilingualText(
            "本地资料来源复核状态未完成时，保持资料设置可见。",
            "Keep profile setup visible while local profile-source review states resolve.",
          )}
          recoveryActions={[
            {
              id: "profile-pending-review-sources",
              href: "/app/profile",
              label: bilingualText(
                "检查暂缓的资料来源",
                "Review held profile sources",
              ),
              recoveryCopy:
                bilingualText(
                  "检查暂缓的资料来源，同时手动编辑、名片草稿和建议修改继续保持暂缓。",
                  "Review held profile sources while manual edits, business-card draft, and suggested changes stay held.",
                ),
            },
          ]}
          title={bilingualText("资料准备度正在加载", "Profile readiness is loading")}
        />
      </RouteStateMarker>
    );
  }

  const failureState = signalService.listUpdateSuggestions({
    scenario: "failure",
  });

  return (
    <RouteStateMarker scenario={scenario}>
      <StateView
        description={bilingualText(
          "资料来源复核无法加载，因此建议修改暂不可用。",
          "Suggested profile changes are unavailable because profile-source review could not load.",
        )}
        emptyState={bilingualText(
          "没有接受任何建议修改，没有保存资料记录，也没有联系外部工具。",
          "No suggested profile change was accepted, no profile record was saved, and no outside tool was contacted.",
        )}
        evidence={
          failureState.success === false
            ? [failureState.error.code, firstEvidence(failureState.error.evidenceIds)]
            : ["profile-route-expected-failure-not-returned"]
        }
      eyebrow={bilingualText("需要处理", "Needs attention")}
      guardrail={bilingualText(
        "返回只会读取资料来源复核；不会接受建议，也不会联系外部工具。",
        "Returning only reads the profile source review; it does not accept suggestions or contact any outside tool.",
      )}
      nextStep={bilingualText(
        "来源详情会说明为什么在来源复核可用前，Ari 当前资料保持不变。",
        "Source details explain why Ari's current profile stays unchanged until source review is available.",
      )}
      purpose={bilingualText(
        "展示无副作用的资料来源恢复路径。",
        "Show a profile-source recovery path without side effects.",
      )}
      recoveryActions={[
        {
          id: "profile-failure-return",
          href: "/app/profile",
          label: bilingualText(
            "返回资料来源复核",
            "Return to profile source review",
          ),
          recoveryCopy:
            bilingualText(
              "返回资料来源复核，不接受建议，也不更改 Ari 的个人资料。",
              "Return to profile source review without accepting suggestions or changing Ari's profile.",
            ),
        },
      ]}
      title={bilingualText(
        "资料准备度无法加载",
        "Profile readiness could not load",
      )}
    />
  </RouteStateMarker>
  );
}

function ProfileLedger({
  completenessScore,
  displayName,
  documentSummary,
  suggestionCount,
}: {
  completenessScore: number;
  displayName: string;
  documentSummary: string;
  suggestionCount: number;
}) {
  return (
    <dl
      aria-label="App profile composed capabilities"
      className="relationship-meta app-profile-ledger"
    >
      <div>
        <dt>{bilingualText("资料所有者", "Profile owner")}</dt>
        <dd>{displayName}</dd>
      </div>
      <div>
        <dt>{bilingualText("完整度", "Completeness")}</dt>
        <dd>
          <strong>{completenessScore}%</strong>
          {bilingualText("资料已准备", "profile ready")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("导入资料备注", "Imported profile note")}</dt>
        <dd>{documentSummary}</dd>
      </div>
      <div>
        <dt>{bilingualText("待复核修改", "Changes to review")}</dt>
        <dd>
          {bilingualText(
            `${suggestionCount} 条来源建议`,
            `${suggestionCount} sourced suggestions`,
          )}
        </dd>
      </div>
    </dl>
  );
}

function ProfileReadinessSplit({
  displayName,
  homeMarket,
}: {
  displayName: string;
  homeMarket: string;
}) {
  return (
    <div
      aria-label="Profile readiness decision boundary"
      className="app-profile-readiness-split"
    >
      <article>
        <h3>{bilingualText("现在可指导跟进的内容", "What can guide follow-up now")}</h3>
        <p className="type-body">
          {bilingualText(
            `姓名、标题、${homeMarket} 市场和关系目标都有来源，可用于判断关系动作。`,
            `Name, headline, ${homeMarket} market, and relationship goal are sourced and ready to inform relationship decisions.`,
          )}
        </p>
      </article>
      <article>
        <h3>{bilingualText("确认前会暂缓什么", "What is blocked until confirmation")}</h3>
        <p className="type-body">
          {bilingualText(
            `介绍偏好和建议修改会保持复核状态，直到 ${displayName} 确认。`,
            `Preferred intro channels and suggested profile changes stay in review until ${displayName} confirms them.`,
          )}
        </p>
      </article>
      <article>
        <h3>{bilingualText("外部访问", "Outside access")}</h3>
        <p className="type-body">
          {bilingualText(
            "没有联系外部账号、存储、名片扫描、写作、邮件、日历、提醒或消息工具。",
            "No outside account, storage, card scanning, writing, email, calendar, reminder, or message tool has been contacted.",
          )}
        </p>
      </article>
    </div>
  );
}

export function AppProfileCommandCenter({
  searchParams,
}: AppProfileCommandCenterProps = {}) {
  const profileService = createProfileService();
  const extractionService = createProfileDocumentExtractionService();
  const signalService = createProfileSignalReviewQueueService();
  const requestedScenario = readRouteScenario(searchParams);
  const actionRequested =
    readSearchParam(searchParams, "action") === "complete-profile-field";
  const requestedIntroChannels = readSearchParamList(
    searchParams,
    "preferredIntroChannels",
  );

  if (requestedScenario) {
    return (
      <div className="app-profile-route">
        <style>{appProfileStyles}</style>
        <RouteStateBoundary scenario={requestedScenario} />
      </div>
    );
  }

  const profileState = profileService.getProfile();
  const resumeState = extractionService.extractResumeDraft();
  const suggestionState = signalService.listUpdateSuggestions();

  if (
    profileState.success === false ||
    resumeState.success === false ||
    suggestionState.success === false ||
    !profileState.data.profile
  ) {
    const evidence = [
      evidenceFromResult(profileState),
      evidenceFromResult(resumeState),
      evidenceFromResult(suggestionState),
    ];

    return (
      <StateView
        description={bilingualText(
          "Orbit 无法准备个人资料复核。",
          "Orbit could not prepare the profile review.",
        )}
        emptyState={bilingualText(
          "个人资料、文档草稿或更新建议返回了异常状态。",
          "A profile, document draft, or update suggestion returned an unexpected state.",
        )}
        evidence={evidence}
        eyebrow={bilingualText("个人资料", "Profile")}
        guardrail={bilingualText(
          "资料复核无法准备时，不能运行外部动作。",
          "No outside action can run when profile review cannot be prepared.",
        )}
        nextStep={bilingualText(
          "来源详情会说明为什么这个资料页面保持不变。",
          "Source details explain why this profile screen stays unchanged.",
        )}
        purpose={bilingualText(
          "来源检查不一致时停止资料决策。",
          "Stop profile decisions when source checks are inconsistent.",
        )}
        title={bilingualText(
          "资料准备度无法加载",
          "Profile readiness could not load",
        )}
      />
    );
  }

  const profile = profileState.data.profile;
  const resumeDraft = resumeState.data.draft;
  const firstSuggestion = suggestionState.data.suggestions[0] ?? null;
  const nextProfileField = profileState.data.completeness.nextBestField;
  const nextProfileFieldLabel = formatProfileFieldLabel(nextProfileField);
  const selectedIntroChannels =
    actionRequested && requestedIntroChannels
      ? requestedIntroChannels
      : suggestedIntroChannels;
  const editorPreview = profileService.updateProfile({
    displayName: profile.displayName,
    headline: profile.headline,
    organization: profile.organization,
    role: profile.role,
    homeMarket: profile.homeMarket,
    relationshipGoal: profile.relationshipGoal,
    targetRelationshipTypes: profile.targetRelationshipTypes,
    preferredFollowUpWindow: profile.preferredFollowUpWindow,
    preferredIntroChannels: selectedIntroChannels,
  });
  const editorProfile =
    editorPreview.success && editorPreview.data.profile
      ? editorPreview.data.profile
      : profile;
  const preferredChannels = formatIntroChannelList(editorProfile.preferredIntroChannels);
  const preferredChannelsSentence = formatNaturalList(
    editorProfile.preferredIntroChannels,
  );
  const preferredChannelsChineseSentence = formatNaturalChineseList(
    editorProfile.preferredIntroChannels,
  );
  const reviewSummary = personalizeReviewSummary(
    suggestionState.data.summary,
    profile.displayName,
  );
  const actionSourceEvidence =
    editorPreview.success && editorPreview.data.provenance.evidenceIds[0]
      ? editorPreview.data.provenance.evidenceIds[0]
      : "evidence:profile-editor-put-request";

  return (
    <div className="app-profile-route">
      <style>{appProfileStyles}</style>
      <div data-state-boundary="app-profile-success">
        <WorkbenchSurface
          className="app-profile-command"
          elevated
          eyebrow={bilingualText("个人资料", "Profile")}
          title={bilingualText(
            `${profile.displayName} 个人资料`,
            `${profile.displayName} Profile`,
          )}
        >
          <p className="type-body">
            {bilingualText(
              `${profile.displayName} 的身份、市场和关系目标已经可用于判断；介绍偏好和建议修改仍要等本人确认后再保存。`,
              `Every field below belongs to ${profile.displayName}. Source-backed identity, market, and relationship goals are usable now; preferred intro channels and suggested changes stay blocked until ${profile.displayName} confirms the save.`,
            )}
          </p>
          <ProfileReadinessSplit
            displayName={profile.displayName}
            homeMarket={profile.homeMarket}
          />
          <ProfileLedger
            completenessScore={profileState.data.completeness.score}
            displayName={profile.displayName}
            documentSummary={
              resumeDraft
                ? bilingualText("简历草稿已准备", "Resume draft ready")
                : resumeState.data.nextAction
            }
            suggestionCount={suggestionState.data.suggestions.length}
          />
          <div className="app-profile-columns">
            <article className="relationship-record">
              <header>
                <p className="type-caption">
                  {bilingualText("个人资料基础", "Profile basics")}
                </p>
                <h3 className="relationship-name">{profile.displayName}</h3>
              </header>
              <p className="type-body">{profile.headline}</p>
              <p className="type-body">{profile.relationshipGoal}</p>
              <p className="type-body">
                {bilingualText("下一字段", "Next field")}:{" "}
                {nextProfileFieldLabel}
              </p>
            </article>
            <article className="relationship-record">
              <header>
                <p className="type-caption">
                  {bilingualText("介绍偏好", "Intro preferences")}
                </p>
                <h3 className="relationship-name">
                  {bilingualText("偏好的介绍渠道", "Preferred intro channels")}
                </h3>
              </header>
              <p className="type-body">
                {bilingualText("建议渠道", "Suggested channels")}:{" "}
                {preferredChannels}
              </p>
              <p className="type-body">
                {bilingualText(
                  "复核状态：可以确认",
                  "Review status: ready for confirmation",
                )}
              </p>
            </article>
          </div>
          <form action="/app/profile" className="app-profile-task" method="get">
            <div>
              <p className="type-caption">
                {bilingualText("资料结果", "Profile outcome")}
              </p>
              <h3 className="relationship-name">
                {bilingualText(
                  `确认 ${profile.displayName} 的介绍偏好`,
                  `Confirm ${profile.displayName}'s intro preference`,
                )}
              </h3>
              <p className="type-body">
                {bilingualText(
                  "这些渠道已经可以成为下一个确认的资料字段。保存前先复核精确值和来源上下文。",
                  "These channels are ready to become the next confirmed profile field. Review the exact value and source context before anything is saved.",
                )}
              </p>
            </div>
            <div
              aria-label="Preferred intro channel choices"
              className="app-profile-task-options"
            >
              <label>
                <input
                  defaultChecked={selectedIntroChannels.includes("warm intro")}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value="warm intro"
                />
                {formatIntroChannelLabel("warm intro")}
              </label>
              <label>
                <input
                  defaultChecked={selectedIntroChannels.includes(
                    "event follow-up",
                  )}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value="event follow-up"
                />
                {formatIntroChannelLabel("event follow-up")}
              </label>
            </div>
            <input name="action" type="hidden" value="complete-profile-field" />
            <button type="submit">
              {bilingualText("确认介绍偏好", "Confirm intro preference")}
            </button>
          </form>
          {actionRequested && (
            <div
              aria-label="App profile local action result"
              className="app-profile-action-result"
              data-action-evidence="complete-profile-field-local-preview"
              data-task-result="preferred-intro-channels-preview"
              data-side-effects="none"
            >
              <strong>
                {bilingualText(
                  `准备确认：${profile.displayName} 偏好${preferredChannelsChineseSentence}`,
                  `Ready for confirmation: ${profile.displayName} prefers ${preferredChannelsSentence}`,
                )}
              </strong>
              <span>
                {bilingualText(
                  "复核面板已经准备好进入确认步骤。",
                  "The review panel is prepared for a confirmation step.",
                )}
              </span>
              <span>
                {bilingualText(
                  "保存资料仍需要明确确认。",
                  "Profile save still requires explicit confirmation.",
                )}
              </span>
              <span>{preferredChannels}</span>
              <details aria-label="App profile action source details">
                <summary>{bilingualText("来源详情", "Source details")}</summary>
                <span>
                  {bilingualText("来源证据", "Source evidence")}:{" "}
                  {actionSourceEvidence}
                </span>
              </details>
              <span>
                {bilingualText("已联系外部工具：无", "Outside tools contacted: none")}
              </span>
              <span hidden>Outside services contacted: none</span>
            </div>
          )}
          <div aria-label="App profile readiness checks">
            <h3 className="relationship-name">
              {bilingualText("资料准备度检查", "Profile readiness checks")}
            </h3>
            <p className="type-body">
              {bilingualText(
                "查看来源上下文缺失、等待复核或不可用时，Orbit 如何阻止资料动作。",
                "Review how Orbit blocks profile actions when source context is missing, waiting for review, or unavailable.",
              )}
            </p>
            <nav className="app-profile-state-links">
              {routeStateChecks.map((stateCheck) => (
                <a href={stateCheck.href} key={stateCheck.href}>
                  {stateCheck.label}
                </a>
              ))}
            </nav>
            <p className="privacy-note">
              {bilingualText(
                "这些检查只停留在资料复核内，不联系外部账号、存储、名片扫描、写作、日历、提醒或消息工具。",
                "These checks stay inside profile review and do not contact outside account, storage, card scanning, writing, calendar, reminder, or messaging tools.",
              )}
            </p>
          </div>
          <EvidenceChips
            evidenceIds={profileState.data.provenance.evidenceIds}
            label="App profile evidence"
          />
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface
        eyebrow={bilingualText("导入的资料草稿", "Imported profile draft")}
        title={bilingualText("简历草稿已准备", "Resume draft ready")}
      >
        {resumeDraft ? (
          <>
            <p className="type-body">
              {bilingualText(
                "可信度高，因为资料文本包含姓名、角色、市场和关系目标。",
                "High confidence because the profile text includes a name, role, market, and relationship goal.",
              )}
            </p>
            <dl className="relationship-meta">
              <div>
                <dt>{bilingualText("来源中的姓名", "Name found in source")}</dt>
                <dd>{resumeDraft.displayName}</dd>
              </div>
              <div>
                <dt>{bilingualText("草稿标题", "Draft headline")}</dt>
                <dd>{resumeDraft.headline}</dd>
              </div>
              <div>
                <dt>{bilingualText("证据摘录", "Evidence excerpt")}</dt>
                <dd>
                  {resumeDraft.evidence[0]?.excerpt ??
                    bilingualText("没有加载摘录。", "No excerpt loaded.")}
                </dd>
              </div>
            </dl>
            <EvidenceChips
              evidenceIds={resumeState.data.provenance.evidenceIds}
              label="App profile document evidence"
            />
          </>
        ) : (
          <p className="type-body">{resumeState.data.nextAction}</p>
        )}
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("建议的资料修改", "Suggested profile change")}
        title={bilingualText(
          "复核有来源的资料修改",
          "Review sourced profile change",
        )}
      >
        <p className="type-body">{reviewSummary}</p>
        {firstSuggestion && (
          <dl className="relationship-meta">
            <div>
              <dt>{bilingualText("待确认字段", "Field to confirm")}</dt>
              <dd>{formatProfileFieldLabel(firstSuggestion.targetProfileField)}</dd>
            </div>
            <div>
              <dt>{bilingualText("待确认值", "Value to confirm")}</dt>
              <dd>{firstSuggestion.suggestedValue}</dd>
            </div>
            <div>
              <dt>{bilingualText("来源摘录", "Source excerpt")}</dt>
              <dd>{firstSuggestion.evidence[0]?.excerpt}</dd>
            </div>
          </dl>
        )}
        <p className="privacy-note">
          {bilingualText(
            "这些建议修改会保持复核状态，直到当前资料缺口补齐，并由资料所有者明确确认保存。",
            "These suggested changes stay in review until the current profile gap is completed and the profile owner explicitly confirms a save.",
          )}
        </p>
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("资料来源", "Profile sources")}
        title={bilingualText(
          "资料细节来自哪里",
          "Where profile details came from",
        )}
      >
        <p className="type-body">
          {bilingualText(
            "这里显示的每个资料细节，都要能追溯到入门设置、手动编辑、导入草稿或建议修改，之后才会影响关系推荐。",
            "Each profile detail shown here traces to onboarding, manual editing, imported drafts, or a suggested change before it can influence a relationship recommendation.",
          )}
        </p>
        <div aria-label="App profile capability labels" className="chip-row">
          {capabilityLabels.map((label) => (
            <Chip key={label} tone="primary">
              {label}
            </Chip>
          ))}
        </div>
        <p className="privacy-note">
          {bilingualText(
            "来源复核确认这个预览不会连接外部账号、存储、名片扫描、写作、提醒、邮件、日历或外部消息工具。",
            "Source review confirms this preview does not connect outside account, storage, card scanning, writing, reminders, email, calendar, or external messaging tools.",
          )}
        </p>
      </WorkbenchSurface>
    </div>
  );
}
