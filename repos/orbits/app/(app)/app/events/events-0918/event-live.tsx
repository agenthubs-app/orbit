"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  OrbitPartyAgendaItemView,
  OrbitPartyPersonView,
  OrbitPartyTableView,
  OrbitPartyViewModel,
} from "../../orbit-party-route-view-model";
import { useOrbitLanguage, type OrbitLanguage } from "../../orbit-language-context";
import { gradientFromString } from "../../orbit-reference-primitives";
import { EventCover } from "../orbit-event-cover";
import {
  AGENDA_STATE,
  GRAPH_CX,
  GRAPH_CY,
  GRAPH_LEGEND,
  LIVE_TABS,
  STATUS_CHIP,
  agendaStatus,
  currentRound,
  eventDetailHref,
  formatJstClock,
  formatEventDateRange,
  formatJstStamp,
  graphLayout,
  graphLegendColor,
  graphLegendKind,
  hotTags,
  matchesPersonQuery,
  paginate,
  sharedTopics,
  type EventListLanguage,
  type GraphLegendKind,
  type LiveTab,
} from "./events-model";
import { EventAttendeeModal } from "./event-attendee-modal";
import { ContactAction } from "./event-contact-action";
import { EventExchangeModal } from "./event-exchange-modal";
import { useEventToast, type EventModalKind } from "./event-modal-frame";
import { EventNoteModal } from "./event-note-modal";
import { EventScheduleModal } from "./event-schedule-modal";
import { EVENTS_STYLES, EventsToast } from "./events-shell";
import { useEventCheckIn } from "./live-controls";
import { formatOrbitPartyDateTime } from "./party-date-time";

/**
 * Orbit_0918 Events 现场屏（取代 /app/party*）。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Events.dc.html 第 221–519 行
 * （221–245 头部 + 页签；246–319 现场主页；320–360 推荐给你；361–390 全部参会者；391–434 分组；435–477 关系图谱；478–519 流程议程）。
 * 数据 = 既有 `loadAppPartyRouteViewModel` → `OrbitPartyViewModel`；写操作 = ./live-controls.ts（搬自 party/event-operations-controls.tsx）。
 *
 * 数据真实性决定（2026-09-22 计划）——省略：最后更新 ⟳ / 倒计时 / 「第 N / 4 轮」（只有两轮）/ 分享活动 / 二度人脉·可能感兴趣 /
 * 打招呼（无 API）/ 换一批 / 仅高匹配开关 / 四个筛选下拉 + 重置 / 排序 / 城市 / bio（无字段；用 summary）/ 组长 / 下一轮预告 /
 * 查看完整分组安排 / 按关系·按兴趣·按行业 / 缩放控件 / 潜在机会 / 数据实时更新 / 添加到日历 / 现场提示；▦ 日期行 = VM 新增 eventStartsAt / eventEndsAt（真实活动时间）；
 * 任务 5：头像 / 成员卡 / 查看资料 → 参会者弹窗；申请交换 → 交换弹窗（含成功态）；约谈 / 记录交流弹窗只从参会者 / 成功态进入（需要人物上下文）；
 * 设计 259「＋ 记录交流」状态格与 412 分组卡底部「▤ 记录交流 / ◎ 交换联系方式」无人物上下文 → 省略（记偏差）。
 */

type Translate = (copy: { en: string; zh: string }) => string;
export type OpenModal = (kind: EventModalKind, person: OrbitPartyPersonView) => void;
export interface EventModalState { kind: EventModalKind; person: OrbitPartyPersonView }

const HOME_REC_LIMIT = 3;
const PAGE_SIZE = 12;

function listLanguage(language: OrbitLanguage): EventListLanguage {
  return language === "ja" ? "en" : language;
}

function roleDot(person: Pick<OrbitPartyPersonView, "title" | "company">): string {
  return [person.title, person.company].filter((value) => value && value.trim()).join(" · ");
}

function roleAt(person: Pick<OrbitPartyPersonView, "title" | "company">): string {
  return person.company?.trim() ? `${person.title} @ ${person.company}` : person.title;
}

function othersOnly(viewModel: OrbitPartyViewModel, people: readonly OrbitPartyPersonView[]): OrbitPartyPersonView[] {
  return people.filter((person) => person.id !== viewModel.me.participantId);
}

// ── 结果四态（文案取自旧 orbit-real-party.tsx PartyResultsBoundary；设计无对应元素，按设计空态色阶）──
export function resultsBoundaryCopy(viewModel: OrbitPartyViewModel, t: Translate): { title: string; detail: string } {
  return {
    failed: {
      title: t({ en: "AI generation failed", zh: "AI 生成失败" }),
      detail:
        viewModel.generationNotice?.errorMessage ??
        t({ en: "The organizer can retry failed shards. No substitute result was published.", zh: "组织者可重试失败分片；系统没有发布替代结果。" }),
    },
    locked: {
      title: t({ en: "Results are not open yet", zh: "结果尚未开放" }),
      detail: t({
        en: `Results open at ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)}.`,
        zh: `结果将在 ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)} 开放。`,
      }),
    },
    not_generated: {
      title: t({ en: "Results have not been generated", zh: "结果尚未生成" }),
      detail: t({ en: "The organizer has not published an AI generation for this registration snapshot.", zh: "组织者尚未为当前报名快照发布 AI 生成结果。" }),
    },
    processing: {
      title: t({ en: "AI generation is processing", zh: "AI 正在生成" }),
      detail: t({ en: "The result will appear only after every shard succeeds and the organizer publishes it.", zh: "只有全部分片成功且组织者发布后，结果才会出现。" }),
    },
    ready: {
      title: t({ en: "No recommended match", zh: "暂无推荐匹配" }),
      detail:
        viewModel.recommendationNoMatchReason ??
        t({ en: "The published AI result did not return a match for this participant.", zh: "已发布的 AI 结果未为该参会者返回匹配。" }),
    },
  }[viewModel.resultsState];
}

function ResultsBoundary({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const copy = resultsBoundaryCopy(viewModel, t);
  return (
    <div className="ev-lv-empty" data-live-results-state={viewModel.resultsState} role="status">
      <strong className="ev-lv-empty-title">{copy.title}</strong>
      <span className="ev-lv-empty-detail">{copy.detail}</span>
      {viewModel.generationNotice?.errorCode ? <span className="ev-lv-empty-code">{viewModel.generationNotice.errorCode}</span> : null}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="ev-lv-empty" role="status"><span className="ev-lv-empty-detail">{children}</span></div>;
}

function Avatar({ initial, label, onClick, size = "56" }: { initial: string; label?: string; onClick?: () => void; size?: "48" | "56" | "64" }) {
  if (onClick) {
    return <button aria-label={label} className={`btn ev-lv-avatar ev-lv-avatar-${size}`} data-live-open="attendee" onClick={onClick} type="button">{initial}</button>;
  }
  return <span aria-hidden="true" className={`ev-lv-avatar ev-lv-avatar-${size}`}>{initial}</span>;
}

function Tags({ tags, limit = 3 }: { tags: readonly string[]; limit?: number }) {
  const list = tags.filter((tag) => tag.trim()).slice(0, limit);
  if (!list.length) return null;
  return <span className="ev-lv-tags">{list.map((tag, index) => <span className="ev-lv-tag" key={`${index}-${tag}`}>{tag}</span>)}</span>;
}

// ── 人物卡（设计 292–301 首页推荐 / 331–341 推荐给你 / 372–382 全部参会者）──
function PersonCard({ eventId, onOpen, open, person, t, variant }: { eventId: string; onOpen: OpenModal; open: boolean; person: OrbitPartyPersonView; t: Translate; variant: "home" | "rec" | "all" }) {
  const openLabel = t({ en: `Open ${person.name}'s profile`, zh: `查看 ${person.name} 的资料` });
  return (
    <article className="ev-lv-person" data-live-person={person.id}>
      <div className="ev-lv-person-head">
        <Avatar initial={person.initial} label={openLabel} onClick={() => onOpen("attendee", person)} />
        <span className="ev-lv-person-copy">
          {variant === "rec" ? (
            <span className="ev-lv-person-name-row">
              <strong className="ev-lv-person-name">{person.name}</strong>
              {person.isRecommended && person.score > 0 ? <span className="ev-lv-match">{t({ en: `${person.score}% match`, zh: `${person.score}% 匹配` })}</span> : null}
            </span>
          ) : (
            <strong className="ev-lv-person-name">{person.name}</strong>
          )}
          <span className="ev-lv-person-role">{variant === "home" ? roleDot(person) : roleAt(person)}</span>
          <Tags limit={variant === "home" ? 2 : 3} tags={person.topics} />
        </span>
      </div>
      {variant === "all" ? (
        person.summary ? <span className="ev-lv-person-bio">{person.summary}</span> : null
      ) : (
        <div className="ev-lv-reason">
          <span className="ev-lv-reason-label">{t({ en: "Why this match", zh: "匹配理由" })}</span>
          <span>• {person.reason}</span>
        </div>
      )}
      <div className="ev-lv-person-actions">
        {variant === "all" ? (
          <button className="btn ev-lv-btn-ghost ev-lv-btn-grow" data-live-open="attendee" onClick={() => onOpen("attendee", person)} type="button">{t({ en: "View profile", zh: "查看资料" })}</button>
        ) : null}
        <ContactAction dark={variant === "all"} eventId={eventId} grow={variant === "all" ? "1.4" : "1"} onRequest={(target) => onOpen("exchange", target)} open={open} person={person} t={t} />
      </div>
    </article>
  );
}

// ── 页签（设计 240–244）──
function LiveTabs({ active, onSelect, t }: { active: LiveTab; onSelect: (tab: LiveTab) => void; t: Translate }) {
  return (
    <nav aria-label={t({ en: "Live sections", zh: "现场栏目" })} className="ev-tabs ev-lv-tabs" role="tablist">
      {LIVE_TABS.map((tab) => (
        <button
          aria-selected={active === tab.key}
          className={`btn ev-tab ${active === tab.key ? "ev-tab-on" : "ev-tab-off"}`}
          data-live-tab={tab.key}
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          role="tab"
          type="button"
        >
          {t(tab.label)}
        </button>
      ))}
    </nav>
  );
}

// ── 现场主页（设计 246–319）──
function CheckInTile({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const control = useEventCheckIn({ checkedInAt: viewModel.checkedInAt, eventId: viewModel.eventId });
  const enabled = viewModel.checkInAvailable && viewModel.eventPhase !== "ended";
  if (control.recordedAt) {
    return (
      <div className="ev-lv-tile ev-lv-tile-green" data-live-checkin="checked" role="status">
        <span className="ev-lv-tile-check"><span className="ev-lv-tile-check-dot">✓</span>{t({ en: "Checked in", zh: "已完成签到" })}</span>
        <span className="ev-lv-tile-green-sub">{t({ en: `Checked in at ${formatJstClock(control.recordedAt)}`, zh: `${formatJstClock(control.recordedAt)} 签到成功` })}</span>
      </div>
    );
  }
  return (
    <div className="ev-lv-tile" data-live-checkin={enabled ? "open" : "closed"}>
      <span className="ev-lv-tile-label">◎ {t({ en: "Check-in", zh: "现场签到" })}</span>
      <button className="btn ev-lv-btn-dark" data-live-action="check-in" disabled={!enabled || control.busy} onClick={() => void control.checkIn()} type="button">
        {control.busy
          ? t({ en: "Checking in…", zh: "签到中…" })
          : enabled
            ? t({ en: "Check in now", zh: "立即签到" })
            : t({ en: "Check-in window is closed", zh: "当前不在签到时间内" })}
      </button>
      {control.error ? <span className="ev-lv-error" role="alert">{control.error}</span> : null}
    </div>
  );
}

function tableLabel(table: OrbitPartyTableView | null, t: Translate): string {
  return table ? t({ en: `Table ${table.tableNumber}`, zh: `${table.tableNumber} 号桌` }) : t({ en: "Seat not assigned yet", zh: "尚未分配座位" });
}

function HomeTab({ go, now, onOpen, t, viewModel }: { go: (tab: LiveTab) => void; now: number; onOpen: OpenModal; t: Translate; viewModel: OrbitPartyViewModel }) {
  const round = currentRound(viewModel.agenda, Boolean(viewModel.roundTwo), now);
  const table = round === 2 ? viewModel.roundTwo : viewModel.roundOne ?? viewModel.roundTwo;
  const roundCount = viewModel.roundTwo ? 2 : 1;
  const recs = othersOnly(viewModel, viewModel.recommendations).slice(0, HOME_REC_LIMIT);
  const known = viewModel.contactRequests.filter((request) => request.status === "accepted").length;
  const statuses = agendaStatus(viewModel.agenda, now);
  const open = viewModel.eventPhase !== "upcoming";
  return (
    <div className="ev-lv-home">
      <div className="ev-lv-col">
        <section className="ev-lv-card">
          <div className="ev-lv-card-head">
            <span className="ev-lv-card-copy">
              <h2 className="ev-h2">{t({ en: "Your live status", zh: "你的现场状态" })}</h2>
              <span className="ev-lv-sub" data-live-me={viewModel.me.participantId}>{[viewModel.me.name, viewModel.me.role].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
          <div className="ev-lv-tiles">
            <CheckInTile t={t} viewModel={viewModel} />
            <div className="ev-lv-tile">
              <span className="ev-lv-tile-label">◎ {t({ en: "Current table", zh: "当前分组 / 桌号" })}</span>
              <strong className="ev-lv-tile-n">{tableLabel(table, t)}</strong>
              {table ? <span className="ev-lv-tile-label">{table.theme}{table.seat ? ` · ${table.seat}` : ""}</span> : null}
            </div>
            <div className="ev-lv-tile ev-lv-tile-actions">
              <button className="btn ev-lv-btn-dark" onClick={() => go("rec")} type="button">{t({ en: "See recommendations →", zh: "查看推荐 →" })}</button>
            </div>
          </div>
        </section>

        <section className="ev-lv-card">
          <div className="ev-lv-card-head">
            <span className="ev-lv-card-copy">
              <h2 className="ev-h2">{t({ en: "For you", zh: "推荐给你" })}</h2>
              <span className="ev-lv-sub">{t({ en: "Attendees worth meeting, based on your interests, industry, and this event.", zh: "基于你的兴趣、行业和当前场景，为你推荐值得交流的参会者" })}</span>
            </span>
          </div>
          {viewModel.resultsState !== "ready" || recs.length === 0 ? (
            <ResultsBoundary t={t} viewModel={viewModel} />
          ) : (
            <div className="ev-lv-grid-220">
              {recs.map((person) => <PersonCard eventId={viewModel.eventId} key={person.id} onOpen={onOpen} open={open} person={person} t={t} variant="home" />)}
            </div>
          )}
        </section>

        <section className="ev-lv-card ev-lv-card-row">
          <div className="ev-lv-graph-summary">
            <span className="ev-lv-card-copy">
              <h2 className="ev-h2">{t({ en: "Graph", zh: "关系图谱" })}</h2>
              <span className="ev-lv-sub">{t({ en: "Explore your network at this event and find more connections.", zh: "探索你在本次活动中的人脉网络，发现更多潜在连接" })}</span>
            </span>
            <div className="ev-lv-ministats">
              <span className="ev-lv-ministat"><span className="ev-lv-ministat-icon">◎</span><span className="ev-lv-ministat-copy"><span className="ev-lv-ministat-label">{t({ en: "Connected", zh: "已认识" })}</span><strong className="ev-lv-ministat-n">{known}</strong></span></span>
            </div>
          </div>
          <button className="btn ev-lv-btn-ghost ev-lv-btn-14" onClick={() => go("graph")} type="button">{t({ en: "Open full graph →", zh: "查看完整图谱 →" })}</button>
        </section>
      </div>

      <div className="ev-lv-col">
        <section className="ev-lv-card ev-lv-card-22">
          <div className="ev-panel-head">
            <h2 className="ev-h2 ev-h2-20">{t({ en: "Current group", zh: "当前分组" })}</h2>
            <button className="btn ev-lv-link" onClick={() => go("group")} type="button">{t({ en: "Switch group", zh: "切换分组" })}</button>
          </div>
          {table ? (
            <>
              <div className="ev-lv-group-tile">
                <span className="ev-lv-group-icon">◎</span>
                <span className="ev-lv-group-copy">
                  <span className="ev-lv-group-row"><strong className="ev-lv-group-name">{tableLabel(table, t)}</strong><span className="ev-lv-group-round">{t({ en: `Round ${round} / ${roundCount}`, zh: `第 ${round} / ${roundCount} 轮` })}</span></span>
                  <span className="ev-lv-group-theme">{table.theme}</span>
                  <span className="ev-lv-progress"><span className="ev-lv-progress-fill" style={{ width: `${Math.round((round / roundCount) * 100)}%` }} /></span>
                </span>
              </div>
              <div className="ev-panel-head">
                <strong className="ev-lv-group-count">{t({ en: `Tablemates (${table.members.length})`, zh: `本桌参会者（${table.members.length} 人）` })}</strong>
                <button className="btn ev-lv-link" onClick={() => go("group")} type="button">{t({ en: "See all →", zh: "查看全部 →" })}</button>
              </div>
              <div className="ev-lv-mates">
                {table.members.slice(0, 6).map((member) => (
                  <button className="btn ev-lv-mate" data-live-open="attendee" key={member.id} onClick={() => onOpen("attendee", member)} type="button">
                    <Avatar initial={member.initial} size="48" />
                    <span className="ev-lv-mate-name">{member.name}</span>
                    <span className="ev-lv-mate-co">{member.company}</span>
                  </button>
                ))}
              </div>
              {table.icebreakers.length ? (
                <div className="ev-lv-ice">
                  <strong className="ev-lv-ice-title">{t({ en: "Icebreakers", zh: "破冰话题" })}</strong>
                  {table.icebreakers.map((line, index) => <span className="ev-lv-ice-line" key={`${index}-${line}`}>• {line}</span>)}
                </div>
              ) : null}
            </>
          ) : (
            <Empty>{t({ en: "No table has been published for you yet.", zh: "尚未为你发布分桌结果。" })}</Empty>
          )}
        </section>

        <section className="ev-lv-card ev-lv-card-22 ev-lv-card-agenda">
          <div className="ev-panel-head">
            <h2 className="ev-h2 ev-h2-20">{t({ en: "Agenda", zh: "流程议程" })}</h2>
            <button className="btn ev-lv-link" onClick={() => go("agenda")} type="button">{t({ en: "Full agenda →", zh: "查看完整议程 →" })}</button>
          </div>
          {viewModel.agenda.map((item, index) => {
            const state = AGENDA_STATE[statuses[index]];
            return (
              <div className="ev-lv-agenda-mini" data-live-agenda-status={statuses[index]} key={`${item.at}-${index}`} style={{ background: state.rowBg }}>
                <span className="ev-lv-agenda-mini-dotwrap"><span className="ev-lv-agenda-mini-dot" style={{ background: state.dotBg, borderColor: state.dotBorder }} /></span>
                <span className="ev-lv-agenda-mini-copy"><span className="ev-lv-agenda-mini-time">{formatJstClock(item.at)}</span><strong className="ev-lv-agenda-mini-title">{t(item.label)}</strong></span>
                <span aria-label={t(state.tag)} className="ev-lv-agenda-mini-mark" role="img" style={{ color: state.tagFg }}>{state.mark}</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

// ── 推荐给你（设计 320–360）──
function RecTab({ onOpen, t, viewModel }: { onOpen: OpenModal; t: Translate; viewModel: OrbitPartyViewModel }) {
  const recs = othersOnly(viewModel, viewModel.recommendations);
  const open = viewModel.eventPhase !== "upcoming";
  return (
    <div className="ev-lv-rec">
      <section className="ev-lv-card">
        <div className="ev-lv-card-head">
          <span className="ev-lv-card-copy">
            <h2 className="ev-h2">{t({ en: "Recommended attendees", zh: "为你推荐的参会者" })}</h2>
            <span className="ev-lv-sub">{t({ en: "Based on your interests, industry, and this event, find attendees worth meeting.", zh: "基于你的兴趣、行业和当前场景，发现值得交流的参会者" })}</span>
          </span>
        </div>
        {viewModel.resultsState !== "ready" || recs.length === 0 ? (
          <ResultsBoundary t={t} viewModel={viewModel} />
        ) : (
          <div className="ev-lv-grid-240">
            {recs.map((person) => <PersonCard eventId={viewModel.eventId} key={person.id} onOpen={onOpen} open={open} person={person} t={t} variant="rec" />)}
          </div>
        )}
      </section>
      <div className="ev-lv-col ev-lv-col-16">
        <section className="ev-lv-card ev-lv-card-22">
          <h2 className="ev-h2 ev-h2-20">✦ {t({ en: "How recommendations work", zh: "推荐说明" })}</h2>
          <div className="ev-lv-note"><span className="ev-icon-40">◎</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Smart matching", zh: "智能匹配" })}</strong><span className="ev-lv-note-desc">{t({ en: "Based on your interests, industry, profile, and this event's attendees.", zh: "基于你的兴趣、行业、个人资料和本次活动的参会者信息" })}</span></span></div>
          <div className="ev-lv-note"><span className="ev-icon-40">▮</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Quality connections", zh: "高质量连接" })}</strong><span className="ev-lv-note-desc">{t({ en: "We prioritise people who share topics with you and may lead to collaboration.", zh: "我们优先推荐与你有共同话题、可能产生合作机会的人" })}</span></span></div>
          <div className="ev-lv-note"><span className="ev-icon-40">◈</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Your privacy", zh: "你的隐私" })}</strong><span className="ev-lv-note-desc">{t({ en: "The other person only sees your details after you request an exchange.", zh: "只有在你主动申请交换后，对方才会收到你的信息" })}</span></span></div>
        </section>
      </div>
    </div>
  );
}

// ── 全部参会者（设计 361–390）──
function AllTab({ onOpen, t, viewModel }: { onOpen: OpenModal; t: Translate; viewModel: OrbitPartyViewModel }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const meId = viewModel.me.participantId;
  const people = useMemo(() => viewModel.attendees.filter((person) => person.id !== meId), [meId, viewModel.attendees]);
  const tags = useMemo(() => hotTags(people), [people]);
  const filtered = people.filter((person) => matchesPersonQuery(person, query));
  const paged = paginate(filtered, page, PAGE_SIZE);
  const open = viewModel.eventPhase !== "upcoming";
  return (
    <section className="ev-lv-card ev-lv-card-22 ev-lv-all">
      <div className="ev-lv-toolbar">
        <label className="ev-search ev-lv-search">
          <span aria-hidden="true" className="ev-search-icon">⌕</span>
          <input
            aria-label={t({ en: "Search attendees", zh: "搜索参会者" })}
            className="ev-search-input"
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder={t({ en: "Search by name, company, role, or keyword…", zh: "搜索参会者姓名、公司、职位或关键词…" })}
            type="search"
            value={query}
          />
        </label>
      </div>
      <div className="ev-lv-hot">
        {tags.length ? <>{t({ en: "Popular tags:", zh: "热门标签：" })}{tags.map((tag) => <button className="btn ev-lv-hot-tag" key={tag} onClick={() => { setQuery(tag); setPage(1); }} type="button">{tag}</button>)}</> : null}
        <span className="ev-lv-hot-total">{t({ en: `${filtered.length} attendees`, zh: `共 ${filtered.length} 位参会者` })}</span>
      </div>
      {paged.items.length ? (
        <div className="ev-lv-grid-250">
          {paged.items.map((person) => <PersonCard eventId={viewModel.eventId} key={person.id} onOpen={onOpen} open={open} person={person} t={t} variant="all" />)}
        </div>
      ) : (
        <Empty>{people.length ? t({ en: "No attendee matches this search.", zh: "没有匹配的参会者。" }) : t({ en: "No other attendee is registered yet.", zh: "还没有其他参会者报名。" })}</Empty>
      )}
      {paged.total > PAGE_SIZE ? (
        <div className="ev-lv-pages">
          <button aria-label={t({ en: "Previous page", zh: "上一页" })} className="btn ev-lv-page-arrow" disabled={paged.page === 1} onClick={() => setPage(paged.page - 1)} type="button">‹</button>
          {paged.pages.map((n) => (
            <button aria-current={paged.page === n ? "page" : undefined} className={`btn ev-lv-page ${paged.page === n ? "ev-lv-page-on" : ""}`} key={n} onClick={() => setPage(n)} type="button">{n}</button>
          ))}
          <button aria-label={t({ en: "Next page", zh: "下一页" })} className="btn ev-lv-page-arrow" disabled={paged.page === paged.pageCount} onClick={() => setPage(paged.page + 1)} type="button">›</button>
          <span className="ev-lv-page-size">{t({ en: `${PAGE_SIZE} per page`, zh: `每页 ${PAGE_SIZE} 条` })}</span>
        </div>
      ) : null}
    </section>
  );
}

// ── 分组（设计 391–434）──
function GroupCard({ current, onOpen, round, t, table }: { current: boolean; onOpen: OpenModal; round: 1 | 2; t: Translate; table: OrbitPartyTableView }) {
  return (
    <section className="ev-lv-card" data-live-round={round}>
      <div className="ev-lv-group-head">
        <h2 className="ev-h2">{current ? t({ en: "Current group", zh: "当前分组" }) : t({ en: `Round ${round} group`, zh: `第 ${round} 轮分组` })}</h2>
        {current ? <span className="ev-lv-group-live">● {t({ en: `Round ${round} in progress`, zh: `第 ${round} 轮进行中` })}</span> : null}
      </div>
      <div className="ev-lv-tiles">
        <div className="ev-lv-tile ev-lv-tile-16"><span className="ev-lv-tile-label-12">◎ {t({ en: "Table", zh: "当前桌号" })}</span><strong className="ev-lv-tile-n-20">{t({ en: `Table ${table.tableNumber}`, zh: `${table.tableNumber} 号桌` })}</strong><span className="ev-lv-tile-label-12">{table.seat}</span></div>
        <div className="ev-lv-tile ev-lv-tile-16"><span className="ev-lv-tile-label-12">◌ {t({ en: "Group size", zh: "本组人数" })}</span><strong className="ev-lv-tile-n-20">{t({ en: `${table.members.length + 1} people`, zh: `${table.members.length + 1} 人` })}</strong><span className="ev-lv-tile-label-12">{t({ en: "Including you", zh: "含你自己" })}</span></div>
        <div className="ev-lv-tile ev-lv-tile-16"><span className="ev-lv-tile-label-12"># {t({ en: "Theme", zh: "本组主题" })}</span><strong className="ev-lv-tile-n-17">{table.theme}</strong></div>
      </div>
      <div className="ev-panel-head">
        <strong className="ev-lv-members-title">{t({ en: `Members (${table.members.length})`, zh: `本组成员（${table.members.length} 人）` })}</strong>
      </div>
      <div className="ev-lv-grid-220 ev-lv-grid-12">
        {table.members.map((member) => (
          <button className="btn ev-lv-member" data-live-open="attendee" key={member.id} onClick={() => onOpen("attendee", member)} title={member.groupingRationale} type="button">
            <Avatar initial={member.initial} size="48" />
            <span className="ev-lv-member-copy">
              <span className="ev-lv-member-row"><strong className="ev-lv-member-name">{member.name}</strong></span>
              <span className="ev-lv-member-role">{roleDot(member)}</span>
              <Tags limit={2} tags={member.topics} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function GroupTab({ now, onOpen, t, viewModel }: { now: number; onOpen: OpenModal; t: Translate; viewModel: OrbitPartyViewModel }) {
  const round = currentRound(viewModel.agenda, Boolean(viewModel.roundTwo), now);
  const primary = round === 2 ? viewModel.roundTwo : viewModel.roundOne;
  const primaryRound: 1 | 2 = primary ? round : viewModel.roundOne ? 1 : 2;
  const shown = primary ?? viewModel.roundOne ?? viewModel.roundTwo;
  const other = shown === viewModel.roundOne ? viewModel.roundTwo : viewModel.roundOne;
  const otherRound: 1 | 2 = primaryRound === 1 ? 2 : 1;
  return (
    <div className="ev-lv-groups">
      <div className="ev-lv-col">
        {shown ? <GroupCard current={Boolean(primary)} onOpen={onOpen} round={primaryRound} t={t} table={shown} /> : (
          <section className="ev-lv-card">
            <h2 className="ev-h2">{t({ en: "Current group", zh: "当前分组" })}</h2>
            <ResultsBoundary t={t} viewModel={viewModel} />
          </section>
        )}
        {other ? <GroupCard current={false} onOpen={onOpen} round={otherRound} t={t} table={other} /> : null}
      </div>
      <section className="ev-lv-card ev-lv-card-22 ev-lv-rules">
        <h2 className="ev-h2 ev-h2-20">{t({ en: "Why this table", zh: "本轮分组说明" })}</h2>
        {shown ? (
          <>
            <div className="ev-lv-note"><span className="ev-lv-icon-round">◎</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Why you are at this table", zh: "你为什么被分到这桌" })}</strong><span className="ev-lv-note-desc-13" data-party-member-rationale="self">{shown.myRationale}</span></span></div>
            <div className="ev-lv-note"><span className="ev-lv-icon-round">▤</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Table rationale", zh: "分组逻辑" })}</strong><span className="ev-lv-note-desc-13">{shown.rationale}</span></span></div>
            {shown.memberPrompts.length ? (
              <div className="ev-lv-note"><span className="ev-lv-icon-round">✦</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Talking points", zh: "交流建议" })}</strong><span className="ev-lv-note-desc-13">{shown.memberPrompts.map((line, index) => <span className="ev-lv-note-line" key={`${index}-${line}`}>• {line}</span>)}</span></span></div>
            ) : null}
            {shown.icebreakers.length ? (
              <div className="ev-lv-tip"><span className="ev-lv-tip-icon">✦</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Icebreakers", zh: "全桌破冰" })}</strong><span className="ev-lv-tip-desc">{shown.icebreakers.map((line, index) => <span className="ev-lv-note-line" key={`${index}-${line}`}>• {line}</span>)}</span></span></div>
            ) : null}
            {shown.members.length ? (
              <div className="ev-lv-note"><span className="ev-lv-icon-round">◌</span><span className="ev-lv-note-copy"><strong className="ev-lv-note-title">{t({ en: "Member rationales", zh: "成员分组理由" })}</strong><span className="ev-lv-note-desc-13">{shown.members.map((member) => <span className="ev-lv-note-line" data-party-member-rationale={member.id} key={member.id}>• {member.name}：{member.groupingRationale}</span>)}</span></span></div>
            ) : null}
          </>
        ) : (
          <Empty>{t({ en: "Table rationales appear once the organizer publishes the grouping.", zh: "组织者发布分组后，这里会显示分桌理由与破冰话题。" })}</Empty>
        )}
      </section>
    </div>
  );
}

// ── 关系图谱（设计 435–477）──
function GraphTab({ go, onOpen, t, viewModel }: { go: (tab: LiveTab) => void; onOpen: OpenModal; t: Translate; viewModel: OrbitPartyViewModel }) {
  const graph = viewModel.graph;
  const meId = viewModel.me.participantId;
  const peopleById = useMemo(() => new Map(viewModel.attendees.map((person) => [person.id, person])), [viewModel.attendees]);
  const nodes = useMemo(() => (graph ? graph.nodes.filter((node) => node.participantId !== meId) : []), [graph, meId]);
  const layout = useMemo(() => graphLayout(nodes), [nodes]);
  const kinds = useMemo(
    () => nodes.map((node) => graphLegendKind(node, graph?.edges ?? [], viewModel.contactRequests, meId)),
    [graph, meId, nodes, viewModel.contactRequests],
  );
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.participantId ?? null);
  const selectedIndex = nodes.findIndex((node) => node.participantId === selectedId);
  const selectedNode = selectedIndex >= 0 ? nodes[selectedIndex] : null;
  const selectedPerson = selectedNode ? peopleById.get(selectedNode.participantId) ?? null : null;
  const selectedKind: GraphLegendKind | null = selectedIndex >= 0 ? kinds[selectedIndex] : null;
  const open = viewModel.eventPhase !== "upcoming";

  const known = viewModel.contactRequests.filter((request) => request.status === "accepted").length;
  const recommended = othersOnly(viewModel, viewModel.recommendations).length;
  const group = new Set([...(viewModel.roundOne?.members ?? []), ...(viewModel.roundTwo?.members ?? [])].map((member) => member.id)).size;
  const stats: { icon: string; label: { en: string; zh: string }; n: number; desc: { en: string; zh: string }; bg: string; fg: string }[] = [
    { icon: "◎", label: { en: "Connected", zh: "已认识" }, n: known, desc: { en: "Exchanged at this event", zh: "现场已建立联系" }, bg: "#E6F1EC", fg: "#2F6B4F" },
    { icon: "✦", label: { en: "Recommended", zh: "推荐认识" }, n: recommended, desc: { en: "Matched on interests and industry", zh: "基于兴趣和行业匹配" }, bg: "#ECEEFB", fg: "#7C4FC7" },
    { icon: "▦", label: { en: "Same table", zh: "同组成员" }, n: group, desc: { en: "Attendees grouped with you", zh: "与你同组的参会者" }, bg: "#ECEEFB", fg: "#4B4FC7" },
  ];

  return (
    <>
      <section className="ev-lv-card">
        <div className="ev-lv-graph-head">
          <span className="ev-lv-card-copy">
            <h2 className="ev-h2">{t({ en: "Live relationship graph", zh: "现场关系图谱" })}</h2>
            <span className="ev-lv-sub">{t({ en: "Explore the network at this event and discover more opportunities.", zh: "探索活动中的人脉网络，发现更多潜在的合作机会。" })}</span>
          </span>
          <div className="ev-lv-legend">
            {GRAPH_LEGEND.map((item) => <span className="ev-lv-legend-item" key={item.kind}><span className="ev-lv-legend-dot" style={{ background: item.color }} />{t(item.label)}</span>)}
          </div>
        </div>
        <div className="ev-lv-graph-grid">
          <div className="ev-lv-graph-area">
            {graph && nodes.length ? (
              <div className="ev-lv-graph-canvas">
                <span className="ev-lv-graph-ring ev-lv-graph-ring-300" />
                <span className="ev-lv-graph-ring ev-lv-graph-ring-200" />
                {layout.map((pos, index) => (
                  <span className="ev-lv-graph-line" key={`line-${nodes[index].participantId}`} style={{ background: graphLegendColor(kinds[index]), left: `${GRAPH_CX}px`, top: `${GRAPH_CY}px`, transform: `rotate(${pos.deg}deg)`, width: `${pos.len}px` }} />
                ))}
                {layout.map((pos, index) => {
                  const node = nodes[index];
                  const on = node.participantId === selectedId;
                  return (
                    <button
                      className="btn ev-lv-graph-node"
                      data-graph-participant={node.participantId}
                      key={node.participantId}
                      onClick={() => setSelectedId(node.participantId)}
                      style={{ boxShadow: on ? "0 0 0 3px #4B4FC7" : `0 0 0 2px ${graphLegendColor(kinds[index])}`, left: `${pos.left}px`, top: `${pos.top}px` }}
                      title={node.displayName}
                      type="button"
                    >
                      {peopleById.get(node.participantId)?.initial ?? node.displayName.slice(0, 1).toUpperCase()}
                    </button>
                  );
                })}
                <span className="ev-lv-graph-me" data-graph-participant={meId}>{viewModel.me.initial}</span>
                <span className="ev-lv-graph-me-label">{t({ en: "Me", zh: "我自己" })}</span>
              </div>
            ) : (
              <div className="ev-lv-graph-empty"><ResultsBoundary t={t} viewModel={viewModel} /></div>
            )}
          </div>
          <div className="ev-lv-gsel">
            {selectedNode ? (
              <>
                <div className="ev-lv-gsel-head">
                  <Avatar initial={selectedPerson?.initial ?? selectedNode.displayName.slice(0, 1).toUpperCase()} size="64" />
                  <span className="ev-lv-gsel-copy">
                    <strong className="ev-lv-gsel-name">{selectedNode.displayName}</strong>
                    <span className="ev-lv-gsel-role">{selectedPerson ? roleAt(selectedPerson) : selectedNode.company ?? ""}</span>
                    {selectedPerson ? <Tags tags={selectedPerson.topics} /> : null}
                  </span>
                </div>
                {selectedPerson?.summary ? (
                  <span className="ev-lv-gsel-block"><strong className="ev-lv-gsel-h">{t({ en: "About", zh: "关于对方" })}</strong><span className="ev-lv-gsel-bio">{selectedPerson.summary}</span></span>
                ) : null}
                <span className="ev-lv-gsel-block">
                  <span className="ev-lv-gsel-rel-row"><strong className="ev-lv-gsel-h">{t({ en: "Your relationship", zh: "你们的关系" })}</strong><span className="ev-lv-gsel-rel" style={{ color: graphLegendColor(selectedKind ?? "other") }}>● {t(GRAPH_LEGEND.find((item) => item.kind === selectedKind)?.label ?? { en: "Other", zh: "其他" })}</span></span>
                  {selectedPerson?.isRecommended && selectedPerson.reason ? <span className="ev-lv-gsel-rel-sub">{selectedPerson.reason}</span> : null}
                </span>
                {selectedPerson ? (
                  <span className="ev-lv-gsel-block">
                    <strong className="ev-lv-gsel-h">{t({ en: "Shared interests", zh: "共同兴趣" })}</strong>
                    {sharedTopics(selectedPerson.topics, viewModel.me.topics).length ? (
                      <span className="ev-lv-gsel-interests">{sharedTopics(selectedPerson.topics, viewModel.me.topics).map((topic, index) => <span className="ev-lv-gsel-interest" key={`${index}-${topic}`}>{topic}</span>)}</span>
                    ) : (
                      <span className="ev-lv-gsel-rel-sub">{t({ en: "No shared topic recorded.", zh: "暂无共同话题记录。" })}</span>
                    )}
                  </span>
                ) : null}
                {selectedPerson ? (
                  <div className="ev-lv-gsel-actions">
                    <ContactAction dark eventId={viewModel.eventId} onRequest={(target) => onOpen("exchange", target)} open={open} person={selectedPerson} t={t} />
                    <button className="btn ev-lv-btn-ghost ev-lv-btn-grow" data-live-open="attendee" onClick={() => onOpen("attendee", selectedPerson)} type="button">{t({ en: "Full profile →", zh: "查看完整资料 →" })}</button>
                  </div>
                ) : null}
              </>
            ) : (
              <Empty>{t({ en: "Select a node to see who they are.", zh: "点击节点查看对方信息。" })}</Empty>
            )}
          </div>
        </div>
      </section>
      <section className="ev-lv-card ev-lv-card-16">
        <div className="ev-panel-head">
          <span className="ev-lv-card-copy">
            <h2 className="ev-h2">{t({ en: "Graph insights", zh: "图谱洞察" })}</h2>
            <span className="ev-lv-sub">{t({ en: "Counts from this event's published data, to help you grow your network.", zh: "基于现场人脉数据的统计，帮助你更好地拓展关系网络。" })}</span>
          </span>
        </div>
        <div className="ev-lv-grid-220">
          {stats.map((stat) => (
            <button className="btn ev-lv-stat" key={stat.label.zh} onClick={() => go("all")} type="button">
              <span className="ev-lv-stat-icon" style={{ background: stat.bg, color: stat.fg }}>{stat.icon}</span>
              <span className="ev-lv-stat-copy"><span className="ev-lv-stat-label">{t(stat.label)}</span><strong className="ev-lv-stat-n">{stat.n}</strong><span className="ev-lv-stat-desc">{t(stat.desc)}</span></span>
              <span className="ev-lv-stat-caret">›</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

// ── 流程议程（设计 478–519）──
function AgendaTab({ language, now, t, viewModel }: { language: EventListLanguage; now: number; t: Translate; viewModel: OrbitPartyViewModel }) {
  const statuses = agendaStatus(viewModel.agenda, now);
  const currentIndex = statuses.indexOf("now");
  const current: OrbitPartyAgendaItemView | null = currentIndex >= 0 ? viewModel.agenda[currentIndex] : null;
  return (
    <div className="ev-lv-agenda">
      <section className="ev-lv-card">
        <div className="ev-lv-agenda-head">
          <span className="ev-lv-card-copy">
            <h2 className="ev-h2">{t({ en: "Event agenda", zh: "活动流程议程" })}</h2>
            <span className="ev-lv-sub">{t({ en: "Follow every session and never miss what matters.", zh: "把握每个精彩环节，不错过重要内容" })}</span>
          </span>
          <span className="ev-lv-sub"><span className="ev-lv-now-dot">●</span> {t({ en: "Now:", zh: "当前时间：" })}{formatJstStamp(now, language)}</span>
        </div>
        <div className="ev-lv-agenda-list">
          {viewModel.agenda.map((item, index) => {
            const state = AGENDA_STATE[statuses[index]];
            const last = index === viewModel.agenda.length - 1;
            return (
              <div className="ev-lv-agenda-row" data-live-agenda-status={statuses[index]} key={`${item.at}-${index}`} style={{ background: state.rowBg }}>
                <span className="ev-lv-agenda-time"><time dateTime={item.at}>{formatJstClock(item.at)}</time></span>
                <span className="ev-lv-agenda-rail">
                  <span className="ev-lv-agenda-dot" style={{ background: state.dotBg, borderColor: state.dotBorder }}>{state.mark}</span>
                  {last ? null : <span className="ev-lv-agenda-line" />}
                </span>
                <div className="ev-lv-agenda-body">
                  <span className="ev-lv-agenda-title-row"><strong className="ev-lv-agenda-title">{t(item.label)}</strong><span className="ev-lv-agenda-tag" style={{ background: state.tagBg, color: state.tagFg }}>{t(state.tag)}</span></span>
                  <span className="ev-lv-agenda-desc">{t(item.description)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="ev-lv-col ev-lv-col-16">
        <section className="ev-lv-card ev-lv-card-22 ev-lv-card-12">
          <h2 className="ev-h2 ev-h2-20">{t({ en: "Current session", zh: "当前环节说明" })}</h2>
          {current ? (
            <>
              <span className="ev-lv-now-chip">{t({ en: "Now", zh: "进行中" })}</span>
              <strong className="ev-lv-now-title">{t(current.label)}</strong>
              <p className="ev-lv-now-desc">{t(current.description)}</p>
            </>
          ) : (
            <Empty>{t({ en: "No session is in progress right now.", zh: "当前没有进行中的环节。" })}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

// ── 页面 ──
export function EventLive({ initialTab = "home", now, viewModel }: { initialTab?: LiveTab; now: string; viewModel: OrbitPartyViewModel }) {
  const { language, t } = useOrbitLanguage();
  const lang = listLanguage(language);
  const [tab, setTab] = useState<LiveTab>(initialTab);
  const [nowIso, setNowIso] = useState(now);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNowIso(new Date().toISOString());
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const nowMs = Date.parse(nowIso);
  const go = (next: LiveTab) => {
    setTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "home") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url);
    }
  };
  const chip = STATUS_CHIP[viewModel.eventPhase];
  const detailHref = eventDetailHref(viewModel.eventId);
  const [modal, setModal] = useState<EventModalState | null>(null);
  const { toast, showToast } = useEventToast();
  const onOpen: OpenModal = useCallback((kind, person) => setModal({ kind, person }), []);
  const closeModal = useCallback(() => setModal(null), []);
  const open = viewModel.eventPhase !== "upcoming";
  const eventDate = formatEventDateRange({ endsAt: viewModel.eventEndsAt, startsAt: viewModel.eventStartsAt }, lang, true);

  return (
    <main className="ev-main" data-appscroll data-events-view="live" data-live-tab={tab} data-orbit-route="app-event-live">
      <style>{EVENTS_STYLES}</style>
      <div className="ev-lv">
        <div className="ev-lv-topbar">
          <a className="btn ev-back" href="/app/events">← {t({ en: "Back to events", zh: "返回活动列表" })}</a>
          <div className="ev-lv-topbar-actions">
            <a className="btn ev-lv-btn-dark ev-lv-btn-14" data-live-action="detail" href={detailHref}>{t({ en: "Event details", zh: "活动详情" })}</a>
          </div>
        </div>
        <div className="ev-lv-hero">
          <EventCover className="ev-lv-cover" g={gradientFromString(viewModel.eventName || viewModel.eventId)} imageAlt={viewModel.eventName} imageLoading="eager" monogram={null}>
            <span className="ev-lv-cover-title">{viewModel.eventName}</span>
          </EventCover>
          <div className="ev-lv-hero-copy">
            <span className="ev-chip ev-chip-hero" style={{ background: chip.bg, color: chip.fg }}>{t(chip.label)}</span>
            <h1 className="ev-lv-h1">{viewModel.eventName} · {t({ en: "Live", zh: "现场" })}</h1>
            <span className="ev-lv-meta"><span aria-hidden="true" className="ev-info-icon">▦</span>{formatEventDateRange({ endsAt: viewModel.eventEndsAt, startsAt: viewModel.eventStartsAt }, lang, true)}</span>
            {viewModel.eventVenue ? <span className="ev-lv-meta"><span aria-hidden="true" className="ev-info-icon">◎</span>{viewModel.eventVenue}</span> : null}
            <span className="ev-lv-meta"><span aria-hidden="true" className="ev-info-icon">◌</span>{t({ en: `${viewModel.attendees.length} attendees`, zh: `${viewModel.attendees.length} 位参会者` })}</span>
          </div>
        </div>
        <LiveTabs active={tab} onSelect={go} t={t} />
        <div className="ev-lv-body" data-live-panel={tab}>
          {tab === "home" ? <HomeTab go={go} now={nowMs} onOpen={onOpen} t={t} viewModel={viewModel} /> : null}
          {tab === "rec" ? <RecTab onOpen={onOpen} t={t} viewModel={viewModel} /> : null}
          {tab === "all" ? <AllTab onOpen={onOpen} t={t} viewModel={viewModel} /> : null}
          {tab === "group" ? <GroupTab now={nowMs} onOpen={onOpen} t={t} viewModel={viewModel} /> : null}
          {tab === "graph" ? <GraphTab go={go} onOpen={onOpen} t={t} viewModel={viewModel} /> : null}
          {tab === "agenda" ? <AgendaTab language={lang} now={nowMs} t={t} viewModel={viewModel} /> : null}
        </div>
      </div>
      {toast ? <EventsToast text={toast} /> : null}
      {modal?.kind === "attendee" ? (
        <EventAttendeeModal
          eventDate={eventDate}
          eventId={viewModel.eventId}
          eventName={viewModel.eventName}
          onClose={closeModal}
          onExchange={(person) => onOpen("exchange", person)}
          onNote={(person) => onOpen("note", person)}
          onSchedule={(person) => onOpen("schedule", person)}
          open={open}
          person={modal.person}
          t={t}
        />
      ) : null}
      {modal?.kind === "exchange" ? (
        <EventExchangeModal
          eventId={viewModel.eventId}
          me={viewModel.me}
          onClose={closeModal}
          onNote={(person) => onOpen("note", person)}
          onSchedule={(person) => onOpen("schedule", person)}
          open={open}
          person={modal.person}
          t={t}
        />
      ) : null}
      {modal?.kind === "schedule" ? (
        <EventScheduleModal
          eventId={viewModel.eventId}
          eventVenue={viewModel.eventVenue}
          language={lang}
          me={viewModel.me}
          now={nowMs}
          onClose={closeModal}
          onSent={(person) => { closeModal(); showToast(t({ en: `Invitation sent — waiting for ${person.name} to confirm`, zh: `邀约已发送，等待 ${person.name} 确认` })); }}
          person={modal.person}
          t={t}
        />
      ) : null}
      {modal?.kind === "note" ? (
        <EventNoteModal
          eventId={viewModel.eventId}
          onClose={closeModal}
          onOpenProfile={(person) => onOpen("attendee", person)}
          onSaved={(person) => { closeModal(); showToast(t({ en: `Saved your note about ${person.name}`, zh: `已保存与 ${person.name} 的交流记录` })); }}
          person={modal.person}
          t={t}
        />
      ) : null}
    </main>
  );
}
