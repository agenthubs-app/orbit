"use client";

import { useMemo, useState } from "react";

import type { OrbitLandingEventView, OrbitLandingViewModel } from "../orbit-landing-route-view-model";
import { productHref, PublicBottomTab, PublicTopNav } from "../orbit-public-shell";
import { Cover, gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";

const tz = { timeZone: "Asia/Tokyo" };
const statusFilters = [["all", "全部"], ["upcoming", "即将开始"], ["active", "进行中"], ["ended", "已结束"]] as const;

interface MappedEvent {
  code: string;
  day: string;
  g: string;
  id: string;
  imageUrl: string;
  month: string;
  name: string;
  people: number;
  place: string;
  pos: { x: number; y: number };
  status: OrbitLandingEventView["status"];
  sub: string;
  time: string;
}

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...tz }).format(date);
}

function formatEventDate(event: OrbitLandingEventView) {
  const date = new Date(event.startsAt);
  if (!Number.isFinite(date.getTime())) return { month: "待定", day: "", time: "时间待定" };
  return {
    month: fmtMonth(date),
    day: fmtDay(date),
    time: new Intl.DateTimeFormat("zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit", ...tz }).format(date),
  };
}

function eventTopics(event: OrbitLandingEventView) {
  return [...new Set([event.industry, ...event.tags].map((item) => item.trim()).filter(Boolean))];
}

function mapEvent(event: OrbitLandingEventView): MappedEvent {
  const date = formatEventDate(event);
  const name = event.name || event.code || "未命名活动";
  return {
    code: event.code,
    day: date.day,
    g: gradientFromString(event.code || name),
    id: event.id || event.code,
    imageUrl: event.logoUrl,
    month: date.month,
    name,
    people: event.participantCount,
    place: event.place,
    pos: { x: event.mapX, y: event.mapY },
    status: event.status,
    sub: [event.theme, event.host, event.code].filter(Boolean).join(" · "),
    time: date.time,
  };
}

function EventCard({ event }: { event: OrbitLandingEventView }) {
  const mapped = mapEvent(event);
  const actionLabel = event.status === "upcoming" || event.status === "active" ? "报名" : "查看";
  const cardTime = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...tz }).format(new Date(event.startsAt));

  return (
    <a className="orbit-card-link" href={productHref(`/events/${event.code}`)}>
      <article className="card card-hover orbit-event-card">
        <Cover className="orbit-card-cover" g={mapped.g} imageAlt={mapped.name} imageUrl={mapped.imageUrl} monogram={mapped.imageUrl ? null : { text: mapped.name.slice(0, 1), size: 46 }} style={{ height: undefined, opacity: event.status === "ended" ? 0.72 : 1 }}>
          <div style={{ left: 12, position: "absolute", top: 12 }}><StatusBadge status={event.status} /></div>
          <div className="orbit-card-date">
            <div style={{ color: "var(--rose)", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{mapped.month}</div>
            <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{mapped.day}</div>
          </div>
        </Cover>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 9, padding: "15px 16px 16px" }}>
          <div>
            <h3 className="h-section" style={{ color: "var(--ink)", fontSize: 17, margin: 0, overflowWrap: "anywhere" }}>{mapped.name}</h3>
            <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2 }}>{[event.theme, event.host].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ color: "var(--text-2)", display: "flex", flexDirection: "column", fontSize: 13, gap: 6 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="clock" size={15} />{cardTime}</div>
            <div style={{ alignItems: "center", display: "flex", gap: 8 }}><Icon color="var(--text-3)" name="pin" size={15} />{mapped.place}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", gap: 12, justifyContent: "space-between", paddingTop: 11 }}>
            <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12.5, gap: 6 }}><Icon color="var(--text-3)" name="users" size={15} />{mapped.people} 人已报名</span>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 3 }}>{actionLabel}<Icon name="chevR" size={14} /></span>
          </div>
        </div>
      </article>
    </a>
  );
}

function MapCanvas({ items, selected, onSelect }: { items: MappedEvent[]; selected: MappedEvent | null; onSelect: (item: MappedEvent) => void }) {
  return (
    <div className="orbit-map-canvas-inner" style={{ background: "#EAEDE6", inset: 0, overflow: "hidden", position: "absolute" }}>
      <svg aria-hidden preserveAspectRatio="xMidYMid slice" style={{ height: "100%", inset: 0, maxWidth: "none", position: "absolute", width: "100%" }} viewBox="0 0 100 100" height="100%" width="100%">
        <defs><linearGradient id="orbit-water" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#AED4E6" /><stop offset="100%" stopColor="#9AC7DD" /></linearGradient></defs>
        <path d="M 100 60 Q 80 64 78 78 Q 76 92 90 100 L 100 100 Z" fill="url(#orbit-water)" />
        <path d="M 0 92 Q 30 86 42 92 L 44 100 L 0 100 Z" fill="url(#orbit-water)" />
        <ellipse cx="38" cy="42" fill="#CADEB8" rx="7" ry="5.5" /><ellipse cx="66" cy="30" fill="#CADEB8" rx="5" ry="4" /><ellipse cx="22" cy="58" fill="#CADEB8" rx="6" ry="5" />
        <g fill="none" opacity="0.95" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="2.4"><path d="M -5 50 Q 30 46 55 52 T 105 48" /><path d="M 50 -5 Q 46 30 52 55 T 48 105" /><path d="M 10 10 Q 45 40 90 90" /><path d="M 90 12 Q 60 45 18 88" /></g>
        <g fill="none" opacity="0.9" stroke="#F3D98B" strokeLinecap="round" strokeWidth="3"><path d="M -5 64 Q 40 58 70 66 T 105 62" /><path d="M 64 -5 Q 60 40 66 80" /></g>
        <g fill="none" opacity="0.7" stroke="#FFFFFF" strokeWidth="0.8"><path d="M 20 0 L 24 100" /><path d="M 36 0 L 40 100" /><path d="M 76 0 L 80 100" /><path d="M 0 28 L 100 24" /><path d="M 0 76 L 100 80" /></g>
      </svg>
      {items.map((item) => {
        const on = selected?.id === item.id;
        return (
          <button key={item.id} type="button" onClick={() => onSelect(item)} style={{ background: "none", border: "none", cursor: "pointer", left: `${item.pos.x}%`, padding: 0, position: "absolute", top: `${item.pos.y}%`, transform: "translate(-50%,-100%)", zIndex: on ? 20 : 10 }}>
            <div style={{ position: "relative", transform: on ? "scale(1.15)" : "scale(1)", transition: "transform .15s" }}>
              <svg aria-hidden height={on ? 56 : 46} style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.22))", height: on ? 56 : 46, maxWidth: "none", width: on ? 44 : 36 }} viewBox="0 0 36 46" width={on ? 44 : 36}>
                <path d="M18 1C9 1 2 8 2 17c0 11 16 27 16 27s16-16 16-27c0-9-7-16-16-16Z" fill={on ? "var(--accent)" : "#fff"} stroke={on ? "var(--accent)" : "var(--border-2)"} strokeWidth="1" />
              </svg>
              <div style={{ alignItems: "center", background: on ? "#fff" : undefined, borderRadius: 999, color: on ? "var(--accent)" : "#fff", display: "flex", fontFamily: "var(--ff-tight)", fontSize: on ? 13 : 11, fontWeight: 700, height: on ? 26 : 22, justifyContent: "center", left: "50%", position: "absolute", top: on ? 7 : 6, transform: "translateX(-50%)", width: on ? 26 : 22 }}>
                {on ? item.name.slice(0, 1) : <span className={`avatar ${item.g}`} style={{ fontSize: 11, height: "100%", width: "100%" }}>{item.name.slice(0, 1)}</span>}
              </div>
            </div>
          </button>
        );
      })}
      <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 6, bottom: 14, color: "var(--text-3)", fontSize: 11, left: 14, padding: "3px 8px", position: "absolute" }}>东京 · Tokyo</div>
    </div>
  );
}

function MapEventCard({ item }: { item: MappedEvent }) {
  return (
    <div className="card" style={{ alignItems: "center", boxShadow: "var(--sh-lg)", display: "flex", gap: 13, padding: 14 }}>
      <Cover g={item.g} monogram={{ text: item.name.slice(0, 1), size: 26 }} style={{ borderRadius: 13, flexShrink: 0, height: 64, width: 64 }}>
        <div style={{ left: 6, position: "absolute", top: 6 }}><StatusBadge status={item.status} /></div>
      </Cover>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="h-section" style={{ color: "var(--ink)", fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2 }}>{item.day ? `${item.month}${item.day}日 · ${item.time}` : item.time}</div>
        <div style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12, gap: 8, marginTop: 6 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="pin" size={13} />{item.place}</span>
          <span style={{ background: "var(--border-strong)", borderRadius: 999, height: 3, width: 3 }} />
          <span>{item.people} 人</span>
        </div>
      </div>
      <a className="btn btn-primary btn-sm" href={productHref(`/events/${item.code}`)} style={{ flexShrink: 0, textDecoration: "none" }}>查看<Icon color="#fff" name="chevR" size={15} /></a>
    </div>
  );
}

function MobileExploreCard({ item }: { item: MappedEvent }) {
  const actionLabel = item.status === "upcoming" || item.status === "active" ? "报名" : "查看";

  return (
    <a className="card card-hover" href={productHref(`/events/${item.code}`)} style={{ display: "block", overflow: "hidden", textDecoration: "none" }}>
      <Cover g={item.g} monogram={{ text: item.name.slice(0, 1), size: 40 }} style={{ height: 128, opacity: item.status === "ended" ? 0.72 : 1 }}>
        <div style={{ left: 11, position: "absolute", top: 11 }}><StatusBadge status={item.status} /></div>
        <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 9, minWidth: 42, padding: "4px 8px", position: "absolute", right: 11, textAlign: "center", top: 11 }}>
          <div style={{ color: "var(--rose)", fontSize: 9.5, fontWeight: 700 }}>{item.month}</div>
          {item.day ? <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{item.day}</div> : null}
        </div>
      </Cover>
      <div style={{ padding: "14px 14px 13px" }}>
        <h2 className="h-section" style={{ color: "var(--ink)", fontSize: 16, margin: 0 }}>{item.name}</h2>
        {item.sub ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{item.sub}</div> : null}
        <div style={{ color: "var(--text-2)", display: "flex", flexWrap: "wrap", fontSize: 12.5, gap: 14, marginTop: 10 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 5 }}><Icon color="var(--text-3)" name="clock" size={14} />{item.time}</span>
          <span style={{ alignItems: "center", display: "flex", gap: 5 }}><Icon color="var(--text-3)" name="pin" size={14} />{item.place}</span>
        </div>
        <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12 }}>
          <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12.5, gap: 6 }}><Icon color="var(--text-3)" name="users" size={14} />{item.people} 人</span>
          <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 2 }}>{actionLabel}<Icon name="chevR" size={13} /></span>
        </div>
      </div>
    </a>
  );
}

export function OrbitRealExploreClient({ viewModel }: { viewModel: OrbitLandingViewModel }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [topic, setTopic] = useState("all");
  const [mode, setMode] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const events = viewModel.events;
  const topicFilters = useMemo(() => [...new Set(events.flatMap(eventTopics))].slice(0, 8), [events]);
  const filtered = useMemo(() => events.filter((event) => {
    const matchesStatus = status === "all" || event.status === status;
    const matchesTopic = topic === "all" || eventTopics(event).includes(topic);
    const matchesQuery = !query || event.name.includes(query) || event.code.includes(query) || event.theme.includes(query);
    return matchesStatus && matchesTopic && matchesQuery;
  }), [events, query, status, topic]);
  const mapItems = useMemo(() => filtered.map(mapEvent), [filtered]);
  const located = mapItems.filter((item) => Number.isFinite(item.pos.x) && Number.isFinite(item.pos.y));
  const canShowMap = located.length > 0;
  const effMode = mode === "map" && canShowMap ? "map" : "list";
  const selectedItem = located.find((item) => item.id === selectedId) ?? located[0] ?? null;
  const resultLabel = filtered.length === 0 ? "没有匹配的开放活动。" : `${filtered.length} 场活动`;

  return (
    <div className="orbit-shell" data-orbit-real-page="explore">
      <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <PublicTopNav />
        <main className="orbit-main" data-appscroll>
          <div className="orbit-browse-head">
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>EXPLORE · 东京</div><h1 className="h-display" style={{ fontSize: 40, margin: 0 }}>发现活动</h1></div>
            <div className="orbit-browse-tools">
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, display: "inline-flex", padding: 3 }}>
                <button type="button" onClick={() => setMode("list")} style={{ alignItems: "center", background: effMode === "list" ? "var(--ink)" : "none", border: "none", borderRadius: 999, color: effMode === "list" ? "#fff" : "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 550, gap: 5, padding: "7px 14px" }}><Icon color={effMode === "list" ? "#fff" : undefined} name="list" size={15} />列表</button>
                {canShowMap ? <button type="button" onClick={() => setMode("map")} style={{ alignItems: "center", background: effMode === "map" ? "var(--ink)" : "none", border: "none", borderRadius: 999, color: effMode === "map" ? "#fff" : "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 550, gap: 5, padding: "7px 14px" }}><Icon color={effMode === "map" ? "#fff" : undefined} name="pin" size={15} />地图</button> : null}
              </div>
              <div className="orbit-search-box">
                <Icon color="var(--text-3)" name="search" size={18} style={{ left: 14, position: "absolute", top: 15 }} />
                <input className="field" onChange={(event) => setQuery(event.target.value)} placeholder="搜索活动名称、编号或主题" style={{ paddingLeft: 42 }} value={query} />
              </div>
            </div>
          </div>
          <div className="orbit-filters">
            <div style={{ display: "flex", gap: 7 }}>{statusFilters.map(([key, label]) => <button key={key} className={`chip${status === key ? " is-active" : ""}`} onClick={() => setStatus(key)} type="button">{label}</button>)}</div>
            {topicFilters.length ? <><span style={{ background: "var(--border-2)", height: 22, width: 1 }} /><div style={{ display: "flex", gap: 7 }}>{topicFilters.map((item) => <button key={item} className={`chip${topic === item ? " is-active" : ""}`} onClick={() => setTopic(topic === item ? "all" : item)} type="button">{item}</button>)}</div></> : null}
          </div>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 16, marginTop: 20 }}>{resultLabel}</div>
          {effMode === "list" && filtered.length > 0 ? <div className="orbit-grid">{filtered.map((event) => <EventCard event={event} key={event.id} />)}</div> : null}
          {effMode === "map" && mapItems.length > 0 ? (
            <section className="orbit-map-shell" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--sh-sm)", display: "grid", gridTemplateColumns: "380px 1fr", height: "min(680px, calc(100dvh - 220px))", minHeight: 520, overflow: "hidden" }}>
              <div className="orbit-map-rail scroll" style={{ borderRight: "1px solid var(--border)", overflowY: "auto", padding: "20px 18px" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 14 }}><h2 className="h-title" style={{ fontSize: 22, margin: 0 }}>发现活动</h2><span style={{ color: "var(--text-3)", fontSize: 12.5 }}>{located.length} 个位置</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {mapItems.map((item) => {
                    const on = selectedItem?.id === item.id;
                    return (
                      <button key={item.id} className="card-hover" onClick={() => setSelectedId(item.id)} style={{ background: on ? "var(--accent-softer)" : "var(--surface)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 13, cursor: "pointer", display: "flex", gap: 12, padding: 11, textAlign: "left" }} type="button">
                        <Cover g={item.g} monogram={{ text: item.name.slice(0, 1), size: 22 }} style={{ borderRadius: 11, flexShrink: 0, height: 54, width: 54 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="h-section" style={{ color: "var(--ink)", display: "block", fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                          <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, marginTop: 2 }}>{[item.day ? `${item.month}${item.day}日` : item.time, item.place].filter(Boolean).join(" · ")}</span>
                          <span style={{ display: "block", marginTop: 6 }}><StatusBadge status={item.status} /></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="orbit-map-canvas" style={{ position: "relative" }}>
                <MapCanvas items={located} onSelect={(item) => setSelectedId(item.id)} selected={selectedItem} />
                {selectedItem ? <div style={{ bottom: 20, left: 20, maxWidth: 420, position: "absolute", right: 20 }}><MapEventCard item={selectedItem} /></div> : null}
              </div>
            </section>
          ) : null}
        </main>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <div style={{ flexShrink: 0, padding: "16px 18px 0" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", marginBottom: 14 }}>
            <div><div className="eyebrow" style={{ marginBottom: 4 }}>EXPLORE</div><h1 className="h-display" style={{ fontSize: 27, margin: 0 }}>发现活动</h1></div>
            <button disabled={!canShowMap} onClick={() => canShowMap && setMode(mode === "map" ? "list" : "map")} style={{ alignItems: "center", background: mode === "map" && canShowMap ? "var(--ink)" : "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 999, boxShadow: "var(--sh-xs)", color: mode === "map" && canShowMap ? "#fff" : "var(--text)", cursor: canShowMap ? "pointer" : "not-allowed", display: "flex", fontSize: 13, fontWeight: 550, gap: 6, height: 38, justifyContent: "center", opacity: canShowMap ? 1 : 0.45, padding: "0 13px" }} type="button"><Icon name="pin" size={15} />地图</button>
          </div>
          <div style={{ position: "relative" }}>
            <Icon color="var(--text-3)" name="search" size={17} style={{ left: 13, position: "absolute", top: 14 }} />
            <input className="field" onChange={(event) => setQuery(event.target.value)} placeholder="搜索活动名称、编号或主题" style={{ height: 44, paddingLeft: 40 }} value={query} />
          </div>
          <div className="scroll noscroll" style={{ display: "flex", gap: 7, margin: "0 -18px", overflowX: "auto", padding: "14px 18px 4px" }}>
            {statusFilters.map(([key, label]) => <button key={key} className={`chip${status === key ? " is-active" : ""}`} onClick={() => setStatus(key)} style={{ flexShrink: 0 }} type="button">{label}</button>)}
            {topicFilters.length ? <span style={{ background: "var(--border-2)", flexShrink: 0, margin: "4px 2px", width: 1 }} /> : null}
            {topicFilters.map((item) => <button key={item} className={`chip${topic === item ? " is-active" : ""}`} onClick={() => setTopic(topic === item ? "all" : item)} style={{ flexShrink: 0 }} type="button">{item}</button>)}
          </div>
        </div>
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 100px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px" }}>{resultLabel}</div>
          {effMode === "map" ? <section className="card" style={{ height: 360, marginBottom: 14, overflow: "hidden" }}><div style={{ height: "100%", position: "relative", width: "100%" }}><MapCanvas items={located} onSelect={(item) => setSelectedId(item.id)} selected={selectedItem} /></div></section> : null}
          {filtered.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{mapItems.map((item) => <MobileExploreCard item={item} key={item.id} />)}</div> : null}
        </div>
        <PublicBottomTab />
      </div>
    </div>
  );
}
