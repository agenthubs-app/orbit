/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteScenario,
  type AppProfileRouteStateViewModel,
  type AppProfileSearchParams,
} from "./profile-route-view-model";

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

export interface AppProfileCommandCenterProps {
  searchParams?: AppProfileSearchParams;
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
  scenario: AppProfileRouteScenario;
}) {
  const routeStateUrl = `/app/profile?scenario=${scenario}`;

  return (
    <div data-route-state-url={routeStateUrl}>
      {children}
    </div>
  );
}

function RouteStateBoundary({
  routeState,
}: {
  routeState: AppProfileRouteStateViewModel;
}) {
  return (
    <RouteStateMarker scenario={routeState.scenario}>
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={Array.from(routeState.recoveryActions)}
        title={routeState.copy.title}
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
  const viewModel = loadAppProfileRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <div className="app-profile-route">
        <style>{appProfileStyles}</style>
        <RouteStateBoundary routeState={viewModel.routeState} />
      </div>
    );
  }

  if (viewModel.state === "failure") {
    return (
      <StateView
        description={viewModel.failure.description}
        emptyState={viewModel.failure.emptyState}
        evidence={Array.from(viewModel.failure.evidenceIds)}
        eyebrow={viewModel.failure.eyebrow}
        guardrail={viewModel.failure.guardrail}
        nextStep={viewModel.failure.nextStep}
        purpose={viewModel.failure.purpose}
        title={viewModel.failure.title}
      />
    );
  }

  const data = viewModel.profile;
  const profile = data.profile;
  const resumeDraft = data.resumeDraft.ready ? data.resumeDraft : null;
  const firstSuggestion = data.firstSuggestion;

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
            completenessScore={data.completenessScore}
            displayName={profile.displayName}
            documentSummary={data.documentSummary}
            suggestionCount={data.suggestionCount}
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
                {data.nextProfileFieldLabel}
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
                {data.action.preferredChannels}
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
                  defaultChecked={data.introChoices[0]?.checked}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value={data.introChoices[0]?.value}
                />
                {data.introChoices[0]?.label}
              </label>
              <label>
                <input
                  defaultChecked={data.introChoices[1]?.checked}
                  name="preferredIntroChannels"
                  type="checkbox"
                  value={data.introChoices[1]?.value}
                />
                {data.introChoices[1]?.label}
              </label>
            </div>
            <input name="action" type="hidden" value="complete-profile-field" />
            <button type="submit">
              {bilingualText("确认介绍偏好", "Confirm intro preference")}
            </button>
          </form>
          {data.action.requested && (
            <div
              aria-label="App profile local action result"
              className="app-profile-action-result"
              data-action-evidence="complete-profile-field-local-preview"
              data-task-result="preferred-intro-channels-preview"
              data-side-effects="none"
            >
              <strong>
                {bilingualText(
                  `准备确认：${profile.displayName} 偏好${data.action.preferredChannelsChineseSentence}`,
                  `Ready for confirmation: ${profile.displayName} prefers ${data.action.preferredChannelsSentence}`,
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
              <span>{data.action.preferredChannels}</span>
              <details aria-label="App profile action source details">
                <summary>{bilingualText("来源详情", "Source details")}</summary>
                <span>
                  {bilingualText("来源证据", "Source evidence")}:{" "}
                  {data.action.actionSourceEvidence}
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
            evidenceIds={data.profileEvidenceIds}
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
                <dd>{resumeDraft.evidenceExcerpt}</dd>
              </div>
            </dl>
            <EvidenceChips
              evidenceIds={data.resumeDraft.evidenceIds}
              label="App profile document evidence"
            />
          </>
        ) : (
          <p className="type-body">{data.resumeDraft.nextAction}</p>
        )}
      </WorkbenchSurface>

      <WorkbenchSurface
        eyebrow={bilingualText("建议的资料修改", "Suggested profile change")}
        title={bilingualText(
          "复核有来源的资料修改",
          "Review sourced profile change",
        )}
      >
        <p className="type-body">{data.reviewSummary}</p>
        {firstSuggestion && (
          <dl className="relationship-meta">
            <div>
              <dt>{bilingualText("待确认字段", "Field to confirm")}</dt>
              <dd>{firstSuggestion.fieldLabel}</dd>
            </div>
            <div>
              <dt>{bilingualText("待确认值", "Value to confirm")}</dt>
              <dd>{firstSuggestion.suggestedValue}</dd>
            </div>
            <div>
              <dt>{bilingualText("来源摘录", "Source excerpt")}</dt>
              <dd>{firstSuggestion.evidenceExcerpt}</dd>
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
