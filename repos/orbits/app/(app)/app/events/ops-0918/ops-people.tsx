/**
 * 参会者屏（Orbit_0918 运营台 people 屏，设计 211–251 行；`/operations/admission`）。
 * 表格 / 筛选 / 统计消费 `useEventOperations(event)`（审阅修订 3：准入列表没有公司 / 职位 / 资料完整度 / 匹配状态），
 * 匹配状态 = `matchedParticipantIds`（已发布目录或最新 completed 快照）。
 * 「查看详情」= `useAdmissionReview(...).openApplication(actorId)`，详情（完整画像八项 + 自适应访谈 + 批准 / 拒绝）作为行下
 * 展开区块渲染；无审核权限 → 禁用。
 * 设计外第二区块：准入队列（待审核 / 已处理、加载更多、重试 / 两种空态、版本化决定）+ `EventAdmissionPolicyPanel` 折叠区
 * （文件保留、原样挂载）。旧 event-admission-review-workspace.tsx 的 `data-admission-*` 标记与文案原样保留。
 * 仅审核权限（`useEventOperations` 403）：筛选栏 / 表格 / 统计卡全部不渲染，只显示准入区块 + 中文提示（审阅修订 3）。
 */
"use client";

import { useState } from "react";

import type {
  EventAdmissionApplication,
  EventAdmissionApplicationStatus,
  EventAdmissionReviewListItem,
} from "../../../../../features/events/admission/contract";
import { EVENT_PARTICIPANT_PROFILE_FIELDS } from "../../../../../features/events/registration/contract";
import { EVENT_PROFILE_FIELD_LABELS } from "../../../../../features/events/registration/interview-response-contract";
import { EventAdmissionPolicyPanel } from "../[id]/operations/admission/event-admission-policy-panel";
import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  filterPeople,
  matchedParticipantIds,
  PEOPLE_FILTER_TONE,
  PEOPLE_FILTERS,
  peopleAvatarBg,
  peopleDocChip,
  peopleMatchChip,
  peopleOrg,
  peopleStats,
  ROUND_TOGGLE_TONE,
  type PeopleFilter,
} from "./ops-model";
import { SessionBanners } from "./ops-operations-shared";
import { useAdmissionReview, type AdmissionReviewSession, type ReviewView } from "./use-admission-review";
import { useEventOperations } from "./use-event-operations";

const statusLabel: Record<EventAdmissionApplicationStatus, string> = {
  admitted: "已批准",
  pending_review: "待审核",
  rejected: "已拒绝",
  waitlisted: "候补",
  withdrawn: "已撤回",
};

/** 准入队列页签（旧工作区 待审核 / 已处理；装饰沿用匹配屏轮次切换口径）。 */
const REVIEW_VIEWS: readonly { key: ReviewView; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "processed", label: "已处理" },
];

function timeLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";
}

function ApplicantCard({
  active,
  application,
  opening,
  onOpen,
}: {
  active: boolean;
  application: EventAdmissionReviewListItem;
  opening: boolean;
  onOpen(): void;
}) {
  return (
    <button
      aria-busy={opening}
      aria-pressed={active}
      className={`btn op-applicant ${active ? "op-applicant-on" : ""}`}
      data-admission-review-applicant={application.actorId}
      disabled={opening}
      onClick={onOpen}
      type="button"
    >
      <span className="op-applicant-head">
        <strong className="op-applicant-name">{application.displayName || application.actorId}</strong>
        <span className={application.status === "pending_review" ? "op-pill op-pill-purple" : "op-pill"}>{statusLabel[application.status]}</span>
      </span>
      {application.displayName ? <span className="op-dir-id">{application.actorId}</span> : null}
      <span className="op-applicant-meta">
        {opening ? "正在读取完整申请…" : `提交 ${timeLabel(application.submittedAt)} · v${application.applicationVersion}`}
      </span>
    </button>
  );
}

function ApplicationDetail({
  application,
  busy,
  onDecision,
}: {
  application: EventAdmissionApplication;
  busy: boolean;
  onDecision(decision: "approve" | "reject"): void;
}) {
  const responses = application.profilePayload.interviewResponses ?? [];
  return (
    <section aria-label="报名申请详情" className="op-detail" data-admission-review-detail={application.actorId}>
      <header className="op-detail-head">
        <span className="op-eyebrow">APPLICATION · v{application.applicationVersion}</span>
        <strong className="op-sec-title-20">{application.profilePayload.displayName || application.actorId}</strong>
        <span className="op-detail-status">
          <span className={application.status === "pending_review" ? "op-pill op-pill-purple" : "op-pill"}>{statusLabel[application.status]}</span>
          <span className="op-empty">提交于 {timeLabel(application.submittedAt)}</span>
        </span>
      </header>

      <section aria-labelledby="profile-answers-title" className="op-detail-sec">
        <strong className="op-detail-title" id="profile-answers-title">完整报名画像</strong>
        <p className="op-copy">审核工作区展示本次报名提交的全部八项画像答案，不按可见性做选择隐藏。</p>
        <div className="op-detail-grid">
          {EVENT_PARTICIPANT_PROFILE_FIELDS.map((field) => (
            <article className="op-detail-field" data-admission-profile-field={field} key={field}>
              <strong className="op-detail-field-label">{EVENT_PROFILE_FIELD_LABELS[field].zh}</strong>
              <p className="op-detail-field-answer">{application.profilePayload.answers[field]?.trim() || "未填写"}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="adaptive-answers-title" className="op-detail-sec">
        <strong className="op-detail-title" id="adaptive-answers-title">自适应访谈记录</strong>
        {responses.length === 0 ? (
          <div className="op-empty op-empty-dashed" data-admission-adaptive-empty>该申请没有自适应访谈快照；上方仍完整展示已提交画像字段。</div>
        ) : responses.map((response) => (
          <article className="op-detail-field" data-admission-adaptive-response={response.responseId} key={response.responseId}>
            <strong className="op-detail-field-label">{response.question?.prompt || EVENT_PROFILE_FIELD_LABELS[response.field].zh}</strong>
            <p className="op-detail-field-answer">{response.answer.displayText}</p>
            <span className="op-dir-id">
              {EVENT_PROFILE_FIELD_LABELS[response.field].zh} · {response.questionSource} · {response.visibility} · {timeLabel(response.answeredAt)}
            </span>
          </article>
        ))}
      </section>

      {application.status === "pending_review" ? (
        <div className="op-detail-actions">
          <button className="btn op-btn-sm op-dark" data-admission-review-decision="approve" disabled={busy} onClick={() => onDecision("approve")} type="button">
            {busy ? "处理中…" : "批准报名"}
          </button>
          <button className="btn op-btn-sm op-ghost" data-admission-review-decision="reject" disabled={busy} onClick={() => onDecision("reject")} type="button">
            拒绝报名
          </button>
        </div>
      ) : (
        <div className="op-empty op-empty-dashed" data-admission-decision-readonly>
          该申请已处理。处理人 {application.decisionActorId || "—"}，处理时间 {timeLabel(application.decidedAt)}。
        </div>
      )}
    </section>
  );
}

/** 详情 / 读取中 / 空态三态（挂在表格行下或队列区块，二者只挂一处）。 */
function DetailHost({ review, withEmpty }: { review: AdmissionReviewSession; withEmpty: boolean }) {
  if (review.selected) {
    return <ApplicationDetail application={review.selected} busy={review.busy} onDecision={(decision) => void review.decide(decision)} />;
  }
  if (review.openingActorId) {
    return <aside aria-live="polite" className="op-empty op-empty-dashed" data-admission-review-detail-loading>正在读取完整画像与自适应访谈记录…</aside>;
  }
  return withEmpty
    ? <aside className="op-empty op-empty-dashed" data-admission-review-detail-empty>从队列或表格中选择申请，查看完整画像答案与自适应访谈记录。</aside>
    : null;
}

export function OpsPeople({
  canConfigurePolicy = false,
  canReview = true,
  event,
}: {
  canConfigurePolicy?: boolean;
  /** 页面已通过 `admission.read` 门禁；false 时「查看详情」禁用（`cursor: default`）。 */
  canReview?: boolean;
  event: EventOperationsPageEvent;
}) {
  const session = useEventOperations(event);
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ReviewView>("pending");
  const review = useAdmissionReview(event.id, view);
  const { workspace } = session;
  const matched = matchedParticipantIds(workspace);
  const visible = workspace ? filterPeople(workspace.participants, filter, query, matched) : [];
  const stats = peopleStats(workspace?.participants ?? []);
  const processed = view === "processed";
  const detailActor = review.selectedId ?? review.openingActorId;
  const detailInTable = detailActor !== null && visible.some((participant) => participant.actorId === detailActor);
  // 审阅修订 3：仅审核权限时只显示准入区块；操作台 403 的英文原文不外露。
  const reviewerOnly = session.accessDenied;

  return (
    <div className="op-screen" data-ops-screen="people">
      {reviewerOnly ? (
        <div className="op-notice" data-ops-people-reviewer-only role="status">当前身份仅有审核权限，参会者表格与统计不可见。</div>
      ) : (
        <SessionBanners session={session} />
      )}

      {reviewerOnly ? null : (
      <div className="op-pbar">
        <div className="op-pfilters">
          {PEOPLE_FILTERS.map((item) => {
            const on = item.key === filter;
            const tone = on ? PEOPLE_FILTER_TONE.on : PEOPLE_FILTER_TONE.off;
            return (
              <button
                aria-pressed={on}
                className="btn op-pfilter"
                key={item.key}
                onClick={() => setFilter(item.key)}
                style={{ background: tone.bg, borderColor: tone.border, color: tone.color, fontWeight: tone.weight }}
                type="button"
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="op-psearch">
          <span className="op-search-icon">⌕</span>
          <input
            aria-label="搜索参会者"
            className="op-search-input"
            onChange={(input) => setQuery(input.target.value)}
            placeholder="搜索姓名、公司或职位…"
            value={query}
          />
        </span>
      </div>
      )}

      {reviewerOnly ? null : (
      <div className="op-pgrid">
        {workspace ? (
          <section className="op-plist" data-ops-people-table>
            {workspace.participants.length === 0 ? <div className="op-empty op-prow-empty">尚无报名。</div> : null}
            {workspace.participants.length > 0 && visible.length === 0 ? <div className="op-empty op-prow-empty">没有匹配的参会者。换一个筛选或关键词试试。</div> : null}
            {visible.map((participant, index) => {
              const doc = peopleDocChip(participant);
              const match = peopleMatchChip(matched.has(participant.participantId) || matched.has(participant.actorId));
              const opening = review.openingActorId === participant.actorId;
              return (
                <div data-ops-person={participant.participantId} key={participant.participantId}>
                  <div className="op-prow">
                    <span className="op-pava" data-ops-avatar style={{ background: peopleAvatarBg(index) }}>{participant.displayName.slice(0, 1)}</span>
                    <span className="op-pname"><strong className="op-pname-main">{participant.displayName}</strong><span className="op-porg">{peopleOrg(participant)}</span></span>
                    <span className="op-pcol"><span className="op-plabel">资料状态</span><span className="op-pchip" data-ops-chip={`doc:${participant.participantId}`} style={{ background: doc.bg, color: doc.color }}>● {doc.label}</span></span>
                    <span className="op-pcol"><span className="op-plabel">匹配状态</span><span className="op-pchip" data-ops-chip={`match:${participant.participantId}`} style={{ background: match.bg, color: match.color }}>● {match.label}</span></span>
                    <button
                      aria-busy={opening}
                      className="btn op-pdetail"
                      data-ops-person-detail={participant.participantId}
                      disabled={!canReview || opening}
                      onClick={() => void review.openApplication(participant.actorId)}
                      style={{ cursor: canReview ? "pointer" : "default" }}
                      type="button"
                    >
                      {opening ? "读取中…" : "查看详情"}
                    </button>
                  </div>
                  {detailInTable && detailActor === participant.actorId ? (
                    <div className="op-prow-detail"><DetailHost review={review} withEmpty={false} /></div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : <div />}
        <div className="op-pside">
          <div className="op-pstats">
            <span className="op-pstat"><span className="op-stat-label">总报名</span><strong className="op-pstat-n" data-ops-stat="total">{stats.total}</strong></span>
            <span className="op-pstat op-pstat-next"><span className="op-stat-label">资料完整</span><strong className="op-pstat-n" data-ops-stat="complete">{stats.complete}</strong></span>
            <span className="op-pstat op-pstat-next"><span className="op-stat-label">待补充</span><strong className="op-pstat-n" data-ops-stat="incomplete">{stats.incomplete}</strong></span>
          </div>
          <div className="op-ptip">
            <span className="op-ptip-ico">✦</span>
            <span className="op-ptip-copy"><strong className="op-ptip-title">建议优先补齐：</strong><span className="op-ptip-sub">想交流的话题、可提供内容</span></span>
          </div>
        </div>
      </div>
      )}

      <section className="op-extra" id="ops-admission">
        <div className="op-extra-head">
          <div>
            <span className="op-eyebrow">EVENT ADMISSION · REVIEW</span>
            <strong className="op-sec-title-20">报名审核</strong>
          </div>
          {/* span 而非 div：.op-extra-head > div 会把直接子 div 竖排 */}
          <span aria-label="报名审核视图" className="op-rounds" role="tablist">
            {REVIEW_VIEWS.map((item) => {
              const tone = item.key === view ? ROUND_TOGGLE_TONE.on : ROUND_TOGGLE_TONE.off;
              return (
                <button aria-selected={item.key === view} className="btn op-round" key={item.key} onClick={() => setView(item.key)} role="tab" style={{ background: tone.bg, color: tone.color, fontWeight: tone.weight }} type="button">{item.label}</button>
              );
            })}
          </span>
        </div>

        {review.notice ? <div className="op-notice" role="status">{review.notice}</div> : null}
        {review.error ? (
          <div className="op-alert op-alert-row" data-ops-queue-error role="alert">
            <span>{review.error}</span>
            <button className="btn op-btn-sm op-ghost" data-ops-queue-retry onClick={() => void review.loadList()} type="button">重试</button>
          </div>
        ) : null}

        <div className="op-queue-grid">
          <section aria-label={processed ? "已处理报名" : "待审核报名"} className="op-queue">
            <div className="op-queue-head">
              <strong className="op-detail-title">{processed ? "已处理" : "待审核"}</strong>
              <span className="op-pill">{review.total}</span>
            </div>
            {review.loading ? <p aria-live="polite" className="op-empty">正在读取真实报名记录…</p> : null}
            {!review.loading && review.items.length === 0 && !review.error ? (
              <div className="op-empty op-empty-dashed" data-admission-review-empty={view}>
                {processed ? "还没有已处理的报名。" : "当前没有待审核报名。"}
              </div>
            ) : null}
            {review.items.map((application) => (
              <ApplicantCard
                active={review.selectedId === application.actorId || review.openingActorId === application.actorId}
                application={application}
                key={`${application.actorId}:${application.applicationVersion}`}
                opening={review.openingActorId === application.actorId}
                onOpen={() => void review.openApplication(application.actorId)}
              />
            ))}
            {review.nextCursor ? (
              <button className="btn op-btn-sm op-ghost" disabled={review.loadingMore} onClick={() => void review.loadList(true, review.nextCursor)} type="button">
                {review.loadingMore ? "正在加载…" : "加载更多"}
              </button>
            ) : null}
          </section>
          {detailInTable ? null : <DetailHost review={review} withEmpty />}
        </div>

        {/* Reviewing applications is this screen's job; policy setup is occasional,
            so it folds away below the queue instead of occupying the first screen. */}
        <details className="op-fold">
          <summary><strong className="op-detail-title">报名政策与时间设置</strong><span className="op-empty">展开 ⌄</span></summary>
          <div className="op-fold-body">
            <EventAdmissionPolicyPanel canConfigurePolicy={canConfigurePolicy} eventId={event.id} />
          </div>
        </details>
      </section>
    </div>
  );
}
