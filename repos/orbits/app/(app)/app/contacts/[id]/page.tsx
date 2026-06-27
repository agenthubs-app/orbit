/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import {
  loadAppContactDetailRoute,
  type AppContactDetailBoundaryModel,
  type AppContactDetailSuccessModel,
} from "../compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";

export const metadata = {
  title: "Kenji Watanabe | Orbit",
  description: bilingualText(
    "复核有来源支撑的联系人详情、关系证据、价值评分和本地下一步预览。",
    "Review a source-backed contact detail route with connection evidence, value scoring, and a local next-action preview.",
  ),
};

type AppContactDetailSearchParams = Record<string, string | string[] | undefined>;

interface ContactDetailPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<AppContactDetailSearchParams>;
}

const routeStyles = `
.app-contact-detail-route {
  display: grid;
  gap: var(--orbit-space-md);
  min-width: 0;
}

.orbit-app-shell:has(.app-contact-detail-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-contact-detail-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-contact-detail-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-contact-detail-hero,
.app-contact-detail-hero-grid,
.app-contact-detail-grid,
.app-contact-detail-metrics,
.app-contact-detail-ledger,
.app-contact-detail-action-grid,
.app-contact-detail-timeline,
.app-contact-detail-tags,
.app-contact-detail-source-grid,
.app-contact-detail-route .chip-row {
  min-width: 0;
}

.app-contact-detail-hero {
  background:
    linear-gradient(90deg, rgba(109, 74, 255, 0.1), rgba(79, 66, 198, 0.04)),
    var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-left: 5px solid var(--orbit-color-evidence);
  border-radius: var(--orbit-radius-card);
  box-shadow: var(--orbit-shadow-card);
  display: grid;
  gap: var(--orbit-space-md);
  padding: var(--orbit-space-lg);
}

.app-contact-detail-title {
  display: grid;
  gap: 8px;
}

.app-contact-detail-title h1 {
  font-family: var(--orbit-font-display);
  font-size: clamp(2rem, 7vw, 3rem);
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.app-contact-detail-title p {
  color: var(--orbit-color-muted);
  font-size: 1rem;
  line-height: 1.55;
  margin: 0;
  max-width: 760px;
}

.app-contact-detail-hero-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
}

.app-contact-detail-story {
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: grid;
  gap: 4px;
  padding: var(--orbit-space-sm);
}

.app-contact-detail-story span {
  color: var(--orbit-color-primary-strong);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.app-contact-detail-story p {
  color: var(--orbit-color-text);
  font-size: 0.94rem;
  line-height: 1.5;
  margin: 0;
}

.app-contact-detail-grid,
.app-contact-detail-action-grid {
  display: grid;
  gap: var(--orbit-space-md);
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
}

.app-contact-detail-metrics,
.app-contact-detail-ledger,
.app-contact-detail-source-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 168px), 1fr));
}

.app-contact-detail-metric,
.app-contact-detail-ledger div,
.app-contact-detail-source-card,
.app-contact-detail-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contact-detail-metric strong {
  display: block;
  font-family: var(--orbit-font-display);
  font-size: 1.5rem;
  line-height: 1;
}

.app-contact-detail-metric span,
.app-contact-detail-ledger dt,
.app-contact-detail-source-card span,
.app-contact-detail-timeline time {
  color: var(--orbit-color-primary-strong);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.35;
  text-transform: uppercase;
}

.app-contact-detail-ledger div {
  display: grid;
  gap: 4px;
}

.app-contact-detail-ledger dd {
  color: var(--orbit-color-muted);
  line-height: 1.45;
  margin: 0;
}

.app-contact-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contact-detail-timeline {
  display: grid;
  gap: var(--orbit-space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-contact-detail-timeline li {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: 4px;
  padding: 2px 0 2px var(--orbit-space-sm);
}

.app-contact-detail-timeline h3,
.app-contact-detail-source-card strong,
.app-contact-detail-action-result strong {
  font-size: 0.98rem;
  line-height: 1.35;
  margin: 0;
}

.app-contact-detail-timeline p,
.app-contact-detail-source-card p,
.app-contact-detail-action-result p {
  color: var(--orbit-color-muted);
  font-size: 0.92rem;
  line-height: 1.5;
  margin: 0;
}

.app-contact-detail-action-link,
.app-contact-detail-recovery-actions a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  display: inline-flex;
  font-weight: 700;
  line-height: 1.3;
  padding: 8px 10px;
  text-decoration: none;
}

.app-contact-detail-action-link {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  width: fit-content;
}

.app-contact-detail-technical-details {
  border-top: 1px solid var(--orbit-color-border);
  display: grid;
  gap: var(--orbit-space-sm);
  padding-top: var(--orbit-space-sm);
}

.app-contact-detail-technical-details summary {
  color: var(--orbit-color-muted);
  cursor: pointer;
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.app-contact-detail-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contact-detail-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contact-detail-draft-form,
.app-contact-detail-draft-form fieldset,
.app-contact-detail-draft-form label {
  display: grid;
  gap: var(--orbit-space-xs);
}

.app-contact-detail-draft-form fieldset {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  margin: 0;
  padding: var(--orbit-space-sm);
}

.app-contact-detail-draft-form legend {
  color: var(--orbit-color-primary-strong);
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.app-contact-detail-draft-form label {
  align-items: start;
  color: var(--orbit-color-muted);
  grid-template-columns: auto minmax(0, 1fr);
  line-height: 1.35;
}

.app-contact-detail-draft-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
  width: fit-content;
}

.app-contact-detail-route-state {
  display: grid;
  gap: var(--orbit-space-sm);
}

@media (max-width: 820px) {
  .app-contact-detail-grid,
  .app-contact-detail-action-grid {
    grid-template-columns: 1fr;
  }
}
`;

const contactDetailActionSafetySummary =
  bilingualText(
    "已联系外部账号：无 / 联系人记录已更改：否 / 消息已发送：否 / 通知已发送：否 / 搜索索引已读取：否 / 数据库查询已执行：否",
    "OUTSIDE ACCOUNTS CONTACTED: none / CONTACT RECORD CHANGED: no / MESSAGE SENT: no / NOTIFICATION SENT: no / SEARCH INDEX READ: no / DATABASE QUERY EXECUTED: no",
  );

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function readSearchParam(
  searchParams: AppContactDetailSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatDate(value: string): string {
  const chineseDate = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
  const englishDate = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));

  return bilingualText(chineseDate, englishDate);
}

function yesNo(value: boolean): string {
  return value ? bilingualText("是", "yes") : bilingualText("否", "no");
}

function titleizeToken(value: string): string {
  const words = value.replaceAll("_", " ").split(" ");
  return words
    .map((word, index) =>
      index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(" ");
}

function relationshipStageLabel(value: string): string {
  if (value === "needs_follow_up") {
    return bilingualText("需要跟进", "Needs follow-up");
  }

  return titleizeToken(value);
}

function DataMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="app-contact-detail-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function renderBoundaryState(model: AppContactDetailBoundaryModel) {
  const routeStateUrl = `/app/contacts/demo-contact-1?scenario=${model.routeState}`;

  return (
    <div
      className="app-contact-detail-route app-contact-detail-route-state"
      data-route-state-url={routeStateUrl}
    >
      <style>{routeStyles}</style>
      <StateView
        description={model.description}
        emptyState={model.description}
        evidence={[...model.evidence]}
        eyebrow={bilingualText("联系人详情", "Contact detail")}
        guardrail={bilingualText(
          "此页面会把关系复核保留在本地，直到有人确认跟进动作。",
          "This route keeps relationship review local until a person confirms a follow-up action.",
        )}
        nextStep={model.nextStep}
        purpose={bilingualText(
          "采取下一步前，复核有来源的关系资料。",
          "Review a sourced relationship profile before taking the next action.",
        )}
        title={model.title}
      />
      <nav
        aria-label={bilingualText(
          "联系人详情恢复操作",
          "Contact detail route recovery actions",
        )}
        className="app-contact-detail-recovery-actions"
      >
        {model.recoveryActions.map((action) => (
          <a href={action.href} key={action.href}>
            {action.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function renderActionResult(model: AppContactDetailSuccessModel) {
  if (!model.actionResult) {
    return null;
  }

  const { actionResult } = model;

  return (
    <div
      className="app-contact-detail-action-result"
      data-action-evidence={actionResult.evidenceId}
      data-action-result="contact-detail-follow-up-prepared"
      data-side-effects={actionResult.sideEffectsLabel}
    >
      <strong>
        {bilingualText(
          `跟进已准备：${actionResult.title}`,
          `Follow-up prepared: ${actionResult.title}`,
        )}
      </strong>
      <p>{actionResult.excerpt}</p>
      <p>
        {bilingualText(
          "这份草稿会留在本地，直到你确认它应该进入哪里。",
          "This draft stays local until you confirm where it should go.",
        )}
      </p>
      <dl
        aria-label={bilingualText(
          "已准备跟进草稿预览",
          "Prepared follow-up draft preview",
        )}
        className="app-contact-detail-ledger"
      >
        <div>
          <dt>{bilingualText("主题", "Subject")}</dt>
          <dd>{actionResult.draftSubject}</dd>
        </div>
        <div>
          <dt>{bilingualText("草稿内容", "Draft note")}</dt>
          <dd>{actionResult.draftBody}</dd>
        </div>
        <div>
          <dt>{bilingualText("本地下一步", "Local next step")}</dt>
          <dd>{actionResult.localNextStep}</dd>
        </div>
      </dl>
      <form
        action="/app/contacts/demo-contact-1"
        aria-label={bilingualText(
          "选择这份草稿的本地暂存位置",
          "Choose where to stage this draft",
        )}
        className="app-contact-detail-draft-form"
        method="get"
      >
        <input name="action" type="hidden" value="prepare-follow-up" />
        <fieldset>
          <legend>
            {bilingualText(
              "选择这份草稿的本地暂存位置",
              "Choose where to stage this draft",
            )}
          </legend>
          <label>
            <input
              defaultChecked
              name="draft_destination"
              type="radio"
              value="local-follow-up-notes"
            />
            {bilingualText(
              "保存到本地跟进笔记",
              "Save to local follow-up notes",
            )}
          </label>
          <label>
            <input
              name="draft_destination"
              type="radio"
              value="conversation-prep"
            />
            {bilingualText(
              "复制到对话准备区",
              "Copy into conversation prep",
            )}
          </label>
          <button type="submit">
            {bilingualText("在本地暂存草稿", "Stage draft locally")}
          </button>
        </fieldset>
      </form>
      <p>{contactDetailActionSafetySummary}</p>
      <dl
        aria-label={bilingualText("跟进安全账本", "Follow-up safety ledger")}
        className="app-contact-detail-ledger"
      >
        <div>
          <dt>{bilingualText("已联系外部账号", "Outside accounts contacted")}</dt>
          <dd>
            {actionResult.externalNetworkRequested
              ? bilingualText("是", "yes")
              : bilingualText("无", "none")}
          </dd>
        </div>
        <div>
          <dt>{bilingualText("联系人记录已更改", "Contact record changed")}</dt>
          <dd>{yesNo(actionResult.databaseWriteExecuted)}</dd>
        </div>
        <div>
          <dt>{bilingualText("消息已发送", "Message sent")}</dt>
          <dd>{yesNo(actionResult.messageSent)}</dd>
        </div>
        <div>
          <dt>{bilingualText("通知已发送", "Notification sent")}</dt>
          <dd>{yesNo(actionResult.notificationDelivered)}</dd>
        </div>
        <div>
          <dt>{bilingualText("搜索索引已读取", "Search index read")}</dt>
          <dd>{yesNo(actionResult.searchIndexReadExecuted)}</dd>
        </div>
        <div>
          <dt>{bilingualText("数据库查询已执行", "Database query executed")}</dt>
          <dd>{yesNo(actionResult.databaseQueryExecuted)}</dd>
        </div>
        <div>
          <dt>{bilingualText("永久审计条目", "Permanent audit entry")}</dt>
          <dd>{yesNo(actionResult.productionAuditLogWriteExecuted)}</dd>
        </div>
      </dl>
    </div>
  );
}

function renderSuccessState(model: AppContactDetailSuccessModel) {
  const { assessment, contact, connection } = model;
  const allEvidenceIds = Array.from(
    new Set([
      ...model.connectionPayload.provenance.evidenceIds,
      ...model.contactPayload.provenance.evidenceIds,
      ...model.valuePayload.provenance.evidenceIds,
      ...model.evidenceTimeline.map((item) => item.evidenceId),
      ...assessment.sourceEvidenceIds,
    ]),
  );

  return (
    <div
      className="app-contact-detail-route"
      data-state-boundary="app-contact-detail-success"
    >
      <style>{routeStyles}</style>
      <section className="app-contact-detail-hero" aria-label="Contact detail header">
        <div className="app-contact-detail-title">
          <p className="surface-eyebrow">
            {bilingualText("已选择的关系", "Selected relationship")}
          </p>
          <h1>
            {bilingualText(
              `关系工作区：${contact.displayName}`,
              `Relationship workspace: ${contact.displayName}`,
            )}
          </h1>
          <p>
            {bilingualText(
              `${contact.role}，${contact.organization}，${contact.location}。先从复盘队列确认这个人，再准备下一次跟进。`,
              `${contact.role}, ${contact.organization} in ${contact.location}. Carry this person forward from the review queue before preparing the next follow-up.`,
            )}
          </p>
        </div>
        <div className="app-contact-detail-hero-grid">
          <div className="app-contact-detail-story">
            <span>{bilingualText("来源故事", "Source story")}</span>
            <p>{contact.relationshipContext}</p>
          </div>
          <div className="app-contact-detail-story">
            <span>{bilingualText("关系阶段", "Relationship stage")}</span>
            <p>
              {bilingualText("关系阶段", "Relationship stage")}:{" "}
              {relationshipStageLabel(connection.relationshipStage)}
            </p>
          </div>
          <div className="app-contact-detail-story">
            <span>{bilingualText("优先原因", "Priority reason")}</span>
            <p>{assessment.rationale.summary}</p>
          </div>
          <div className="app-contact-detail-story">
            <span>{bilingualText("准备跟进", "Prepare follow-up")}</span>
            <p>{contact.nextAction}</p>
          </div>
        </div>
        <a
          className="app-contact-detail-action-link"
          href="/app/contacts/demo-contact-1?action=prepare-follow-up"
        >
          {bilingualText("准备跟进", "Prepare follow-up")}
        </a>
      </section>

      <section
        className="app-contact-detail-metrics"
        aria-label={bilingualText(
          "关系摘要指标",
          "Relationship summary metrics",
        )}
      >
        <DataMetric
          label={bilingualText("连接评分", "Connection score")}
          value={connection.strengthScore}
        />
        <DataMetric
          label={bilingualText("关系价值", "Relationship value")}
          value={bilingualText(
            `优先级评分 ${assessment.priorityScore.value}`,
            `Priority score ${assessment.priorityScore.value}`,
          )}
        />
        <DataMetric
          label={bilingualText("优先级分层", "Priority band")}
          value={assessment.priorityScore.band}
        />
        <DataMetric
          label={bilingualText("来源链接", "Source links")}
          value={connection.sourceLinks.length}
        />
      </section>

      <div className="app-contact-detail-grid">
        <WorkbenchSurface
          eyebrow={bilingualText("连接", "Connection")}
          title={bilingualText(
            "这段关系为什么存在",
            "Why this relationship exists",
          )}
        >
          <dl className="app-contact-detail-ledger">
            <div>
              <dt>{bilingualText("连接原因", "Connection reason")}</dt>
              <dd>{connection.connectionReason}</dd>
            </div>
            <div>
              <dt>{bilingualText("阶段", "Stage")}</dt>
              <dd>{relationshipStageLabel(connection.relationshipStage)}</dd>
            </div>
            <div>
              <dt>{bilingualText("最近接触", "Last touched")}</dt>
              <dd>{formatDate(connection.lastTouchedAt)}</dd>
            </div>
          </dl>
          <p className="privacy-note">{model.connectionPayload.summary}</p>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow={bilingualText("下一步", "Next action")}
          title={bilingualText("推荐跟进", "Recommended follow-up")}
        >
          <p className="type-body">{contact.nextAction}</p>
          <p className="type-body">{assessment.suggestedNextAction.reason}</p>
          <a
            className="app-contact-detail-action-link"
            href="/app/contacts/demo-contact-1?action=prepare-follow-up"
          >
            {bilingualText("复核已准备草稿", "Review prepared draft")}
          </a>
          {renderActionResult(model)}
        </WorkbenchSurface>
      </div>

      <div className="app-contact-detail-action-grid">
        <WorkbenchSurface
          eyebrow={bilingualText("证据", "Evidence")}
          title={bilingualText("时间线", "Timeline")}
        >
          <ol className="app-contact-detail-timeline">
            {model.evidenceTimeline.map((item) => (
              <li key={item.evidenceId}>
                <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
              </li>
            ))}
          </ol>
        </WorkbenchSurface>

        <WorkbenchSurface
          eyebrow={bilingualText("价值", "Value")}
          title={bilingualText("为什么排序靠前", "Why it ranks high")}
        >
          <p className="type-body">{assessment.rationale.summary}</p>
          <dl className="app-contact-detail-ledger">
            {assessment.priorityScore.factors.map((factor) => (
              <div key={factor.label}>
                <dt>{factor.label}</dt>
                <dd>
                  {bilingualText(
                    "已复核的关系证据支持这个优先级。",
                    "Reviewed relationship evidence supports this priority.",
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </WorkbenchSurface>
      </div>

      <WorkbenchSurface
        eyebrow={bilingualText("来源", "Sources")}
        title={bilingualText("来源依据", "Provenance")}
      >
        <div className="app-contact-detail-source-grid">
          {connection.sourceLinks.map((source) => (
            <div className="app-contact-detail-source-card" key={source.id}>
              <span>{source.type.replaceAll("_", " ")}</span>
              <strong>{source.label}</strong>
            </div>
          ))}
        </div>
        <details className="app-contact-detail-technical-details">
          <summary>
            {bilingualText(
              "证据 ID 和来源记录",
              "Evidence IDs and source records",
            )}
          </summary>
          <div
            aria-label={bilingualText("已选择联系人标签", "Selected contact tags")}
            className="app-contact-detail-tags"
          >
            {contact.tags.map((tag) => (
              <Chip key={tag} tone="evidence">
                {tag}
              </Chip>
            ))}
          </div>
          <div
            aria-label={bilingualText(
              "已选择联系人证据记录",
              "Selected contact evidence records",
            )}
            className="chip-row"
          >
            {allEvidenceIds.map((evidenceId) => (
              <Chip key={evidenceId} tone="evidence">
                {evidenceId}
              </Chip>
            ))}
          </div>
          <div className="app-contact-detail-source-grid">
            {connection.sourceLinks.map((source) => (
              <div className="app-contact-detail-source-card" key={source.id}>
                <span>{source.type.replaceAll("_", " ")}</span>
                <strong>{source.label}</strong>
                <p>{source.evidenceId}</p>
              </div>
            ))}
          </div>
        </details>
      </WorkbenchSurface>

    </div>
  );
}

async function renderContactDetailPage({
  params,
  searchParams,
}: ContactDetailPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = isPromiseLike(searchParams)
    ? await searchParams
    : undefined;
  const model = loadAppContactDetailRoute({
    action: readSearchParam(resolvedSearchParams, "action"),
    contactId: resolvedParams.id,
    scenario: readSearchParam(resolvedSearchParams, "scenario"),
  });

  if (model.routeState !== "success") {
    return renderBoundaryState(model);
  }

  return renderSuccessState(model);
}

export default function ContactDetailPage(props: ContactDetailPageProps) {
  return renderContactDetailPage(props);
}
