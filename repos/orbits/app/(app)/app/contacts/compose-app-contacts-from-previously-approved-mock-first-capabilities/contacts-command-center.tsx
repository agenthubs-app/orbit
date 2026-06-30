/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import type { ReactNode } from "react";
import { bilingualText } from "../../../../../shared/ui/bilingual";
import { Chip, Field, WorkbenchSurface } from "../../../../../shared/ui/primitives";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  loadAppContactsRouteViewModel,
  type AppContactListItemViewModel,
  type AppContactsPayloadViewModel,
  type AppContactsRouteScenario,
  type AppContactsRouteStateViewModel,
  type AppContactsSearchParams,
} from "./contacts-route-view-model";

// ContactsCommandCenter 是联系人列表页的纯 UI 组合层。
// 数据和状态都来自 contacts-route-view-model；这里不直接调用 feature service。
const appContactsStyles = `
.app-contacts-route {
  display: grid;
  gap: var(--orbit-space-md);
}

.orbit-app-shell:has(.app-contacts-route) .workbench-header .workbench-intro,
.orbit-app-shell:has(.app-contacts-route) .workbench-header [aria-label="Account summary"],
.orbit-app-shell:has(.app-contacts-route) [aria-label="Account and next steps"] {
  display: none;
}

.app-contacts-route,
.app-contacts-route .workbench-surface,
.app-contacts-route .relationship-meta,
.app-contacts-route .chip-row,
.app-contacts-route .contacts-ledger,
.app-contacts-route .contacts-filter-grid,
.app-contacts-route .contacts-card-grid,
.app-contacts-route .contacts-queue-grid {
  min-width: 0;
}

.app-contacts-route .contacts-command {
  border-left: 4px solid var(--orbit-color-primary);
}

.app-contacts-route .contacts-ledger,
.app-contacts-route .contacts-filter-grid,
.app-contacts-route .contacts-card-grid,
.app-contacts-route .contacts-queue-grid {
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 198px), 1fr));
}

.app-contacts-route .contacts-queue-card,
.app-contacts-route .contacts-ledger div,
.app-contacts-route .contacts-card,
.app-contacts-route .contacts-action-result {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-route .contacts-queue {
  border-left: 4px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-queue-card {
  border-top: 3px solid var(--orbit-color-primary);
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-ledger strong {
  display: block;
  font-size: 1.45rem;
  line-height: 1.05;
}

.app-contacts-route .contacts-card,
.app-contacts-route .contacts-action-result {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-card {
  border-top: 3px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-card header {
  display: grid;
  gap: 6px;
}

.app-contacts-route .contacts-person-link,
.app-contacts-route .contacts-detail-link {
  color: var(--orbit-color-text);
  font-weight: 800;
  text-decoration-color: var(--orbit-color-primary);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.app-contacts-route .contacts-detail-link {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  display: inline-flex;
  line-height: 1.3;
  padding: 7px 10px;
  width: fit-content;
}

.app-contacts-route details {
  border-top: 1px solid var(--orbit-color-border);
  padding-top: var(--orbit-space-xs);
}

.app-contacts-route summary {
  color: var(--orbit-color-muted);
  cursor: pointer;
  font-family: var(--orbit-font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.app-contacts-route .contacts-action-result {
  border-left: 3px solid var(--orbit-color-evidence);
}

.app-contacts-route .contacts-search-form,
.app-contacts-route .contacts-review-form {
  display: grid;
  gap: var(--orbit-space-sm);
}

.app-contacts-route .contacts-review-form {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  padding: var(--orbit-space-sm);
}

.app-contacts-route .contacts-search-form button,
.app-contacts-route .contacts-review-form button {
  background: var(--orbit-color-primary);
  border-color: var(--orbit-color-primary-strong);
  color: var(--orbit-color-primary-text);
}

.app-contacts-route .contacts-state-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-xs);
}

.app-contacts-route .contacts-state-links a {
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-text);
  padding: 6px 10px;
  text-decoration: none;
}

.app-contacts-route .contacts-recovery-actions {
  align-items: center;
}
`;

const routeStateChecks = [
  {
    href: "/app/contacts?scenario=empty",
    label: bilingualText("没有找到联系人", "No contacts found"),
  },
  {
    href: "/app/contacts?scenario=pending",
    label: bilingualText("仍在检查来源", "Still checking sources"),
  },
  {
    href: "/app/contacts?scenario=failure",
    label: bilingualText("列表不可用", "List unavailable"),
  },
] as const;

const contactsActionSafetySummary =
  "OUTSIDE ACCOUNTS CONTACTED: none / CONTACT RECORD CHANGED: no / MESSAGE SENT: no / NOTIFICATION SENT: no / SEARCH INDEX READ: no / DATABASE QUERY EXECUTED: no";

export interface AppContactsCommandCenterProps {
  searchParams?: AppContactsSearchParams;
}

function firstEvidence(evidenceIds: readonly string[] | undefined): string {
  return evidenceIds?.[0] ?? "evidence:unavailable";
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function EvidenceChips({
  evidenceIds,
  label,
}: {
  evidenceIds: readonly string[];
  label: string;
}) {
  return (
    <div aria-label={label} className="chip-row">
      {evidenceIds.slice(0, 5).map((evidenceId) => (
        <Chip key={evidenceId} tone="evidence">
          {evidenceId}
        </Chip>
      ))}
    </div>
  );
}

// ValueChips 把关系价值类型展示成标签，不重新计算 value score。
function ValueChips({ contact }: { contact: AppContactListItemViewModel }) {
  return (
    <div
      aria-label={`${contact.displayName} relationship value tags`}
      className="chip-row"
    >
      {contact.relationshipValueLabels.map((valueLabel) => (
        <Chip key={`${contact.id}:${valueLabel}`} tone="confirmation">
          {valueLabel}
        </Chip>
      ))}
    </div>
  );
}

function RouteStateMarker({
  children,
  scenario,
}: {
  children: ReactNode;
  scenario: AppContactsRouteScenario;
}) {
  return (
    <div data-route-state-url={`/app/contacts?scenario=${scenario}`}>
      {children}
    </div>
  );
}

function RouteRecoveryActions({
  actions,
}: {
  actions: AppContactsRouteStateViewModel["recoveryActions"];
}) {
  return (
    <nav
      aria-label="Contacts route recovery actions"
      className="contacts-state-links contacts-recovery-actions"
      data-side-effects="none"
    >
      {actions.map((action) => (
        <a href={action.href} key={action.href}>
          {action.label}
        </a>
      ))}
    </nav>
  );
}

// RouteStateBoundary 只负责 empty/pending/failure；成功列表在 SuccessBoundary 渲染。
function RouteStateBoundary({
  routeState,
}: {
  routeState: AppContactsRouteStateViewModel;
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
        title={routeState.copy.title}
      />
      <RouteRecoveryActions actions={routeState.recoveryActions} />
    </RouteStateMarker>
  );
}

// ContactsLedger 是列表级摘要，所有数字都来自 view-model，不在组件中重新查询。
function ContactsLedger({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <dl
      aria-label="App contacts composed list summary"
      className="relationship-meta contacts-ledger"
    >
      <div>
        <dt>{bilingualText("已知人物", "Known people")}</dt>
        <dd>
          <strong>{payload.ledger.knownPeople}</strong>
          {bilingualText("有来源联系人", "source-backed contacts")}
        </dd>
      </div>
      <div>
        <dt>{bilingualText("来源筛选", "Source filters")}</dt>
        <dd>{formatCount(payload.ledger.sourceFilters, "source")}</dd>
      </div>
      <div>
        <dt>{bilingualText("价值标签", "Value tags")}</dt>
        <dd>{formatCount(payload.ledger.valueTags, "value tag")}</dd>
      </div>
      <div>
        <dt>{bilingualText("需要关注", "Needs attention")}</dt>
        <dd>{formatCount(payload.ledger.needsAttention, "contact")}</dd>
      </div>
    </dl>
  );
}

// ContactsSearchForm 用 GET query 驱动筛选，便于复制 URL 和测试状态。
function ContactsSearchForm({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <form
      action="/app/contacts"
      aria-label="App contacts search and filter form"
      className="contacts-search-form"
      method="get"
    >
      <div className="contacts-filter-grid">
        <Field
          label={bilingualText("搜索", "Search")}
          helper={bilingualText(
            "姓名、公司、上下文、下一步动作或标签。",
            "Name, company, context, next action, or tag.",
          )}
        >
          <input
            defaultValue={payload.appliedFilters.query}
            name="query"
            placeholder="Try storage or venture ecosystem"
            type="search"
          />
        </Field>
        <Field
          label={bilingualText("来源", "Source")}
          helper={bilingualText(
            "让每个人旁边保留来源上下文。",
            "Keep source context beside each person.",
          )}
        >
          <select
            defaultValue={payload.appliedFilters.sourceFilters[0] ?? ""}
            name="source"
          >
            <option value="">{bilingualText("全部来源", "All sources")}</option>
            {payload.availableFilters.sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={bilingualText("状态", "Status")}
          helper={bilingualText(
            "关系运营状态。",
            "Relationship operating state.",
          )}
        >
          <select
            defaultValue={payload.appliedFilters.statusFilters[0] ?? ""}
            name="status"
          >
            <option value="">{bilingualText("全部状态", "All statuses")}</option>
            {payload.availableFilters.statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button type="submit">
        {bilingualText("搜索联系人列表", "Search contact list")}
      </button>
    </form>
  );
}

// ContactCard 展示单个联系人及其证据；不负责发起详情查询或外部查找。
function ContactCard({ contact }: { contact: AppContactListItemViewModel }) {
  return (
    <article
      aria-label={`Contact relationship row for ${contact.displayName}`}
      className="contacts-card"
    >
      <header>
        <p className="type-caption">{contact.sourceLabel}</p>
        <h3 className="relationship-name">{contact.displayName}</h3>
        <p className="type-caption">
          {contact.role} at {contact.organization} · {contact.location}
        </p>
        <a className="contacts-detail-link" href={contact.detailHref}>
          {bilingualText("打开关系工作区", "Open relationship workspace")}
        </a>
      </header>
      <p className="type-body">{contact.relationshipContextCopy}</p>
      <dl className="relationship-meta">
        <div>
          <dt>{bilingualText("来源上下文", "Source context")}</dt>
          <dd>{contact.sourceLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("关系状态", "Relationship status")}</dt>
          <dd>{contact.statusLabel}</dd>
        </div>
        <div>
          <dt>{bilingualText("关系价值", "Relationship value")}</dt>
          <dd>{contact.relationshipValueSummary}</dd>
        </div>
        <div>
          <dt>{bilingualText("安全下一步", "Next safe action")}</dt>
          <dd>{contact.nextAction}</dd>
        </div>
      </dl>
      <ValueChips contact={contact} />
      <details>
        <summary>{bilingualText("联系人证据详情", "Contact evidence details")}</summary>
        <div aria-label={`${contact.displayName} source tags`} className="chip-row">
          {contact.tags.map((tag) => (
            <Chip key={`${contact.id}:${tag}`} tone="primary">
              {tag}
            </Chip>
          ))}
        </div>
        <EvidenceChips
          evidenceIds={contact.evidenceIds}
          label={`${contact.displayName} contact evidence`}
        />
      </details>
    </article>
  );
}

// ReviewActionResult 是本地复核预览的结果面板，明确标记 data-side-effects="none"。
function ReviewActionResult({
  payload,
}: {
  payload: AppContactsPayloadViewModel;
}) {
  if (!payload.reviewActionRequested) {
    return null;
  }

  const reviewedContact = payload.contacts[0] ?? null;

  if (!reviewedContact) {
    return (
      <div
        aria-label="App contacts local action result"
        className="contacts-action-result"
        data-action-evidence="contacts-filtered-review-local-preview"
        data-side-effects="none"
        data-task-result="contacts-filtered-review-preview"
      >
        <strong>
          {bilingualText(
            "筛选复核已准备：没有匹配联系人",
            "Filtered review ready: no matching contact",
          )}
        </strong>
        <span>
          {bilingualText(
            "复核关系动作前先清除筛选。",
            "Clear the filters before reviewing a relationship action.",
          )}
        </span>
        <span>{contactsActionSafetySummary}</span>
        <span>{bilingualText("联系人记录已更改：否", "Contact record changed: no")}</span>
        <span>{bilingualText("消息已发送：否", "Message sent: no")}</span>
        <span>{bilingualText("通知已发送：否", "Notification sent: no")}</span>
        <span>{bilingualText("搜索索引已读取：否", "Search index read: no")}</span>
        <span>
          {bilingualText("数据库查询已执行：否", "Database query executed: no")}
        </span>
        <span>
          {bilingualText("已联系外部服务：无", "Outside services contacted: none")}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label="App contacts local action result"
      className="contacts-action-result"
      data-action-evidence="contacts-filtered-review-local-preview"
      data-side-effects="none"
      data-task-result="contacts-filtered-review-preview"
    >
      <strong>
        {bilingualText(
          `筛选复核已准备：${reviewedContact.displayName}`,
          `Filtered review ready: ${reviewedContact.displayName}`,
        )}
      </strong>
      <span>{reviewedContact.nextAction}</span>
      <span>{contactsActionSafetySummary}</span>
      <span>{bilingualText("联系人记录已更改：否", "Contact record changed: no")}</span>
      <span>{bilingualText("消息已发送：否", "Message sent: no")}</span>
      <span>{bilingualText("通知已发送：否", "Notification sent: no")}</span>
      <span>
        {bilingualText("搜索索引已读取", "Search index read")}:{" "}
        {reviewedContact.searchIndexReadExecuted
          ? bilingualText("是", "yes")
          : bilingualText("否", "no")}
      </span>
      <span>
        {bilingualText("数据库查询已执行", "Database query executed")}:{" "}
        {reviewedContact.databaseQueryExecuted
          ? bilingualText("是", "yes")
          : bilingualText("否", "no")}
      </span>
      <span>
        {bilingualText("已联系外部服务", "Outside services contacted")}:{" "}
        {reviewedContact.externalServicesContacted
          ? bilingualText("需要复核", "review required")
          : bilingualText("无", "none")}
      </span>
      <details>
        <summary>{bilingualText("动作来源详情", "Action source details")}</summary>
        <span>
          {bilingualText("来源证据", "Source evidence")}:{" "}
          {firstEvidence(reviewedContact.evidenceIds)}
        </span>
      </details>
    </div>
  );
}

// AttentionQueueCard 只展示下一步建议，不会创建任务或发送消息。
function AttentionQueueCard({
  contact,
}: {
  contact: AppContactListItemViewModel;
}) {
  return (
    <article
      aria-label={`Current relationship review for ${contact.displayName}`}
      className="contacts-queue-card"
    >
      <div>
        <p className="type-caption">
          {bilingualText("现在该关注谁", "Who needs attention now")}
        </p>
        <h3 className="relationship-name">
          <a className="contacts-person-link" href={contact.detailHref}>
            {contact.displayName}
          </a>
        </h3>
        <p className="type-caption">
          {contact.role} at {contact.organization} · {contact.location}
        </p>
      </div>
      <p className="type-body">
        {bilingualText("为什么 Kenji 现在重要", "Why Kenji matters now")}:{" "}
        {contact.valueRationale}
      </p>
      <p className="type-body">
        {bilingualText("来源上下文", "Source context")}:{" "}
        {contact.sourceLabel} from {contact.relationshipContextCopy}
      </p>
      <p className="type-body">
        {bilingualText("安全下一步", "Next safe action")}: {contact.nextAction}
      </p>
    </article>
  );
}

// RelationshipReviewQueue 是联系人页的主工作区：先看需要关注的人，再看安全下一步。
function RelationshipReviewQueue({
  payload,
}: {
  payload: AppContactsPayloadViewModel;
}) {
  const attentionContacts = payload.contacts.filter(
    (contact) => contact.needsAttention,
  );
  const queueContacts =
    attentionContacts.length > 0 ? attentionContacts : payload.contacts.slice(0, 1);

  return (
    <WorkbenchSurface
      className="contacts-queue"
      elevated
      eyebrow={bilingualText("人脉", "People")}
      title={bilingualText("关系复盘队列", "Relationship review queue")}
    >
      <p className="type-body">
        {bilingualText(
          "先看当前最需要处理的人、这段关系为什么重要、它来自哪里，以及可以准备的安全下一步。",
          "Start with the person who needs attention now, the reason this relationship matters, the source context that created it, and the next safe action to prepare.",
        )}
      </p>
      <div className="contacts-queue-grid">
        {queueContacts.map((contact) => (
          <AttentionQueueCard contact={contact} key={contact.id} />
        ))}
      </div>
      <ContactsLedger payload={payload} />
      <ReviewActionResult payload={payload} />
    </WorkbenchSurface>
  );
}

// ReviewActionForm 提交的是本地 preview action，不写联系人、不发消息、不改外部账号。
function ReviewActionForm() {
  return (
    <form
      action="/app/contacts"
      className="contacts-review-form"
      method="get"
    >
      <div>
        <p className="type-caption">
          {bilingualText("核心联系人动作", "Core contacts action")}
        </p>
        <h3 className="relationship-name">
          {bilingualText(
            "预览筛选后的关系复核",
            "Preview a filtered relationship review",
          )}
        </h3>
        <p className="type-body">
          {bilingualText(
            "这会准备一个有来源联系人用于跟进复核，然后在任何联系人写入、搜索索引读取、消息、任务或外部账号更改前停止。",
            "This prepares one sourced contact for follow-up review, then stops before any contact write, search index read, message, task, or outside account change.",
          )}
        </p>
      </div>
      <input name="action" type="hidden" value="review-filtered-contact" />
      <input name="query" type="hidden" value="storage" />
      <input name="tag" type="hidden" value="topic:storage-pilots" />
      <input name="value" type="hidden" value="commercial_opportunity" />
      <button type="submit">
        {bilingualText("预览筛选复核", "Preview filtered review")}
      </button>
    </form>
  );
}

// SuccessBoundary 给成功状态一个明确 DOM 边界，方便页面测试定位。
function SuccessBoundary({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <div data-state-boundary="app-contacts-success">
      <span hidden>Contacts relationship console</span>
      <RelationshipReviewQueue payload={payload} />
    </div>
  );
}

// SecondaryControls 包含搜索表单、preview action 和状态检查入口。
function SecondaryControls({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("控制", "Controls")}
      title={bilingualText("查找另一段关系", "Find another relationship")}
    >
      <ContactsSearchForm payload={payload} />
      <ReviewActionForm />
      <div aria-label="App contacts list health states">
        <h3 className="relationship-name">
          {bilingualText("列表健康", "List health")}
        </h3>
        <p className="type-body">
          {bilingualText(
            "检查列表为空、仍在解析或不可用时联系人页如何表现。",
            "Check how contacts behaves when the list is empty, still resolving, or unavailable.",
          )}
        </p>
        <nav className="contacts-state-links">
          {routeStateChecks.map((stateCheck) => (
            <a href={stateCheck.href} key={stateCheck.href}>
              {stateCheck.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="privacy-note">
        {bilingualText(
          "这个页面不会联系搜索索引、数据库、邮件、日历、AI、通知、消息或外部网络。",
          "No search index, database, email, calendar, AI, notification, messaging, or external network is contacted from this route.",
        )}
      </p>
    </WorkbenchSurface>
  );
}

// ContactsListSection 展示当前筛选后的联系人集合。
function ContactsListSection({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("人物", "People")}
      title={bilingualText("本次复核中的人", "People in this review")}
    >
      <p className="type-body">{payload.listSummary}</p>
      <div className="contacts-card-grid">
        {payload.contacts.map((contact) => (
          <ContactCard contact={contact} key={contact.id} />
        ))}
      </div>
    </WorkbenchSurface>
  );
}

// FilterVocabulary 展示当前可用筛选词汇和列表证据。
function FilterVocabulary({ payload }: { payload: AppContactsPayloadViewModel }) {
  return (
    <WorkbenchSurface
      eyebrow={bilingualText("筛选", "Filters")}
      title={bilingualText(
        "搜索、来源和价值词汇",
        "Search, source, and value vocabulary",
      )}
    >
      <p className="type-body">
        {bilingualText(
          "使用这些标签缩小复核范围，不更改联系人，也不联系外部账号。",
          "Use these labels to narrow the review without changing contacts or contacting outside accounts.",
        )}
      </p>
      <div aria-label="App contacts value filter labels" className="chip-row">
        {payload.availableFilters.values.map((value) => (
          <Chip key={value.value} tone={value.selected ? "primary" : "confirmation"}>
            {value.label}
          </Chip>
        ))}
      </div>
      <div aria-label="App contacts source filter labels" className="chip-row">
        {payload.availableFilters.sources.map((source) => (
          <Chip key={source.value} tone={source.selected ? "primary" : "privacy"}>
            {source.label}
          </Chip>
        ))}
      </div>
      <details>
        <summary>{bilingualText("列表证据详情", "List evidence details")}</summary>
        <EvidenceChips
          evidenceIds={payload.listEvidenceIds}
          label="App contacts list evidence"
        />
      </details>
    </WorkbenchSurface>
  );
}

// 页面入口：根据 view-model state 选择 route-state、failure 或 success 工作区。
export function AppContactsCommandCenter({
  searchParams,
}: AppContactsCommandCenterProps) {
  const viewModel = loadAppContactsRouteViewModel(searchParams);

  if (viewModel.state === "route-state") {
    return (
      <div className="app-contacts-route">
        <style>{appContactsStyles}</style>
        <RouteStateBoundary routeState={viewModel.routeState} />
      </div>
    );
  }

  if (viewModel.state === "failure") {
    return (
      <div className="app-contacts-route">
        <style>{appContactsStyles}</style>
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
      </div>
    );
  }

  return (
    <div className="app-contacts-route">
      <style>{appContactsStyles}</style>
      <SuccessBoundary payload={viewModel.payload} />
      <ContactsListSection payload={viewModel.payload} />
      <SecondaryControls payload={viewModel.payload} />
      <FilterVocabulary payload={viewModel.payload} />
    </div>
  );
}
