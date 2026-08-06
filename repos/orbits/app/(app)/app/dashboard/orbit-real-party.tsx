"use client";

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { OrbitPartyPersonView, OrbitPartyViewModel } from "../orbit-party-route-view-model";
import type { EventParticipantDetailView } from "../../../../features/events/event-operations/participant-detail";
import { useOrbitLanguage } from "../orbit-language-context";
import { ModalShell } from "../orbit-account-shell";
import {
  partyHrefForEvent,
  productHref,
} from "../orbit-product-href";
import { PublicTopNav } from "../orbit-public-shell";
import { Icon, Logo } from "../orbit-reference-primitives";
import { ORBIT_Z } from "../orbit-z";
import {
  EventCheckInControl,
  EventContactRequestControl,
} from "../party/event-operations-controls";
import { formatOrbitPartyDateTime } from "../party/party-date-time";

type Translate = (copy: { en: string; zh: string }) => string;

type PartyTab = "home" | "recommendations" | "attendees" | "table" | "graph" | "agenda";

/** Roving keyboard navigation for the party tablists (Arrow / Home / End). */
function handlePartyTabKey(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  tabs: Array<[PartyTab, string, string]>,
  current: PartyTab,
  setTab: (tab: PartyTab) => void,
) {
  const keys = tabs.map((entry) => entry[0]);
  const index = keys.indexOf(current);
  let nextIndex: number | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % keys.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + keys.length) % keys.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = keys.length - 1;

  if (nextIndex === null) return;
  event.preventDefault();

  const nextKey = keys[nextIndex];
  setTab(nextKey);
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-party-tab="${nextKey}"]`)?.focus();
    });
  }
}
const partyReturnStorageKey = "orbit-party-return-url";

function navigateTo(path: string) {
  window.location.href = path;
}

function navigatePrototype(prototypeHref: string) {
  navigateTo(productHref(prototypeHref));
}

function returnToBeforeParty() {
  const stored = window.sessionStorage.getItem(partyReturnStorageKey);
  window.sessionStorage.removeItem(partyReturnStorageKey);

  if (stored) {
    try {
      const url = new URL(stored, window.location.origin);

      if (url.origin === window.location.origin) {
        window.location.replace(url.href);
        return;
      }
    } catch {
      // Ignore invalid stored return targets and fall back to the events list.
    }
  }

  window.location.replace(productHref("/events"));
}

function PartyReturnButton({ onExit, t }: { onExit: () => void; t: Translate }) {
  return (
    <button aria-label={t({ en: "Back to event", zh: "返回活动" })} className="orbit-party-return-icon hit-44" onClick={onExit} type="button">
      <Icon name="chevL" size={20} />
    </button>
  );
}

function PartyMobileTopTabs({
  onExit,
  setTab,
  t,
  tab,
  viewModel,
}: {
  onExit: () => void;
  setTab: (tab: PartyTab) => void;
  t: Translate;
  tab: PartyTab;
  viewModel: OrbitPartyViewModel;
}) {
  const tabs: Array<[PartyTab, string, string]> = [
    ["home", "home", t({ en: "Live home", zh: "现场主页" })],
    ["recommendations", "sparkle", t({ en: "For you", zh: "推荐给你" })],
    ["attendees", "users", t({ en: "All attendees", zh: "全部参会者" })],
    ...(viewModel.me.groupNumber !== null && viewModel.me.seat
      ? [["table", "seat", t({ en: "Groups", zh: "分组" })] as [PartyTab, string, string]]
      : []),
    ["graph", "network", t({ en: "Graph", zh: "关系图谱" })],
    ["agenda", "clock", t({ en: "Agenda", zh: "流程议程" })],
  ];

  return (
    <header className="orbit-party-top-tabs orbit-mobile-only">
      <PartyReturnButton onExit={onExit} t={t} />
      <div className="orbit-party-top-tab-list" role="tablist" aria-label={t({ en: "Event pages", zh: "活动页面" })}>
        {tabs.map(([key, icon, label]) => {
          const selected = tab === key;
          return (
            <button
              aria-selected={selected}
              className={`chip orbit-party-top-tab${selected ? " is-active" : ""}`}
              data-party-tab={key}
              key={key}
              onClick={() => setTab(key)}
              onKeyDown={(event) => handlePartyTabKey(event, tabs, key, setTab)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <Icon name={icon} size={15} stroke={selected ? 2 : 1.7} />
              {label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function PartyDesktopChrome({
  onExit,
  setTab,
  t,
  tab,
  viewModel,
}: {
  onExit: () => void;
  setTab: (tab: PartyTab) => void;
  t: Translate;
  tab: PartyTab;
  viewModel: OrbitPartyViewModel;
}) {
  const tabs: Array<[PartyTab, string, string]> = [
    ["home", "home", t({ en: "Live home", zh: "现场主页" })],
    ["recommendations", "sparkle", t({ en: "For you", zh: "推荐给你" })],
    ["attendees", "users", t({ en: "All attendees", zh: "全部参会者" })],
    ...(viewModel.me.groupNumber !== null && viewModel.me.seat
      ? [["table", "grid", t({ en: "Groups", zh: "分组" })] as [PartyTab, string, string]]
      : []),
    ["graph", "network", t({ en: "Graph", zh: "关系图谱" })],
    ["agenda", "clock", t({ en: "Agenda", zh: "流程议程" })],
  ];

  return (
    <div className="orbit-party-desktop-chrome orbit-desktop-only">
      <div className="orbit-party-desktop-head">
        <button className="orbit-party-exit-button" onClick={onExit} type="button">
          <Icon name="chevL" size={18} />
          {t({ en: "Exit event", zh: "退出活动" })}
        </button>
        <div className="orbit-party-event-mark">{t({ en: "E", zh: "活" })}</div>
        <div className="orbit-party-event-title">
          <strong>{t({ en: "Live event", zh: "活动现场" })}</strong>
          <span>
            {viewModel.me.seat
              ? `${t({ en: "Your seat", zh: "你的座位" })} ${viewModel.me.seat}`
              : t({ en: "No source-backed seat assignment", zh: "暂无来源可核验的座位安排" })}
          </span>
        </div>
        {viewModel.eventPhase === "ended" ? (
          <span className="orbit-party-ended-pill">{t({ en: "Ended", zh: "已结束" })}</span>
        ) : null}
      </div>
      <nav aria-label={t({ en: "Event pages", zh: "活动内部页面" })} className="orbit-party-desktop-tabs" role="tablist">
        {tabs.map(([key, icon, label]) => {
          const selected = tab === key;
          return (
            <button
              aria-selected={selected}
              className={`orbit-party-desktop-tab${selected ? " is-active" : ""}`}
              data-party-tab={key}
              key={key}
              onClick={() => setTab(key)}
              onKeyDown={(event) => handlePartyTabKey(event, tabs, key, setTab)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <Icon name={icon} size={18} stroke={selected ? 2 : 1.7} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function NetworkPerson({
  contactRequestsOpen,
  eventId,
  onSelect,
  p,
  t,
}: {
  contactRequestsOpen: boolean;
  eventId: string;
  onSelect: (person: OrbitPartyPersonView) => void;
  p: OrbitPartyPersonView;
  t: Translate;
}) {
  return (
    <article className="orbit-party-network-person card" style={{ minWidth: 0, position: "relative" }}>
      <button
        aria-label={t({ en: `View ${p.name}'s details`, zh: `查看 ${p.name} 的详情` })}
        data-party-person-open={p.id}
        onClick={() => onSelect(p)}
        style={{ background: "transparent", border: 0, cursor: "pointer", inset: 0, padding: 0, position: "absolute", zIndex: 0 }}
        type="button"
      />
      <span className={`avatar ${p.g} orbit-party-network-avatar`} style={{ pointerEvents: "none", position: "relative", zIndex: 1 }}>{p.initial}</span>
      <div className="orbit-party-network-person-body" style={{ pointerEvents: "none", position: "relative", zIndex: 1 }}>
        <div className="orbit-party-network-person-top">
          <span className="h-section orbit-party-network-person-name">{p.name}</span>
          {p.groupNumber !== null && p.seat ? (
            <span className="chip orbit-party-network-seat" style={{ height: 24 }}>
              {t({ en: `Group ${p.groupNumber}`, zh: `第${p.groupNumber}组` })} · {p.seat}
            </span>
          ) : null}
        </div>
        <span className="orbit-party-network-person-meta">
          {p.title} · {p.company}
        </span>
        <div className="orbit-party-network-person-summary">{p.reason}</div>
        <div className="orbit-party-network-tags" style={{ minWidth: 0 }}>
          <span className="chip chip-accent" style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>{p.industry}</span>
          {p.topics.map((topic) => (
            <span className="chip" key={topic} style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>
              {topic}
            </span>
          ))}
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 12, pointerEvents: "auto", position: "relative", zIndex: 2 }}>
          <EventContactRequestControl contactRequestsOpen={contactRequestsOpen} eventId={eventId} person={p} t={t} />
        </div>
      </div>
    </article>
  );
}

function partyParticipants(viewModel: OrbitPartyViewModel) {
  return viewModel.attendees.filter(
    (person) => person.id !== viewModel.me.participantId,
  );
}

function PartyResultsBoundary({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const content = {
    failed: {
      icon: "alert",
      title: t({ en: "AI generation failed", zh: "AI 生成失败" }),
      detail:
        viewModel.generationNotice?.errorMessage ??
        t({ en: "The organizer can retry failed shards. No substitute result was published.", zh: "组织者可重试失败分片；系统没有发布替代结果。" }),
    },
    locked: {
      icon: "lock",
      title: t({ en: "Results are not open yet", zh: "结果尚未开放" }),
      detail: t({
        en: `Results open at ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)}.`,
        zh: `结果将在 ${formatOrbitPartyDateTime(viewModel.resultsAvailableAt)} 开放。`,
      }),
    },
    not_generated: {
      icon: "clock",
      title: t({ en: "Results have not been generated", zh: "结果尚未生成" }),
      detail: t({ en: "The organizer has not published an AI generation for this registration snapshot.", zh: "组织者尚未为当前报名快照发布 AI 生成结果。" }),
    },
    processing: {
      icon: "clock",
      title: t({ en: "AI generation is processing", zh: "AI 正在生成" }),
      detail: t({ en: "The result will appear only after every shard succeeds and the organizer publishes it.", zh: "只有全部分片成功且组织者发布后，结果才会出现。" }),
    },
    ready: {
      icon: "sparkle",
      title: t({ en: "No recommended match", zh: "暂无推荐匹配" }),
      detail:
        viewModel.recommendationNoMatchReason ??
        t({ en: "The published AI result did not return a match for this participant.", zh: "已发布的 AI 结果未为该参会者返回匹配。" }),
    },
  }[viewModel.resultsState];

  return (
    <div className="card" role="status" style={{ display: "grid", gap: 10, padding: 18 }}>
      <Icon color="var(--accent)" name={content.icon} size={22} />
      <strong>{content.title}</strong>
      <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>{content.detail}</span>
      {viewModel.generationNotice?.errorCode ? (
        <span className="mono" style={{ color: "var(--rose)", fontSize: 11 }}>{viewModel.generationNotice.errorCode}</span>
      ) : null}
    </div>
  );
}

function PartyEventWindows({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const eventProfileHref = `/app/events/${encodeURIComponent(viewModel.eventId)}/register`;
  const profileStatusId = `party-event-profile-status-${viewModel.eventId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;

  return (
    <section aria-label={t({ en: "Event matching schedule", zh: "活动匹配时间" })} className="card" data-party-event-windows style={{ display: "grid", gap: 14, marginTop: 14, padding: 18 }}>
      <div style={{ alignItems: "start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">MATCHING TIMELINE</div>
          <h2 className="h-section" style={{ margin: "6px 0 0" }}>
            {t({ en: "Your event persona and results", zh: "你的活动画像与匹配结果" })}
          </h2>
        </div>
        <span className={`chip${viewModel.profileEditable ? " chip-accent" : ""}`}>
          {viewModel.profileEditable
            ? t({ en: "Persona editable", zh: "画像可编辑" })
            : t({ en: "Persona locked", zh: "画像已锁定" })}
        </span>
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", display: "grid", gap: 5, padding: 12 }}>
          <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>
            {t({ en: "PERSONA EDIT DEADLINE", zh: "画像编辑截止" })}
          </span>
          <time dateTime={viewModel.profileEditDeadlineAt} style={{ fontWeight: 650 }}>
            {formatOrbitPartyDateTime(viewModel.profileEditDeadlineAt)}
          </time>
        </div>
        <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", display: "grid", gap: 5, padding: 12 }}>
          <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>
            {t({ en: "RESULTS OPEN", zh: "结果开放时间" })}
          </span>
          <time dateTime={viewModel.resultsAvailableAt} style={{ fontWeight: 650 }}>
            {formatOrbitPartyDateTime(viewModel.resultsAvailableAt)}
          </time>
        </div>
      </div>
      {viewModel.profileEditable ? (
        <a aria-describedby={profileStatusId} className="btn btn-primary" data-event-profile-action="edit" href={eventProfileHref}>
          <Icon color="var(--on-dark)" name="edit" size={16} />
          {t({ en: "Edit event persona", zh: "编辑本场活动画像" })}
        </a>
      ) : (
        <button aria-describedby={profileStatusId} className="btn btn-ghost" data-event-profile-action="locked" disabled type="button">
          <Icon name="lock" size={16} />
          {t({ en: "Event persona is read only", zh: "本场活动画像仅可查看" })}
        </button>
      )}
      <p id={profileStatusId} role="status" style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.6, margin: 0 }}>
        {viewModel.profileEditable
          ? t({
              en: "Changes saved before the deadline are included in the frozen matching snapshot.",
              zh: "截止时间前保存的修改会进入冻结的匹配快照。",
            })
          : t({
              en: "The persona deadline has been reached. This event persona is locked so the published matching snapshot cannot change.",
              zh: "画像截止时间已到；本场活动画像已锁定，以确保已发布的匹配快照不再变化。",
            })}
      </p>
    </section>
  );
}

function PartyHome({ go, t, viewModel }: { go: (tab: PartyTab) => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const first = viewModel.recommendations[0];

  return (
    <div className="orbit-party-home-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 32px" }}>
      <div className="card" style={{ marginTop: 12, overflow: "hidden", padding: 20, position: "relative" }}>
        {viewModel.eventPhase === "active" ? (
          <span className="badge badge-live" style={{ position: "absolute", right: 16, top: 16 }}>
            <span className="dot dot-live" />
            {t({ en: "Live", zh: "进行中" })}
          </span>
        ) : viewModel.eventPhase === "upcoming" ? (
          <span className="badge badge-soon" style={{ position: "absolute", right: 16, top: 16 }}>
            {t({ en: "Upcoming", zh: "即将开始" })}
          </span>
        ) : (
          <span className="badge badge-ended" style={{ position: "absolute", right: 16, top: 16 }}>
            {t({ en: "Ended", zh: "已结束" })}
          </span>
        )}
        <div className="eyebrow">
          {viewModel.eventPhase === "ended"
            ? t({ en: "RECAP · On site", zh: "回顾 · 现场" })
            : `TONIGHT · ${t({ en: "On site", zh: "现场" })}`}
        </div>
        <h1 className="h-display" style={{ margin: "8px 0 0" }}>
          {t({ en: "Good evening, ", zh: "晚上好，" })}
          {viewModel.me.initial}
        </h1>
        <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>{`${viewModel.eventName} · ${viewModel.eventVenue}`}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" disabled={!viewModel.checkInAvailable || viewModel.eventPhase === "ended"} onClick={() => navigateTo(partyHrefForEvent(viewModel.eventId, "/checkin"))} style={{ flex: "1 1 0%" }}>
            <Icon color="var(--on-dark)" name="ticket" size={16} />
            {viewModel.checkedInAt
              ? t({ en: "Checked in", zh: "已签到" })
              : !viewModel.checkInAvailable
              ? t({ en: "Check-in unavailable", zh: "暂不支持签到" })
              : viewModel.eventPhase === "ended"
              ? t({ en: "Check-in closed", zh: "签到已结束" })
              : t({ en: "Check in", zh: "签到" })}
          </button>
          <button className="btn btn-ghost" disabled={!viewModel.me.seat || viewModel.me.groupNumber === null} onClick={() => go("table")} style={{ flex: "1 1 0%" }}>
            <Icon name="seat" size={16} />
            {viewModel.me.seat
              ? `${t({ en: "My seat", zh: "我的座位" })} ${viewModel.me.seat}`
              : t({ en: "Seat not assigned", zh: "尚未分配座位" })}
          </button>
        </div>
      </div>
      <PartyEventWindows t={t} viewModel={viewModel} />
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", margin: "24px 0 12px" }}>
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "People recommended for you", zh: "为你推荐的人脉" })}
        </h2>
        <button
          onClick={() => go("recommendations")}
          style={{ alignItems: "center", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 600, gap: 2, padding: "1px 6px" }}
          type="button"
        >
          {t({ en: "All", zh: "全部" })}
          <Icon name="chevR" size={14} />
        </button>
      </div>
      {first ? <div className="card" style={{ padding: 18 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
          <span className={`avatar ${first.g}`} style={{ fontSize: 24, height: 56, width: 56 }}>
            {first.initial}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <span className="h-section" style={{ color: "var(--ink)", fontSize: 17 }}>
                {first.name}
              </span>
              <span className="chip chip-accent" style={{ height: 22 }}>
                {t({ en: "Match", zh: "匹配" })} {first.score}
              </span>
            </div>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>
              {first.title} · {first.company}
            </div>
          </div>
        </div>
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 14, padding: 13 }}>
          <Icon color="var(--accent)" name="sparkle" size={17} style={{ flexShrink: 0, height: 17, marginTop: 1, width: 17 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>{t({ en: "Why recommended", zh: "为什么推荐" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{first.reason}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--ink)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>{t({ en: "Icebreakers", zh: "破冰问题" })}</div>
          {first.icebreakers.map((question, index) => (
            <div key={question} style={{ display: "flex", gap: 10, marginBottom: 7 }}>
              <span className="mono" style={{ alignItems: "center", background: "var(--surface-2)", borderRadius: "var(--r-pill)", color: "var(--text-3)", display: "flex", flexShrink: 0, fontSize: 11, height: 22, justifyContent: "center", width: 22 }}>
                0{index + 1}
              </span>
              <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>{question}</span>
            </div>
          ))}
        </div>
      </div> : <PartyResultsBoundary t={t} viewModel={viewModel} />}
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", margin: "24px 0 12px" }}>
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Tonight's agenda", zh: "今晚流程" })}
        </h2>
      </div>
      <div className="card" style={{ padding: 18 }}>
        {viewModel.agenda.map((item, index) => (
          <div key={item.time} style={{ display: "flex", gap: 14, paddingBottom: index < viewModel.agenda.length - 1 ? 16 : 0 }}>
            <div style={{ alignItems: "center", display: "flex", flexDirection: "column" }}>
              <span style={{ background: index === 2 ? "var(--accent)" : "var(--surface)", border: `2px solid ${index === 2 ? "var(--accent)" : "var(--border-strong)"}`, borderRadius: "var(--r-pill)", height: 11, width: 11 }} />
              {index < viewModel.agenda.length - 1 ? <span style={{ background: "var(--border-2)", flex: 1, marginTop: 4, width: 2 }} /> : null}
            </div>
            <div style={{ marginTop: -3 }}>
              <div style={{ alignItems: "baseline", display: "flex", gap: 10 }}>
                <span className="mono" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
                  {item.time}
                </span>
                <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{t(item.label)}</span>
                {/* UI-audit fix C10 (second source). The agenda marked its third
                    row "进行中" purely by array index, with no reference to the
                    clock or the event state — so an event that had already
                    ended still showed an item in progress, right below a badge
                    saying the event was over. Gating on the phase removes the
                    contradiction; which specific row is live is still an index
                    heuristic rather than a time comparison. */}
                {index === 2 && viewModel.eventPhase === "active" ? (
                  <span className="badge badge-live" style={{ height: 20 }}>
                    {t({ en: "Live", zh: "进行中" })}
                  </span>
                ) : null}
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 3 }}>{t(item.description)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyRoundTableCard({
  label,
  table,
  t,
}: {
  label: string;
  table: NonNullable<OrbitPartyViewModel["roundOne"]>;
  t: Translate;
}) {
  return (
    <section className="card" style={{ display: "grid", gap: 18, marginTop: 16, padding: 20 }}>
      <div style={{ alignItems: "start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div>
          <div className="eyebrow">{label}</div>
          <h2 className="h-title" style={{ margin: "8px 0 0" }}>
            {t({ en: `Table ${table.tableNumber}`, zh: `第 ${table.tableNumber} 桌` })} · {table.theme}
          </h2>
        </div>
        <span className="chip chip-accent">{t({ en: "Your seat", zh: "你的座位" })} {table.seat}</span>
      </div>
      <p style={{ color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>{table.rationale}</p>
      <div style={{ background: "var(--accent-softer)", borderRadius: 12, padding: 14 }}>
        <strong style={{ color: "var(--accent)", fontSize: 13 }}>
          {t({ en: "Why you are at this table", zh: "你为什么被分到这桌" })}
        </strong>
        <p data-party-member-rationale="self" style={{ color: "var(--text-2)", lineHeight: 1.6, margin: "8px 0 0" }}>
          {table.myRationale}
        </p>
      </div>
      <div>
        <div className="orbit-party-table-block-head">
          <Icon name="sparkle" size={16} />
          {t({ en: "Table icebreakers", zh: "全桌破冰" })}
        </div>
        <div className="orbit-party-table-icebreaker-list">
          {table.icebreakers.map((question, index) => (
            <div className="orbit-party-table-icebreaker-item" key={question}>
              <span>0{index + 1}</span>
              <p>{question}</p>
            </div>
          ))}
        </div>
      </div>
      {table.memberPrompts.length ? (
        <div style={{ background: "var(--accent-softer)", borderRadius: 12, padding: 14 }}>
          <strong style={{ color: "var(--accent)", fontSize: 13 }}>{t({ en: "Your conversation prompts", zh: "你的对话提示" })}</strong>
          {table.memberPrompts.map((prompt) => <p key={prompt} style={{ color: "var(--text-2)", lineHeight: 1.6, margin: "8px 0 0" }}>{prompt}</p>)}
        </div>
      ) : null}
      <div className="orbit-party-table-member-list">
        {table.members.map((mate) => (
          <div className="orbit-party-table-member" key={mate.id}>
            <span className={`avatar ${mate.g}`} style={{ fontSize: 18, height: 44, width: 44 }}>{mate.initial}</span>
            <div className="orbit-party-table-member-body">
              <div className="orbit-party-table-member-name">{mate.name} · {mate.title}</div>
              <div className="orbit-party-table-member-meta">{mate.company}{mate.seat ? ` · ${t({ en: "Seat", zh: "座位" })} ${mate.seat}` : ""}</div>
              <div className="orbit-party-table-member-prompt" data-party-member-rationale={mate.id}>
                <span>{t({ en: "Why this member", zh: "成员分组理由" })}</span>
                {mate.groupingRationale}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PartyTable({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  return (
    <div className="orbit-party-table-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-table-header">
        <div>
          <div className="eyebrow">TWO AI ROUNDS</div>
          <h1 className="h-display orbit-party-table-title">{t({ en: "Your table assignments", zh: "你的双轮桌次" })}</h1>
        </div>
      </div>
      {viewModel.roundOne ? <PartyRoundTableCard label="ROUND 01 · COMPLEMENTARY" table={viewModel.roundOne} t={t} /> : null}
      {viewModel.roundTwo ? <PartyRoundTableCard label="ROUND 02 · TOPIC" table={viewModel.roundTwo} t={t} /> : null}
      {!viewModel.roundOne && !viewModel.roundTwo ? <PartyResultsBoundary t={t} viewModel={viewModel} /> : null}
    </div>
  );
}

function PartyRecommendations({ onSelect, t, viewModel }: { onSelect: (person: OrbitPartyPersonView) => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const [industry, setIndustry] = useState("");
  const [query, setQuery] = useState("");
  const industries = useMemo(
    () =>
      Array.from(
        new Set(
          viewModel.recommendations
            .map((person) => person.industry.trim())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [viewModel.recommendations],
  );
  const list = useMemo(
    () =>
      viewModel.recommendations.filter((person) => {
        const trimmed = query.trim().toLowerCase();
        const matchesQuery =
          !trimmed ||
          [person.name, person.company, person.industry]
            .join(" ")
            .toLowerCase()
            .includes(trimmed);
        const matchesIndustry =
          !industry || person.industry.trim() === industry;

        return matchesQuery && matchesIndustry;
      }),
    [industry, query, viewModel.recommendations],
  );

  return (
    <div className="orbit-party-network-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-network-header">
        <div>
          <div className="eyebrow">FOR YOU</div>
          <h1 className="h-display orbit-party-network-title">{t({ en: "For you", zh: "推荐给你" })}</h1>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <div className="card orbit-party-network-count">
            <div className="h-title">{viewModel.recommendations.length}</div>
            <div className="mono">RECOMMENDED</div>
          </div>
        </div>
      </div>
      {viewModel.resultsState !== "ready" || viewModel.recommendations.length === 0 ? (
        <PartyResultsBoundary t={t} viewModel={viewModel} />
      ) : null}
      <div className="orbit-party-network-toolbar">
        <div className="orbit-party-network-search">
          <Icon color="var(--text-3)" name="search" size={17} />
          <input aria-label={t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" })} onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" })} type="search" value={query} />
        </div>
        <select
          aria-label={t({ en: "Filter by industry", zh: "按行业筛选" })}
          className="field hit-44"
          onChange={(event) => setIndustry(event.target.value)}
          style={{ minWidth: 150, width: "auto" }}
          value={industry}
        >
          <option value="">{t({ en: "All industries", zh: "全部行业" })}</option>
          {industries.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="orbit-party-network-list">
        {list.map((person) => (
          <NetworkPerson contactRequestsOpen={viewModel.eventPhase !== "upcoming"} eventId={viewModel.eventId} key={person.id} onSelect={onSelect} p={person} t={t} />
        ))}
      </div>
    </div>
  );
}

function PartyAttendees({ onSelect, t, viewModel }: { onSelect: (person: OrbitPartyPersonView) => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const [query, setQuery] = useState("");
  const attendees = useMemo(() => partyParticipants(viewModel), [viewModel]);
  const list = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return attendees;
    return attendees.filter((person) => [person.name, person.company, person.title, person.industry].join(" ").toLowerCase().includes(trimmed));
  }, [attendees, query]);

  return (
    <div className="orbit-party-attendees-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-network-header">
        <div>
          <div className="eyebrow">ATTENDEES</div>
          <h1 className="h-display orbit-party-network-title">{t({ en: "All attendees", zh: "全部参会者" })}</h1>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{t({ en: `${viewModel.attendees.length} registered attendees`, zh: `共 ${viewModel.attendees.length} 位真实报名参会者` })}</div>
        </div>
        <div className="orbit-party-network-search orbit-party-attendees-search">
          <Icon color="var(--text-3)" name="search" size={17} />
          <input aria-label={t({ en: "Search attendees", zh: "搜索参会者" })} onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search attendees", zh: "搜索参会者" })} type="search" value={query} />
        </div>
      </div>
      <div className="orbit-party-attendee-grid">
        <div className="card orbit-party-attendee-card">
          <span className="avatar g-indigo orbit-party-attendee-avatar">{viewModel.me.initial}</span>
          <div className="orbit-party-attendee-body">
            <div className="orbit-party-attendee-name">{viewModel.me.name}</div>
            <div className="orbit-party-attendee-meta">{viewModel.me.role}</div>
            <div className="orbit-party-attendee-summary">
              {viewModel.me.seat
                ? `${t({ en: "My seat", zh: "我的席位" })} · ${viewModel.me.seat}`
                : t({ en: "No source-backed seat assignment", zh: "暂无来源可核验的座位安排" })}
            </div>
            <div className="orbit-party-attendee-tags">
              {viewModel.me.topics.slice(0, 3).map((topic) => (
                <span className="chip" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
          </div>
          {viewModel.me.seat ? (
            <span className="chip chip-accent orbit-party-attendee-seat">{viewModel.me.seat}</span>
          ) : null}
        </div>
        {list.map((person) => (
          <article className="card orbit-party-attendee-card" key={person.id} style={{ position: "relative" }}>
            <button
              aria-label={t({ en: `View ${person.name}'s details`, zh: `查看 ${person.name} 的详情` })}
              data-party-person-open={person.id}
              onClick={() => onSelect(person)}
              style={{ background: "transparent", border: 0, cursor: "pointer", inset: 0, padding: 0, position: "absolute", zIndex: 0 }}
              type="button"
            />
            <span className={`avatar ${person.g} orbit-party-attendee-avatar`} style={{ pointerEvents: "none", position: "relative", zIndex: 1 }}>{person.initial}</span>
            <div className="orbit-party-attendee-body" style={{ pointerEvents: "none", position: "relative", zIndex: 1 }}>
              <div className="orbit-party-attendee-name">{person.name}</div>
              <div className="orbit-party-attendee-meta">
                {person.company} · {person.title}
              </div>
              <div className="orbit-party-attendee-summary">{person.summary}</div>
              <div className="orbit-party-attendee-tags" style={{ minWidth: 0 }}>
                <span className="chip chip-accent" style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>{person.industry}</span>
                {person.topics.map((topic) => (
                  <span className="chip" key={topic} style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
            {person.seat ? (
              <span className="chip chip-accent orbit-party-attendee-seat" style={{ pointerEvents: "none", position: "relative", zIndex: 1 }}>{person.seat}</span>
            ) : null}
            <div style={{ gridColumn: "1 / -1", position: "relative", zIndex: 2 }}>
              <EventContactRequestControl contactRequestsOpen={viewModel.eventPhase !== "upcoming"} eventId={viewModel.eventId} person={person} t={t} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PartyAgenda({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const phaseLabel =
    viewModel.eventPhase === "active"
      ? t({ en: "Event live", zh: "活动进行中" })
      : viewModel.eventPhase === "upcoming"
        ? t({ en: "Upcoming", zh: "即将开始" })
        : t({ en: "Ended", zh: "已结束" });
  const phaseBadgeClass =
    viewModel.eventPhase === "active"
      ? "badge badge-live"
      : viewModel.eventPhase === "upcoming"
        ? "badge badge-soon"
        : "badge badge-ended";

  return (
    <div className="orbit-party-agenda-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-network-header">
        <div>
          <div className="eyebrow">AGENDA</div>
          <h1 className="h-display orbit-party-network-title">{t({ en: "Agenda", zh: "流程议程" })}</h1>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{`${viewModel.eventName} · ${t({ en: "Tonight's agenda", zh: "今晚流程" })}`}</div>
        </div>
        <span className={phaseBadgeClass}>{phaseLabel}</span>
      </div>
      <div className="orbit-party-agenda-list">
        {viewModel.agenda.map((item, index) => (
          <div className="orbit-party-agenda-row" key={`${item.time}-${item.label}`}>
            <div className="orbit-party-agenda-time">{item.time}</div>
            <div className="orbit-party-agenda-line">
              <span />
              {index < viewModel.agenda.length - 1 ? <i /> : null}
            </div>
            <div className="orbit-party-agenda-main">
              <strong>{t(item.label)}</strong>
              <p>{t(item.description)}</p>
            </div>
            <span className="orbit-party-agenda-status">{phaseLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Language-agnostic palette: color derived from a stable hash of the label so the
// graph stays colorful whether industry text is zh / en / ja.
const graphColorPalette = ["#8AA4C8", "#9B8CC6", "#C2998A", "#D97B5E", "#C4A25E", "#6359E9", "#7D7870", "#47898F"];

function graphColor(industry: string) {
  const label = industry || "";
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return graphColorPalette[hash % graphColorPalette.length] ?? "#8B7E74";
}

function SocialGraphLite({
  graph,
  height = 560,
  me,
  onSelect,
  people,
  scale,
  width = 720,
}: {
  graph: NonNullable<OrbitPartyViewModel["graph"]>;
  height?: number;
  me: OrbitPartyViewModel["me"];
  onSelect: (person: OrbitPartyPersonView) => void;
  people: OrbitPartyPersonView[];
  scale: number;
  width?: number;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const nodes = people.map((person, index) => {
    const angle = (index / people.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...person,
      r: person.isRecommended ? 22 + Math.min(8, person.score / 15) : 18,
      x: cx + Math.cos(angle) * radius * (0.78 + (index % 3) * 0.13),
      y: cy + Math.sin(angle) * radius * (0.78 + (index % 3) * 0.13),
    };
  });
  const positionByParticipantId = new Map<string, { x: number; y: number }>([
    [me.participantId, { x: cx, y: cy }],
    ...nodes.map((node) => [node.id, { x: node.x, y: node.y }] as const),
  ]);

  return (
    <svg style={{ aspectRatio: `${width} / ${height}`, display: "block", maxHeight: "76vh", width: "100%" }} viewBox={`0 0 ${width} ${height}`} width="100%">
      <defs>
        <pattern height="24" id="pg-dot" patternUnits="userSpaceOnUse" width="24">
          <circle cx="0.6" cy="0.6" fill="rgba(20,20,28,0.06)" r="0.6" />
        </pattern>
      </defs>
      <rect fill="url(#pg-dot)" height={height} rx="22" width={width} />
      <g transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
        {graph.edges.flatMap((edge) => {
          const from = positionByParticipantId.get(edge.fromParticipantId);
          const to = positionByParticipantId.get(edge.toParticipantId);
          if (!from || !to) return [];
          const stroke = edge.kind === "recommendation"
            ? "rgba(99,89,233,0.72)"
            : edge.kind === "round_one_table"
              ? "rgba(71,137,143,0.62)"
              : "rgba(217,123,94,0.62)";
          return [
            <line
              key={edge.id}
              stroke={stroke}
              strokeDasharray={edge.kind === "round_two_topic" ? "5 4" : undefined}
              strokeWidth={edge.kind === "recommendation" ? 2 : 1.2}
              x1={from.x}
              x2={to.x}
              y1={from.y}
              y2={to.y}
            >
              <title>{edge.label}</title>
            </line>,
          ];
        })}
        {nodes.map((node) => {
          const color = graphColor(node.industry);
          return (
            <g
              aria-label={node.name}
              data-graph-participant={node.id}
              key={node.id}
              onClick={() => onSelect(node)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node);
                }
              }}
              role="button"
              style={{ cursor: "pointer" }}
              tabIndex={0}
              transform={`translate(${node.x} ${node.y})`}
            >
              <circle fill={color} fillOpacity={0.1} r={node.r + 5} />
              <circle fill="#fff" r={node.r} stroke={color} strokeWidth="1.6" />
              <text dominantBaseline="central" fill="#1D1D22" fontFamily="var(--ff-display)" fontSize={Math.max(11, node.r * 0.7)} fontWeight="600" textAnchor="middle">
                {node.initial}
              </text>
              <text fill="rgba(29,29,34,0.6)" fontFamily="var(--ff)" fontSize="10" fontWeight="500" textAnchor="middle" y={node.r + 13}>
                {node.name}
              </text>
            </g>
          );
        })}
        <circle fill="var(--accent)" fillOpacity="0.05" r="56" />
        <circle fill="var(--accent)" fillOpacity="0.1" r="44" />
        <circle fill="rgba(99,89,233,0.14)" r="34" stroke="var(--accent)" strokeWidth="2.4" />
        <text dominantBaseline="central" fill="var(--accent)" fontFamily="var(--ff-display)" fontSize="24" fontWeight="700" textAnchor="middle">
          {me.initial}
        </text>
        <text fill="var(--accent)" fontFamily="var(--ff-mono)" fontSize="9" fontWeight="600" letterSpacing="0.28em" textAnchor="middle" y="-46">
          YOU
        </text>
      </g>
    </svg>
  );
}

function PersonDetailOverlay({ contactRequestsOpen, eventId, onClose, person, t }: { contactRequestsOpen: boolean; eventId: string; onClose: () => void; person: OrbitPartyPersonView; t: Translate }) {
  const [detail, setDetail] = useState<EventParticipantDetailView | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setDetailError(null);
    setLoading(true);
    void fetch(
      `/api/events/${encodeURIComponent(eventId)}/operations/participants/${encodeURIComponent(person.id)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          data?: EventParticipantDetailView;
          error?: { message?: string };
          success?: boolean;
        } | null;
        if (!response.ok || body?.success !== true || !body.data) {
          throw new Error(
            body?.error?.message ??
              t({
                en: "Participant details could not be loaded.",
                zh: "暂时无法加载参会者详情。",
              }),
          );
        }
        setDetail(body.data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(
          error instanceof Error
            ? error.message
            : t({
                en: "Participant details could not be loaded.",
                zh: "暂时无法加载参会者详情。",
              }),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `t` is request-language scoped; including its function identity would
    // refetch the same immutable profile version on every provider render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, person.id]);

  const contactPerson = detail
    ? {
        ...person,
        contactId: detail.contactRequest.contactId,
        contactRequestDirection: detail.contactRequest.direction,
        contactRequestId: detail.contactRequest.requestId,
        contactRequestRevision: detail.contactRequest.revision,
        contactRequestStatus: detail.contactRequest.status,
      }
    : person;

  return (
    <ModalShell bare label={person.name} onClose={onClose} variant="bottom-sheet">
      <div style={{ background: "var(--surface)", padding: "16px 18px 0", position: "sticky", top: 0 }}>
        <button aria-label={t({ en: "Close participant details", zh: "关闭参会者详情" })} className="btn btn-ghost btn-sm" onClick={onClose} type="button">
          <Icon name="chevL" size={16} />
          {t({ en: "Back", zh: "返回" })}
        </button>
      </div>
      <div data-party-person-detail={person.id} style={{ minWidth: 0, overflowWrap: "anywhere", padding: 20 }}>
        {detail?.placements.length ? (
          <section
            style={{
              background: "linear-gradient(135deg, var(--ink), color-mix(in srgb, var(--ink) 82%, var(--accent)))",
              borderRadius: 18,
              color: "var(--on-dark)",
              display: "grid",
              gap: 12,
              marginBottom: 20,
              padding: 18,
            }}
          >
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".2em", opacity: 0.72 }}>
              {t({ en: "SEAT ASSIGNMENTS", zh: "座位安排" })}
            </div>
            {detail.placements.map((placement) => (
              <div data-party-placement={`${placement.roundNumber}:${placement.tableNumber}:${placement.seat}`} key={`${placement.roundNumber}:${placement.tableNumber}`} style={{ alignItems: "center", display: "grid", gap: 12, gridTemplateColumns: "auto 1fr auto" }}>
                <span style={{ alignItems: "center", background: "rgba(255,255,255,.12)", borderRadius: 12, display: "inline-flex", fontFamily: "var(--ff-mono)", fontSize: 12, height: 42, justifyContent: "center", width: 42 }}>
                  R{placement.roundNumber}
                </span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {t({ en: `Table ${placement.tableNumber}`, zh: `第 ${placement.tableNumber} 桌` })}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 3, opacity: 0.72 }}>{placement.theme}</div>
                </div>
                <strong style={{ fontFamily: "var(--ff-display)", fontSize: 25 }}>{placement.seat}</strong>
              </div>
            ))}
          </section>
        ) : null}
        <div className="eyebrow">{person.company}</div>
        <h2 className="h-display" style={{ marginTop: 10 }}>
          {person.name}
        </h2>
        <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>
          {person.company} · {person.title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <span className="chip chip-accent" style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>{person.industry}</span>
          {person.groupNumber !== null && person.seat ? (
            <span className="chip" style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>
              {t({ en: `Group ${person.groupNumber}`, zh: `第${person.groupNumber}组` })} / {person.seat}
            </span>
          ) : null}
        </div>
        <p style={{ color: "var(--text)", lineHeight: 1.8, marginTop: 18 }}>{person.summary}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {person.topics.map((topic) => (
            <span className="chip" key={topic} style={{ height: "auto", maxWidth: "100%", minHeight: 26, overflowWrap: "anywhere", whiteSpace: "normal" }}>
              {topic}
            </span>
          ))}
        </div>
        {loading ? (
          <div aria-busy="true" className="card" style={{ color: "var(--text-3)", marginTop: 18, padding: 18 }}>
            {t({ en: "Loading verified profile responses…", zh: "正在加载可核验的活动资料…" })}
          </div>
        ) : null}
        {detailError ? (
          <div className="orbit-alert error" role="alert" style={{ marginTop: 18 }}>
            {detailError}
          </div>
        ) : null}
        {detail?.responses.length ? (
          <section style={{ display: "grid", gap: 12, marginTop: 24 }}>
            <div>
              <div className="eyebrow">PROFILE RESPONSES</div>
              <h3 className="h-section" style={{ margin: "7px 0 0" }}>
                {t({ en: "What they shared for this event", zh: "TA 为本场活动填写的内容" })}
              </h3>
            </div>
            {detail.responses.map((response) => (
              <article className="card" data-party-profile-response={response.fieldKey} key={response.fieldKey} style={{ padding: 16 }}>
                <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13.5 }}>{t(response.label)}</strong>
                  <span className="chip" style={{ fontSize: 10.5 }}>
                    {t({ en: "Participant-provided", zh: "参会者填写" })}
                  </span>
                </div>
                <p style={{ color: "var(--ink)", fontSize: 15, lineHeight: 1.7, margin: "12px 0 0" }}>{response.answer}</p>
                {response.prompt ? (
                  <div style={{ borderTop: "1px solid var(--hairline)", color: "var(--text-3)", fontSize: 12, lineHeight: 1.65, marginTop: 13, paddingTop: 11 }}>
                    <span style={{ fontWeight: 700 }}>{t({ en: "Question asked: ", zh: "本场提问：" })}</span>
                    {response.prompt}
                  </div>
                ) : (
                  <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 10 }}>
                    {t({ en: "Historical answer; the original question was not stored.", zh: "历史回答，原始问题未被保存。" })}
                  </div>
                )}
              </article>
            ))}
          </section>
        ) : null}
        {detail?.recommendation ? (
          <section className="card" style={{ marginTop: 22, padding: 17 }}>
            <div className="eyebrow">WHY THIS PERSON</div>
            <h3 className="h-section" style={{ margin: "8px 0 0" }}>{t({ en: "Why Orbit recommended this connection", zh: "为什么 Orbit 推荐你们认识" })}</h3>
            <div style={{ color: "var(--text-2)", display: "grid", gap: 8, lineHeight: 1.7, marginTop: 12 }}>
              {detail.recommendation.reasons.map((reason) => <div key={reason}>{reason}</div>)}
            </div>
          </section>
        ) : (
          <p style={{ color: "var(--text-2)", lineHeight: 1.8, marginTop: 18 }}>{person.reason}</p>
        )}
        <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
          <EventContactRequestControl contactRequestsOpen={contactRequestsOpen} eventId={eventId} person={contactPerson} showAcceptedWorkflow t={t} />
        </div>
      </div>
    </ModalShell>
  );
}

export function OrbitRealPartyCheckin({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const { t } = useOrbitLanguage();

  return (
    <div className="orbit-party-page orbit-live-checkin-page">
      <header className="orbit-party-checkin-top">
        <a
          aria-label={t({ en: "Back", zh: "返回" })}
          className="orbit-party-icon-button hit-44"
          href={partyHrefForEvent(viewModel.eventId)}
        >
          <Icon name="chevL" size={20} />
        </a>
        <div className="orbit-party-checkin-title">
          <div className="eyebrow">ON-SITE CHECK-IN</div>
          <div>{t({ en: "Check-in status", zh: "签到状态" })}</div>
        </div>
        <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
          {t({ en: "ZH / JA", zh: "中 / 日" })}
        </span>
      </header>
      <main className="orbit-party-checkin-shell">
        <section className="orbit-party-action-card card">
          <div className="orbit-party-checkin-icon">
            <Icon name={viewModel.checkedInAt ? "checkCircle" : "scan"} size={30} />
          </div>
          <div className="eyebrow">PERSISTED EVENT CHECK-IN</div>
          <h1 className="h-title">
            {viewModel.checkedInAt
              ? t({ en: "You are checked in", zh: "你已完成签到" })
              : t({ en: "Confirm your arrival", zh: "确认到场" })}
          </h1>
          <p style={{ color: "var(--text-2)", lineHeight: 1.65, margin: "12px 0 0" }}>
            {t({
              en: "This writes an actor-scoped arrival record for your real event registration during the organizer-defined check-in window.",
              zh: "该操作会在组织者设定的签到时间窗内，为你的真实活动报名写入仅限本人范围的到场记录。",
            })}
          </p>
          <div style={{ marginTop: 20 }}>
            <EventCheckInControl
              checkedInAt={viewModel.checkedInAt}
              enabled={viewModel.checkInAvailable}
              eventId={viewModel.eventId}
              t={t}
            />
          </div>
          <a className="btn btn-primary btn-lg btn-block" href={partyHrefForEvent(viewModel.eventId)} style={{ marginTop: 20 }}>
            <Icon color="var(--on-accent)" name="arrow" size={18} />
            {t({ en: "Return to event home", zh: "返回活动主页" })}
          </a>
        </section>
      </main>
    </div>
  );
}

export function OrbitRealPartyGraph({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const { t } = useOrbitLanguage();
  const [scale, setScale] = useState(0.95);
  const [selected, setSelected] = useState<OrbitPartyPersonView | null>(null);
  const graphParticipantIds = new Set(
    viewModel.graph?.nodes.map((node) => node.participantId) ?? [],
  );
  const graphPeople = viewModel.attendees.filter(
    (person) =>
      person.id !== viewModel.me.participantId &&
      graphParticipantIds.has(person.id),
  );

  return (
    <div className="orbit-party-graph-screen" data-orbit-real-page style={{ minHeight: "100dvh" }}>
      <div style={{ margin: "0 auto", maxWidth: 720, minHeight: "100dvh", padding: "18px clamp(16px,4vw,32px) 48px", position: "relative", zIndex: ORBIT_Z.raised }}>
        <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
          <button aria-label={t({ en: "Back", zh: "返回" })} className="btn btn-ghost hit-44" onClick={() => navigateTo(partyHrefForEvent(viewModel.eventId))} style={{ minWidth: 40, padding: 0 }} type="button">
            <Icon name="chevL" size={18} />
          </button>
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div className="eyebrow" style={{ fontSize: 11 }}>
              STEP 02 / 02
            </div>
            <div style={{ color: "var(--ink)", fontSize: 12 }}>{t({ en: "Social graph", zh: "社交图谱" })}</div>
          </div>
          <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
            {t({ en: "ZH / JA", zh: "中 / 日" })}
          </span>
        </div>
        <div style={{ background: "linear-gradient(180deg, var(--surface) 0%, var(--bg-sunken) 100%)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-lg)", marginTop: 16, padding: 22 }}>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontFamily: "var(--ff-mono)", fontSize: 11, justifyContent: "space-between", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            <span>SOCIAL GRAPH</span>
            <span className={viewModel.graph ? "badge badge-live" : "badge"}>
              {viewModel.graph ? <span className="dot dot-live" /> : null}
              {viewModel.graph
                ? t({ en: "Published", zh: "已发布" })
                : t({ en: "Unavailable", zh: "不可用" })}
            </span>
          </div>
          <h1 className="h-display" style={{ lineHeight: 0.94, marginTop: 18 }}>
            {t({ en: "Tonight's", zh: "今晚的" })}
            <br />
            <span style={{ color: "var(--accent)" }}>{t({ en: "connection map.", zh: "连接图。" })}</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.8, marginTop: 16 }}>{t({ en: "Zoom in to see the whole night's connections. You can zoom and tap any node to view their details.", zh: "放大看一眼整场连接关系。你可以缩放，并点击任意节点查看对方详情。" })}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <span className="chip badge-live">{t({ en: "Published generation only", zh: "仅展示已发布生成结果" })}</span>
            <span className="chip chip-accent">{t({ en: `${viewModel.graph?.nodes.length ?? 0} nodes`, zh: `${viewModel.graph?.nodes.length ?? 0} 个节点` })}</span>
            <span className="chip chip-accent">{t({ en: `${viewModel.graph?.edges.length ?? 0} connections`, zh: `${viewModel.graph?.edges.length ?? 0} 条真实连接` })}</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 14, padding: 18 }}>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 11 }}>
                {t({ en: "How to use", zh: "操作方式" })}
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{t({ en: "Zoom / tap a node", zh: "缩放 / 点击节点" })}</div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 11 }}>
                {t({ en: "Data source", zh: "数据来源" })}
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{t({ en: "Real recommendation graph", zh: "真实推荐图谱" })}</div>
            </div>
          </div>
          <p style={{ color: "var(--text-3)", fontSize: 12, margin: "14px 0 0" }}>
            {t({ en: "This graph is source-backed and read only. Open a node to review its contact context.", zh: "该图谱基于来源数据且为只读。打开节点可查看联系人上下文。" })}
          </p>
        </div>
        <div className="card" style={{ marginTop: 14, padding: 14 }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 8 }}>
            <button aria-label={t({ en: "Zoom out", zh: "缩小" })} className="btn btn-ghost btn-sm hit-44" onClick={() => setScale((value) => Math.max(0.5, value - 0.2))} type="button">
              -
            </button>
            <span className="mono" style={{ alignSelf: "center", color: "var(--text-3)", fontSize: 12 }}>
              {Math.round(scale * 100)}%
            </span>
            <button aria-label={t({ en: "Zoom in", zh: "放大" })} className="btn btn-primary btn-sm hit-44" onClick={() => setScale((value) => Math.min(4, value + 0.2))} type="button">
              +
            </button>
          </div>
          {viewModel.graph ? (
            <SocialGraphLite graph={viewModel.graph} height={700} me={viewModel.me} onSelect={setSelected} people={graphPeople} scale={scale} width={880} />
          ) : (
            <PartyResultsBoundary t={t} viewModel={viewModel} />
          )}
        </div>
      </div>
      {selected ? <PersonDetailOverlay contactRequestsOpen={viewModel.eventPhase !== "upcoming"} eventId={viewModel.eventId} onClose={() => setSelected(null)} person={selected} t={t} /> : null}
    </div>
  );
}

function PartyGraphInline({ onSelect, t, viewModel }: { onSelect: (person: OrbitPartyPersonView) => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const [scale, setScale] = useState(1);
  const graphParticipantIds = new Set(
    viewModel.graph?.nodes.map((node) => node.participantId) ?? [],
  );
  const graphPeople = viewModel.attendees.filter(
    (person) =>
      person.id !== viewModel.me.participantId &&
      graphParticipantIds.has(person.id),
  );

  return (
    <div className="orbit-party-graph-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-graph-header">
        <div>
          <div className="eyebrow">SOCIAL GRAPH</div>
          <h1 className="h-display orbit-party-graph-title">{t({ en: "Social graph", zh: "社交图谱" })}</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button aria-label={t({ en: "Zoom out", zh: "缩小" })} className="btn btn-ghost btn-sm hit-44" onClick={() => setScale((value) => Math.max(0.6, value - 0.2))} type="button">
            -
          </button>
          <button aria-label={t({ en: "Zoom in", zh: "放大" })} className="btn btn-primary btn-sm hit-44" onClick={() => setScale((value) => Math.min(2.5, value + 0.2))} type="button">
            +
          </button>
        </div>
      </div>
      <div className="orbit-party-graph-stats">
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.graph?.nodes.length ?? 0}</div>
          <div className="mono">{t({ en: "Nodes", zh: "节点" })}</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.graph?.edges.length ?? 0}</div>
          <div className="mono">{t({ en: "Connections", zh: "连接" })}</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.graph ? t({ en: "Published", zh: "已发布" }) : t({ en: "Unavailable", zh: "不可用" })}</div>
          <div className="mono">{t({ en: "Results", zh: "结果" })}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 14 }}>
        {viewModel.graph ? (
          <SocialGraphLite graph={viewModel.graph} me={viewModel.me} onSelect={onSelect} people={graphPeople} scale={scale} />
        ) : (
          <PartyResultsBoundary t={t} viewModel={viewModel} />
        )}
      </div>
    </div>
  );
}

function PartyMe({ onExit, t, viewModel }: { onExit: () => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="orbit-party-me-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <div className="eyebrow">MY PASS</div>
      </div>
      <div className="orbit-party-me-hero">
        <span className="avatar g-indigo orbit-party-me-avatar">{viewModel.me.initial}</span>
        <div className="orbit-party-me-hero-info">
          <h1 className="h-display orbit-party-me-name">{viewModel.me.name}</h1>
          <div className="orbit-party-me-role">{viewModel.me.role}</div>
          <div className="orbit-party-me-chips">
            {viewModel.me.groupNumber !== null ? (
              <span className="chip chip-accent" style={{ height: 24 }}>
                {t({ en: `Group ${viewModel.me.groupNumber}`, zh: `第${viewModel.me.groupNumber}组` })}
              </span>
            ) : null}
            {viewModel.me.seat ? (
              <span className="chip" style={{ height: 24 }}>
                {t({ en: "Seat", zh: "座位" })} {viewModel.me.seat}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {viewModel.accessCode ? (
        <div className="card orbit-party-me-code-card">
          <div className="orbit-party-me-code-icon">
            <Icon name="qr" size={26} />
          </div>
          <div className="orbit-party-me-code-body">
            <div className="eyebrow">{t({ en: "Access code", zh: "通行码" })}</div>
            <div className="mono orbit-party-me-code-value">{viewModel.accessCode}</div>
          </div>
          <button
            aria-label={t({ en: "Copy access code", zh: "复制通行码" })}
            className="btn btn-ghost orbit-party-me-copy hit-44"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(viewModel.accessCode ?? "");
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              } catch {
                setCopied(false);
              }
            }}
            type="button"
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
          </button>
        </div>
      ) : (
        <div className="card orbit-party-me-code-card">
          <div className="orbit-party-me-code-icon">
            <Icon name="lock" size={26} />
          </div>
          <div className="orbit-party-me-code-body">
            <div className="eyebrow">{t({ en: "Event pass", zh: "活动通行凭证" })}</div>
            <div>{t({ en: "No source-backed pass is available.", zh: "暂无来源可核验的活动通行凭证。" })}</div>
          </div>
        </div>
      )}
      <div className="orbit-party-me-stat-grid">
        <div className="card orbit-party-me-stat">
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">{t({ en: "Recommended", zh: "推荐人脉" })}</div>
        </div>
        <div className="card orbit-party-me-stat">
          <div className="h-title">{viewModel.me.topics.length}</div>
          <div className="mono">{t({ en: "Topic tags", zh: "话题标签" })}</div>
        </div>
      </div>
      <div className="orbit-party-me-section-head">
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "AI opener suggestions", zh: "AI 开场白建议" })}
        </h2>
      </div>
      <div className="card orbit-party-me-copy-card">
        <div className="orbit-party-me-prompt-list">
          {viewModel.me.prompts.map((prompt, index) => (
            <div className="orbit-party-me-prompt-item" key={prompt}>
              <span className="mono">0{index + 1}</span>
              <span>{prompt}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="orbit-party-me-section-head">
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "My tags", zh: "我的标签" })}
        </h2>
      </div>
      <div className="orbit-party-me-tags">
        {viewModel.me.offering.map((tag) => (
          <span className="chip chip-accent" key={tag}>
            {tag}
          </span>
        ))}
        {viewModel.me.seeking.map((tag) => (
          <span className="chip" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <button className="card orbit-party-me-action-row" onClick={() => navigateTo("/app/profile")} style={{ marginTop: 20 }} type="button">
        <Icon color="var(--text-2)" name="edit" size={18} />
        <span>{t({ en: "Edit general profile", zh: "编辑通用画像" })}</span>
        <Icon color="var(--text-4)" name="chevR" size={17} />
      </button>
      <button className="card orbit-party-me-action-row orbit-party-me-logout" onClick={onExit} type="button">
        <Icon color="var(--rose)" name="logout" size={18} />
        <span>{t({ en: "Back to event", zh: "返回活动" })}</span>
        <Icon color="var(--rose)" name="chevR" size={17} />
      </button>
    </div>
  );
}

export function OrbitRealParty({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const { t } = useOrbitLanguage();
  const [tab, setTab] = useState<PartyTab>("home");
  const [selectedPerson, setSelectedPerson] = useState<OrbitPartyPersonView | null>(null);

  return (
    <div className="orbit-party-page" data-orbit-real-page style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", position: "relative" }}>
      <PublicTopNav active="events" />
      <PartyDesktopChrome onExit={returnToBeforeParty} setTab={setTab} t={t} tab={tab} viewModel={viewModel} />
      <PartyMobileTopTabs onExit={returnToBeforeParty} setTab={setTab} t={t} tab={tab} viewModel={viewModel} />
      {tab === "home" ? <PartyHome go={setTab} t={t} viewModel={viewModel} /> : null}
      {tab === "table" ? <PartyTable t={t} viewModel={viewModel} /> : null}
      {tab === "recommendations" ? <PartyRecommendations onSelect={setSelectedPerson} t={t} viewModel={viewModel} /> : null}
      {tab === "attendees" ? <PartyAttendees onSelect={setSelectedPerson} t={t} viewModel={viewModel} /> : null}
      {tab === "graph" ? <PartyGraphInline onSelect={setSelectedPerson} t={t} viewModel={viewModel} /> : null}
      {tab === "agenda" ? <PartyAgenda t={t} viewModel={viewModel} /> : null}
      {selectedPerson ? (
        <PersonDetailOverlay
          contactRequestsOpen={viewModel.eventPhase !== "upcoming"}
          eventId={viewModel.eventId}
          onClose={() => setSelectedPerson(null)}
          person={selectedPerson}
          t={t}
        />
      ) : null}
    </div>
  );
}
