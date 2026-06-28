"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { getOrbitPartyViewModel, type OrbitPartyPersonView, type OrbitPartyViewModel } from "../orbit-party-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { PublicTopNav } from "../orbit-public-shell";
import { Icon, Logo } from "../orbit-reference-primitives";

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

function productHref(prototypeHref: string) {
  if (prototypeHref === "/party") return "/app/party";
  if (prototypeHref.startsWith("/app")) return prototypeHref;
  return `/app${prototypeHref}`;
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
}: {
  onExit: () => void;
  setTab: (tab: PartyTab) => void;
  t: Translate;
  tab: PartyTab;
}) {
  const tabs: Array<[PartyTab, string, string]> = [
    ["home", "home", t({ en: "Live home", zh: "现场主页" })],
    ["recommendations", "sparkle", t({ en: "For you", zh: "推荐给你" })],
    ["attendees", "users", t({ en: "All attendees", zh: "全部参会者" })],
    ["table", "seat", t({ en: "Groups", zh: "分组" })],
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
    ["table", "grid", t({ en: "Groups", zh: "分组" })],
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
          <span>{t({ en: "Your seat", zh: "你的座位" })} {viewModel.me.seat}</span>
        </div>
        <span className="orbit-party-ended-pill">{t({ en: "Ended", zh: "已结束" })}</span>
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
  added,
  onAdd,
  p,
  t,
}: {
  added?: boolean;
  onAdd: () => void;
  p: OrbitPartyPersonView;
  t: Translate;
}) {
  return (
    <div className="orbit-party-network-person card">
      <span className={`avatar ${p.g} orbit-party-network-avatar`}>{p.initial}</span>
      <div className="orbit-party-network-person-body">
        <div className="orbit-party-network-person-top">
          <span className="h-section orbit-party-network-person-name">{p.name}</span>
          <span className="chip orbit-party-network-seat" style={{ height: 24 }}>
            {t({ en: `Group ${p.groupNumber}`, zh: `第${p.groupNumber}组` })} · {p.seat}
          </span>
        </div>
        <span className="orbit-party-network-person-meta">
          {p.title} · {p.company}
        </span>
        <div className="orbit-party-network-person-summary">{p.reason}</div>
        <div className="orbit-party-network-tags">
          <span className="chip chip-accent">{p.industry}</span>
          {p.topics.map((topic) => (
            <span className="chip" key={topic}>
              {topic}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className={added ? "btn btn-soft btn-sm" : "btn btn-primary btn-sm"} disabled={added} onClick={onAdd} type="button">
            <Icon color={added ? undefined : "var(--on-dark)"} name={added ? "check" : "wallet"} size={15} />
            {added ? t({ en: "In card wallet", zh: "已加入名片夹" }) : t({ en: "Add to wallet", zh: "加入名片夹" })}
          </button>
        </div>
      </div>
    </div>
  );
}

function partyParticipants(viewModel: OrbitPartyViewModel) {
  const people = [...viewModel.recommendations, ...viewModel.tableMates];
  const seen = new Set<string>();

  return people.filter((person) => {
    if (seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
}

function PartyHome({ go, t, viewModel }: { go: (tab: PartyTab) => void; t: Translate; viewModel: OrbitPartyViewModel }) {
  const first = viewModel.recommendations[0];

  return (
    <div className="orbit-party-home-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 32px" }}>
      <div className="card" style={{ marginTop: 12, overflow: "hidden", padding: 20, position: "relative" }}>
        <span className="badge badge-live" style={{ position: "absolute", right: 16, top: 16 }}>
          <span className="dot dot-live" />
          {t({ en: "Live", zh: "进行中" })}
        </span>
        <div className="eyebrow">{`TONIGHT · ${t({ en: "On site", zh: "现场" })}`}</div>
        <h1 className="h-display" style={{ margin: "8px 0 0" }}>
          {t({ en: "Good evening, ", zh: "晚上好，" })}
          {viewModel.me.initial}
        </h1>
        <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>{`Tokyo Business Connect · ${t({ en: "Tokyo Midtown Hall B", zh: "东京中城 Hall B" })}`}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => navigateTo("/app/party/checkin")} style={{ flex: "1 1 0%" }}>
            <Icon color="var(--on-dark)" name="ticket" size={16} />
            {t({ en: "Check in", zh: "签到" })}
          </button>
          <button className="btn btn-ghost" onClick={() => go("table")} style={{ flex: "1 1 0%" }}>
            <Icon name="seat" size={16} />
            {`${t({ en: "My seat", zh: "我的座位" })} ${viewModel.me.seat}`}
          </button>
        </div>
      </div>
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
      <div className="card" style={{ padding: 18 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 13 }}>
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
            <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2 }}>
              {first.title} · {first.company}
            </div>
          </div>
        </div>
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 14, padding: 13 }}>
          <Icon color="var(--accent)" name="sparkle" size={17} style={{ flexShrink: 0, height: 17, marginTop: 1, width: 17 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>{t({ en: "Why recommended", zh: "为什么推荐" })}</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{first.reason}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--ink)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>{t({ en: "Icebreakers", zh: "破冰问题" })}</div>
          {first.icebreakers.map((question, index) => (
            <div key={question} style={{ display: "flex", gap: 9, marginBottom: 7 }}>
              <span className="mono" style={{ alignItems: "center", background: "var(--surface-2)", borderRadius: 999, color: "var(--text-3)", display: "flex", flexShrink: 0, fontSize: 10, height: 22, justifyContent: "center", width: 22 }}>
                0{index + 1}
              </span>
              <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5 }}>{question}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", margin: "24px 0 12px" }}>
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Tonight's agenda", zh: "今晚流程" })}
        </h2>
      </div>
      <div className="card" style={{ padding: 18 }}>
        {viewModel.agenda.map((item, index) => (
          <div key={item.time} style={{ display: "flex", gap: 14, paddingBottom: index < viewModel.agenda.length - 1 ? 16 : 0 }}>
            <div style={{ alignItems: "center", display: "flex", flexDirection: "column" }}>
              <span style={{ background: index === 2 ? "var(--accent)" : "var(--surface)", border: `2px solid ${index === 2 ? "var(--accent)" : "var(--border-strong)"}`, borderRadius: 999, height: 11, width: 11 }} />
              {index < viewModel.agenda.length - 1 ? <span style={{ background: "var(--border-2)", flex: 1, marginTop: 4, width: 2 }} /> : null}
            </div>
            <div style={{ marginTop: -3 }}>
              <div style={{ alignItems: "baseline", display: "flex", gap: 10 }}>
                <span className="mono" style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
                  {item.time}
                </span>
                <span style={{ color: "var(--ink)", fontSize: 14.5, fontWeight: 600 }}>{item.label}</span>
                {index === 2 ? (
                  <span className="badge badge-live" style={{ height: 20 }}>
                    {t({ en: "Live", zh: "进行中" })}
                  </span>
                ) : null}
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 3 }}>{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyTable({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const seatCount = 8;

  return (
    <div className="orbit-party-table-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-table-header">
        <div>
          <div className="eyebrow">YOUR TABLE</div>
          <h1 className="h-display orbit-party-table-title">
            {t({ en: "Group ", zh: "第 " })}
            <span>1</span>
            {t({ en: " · Round table", zh: " 组 · 圆桌" })}
          </h1>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span className="chip chip-accent">{t({ en: "Seat", zh: "座位" })} {viewModel.me.seat}</span>
        </div>
      </div>
      <div className="orbit-party-table-seat-scene" style={{ height: 350, margin: "20px auto 30px", position: "relative", width: 350 }}>
        <div className="orbit-party-table-center">
          <div className="h-display orbit-party-table-code">1</div>
          <div className="orbit-party-table-meta">TABLE</div>
          <span className="chip chip-accent orbit-party-table-pill" style={{ height: 24 }}>
            {viewModel.tableMates.length + 1} {t({ en: "people", zh: "人" })}
          </span>
        </div>
        {Array.from({ length: seatCount }).map((_, index) => {
          const angle = (2 * Math.PI * index) / seatCount - Math.PI / 2;
          const x = 175 + Math.cos(angle) * 150;
          const y = 175 + Math.sin(angle) * 150;
          const mate = index > 0 ? viewModel.tableMates[index - 1] : undefined;
          return (
            <div key={index} style={{ left: x, position: "absolute", top: y, transform: "translate(-50%,-50%)" }}>
              {index === 0 ? (
                <div style={{ position: "relative" }}>
                  <span className="avatar g-indigo" style={{ fontSize: 18, height: 44, width: 44 }}>
                    {viewModel.me.initial}
                  </span>
                  <span className="orbit-party-table-you">YOU</span>
                </div>
              ) : mate ? (
                <span className={`avatar ${mate.g}`} style={{ fontSize: 16, height: 40, width: 40 }} title={mate.name}>
                  {mate.initial}
                </span>
              ) : (
                <div className="orbit-party-table-empty-seat" />
              )}
            </div>
          );
        })}
      </div>
      <div className="card orbit-party-table-icebreaker">
        <div className="orbit-party-table-block-head">
          <Icon name="sparkle" size={16} />
          {t({ en: "Table icebreakers", zh: "全桌破冰" })}
        </div>
        <div className="orbit-party-table-icebreaker-list">
          {viewModel.icebreakers.map((question, index) => (
            <div className="orbit-party-table-icebreaker-item" key={question}>
              <span>0{index + 1}</span>
              <p>{question}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="orbit-party-table-member-head">
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "People at your table", zh: "同桌的人" })}
        </h2>
      </div>
      <div className="orbit-party-table-member-list">
        {viewModel.tableMates.map((mate) => (
          <div className="orbit-party-table-member" key={mate.id}>
            <span className={`avatar ${mate.g}`} style={{ fontSize: 18, height: 44, width: 44 }}>
              {mate.initial}
            </span>
            <div className="orbit-party-table-member-body">
              <div className="orbit-party-table-member-name">
                {mate.name} · {mate.title}
              </div>
              <div className="orbit-party-table-member-meta">
                {mate.company} · {t({ en: "Seat", zh: "座位" })} {mate.seat}
              </div>
              <div className="orbit-party-table-member-prompt">
                <span>{t({ en: "Icebreaker", zh: "破冰" })}</span>
                {mate.icebreakers[0]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyRecommendations({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const list = useMemo(
    () =>
      viewModel.recommendations.filter((person) => {
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return true;
        return [person.name, person.company, person.industry].join(" ").toLowerCase().includes(trimmed);
      }),
    [query, viewModel.recommendations],
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
      <div className="orbit-party-network-toolbar">
        <div className="orbit-party-network-search">
          <Icon color="var(--text-3)" name="search" size={17} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" })} value={query} />
        </div>
        <button aria-label={t({ en: "Filter", zh: "筛选" })} className="btn btn-ghost orbit-party-network-filter hit-44" type="button">
          <Icon name="filter" size={18} />
        </button>
      </div>
      <div className="orbit-party-network-list">
        {list.map((person) => (
          <NetworkPerson added={added[person.id]} key={person.id} onAdd={() => setAdded((current) => ({ ...current, [person.id]: true }))} p={person} t={t} />
        ))}
      </div>
    </div>
  );
}

function PartyAttendees({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
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
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{t({ en: `${attendees.length + 1} attendees in total`, zh: `共 ${attendees.length + 1} 位参会者` })}</div>
        </div>
        <div className="orbit-party-network-search orbit-party-attendees-search">
          <Icon color="var(--text-3)" name="search" size={17} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search attendees", zh: "搜索参会者" })} value={query} />
        </div>
      </div>
      <div className="orbit-party-attendee-grid">
        <div className="card orbit-party-attendee-card">
          <span className="avatar g-indigo orbit-party-attendee-avatar">{viewModel.me.initial}</span>
          <div className="orbit-party-attendee-body">
            <div className="orbit-party-attendee-name">{viewModel.me.name}</div>
            <div className="orbit-party-attendee-meta">{viewModel.me.role}</div>
            <div className="orbit-party-attendee-summary">{t({ en: "My seat", zh: "我的席位" })} · {viewModel.me.seat}</div>
            <div className="orbit-party-attendee-tags">
              {viewModel.me.topics.slice(0, 3).map((topic) => (
                <span className="chip" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
          </div>
          <span className="chip chip-accent orbit-party-attendee-seat">{viewModel.me.seat}</span>
        </div>
        {list.map((person) => (
          <div className="card orbit-party-attendee-card" key={person.id}>
            <span className={`avatar ${person.g} orbit-party-attendee-avatar`}>{person.initial}</span>
            <div className="orbit-party-attendee-body">
              <div className="orbit-party-attendee-name">{person.name}</div>
              <div className="orbit-party-attendee-meta">
                {person.company} · {person.title}
              </div>
              <div className="orbit-party-attendee-summary">{person.summary}</div>
              <div className="orbit-party-attendee-tags">
                <span className="chip chip-accent">{person.industry}</span>
                {person.topics.map((topic) => (
                  <span className="chip" key={topic}>
                    {topic}
                  </span>
                ))}
              </div>
            </div>
            <span className="chip chip-accent orbit-party-attendee-seat">{person.seat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyAgenda({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  return (
    <div className="orbit-party-agenda-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 32px" }}>
      <div className="orbit-party-network-header">
        <div>
          <div className="eyebrow">AGENDA</div>
          <h1 className="h-display orbit-party-network-title">{t({ en: "Agenda", zh: "流程议程" })}</h1>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>{`Tokyo Business Connect · ${t({ en: "Tonight's agenda", zh: "今晚流程" })}`}</div>
        </div>
        <span className="badge badge-ended">{t({ en: "Ended", zh: "已结束" })}</span>
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
              <strong>{item.label}</strong>
              <p>{item.description}</p>
            </div>
            <span className="orbit-party-agenda-status">{t({ en: "Ended", zh: "已结束" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const graphColors: Record<string, string> = {
  AI: "#8AA4C8",
  SaaS: "#8AA4C8",
  云计算: "#9B8CC6",
  消费电子: "#C2998A",
  电商: "#D97B5E",
  风险投资: "#C4A25E",
  金融: "#6359E9",
  硬件: "#7D7870",
  综合商社: "#6359E9",
};

function graphColor(industry: string) {
  return graphColors[industry] ?? "#8B7E74";
}

function SocialGraphLite({
  height = 560,
  me,
  onSelect,
  people,
  scale,
  width = 720,
}: {
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
      r: 18 + Math.min(14, (person.score - 80) * 1),
      x: cx + Math.cos(angle) * radius * (0.78 + (index % 3) * 0.13),
      y: cy + Math.sin(angle) * radius * (0.78 + (index % 3) * 0.13),
    };
  });

  return (
    <svg style={{ aspectRatio: `${width} / ${height}`, display: "block", maxHeight: "76vh", width: "100%" }} viewBox={`0 0 ${width} ${height}`} width="100%">
      <defs>
        <pattern height="24" id="pg-dot" patternUnits="userSpaceOnUse" width="24">
          <circle cx="0.6" cy="0.6" fill="rgba(20,20,28,0.06)" r="0.6" />
        </pattern>
      </defs>
      <rect fill="url(#pg-dot)" height={height} rx="22" width={width} />
      <g transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`}>
        {nodes.map((node) => (
          <line key={`l${node.id}`} stroke="rgba(99,89,233,0.35)" strokeWidth="1.2" x1={cx} x2={node.x} y1={cy} y2={node.y} />
        ))}
        {nodes.map((node) => {
          const color = graphColor(node.industry);
          return (
            <g key={node.id} onClick={() => onSelect(node)} style={{ cursor: "pointer" }} transform={`translate(${node.x} ${node.y})`}>
              <circle fill={color} fillOpacity={0.1} r={node.r + 5} />
              <circle fill="#fff" r={node.r} stroke={color} strokeWidth="1.6" />
              <text dominantBaseline="central" fill="#1D1D22" fontFamily="var(--ff-tight)" fontSize={Math.max(11, node.r * 0.7)} fontWeight="600" textAnchor="middle">
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
        <text dominantBaseline="central" fill="var(--accent)" fontFamily="var(--ff-tight)" fontSize="24" fontWeight="700" textAnchor="middle">
          {me.initial}
        </text>
        <text fill="var(--accent)" fontFamily="var(--ff-mono)" fontSize="9" fontWeight="600" letterSpacing="0.28em" textAnchor="middle" y="-46">
          YOU
        </text>
      </g>
    </svg>
  );
}

function PersonDetailOverlay({ onClose, person, t }: { onClose: () => void; person: OrbitPartyPersonView; t: Translate }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ alignItems: "flex-end", background: "var(--scrim)", display: "flex", inset: 0, justifyContent: "center", padding: 16, position: "fixed", zIndex: 50 }}>
      <div className="card" onClick={(event) => event.stopPropagation()} style={{ borderRadius: 24, maxHeight: "88vh", overflowY: "auto", width: "min(100%, 460px)" }}>
        <div style={{ background: "var(--surface)", padding: "16px 18px 0", position: "sticky", top: 0 }}>
          <button aria-label={t({ en: "Back to graph", zh: "返回图谱" })} className="btn btn-ghost btn-sm" onClick={onClose} type="button">
            <Icon name="chevL" size={16} />
            {t({ en: "Back to graph", zh: "返回图谱" })}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div className="eyebrow">{person.company}</div>
          <h2 className="h-display" style={{ marginTop: 10 }}>
            {person.name}
          </h2>
          <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>
            {person.company} · {person.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <span className="chip chip-accent">{person.industry}</span>
            <span className="chip">
              {t({ en: `Group ${person.groupNumber}`, zh: `第${person.groupNumber}组` })} / {person.seat}
            </span>
          </div>
          <p style={{ color: "var(--text)", lineHeight: 1.8, marginTop: 18 }}>{person.summary}</p>
          <p style={{ color: "var(--text-2)", lineHeight: 1.8, marginTop: 12 }}>{person.reason}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {person.topics.map((topic) => (
              <span className="chip" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrbitRealPartyCheckin() {
  const { t } = useOrbitLanguage();
  const [checkedIn, setCheckedIn] = useState(false);
  const [redirectIn, setRedirectIn] = useState(3);
  const [returnedToParty, setReturnedToParty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const returnToParty = useCallback(() => {
    window.history.pushState(null, "", productHref("/party"));
    setReturnedToParty(true);
  }, []);

  useEffect(() => {
    if (!checkedIn) return undefined;

    setRedirectIn(3);

    const interval = window.setInterval(() => setRedirectIn((value) => (value > 0 ? value - 1 : 0)), 1000);
    const timeout = window.setTimeout(returnToParty, 3000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checkedIn, returnToParty]);

  function submit() {
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setCheckedIn(true);
    }, 700);
  }

  if (returnedToParty) {
    return <OrbitRealParty viewModel={getOrbitPartyViewModel()} />;
  }

  if (checkedIn) {
    return (
      <div className="orbit-party-page orbit-live-checkin-page">
        <header className="orbit-party-checkin-top">
          <Logo size={23} />
          <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
            {t({ en: "ZH / JA", zh: "中 / 日" })}
          </span>
        </header>
        <main className="orbit-party-checkin-shell">
          <section className="orbit-party-done-card card">
            <div className="orbit-party-done-mark">
              <Icon name="check" size={42} stroke={2.2} />
            </div>
            <div className="eyebrow">CHECK-IN COMPLETE</div>
            <h1 className="h-title">{t({ en: "Check-in complete", zh: "签到完毕" })}</h1>
            <p className="orbit-party-done-event">Tokyo Business Connect</p>
            <div className="orbit-party-done-meta">
              <span className="badge badge-live">
                <Icon name="check" size={13} />
                {t({ en: "Checked in", zh: "已签到" })}
              </span>
              <span className="mono">{t({ en: `Returning to event home in ${redirectIn}s`, zh: `${redirectIn} 秒后返回活动主页` })}</span>
            </div>
            <button className="btn btn-primary btn-lg btn-block" onClick={returnToParty} type="button">
              <Icon color="var(--on-accent)" name="arrow" size={18} />
              {t({ en: "Return now", zh: "立即返回" })}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="orbit-party-page orbit-live-checkin-page">
      <header className="orbit-party-checkin-top">
        <button aria-label={t({ en: "Back", zh: "返回" })} className="orbit-party-icon-button hit-44" onClick={returnToParty} type="button">
          <Icon name="chevL" size={20} />
        </button>
        <div className="orbit-party-checkin-title">
          <div className="eyebrow">STEP 03 / 03</div>
          <div>{t({ en: "On-site check-in", zh: "现场签到" })}</div>
        </div>
        <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
          {t({ en: "ZH / JA", zh: "中 / 日" })}
        </span>
      </header>
      <main className="orbit-party-checkin-shell">
        <section className="orbit-party-checkin-hero card">
          <div className="orbit-party-checkin-meta">
            <span className="eyebrow">{t({ en: "On-site check-in", zh: "现场签到" })}</span>
            <span className="badge badge-live">
              <span className="dot dot-live" />
              {t({ en: "Live", zh: "进行中" })}
            </span>
          </div>
          <div className="orbit-party-checkin-icon">
            <Icon name="ticket" size={30} />
          </div>
          <h1 className="h-display">
            {t({ en: "Tap the button", zh: "点击按钮" })}<span>{t({ en: "to check in", zh: "完成签到" })}</span>
          </h1>
          <p>{t({ en: "Once check-in opens, tap the button below to check in. No QR code needed.", zh: "签到开放后，点击下方按钮即可完成签到。无需扫描二维码。" })}</p>
          <div className="orbit-party-status-strip">
            <span className="eyebrow">{t({ en: "Current status", zh: "当前状态" })}</span>
            <strong>{t({ en: "Ready to check in", zh: "可以签到" })}</strong>
          </div>
        </section>
        <section className="orbit-party-action-card card">
          <div className="orbit-party-card-head">
            <div>
              <div className="eyebrow">{t({ en: "On-site check-in", zh: "现场签到" })}</div>
              <h2 className="h-section">{t({ en: "One-tap check-in", zh: "一键签到" })}</h2>
            </div>
            <span className="chip chip-accent">{t({ en: "Open", zh: "开放中" })}</span>
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={submitting} onClick={submit} type="button">
            <Icon color="var(--on-accent)" name={submitting ? "clock" : "check"} size={18} />
            {submitting ? t({ en: "Checking in...", zh: "签到中..." }) : t({ en: "One-tap check-in", zh: "一键签到" })}
          </button>
          <div className="orbit-party-note">
            <span className="dot dot-live" />
            <div>{t({ en: "Your check-in time is recorded when you tap the button.", zh: "点击按钮后会记录你的签到时间。" })}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function OrbitRealPartyGraph({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const { t } = useOrbitLanguage();
  const [bulkMessage, setBulkMessage] = useState("");
  const [scale, setScale] = useState(0.95);
  const [selected, setSelected] = useState<OrbitPartyPersonView | null>(null);

  return (
    <div className="orbit-party-graph-screen" data-orbit-real-page style={{ minHeight: "100dvh" }}>
      <div style={{ margin: "0 auto", maxWidth: 720, minHeight: "100dvh", padding: "18px clamp(16px,4vw,32px) 48px", position: "relative", zIndex: 1 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
          <button aria-label={t({ en: "Back", zh: "返回" })} className="btn btn-ghost hit-44" onClick={() => navigateTo("/app/party")} style={{ minWidth: 40, padding: 0 }} type="button">
            <Icon name="chevL" size={18} />
          </button>
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>
              STEP 02 / 02
            </div>
            <div style={{ color: "var(--ink)", fontSize: 12 }}>{t({ en: "Social graph", zh: "社交图谱" })}</div>
          </div>
          <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
            {t({ en: "ZH / JA", zh: "中 / 日" })}
          </span>
        </div>
        <div style={{ background: "linear-gradient(180deg, var(--surface) 0%, var(--bg-sunken) 100%)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--sh-lg)", marginTop: 16, padding: 22 }}>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontFamily: "var(--ff-mono)", fontSize: 10, justifyContent: "space-between", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            <span>SOCIAL GRAPH</span>
            <span className="badge badge-live">
              <span className="dot dot-live" />
              {t({ en: "Open", zh: "已开放" })}
            </span>
          </div>
          <h1 className="h-display" style={{ lineHeight: 0.94, marginTop: 18 }}>
            {t({ en: "Tonight's", zh: "今晚的" })}
            <br />
            <span style={{ color: "var(--accent)" }}>{t({ en: "connection map.", zh: "连接图。" })}</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.8, marginTop: 16 }}>{t({ en: "Zoom in to see the whole night's connections. You can zoom and tap any node to view their details.", zh: "放大看一眼整场连接关系。你可以缩放，并点击任意节点查看对方详情。" })}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <span className="chip badge-live">{t({ en: "Results open", zh: "结果已开放" })}</span>
            <span className="chip chip-accent">{t({ en: `${viewModel.recommendations.length} nodes`, zh: `${viewModel.recommendations.length} 个节点` })}</span>
            <span className="chip chip-accent">{t({ en: `${viewModel.recommendations.length} connections`, zh: `${viewModel.recommendations.length} 条连接` })}</span>
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
          <div style={{ alignItems: "center", display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => setBulkMessage(t({ en: `Added ${viewModel.recommendations.length} people to your wallet`, zh: `已把 ${viewModel.recommendations.length} 位加入名片夹` }))} style={{ flex: 1 }} type="button">
              <Icon color="var(--on-dark)" name="wallet" size={16} />
              {t({ en: "Add all current contacts to wallet", zh: "把当前人脉全部加入名片夹" })}
            </button>
          </div>
          {bulkMessage ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 12 }}>{bulkMessage}</div> : null}
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
          <SocialGraphLite height={700} me={viewModel.me} onSelect={setSelected} people={viewModel.recommendations} scale={scale} width={880} />
        </div>
      </div>
      {selected ? <PersonDetailOverlay onClose={() => setSelected(null)} person={selected} t={t} /> : null}
    </div>
  );
}

function PartyGraphInline({ t, viewModel }: { t: Translate; viewModel: OrbitPartyViewModel }) {
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<OrbitPartyPersonView | null>(null);

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
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">{t({ en: "Nodes", zh: "节点" })}</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">{t({ en: "Connections", zh: "连接" })}</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{t({ en: "Open", zh: "已开放" })}</div>
          <div className="mono">{t({ en: "Results", zh: "结果" })}</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 14 }}>
        <SocialGraphLite me={viewModel.me} onSelect={setSelected} people={viewModel.recommendations} scale={scale} />
      </div>
      {selected ? <PersonDetailOverlay onClose={() => setSelected(null)} person={selected} t={t} /> : null}
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
            <span className="chip chip-accent" style={{ height: 24 }}>
              {t({ en: `Group ${viewModel.me.groupNumber}`, zh: `第${viewModel.me.groupNumber}组` })}
            </span>
            <span className="chip" style={{ height: 24 }}>
              {t({ en: "Seat", zh: "座位" })} {viewModel.me.seat}
            </span>
          </div>
        </div>
      </div>
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
          onClick={() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          type="button"
        >
          <Icon name={copied ? "check" : "copy"} size={16} />
        </button>
      </div>
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

  return (
    <div className="orbit-party-page" data-orbit-real-page style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", position: "relative" }}>
      <PublicTopNav active="events" />
      <PartyDesktopChrome onExit={returnToBeforeParty} setTab={setTab} t={t} tab={tab} viewModel={viewModel} />
      <PartyMobileTopTabs onExit={returnToBeforeParty} setTab={setTab} t={t} tab={tab} />
      {tab === "home" ? <PartyHome go={setTab} t={t} viewModel={viewModel} /> : null}
      {tab === "table" ? <PartyTable t={t} viewModel={viewModel} /> : null}
      {tab === "recommendations" ? <PartyRecommendations t={t} viewModel={viewModel} /> : null}
      {tab === "attendees" ? <PartyAttendees t={t} viewModel={viewModel} /> : null}
      {tab === "graph" ? <PartyGraphInline t={t} viewModel={viewModel} /> : null}
      {tab === "agenda" ? <PartyAgenda t={t} viewModel={viewModel} /> : null}
    </div>
  );
}
