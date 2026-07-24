"use client";

import { useMemo, useState } from "react";

import type { OrbitLandingEventView, OrbitLandingViewModel } from "../orbit-landing-route-view-model";
import { useOrbitLanguage } from "../orbit-language-context";
import { productHref, PublicTopNav } from "../orbit-public-shell";
import { Cover, gradientFromString, Icon, StatusBadge } from "../orbit-reference-primitives";
import { getDemoEventSceneAsset } from "../../../../shared/demo-visual-assets";
import { ORBIT_Z } from "../orbit-z";

const tz = { timeZone: "Asia/Tokyo" };
const statusFilters = ["all", "upcoming", "active", "ended"] as const;

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

function fmtMonth(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "short", ...tz }).format(date);
}

function fmtDay(date: Date, language: "en" | "zh") {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { day: "2-digit", ...tz }).format(date);
}

function formatEventDate(event: OrbitLandingEventView, language: "en" | "zh") {
  const date = new Date(event.startsAt);
  if (!Number.isFinite(date.getTime())) return { month: language === "en" ? "TBD" : "待定", day: "", time: language === "en" ? "Time TBD" : "时间待定" };
  return {
    month: fmtMonth(date, language),
    day: fmtDay(date, language),
    time: new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit", ...tz }).format(date),
  };
}

function eventTopics(event: OrbitLandingEventView) {
  return [...new Set([event.industry, ...event.tags].map((item) => item.trim()).filter(Boolean))];
}

function mapEvent(event: OrbitLandingEventView, language: "en" | "zh"): MappedEvent {
  const date = formatEventDate(event, language);
  const name = event.name || event.code || (language === "en" ? "Untitled event" : "未命名活动");
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  return {
    code: event.code,
    day: date.day,
    g: gradientFromString(event.code || name),
    id: event.id || event.code,
    imageUrl: event.detailLogoUrl || event.logoUrl || sceneAsset?.src || "",
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

function EventModuleGrid({
  events,
}: {
  events: OrbitLandingEventView[];
}) {
  return (
    <div className="orbit-event-module-grid">
      {events.map((event) => (
        <EventModuleCard event={event} key={event.id} />
      ))}
    </div>
  );
}

function EventModuleCard({ event }: { event: OrbitLandingEventView }) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const mapped = mapEvent(event, language === "ja" ? "en" : language);
  const actionLabel = event.status === "upcoming" || event.status === "active" ? t({ en: "Register", zh: "报名" }) : t({ en: "View", zh: "查看" });
  const canEnter = Boolean(event.stats.youRsvped) && (event.status === "active" || event.status === "ended");
  const enterLabel = event.status === "ended" ? t({ en: "Replay", zh: "回看" }) : t({ en: "Enter", zh: "进入现场" });
  const cardTime = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...tz }).format(new Date(event.startsAt));
  const sceneAsset = getDemoEventSceneAsset(event.id) ?? getDemoEventSceneAsset(event.code);
  const topics = eventTopics(event).slice(0, 3);

  return (
    <a className="orbit-card-link" href={preserveHref(productHref(`/events/${event.code}`))}>
      <article
        className="card card-hover orbit-event-module-card"
        data-demo-visual-asset-id={sceneAsset?.assetId}
        data-demo-visual-source={sceneAsset?.sourceLabel}
        data-demo-visual-source-label={sceneAsset?.sourceLabel}
      >
        <Cover className="orbit-event-module-cover" g={mapped.g} imageAlt={mapped.name} imageUrl={mapped.imageUrl} monogram={mapped.imageUrl ? null : { text: mapped.name.slice(0, 1), size: 46 }} style={{ opacity: event.status === "ended" ? 0.74 : 1 }}>
          <div className="orbit-event-module-cover-top">
            <StatusBadge language={language} status={event.status} />
            <div className="orbit-card-date">
              <div style={{ color: "var(--rose-text)", fontSize: 11, fontWeight: 600, letterSpacing: "0.02em" }}>{mapped.month}</div>
              <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{mapped.day}</div>
            </div>
          </div>
        </Cover>
        <div className="orbit-event-module-body">
          <div className="orbit-event-module-copy">
            <span>{[event.theme, event.host].filter(Boolean).join(" · ")}</span>
            <h2>{mapped.name}</h2>
          </div>
          {topics.length > 0 ? (
            <div className="orbit-event-module-topic-row">
              {topics.map((topicItem) => (
                <span key={topicItem}>{topicItem}</span>
              ))}
            </div>
          ) : null}
          <div className="orbit-event-module-meta">
            <span><Icon color="var(--text-3)" name="clock" size={15} />{cardTime}</span>
            <span><Icon color="var(--text-3)" name="pin" size={15} />{mapped.place}</span>
            <span><Icon color="var(--text-3)" name="users" size={15} />{t({ en: `${mapped.people} registered`, zh: `${mapped.people} 人已报名` })}</span>
          </div>
          <div className="orbit-event-module-foot">
            <span>{event.status === "ended" ? t({ en: "Review event context", zh: "回看活动背景" }) : t({ en: "Open event context", zh: "打开活动背景" })}</span>
            {canEnter ? (
              <span role="button" tabIndex={0} onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.assign(preserveHref(productHref("/party"))); }} className="btn btn-soft btn-sm" style={{ height: 30, fontSize: 12.5 }}>{enterLabel}<Icon name="arrowUR" size={14} /></span>
            ) : (
              <strong>{actionLabel}<Icon name="chevR" size={14} /></strong>
            )}
          </div>
        </div>
      </article>
    </a>
  );
}

function MapCanvas({ items, selected, onSelect }: { items: MappedEvent[]; selected: MappedEvent | null; onSelect: (item: MappedEvent) => void }) {
  const { t } = useOrbitLanguage();
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
          <button key={item.id} type="button" onClick={() => onSelect(item)} style={{ background: "none", border: "none", cursor: "pointer", left: `${item.pos.x}%`, padding: 0, position: "absolute", top: `${item.pos.y}%`, transform: "translate(-50%,-100%)", zIndex: on ? ORBIT_Z.raised + 10 : ORBIT_Z.raised }}>
            <div style={{ position: "relative", transform: on ? "scale(1.15)" : "scale(1)", transition: "transform .15s" }}>
              <svg aria-hidden height={on ? 56 : 46} style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.22))", height: on ? 56 : 46, maxWidth: "none", width: on ? 44 : 36 }} viewBox="0 0 36 46" width={on ? 44 : 36}>
                <path d="M18 1C9 1 2 8 2 17c0 11 16 27 16 27s16-16 16-27c0-9-7-16-16-16Z" fill={on ? "var(--accent)" : "#fff"} stroke={on ? "var(--accent)" : "var(--border-2)"} strokeWidth="1" />
              </svg>
              <div style={{ alignItems: "center", background: on ? "#fff" : undefined, borderRadius: "var(--r-pill)", color: on ? "var(--accent)" : "#fff", display: "flex", fontFamily: "var(--ff-tight)", fontSize: on ? 13 : 11, fontWeight: 600, height: on ? 26 : 22, justifyContent: "center", left: "50%", position: "absolute", top: on ? 7 : 6, transform: "translateX(-50%)", width: on ? 26 : 22 }}>
                {on ? item.name.slice(0, 1) : <span className={`avatar ${item.g}`} style={{ fontSize: 11, height: "100%", width: "100%" }}>{item.name.slice(0, 1)}</span>}
              </div>
            </div>
          </button>
        );
      })}
      <div style={{ background: "rgba(255,255,255,0.7)", borderRadius: 6, bottom: 14, color: "var(--text-3)", fontSize: 11, left: 14, padding: "3px 8px", position: "absolute" }}>{t({ en: "Tokyo", zh: "东京 · Tokyo" })}</div>
    </div>
  );
}

function MapEventCard({ item }: { item: MappedEvent }) {
  const { language, preserveHref, t } = useOrbitLanguage();

  return (
    <div className="card" style={{ alignItems: "center", boxShadow: "var(--sh-lg)", display: "flex", gap: 14, padding: 14 }}>
      <Cover g={item.g} imageAlt={item.name} imageUrl={item.imageUrl} monogram={item.imageUrl ? null : { text: item.name.slice(0, 1), size: 26 }} style={{ borderRadius: 13, flexShrink: 0, height: 64, width: 64 }}>
        <div style={{ left: 6, position: "absolute", top: 6 }}><StatusBadge language={language} status={item.status} /></div>
      </Cover>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 className="h-section" style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</h3>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 2 }}>{item.day ? `${item.month}${language === "zh" ? `${item.day}日` : ` ${item.day}`} · ${item.time}` : item.time}</div>
        <div style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 12, gap: 8, marginTop: 6 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 4 }}><Icon color="var(--text-3)" name="pin" size={13} />{item.place}</span>
          <span style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)", height: 3, width: 3 }} />
          <span>{t({ en: `${item.people} people`, zh: `${item.people} 人` })}</span>
        </div>
      </div>
      <a className="btn btn-primary btn-sm" href={preserveHref(productHref(`/events/${item.code}`))} style={{ flexShrink: 0, textDecoration: "none" }}>{t({ en: "View", zh: "查看" })}<Icon color="var(--on-dark)" name="chevR" size={15} /></a>
    </div>
  );
}

function MobileExploreCard({ item }: { item: MappedEvent }) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const actionLabel = item.status === "upcoming" || item.status === "active" ? t({ en: "Register", zh: "报名" }) : t({ en: "View", zh: "查看" });

  return (
    <a className="card card-hover" href={preserveHref(productHref(`/events/${item.code}`))} style={{ display: "block", overflow: "hidden", textDecoration: "none" }}>
      <Cover g={item.g} imageAlt={item.name} imageUrl={item.imageUrl} monogram={item.imageUrl ? null : { text: item.name.slice(0, 1), size: 40 }} style={{ height: 128, opacity: item.status === "ended" ? 0.72 : 1 }}>
        <div style={{ left: 11, position: "absolute", top: 11 }}><StatusBadge language={language} status={item.status} /></div>
        <div style={{ background: "var(--glass-chip)", borderRadius: 9, minWidth: 42, padding: "4px 8px", position: "absolute", right: 11, textAlign: "center", top: 11 }}>
          <div style={{ color: "var(--rose-text)", fontSize: 11, fontWeight: 600 }}>{item.month}</div>
          {item.day ? <div style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{item.day}</div> : null}
        </div>
      </Cover>
      <div style={{ padding: "14px 14px 13px" }}>
        <h3 className="h-section" style={{ color: "var(--ink)", margin: 0 }}>{item.name}</h3>
        {item.sub ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{item.sub}</div> : null}
        <div style={{ color: "var(--text-2)", display: "flex", flexWrap: "wrap", fontSize: 13, gap: 14, marginTop: 10 }}>
          <span style={{ alignItems: "center", display: "flex", gap: 6 }}><Icon color="var(--text-3)" name="clock" size={14} />{item.time}</span>
          <span style={{ alignItems: "center", display: "flex", gap: 6 }}><Icon color="var(--text-3)" name="pin" size={14} />{item.place}</span>
        </div>
        <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12 }}>
          <span style={{ alignItems: "center", color: "var(--text-2)", display: "flex", fontSize: 13, gap: 6 }}><Icon color="var(--text-3)" name="users" size={14} />{t({ en: `${item.people} people`, zh: `${item.people} 人` })}</span>
          <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 13, fontWeight: 600, gap: 2 }}>{actionLabel}<Icon name="chevR" size={13} /></span>
        </div>
      </div>
    </a>
  );
}

export function OrbitRealExploreClient({ viewModel }: { viewModel: OrbitLandingViewModel }) {
  const { language, t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [topic, setTopic] = useState("all");
  const [mode, setMode] = useState("modules");
  const [selectedId, setSelectedId] = useState("");
  const events = viewModel.events;
  const topicFilters = useMemo(() => [...new Set(events.flatMap(eventTopics))].slice(0, 8), [events]);
  const filtered = useMemo(() => events.filter((event) => {
    const matchesStatus = status === "all" || event.status === status;
    const matchesTopic = topic === "all" || eventTopics(event).includes(topic);
    const matchesQuery = !query || event.name.includes(query) || event.code.includes(query) || event.theme.includes(query);
    return matchesStatus && matchesTopic && matchesQuery;
  }), [events, query, status, topic]);
  const mapItems = useMemo(() => filtered.map((event) => mapEvent(event, language === "ja" ? "en" : language)), [filtered, language]);
  const located = mapItems.filter((item) => Number.isFinite(item.pos.x) && Number.isFinite(item.pos.y));
  const canShowMap = located.length > 0;
  const effMode = mode === "map" && canShowMap ? "map" : "modules";
  const selectedItem = located.find((item) => item.id === selectedId) ?? located[0] ?? null;
  const resultLabel = filtered.length === 0 ? t({ en: "No matching open events.", zh: "没有匹配的开放活动。" }) : t({ en: `${filtered.length} events`, zh: `${filtered.length} 场活动` });
  const statusLabels = {
    active: t({ en: "Live", zh: "进行中" }),
    all: t({ en: "All", zh: "全部" }),
    ended: t({ en: "Ended", zh: "已结束" }),
    upcoming: t({ en: "Upcoming", zh: "即将开始" }),
  };

  return (
    <div className="orbit-shell" data-orbit-real-page="explore">
      <div className="orbit-desktop-only" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <PublicTopNav />
        <main className="orbit-main" data-appscroll>
          <div className="orbit-browse-head">
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>{t({ en: "EXPLORE · Tokyo", zh: "EXPLORE · 东京" })}</div><h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Discover events", zh: "发现活动" })}</h1></div>
            <div className="orbit-browse-tools">
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", display: "inline-flex", padding: 3 }}>
                <button type="button" onClick={() => setMode("modules")} style={{ alignItems: "center", background: effMode === "modules" ? "var(--ink)" : "none", border: "none", borderRadius: "var(--r-pill)", color: effMode === "modules" ? "var(--on-dark)" : "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 600, gap: 6, padding: "7px 14px" }}><Icon color={effMode === "modules" ? "var(--on-dark)" : undefined} name="grid" size={15} />{t({ en: "Events", zh: "内容" })}</button>
                {canShowMap ? <button type="button" onClick={() => setMode("map")} style={{ alignItems: "center", background: effMode === "map" ? "var(--ink)" : "none", border: "none", borderRadius: "var(--r-pill)", color: effMode === "map" ? "var(--on-dark)" : "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 600, gap: 6, padding: "7px 14px" }}><Icon color={effMode === "map" ? "var(--on-dark)" : undefined} name="pin" size={15} />{t({ en: "Map", zh: "地图" })}</button> : null}
              </div>
              <div className="orbit-search-box">
                <Icon color="var(--text-3)" name="search" size={18} style={{ left: 14, position: "absolute", top: 15 }} />
                <input aria-label={t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" })} className="field" onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" })} style={{ paddingLeft: 42 }} type="search" value={query} />
              </div>
            </div>
          </div>
          <div className="orbit-filters">
            <div style={{ display: "flex", gap: 8 }}>{statusFilters.map((key) => <button key={key} className={`chip${status === key ? " is-active" : ""}`} onClick={() => setStatus(key)} type="button">{statusLabels[key]}</button>)}</div>
            {topicFilters.length ? <><span style={{ background: "var(--border-2)", height: 22, width: 1 }} /><div style={{ display: "flex", gap: 8 }}>{topicFilters.map((item) => <button key={item} className={`chip${topic === item ? " is-active" : ""}`} onClick={() => setTopic(topic === item ? "all" : item)} type="button">{item}</button>)}</div></> : null}
          </div>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 16, marginTop: 20 }}>{resultLabel}</div>
          {effMode === "modules" && filtered.length > 0 ? <EventModuleGrid events={filtered} /> : null}
          {effMode === "map" && mapItems.length > 0 ? (
            <section className="orbit-map-shell" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-sm)", display: "grid", gridTemplateColumns: "380px 1fr", height: "min(680px, calc(100dvh - 220px))", minHeight: 520, overflow: "hidden" }}>
              <div className="orbit-map-rail scroll" style={{ borderRight: "1px solid var(--border)", overflowY: "auto", padding: "20px 18px" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 14 }}><h2 className="h-title" style={{ margin: 0 }}>{t({ en: "Discover events", zh: "发现活动" })}</h2><span style={{ color: "var(--text-3)", fontSize: 13 }}>{t({ en: `${located.length} locations`, zh: `${located.length} 个位置` })}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {mapItems.map((item) => {
                    const on = selectedItem?.id === item.id;
                    return (
                      <button key={item.id} className="card-hover" onClick={() => setSelectedId(item.id)} style={{ background: on ? "var(--accent-softer)" : "var(--surface)", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, borderRadius: 13, cursor: "pointer", display: "flex", gap: 12, padding: 11, textAlign: "left" }} type="button">
                        <Cover g={item.g} imageAlt={item.name} imageUrl={item.imageUrl} monogram={item.imageUrl ? null : { text: item.name.slice(0, 1), size: 22 }} style={{ borderRadius: 11, flexShrink: 0, height: 54, width: 54 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="h-section" style={{ color: "var(--ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                          <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, marginTop: 2 }}>{[item.day ? `${item.month}${language === "zh" ? `${item.day}日` : ` ${item.day}`}` : item.time, item.place].filter(Boolean).join(" · ")}</span>
                          <span style={{ display: "block", marginTop: 6 }}><StatusBadge language={language} status={item.status} /></span>
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
        <PublicTopNav active="events" />
        <div style={{ flexShrink: 0, padding: "16px 18px 0" }}>
          <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", marginBottom: 14 }}>
            <div><div className="eyebrow" style={{ marginBottom: 4 }}>EXPLORE</div><h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Discover events", zh: "发现活动" })}</h1></div>
            <button disabled={!canShowMap} onClick={() => canShowMap && setMode(mode === "map" ? "modules" : "map")} style={{ alignItems: "center", background: mode === "map" && canShowMap ? "var(--ink)" : "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--r-pill)", boxShadow: "var(--sh-xs)", color: mode === "map" && canShowMap ? "var(--on-dark)" : "var(--text)", cursor: canShowMap ? "pointer" : "not-allowed", display: "flex", fontSize: 13, fontWeight: 600, gap: 6, height: 38, justifyContent: "center", opacity: canShowMap ? 1 : 0.45, padding: "0 13px" }} type="button"><Icon name="pin" size={15} />{t({ en: "Map", zh: "地图" })}</button>
          </div>
          <div style={{ position: "relative" }}>
            <Icon color="var(--text-3)" name="search" size={17} style={{ left: 13, position: "absolute", top: 14 }} />
            <input aria-label={t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" })} className="field" onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search event name, code, or topic", zh: "搜索活动名称、编号或主题" })} style={{ height: 44, paddingLeft: 40 }} type="search" value={query} />
          </div>
          <div className="scroll noscroll" style={{ display: "flex", gap: 8, margin: "0 -18px", overflowX: "auto", padding: "14px 18px 4px" }}>
            {statusFilters.map((key) => <button key={key} className={`chip${status === key ? " is-active" : ""}`} onClick={() => setStatus(key)} style={{ flexShrink: 0 }} type="button">{statusLabels[key]}</button>)}
            {topicFilters.length ? <span style={{ background: "var(--border-2)", flexShrink: 0, margin: "4px 2px", width: 1 }} /> : null}
            {topicFilters.map((item) => <button key={item} className={`chip${topic === item ? " is-active" : ""}`} onClick={() => setTopic(topic === item ? "all" : item)} style={{ flexShrink: 0 }} type="button">{item}</button>)}
          </div>
        </div>
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px" }}>{resultLabel}</div>
          {effMode === "map" ? <section className="card" style={{ height: 360, marginBottom: 14, overflow: "hidden" }}><div style={{ height: "100%", position: "relative", width: "100%" }}><MapCanvas items={located} onSelect={(item) => setSelectedId(item.id)} selected={selectedItem} /></div></section> : null}
          {filtered.length > 0 ? <EventModuleGrid events={filtered} /> : null}
        </div>
      </div>
    </div>
  );
}
