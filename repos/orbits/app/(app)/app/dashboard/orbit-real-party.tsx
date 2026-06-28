"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getOrbitAccountAuthViewModel } from "../orbit-account-auth-route-view-model";
import { OrbitRealAccountAuth } from "../account/orbit-real-account-auth";
import { getOrbitPartyViewModel, type OrbitPartyPersonView, type OrbitPartyViewModel } from "../orbit-party-route-view-model";
import { Icon, Logo } from "../orbit-reference-primitives";

type PartyTab = "home" | "table" | "network" | "graph" | "me";

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

function NetworkPerson({
  added,
  onAdd,
  p,
}: {
  added?: boolean;
  onAdd: () => void;
  p: OrbitPartyPersonView;
}) {
  return (
    <div className="orbit-party-network-person card">
      <span className={`avatar ${p.g} orbit-party-network-avatar`}>{p.initial}</span>
      <div className="orbit-party-network-person-body">
        <div className="orbit-party-network-person-top">
          <span className="h-section orbit-party-network-person-name">{p.name}</span>
          <span className="chip orbit-party-network-seat" style={{ height: 24 }}>
            第{p.groupNumber}组 · {p.seat}
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
            <Icon color={added ? undefined : "#fff"} name={added ? "check" : "wallet"} size={15} />
            {added ? "已加入名片夹" : "加入名片夹"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartyHome({ go, viewModel }: { go: (tab: PartyTab) => void; viewModel: OrbitPartyViewModel }) {
  const first = viewModel.recommendations[0];

  return (
    <div className="orbit-party-home-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 96px" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "6px 0 2px" }}>
        <Logo size={24} />
        <span className="badge badge-live">
          <span className="dot dot-live" />
          进行中
        </span>
      </div>
      <div className="card" style={{ marginTop: 12, overflow: "hidden", padding: 20, position: "relative" }}>
        <div className="eyebrow">TONIGHT · 现场</div>
        <h1 className="h-display" style={{ fontSize: 30, margin: "8px 0 0" }}>
          晚上好，{viewModel.me.initial}
        </h1>
        <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>Tokyo Business Connect · 东京中城 Hall B</div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => navigateTo("/app/party/checkin")} style={{ flex: "1 1 0%" }}>
            <Icon color="#fff" name="ticket" size={16} />
            现场签到
          </button>
          <button className="btn btn-ghost" onClick={() => go("table")} style={{ flex: "1 1 0%" }}>
            <Icon name="seat" size={16} />
            {`我的座位 ${viewModel.me.seat}`}
          </button>
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", margin: "24px 0 12px" }}>
        <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>
          为你推荐的人脉
        </h2>
        <button
          onClick={() => go("network")}
          style={{ alignItems: "center", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", display: "flex", fontSize: 13, fontWeight: 600, gap: 2, padding: "1px 6px" }}
          type="button"
        >
          全部
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
                匹配 {first.score}
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
            <div style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>为什么推荐</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{first.reason}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--ink)", fontSize: 12, fontWeight: 600, marginBottom: 7 }}>破冰问题</div>
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
        <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>
          今晚流程
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
                    进行中
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

function PartyTable({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const seatCount = 8;

  return (
    <div className="orbit-party-table-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 96px" }}>
      <div className="orbit-party-table-header">
        <div>
          <div className="eyebrow">YOUR TABLE</div>
          <h1 className="h-display orbit-party-table-title">
            第 <span>1</span> 组 · 圆桌
          </h1>
        </div>
        <span className="chip chip-accent">座位 {viewModel.me.seat}</span>
      </div>
      <div className="orbit-party-table-seat-scene" style={{ height: 350, margin: "20px auto 30px", position: "relative", width: 350 }}>
        <div className="orbit-party-table-center">
          <div className="h-display orbit-party-table-code">1</div>
          <div className="orbit-party-table-meta">TABLE</div>
          <span className="chip chip-accent orbit-party-table-pill" style={{ height: 24 }}>
            {viewModel.tableMates.length + 1} 人
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
          全桌破冰
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
        <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>
          同桌的人
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
                {mate.company} · 座位 {mate.seat}
              </div>
              <div className="orbit-party-table-member-prompt">
                <span>破冰</span>
                {mate.icebreakers[0]}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyNetwork({ viewModel }: { viewModel: OrbitPartyViewModel }) {
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
    <div className="orbit-party-network-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 96px" }}>
      <div className="orbit-party-network-header">
        <div>
          <div className="eyebrow">FOR YOU</div>
          <h1 className="h-display orbit-party-network-title">推荐人脉</h1>
        </div>
        <div className="card orbit-party-network-count">
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">RECOMMENDED</div>
        </div>
      </div>
      <div className="orbit-party-network-toolbar">
        <div className="orbit-party-network-search">
          <Icon color="var(--text-3)" name="search" size={17} />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名 / 公司 / 行业" value={query} />
        </div>
        <button className="btn btn-ghost orbit-party-network-filter" type="button">
          <Icon name="filter" size={18} />
        </button>
      </div>
      <div className="orbit-party-network-list">
        {list.map((person) => (
          <NetworkPerson added={added[person.id]} key={person.id} onAdd={() => setAdded((current) => ({ ...current, [person.id]: true }))} p={person} />
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

function PersonDetailOverlay({ onClose, person }: { onClose: () => void; person: OrbitPartyPersonView }) {
  return (
    <div onClick={onClose} style={{ alignItems: "flex-end", background: "rgba(8,8,10,0.55)", display: "flex", inset: 0, justifyContent: "center", padding: 16, position: "fixed", zIndex: 50 }}>
      <div className="card" onClick={(event) => event.stopPropagation()} style={{ borderRadius: 24, maxHeight: "88vh", overflowY: "auto", width: "min(100%, 460px)" }}>
        <div style={{ background: "var(--surface)", padding: "16px 18px 0", position: "sticky", top: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} type="button">
            <Icon name="chevL" size={16} />
            返回图谱
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div className="eyebrow">{person.company}</div>
          <div className="h-display" style={{ fontSize: 34, marginTop: 10 }}>
            {person.name}
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 14, marginTop: 6 }}>
            {person.company} · {person.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            <span className="chip chip-accent">{person.industry}</span>
            <span className="chip">
              第{person.groupNumber}组 / {person.seat}
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
            中 / 日
          </span>
        </header>
        <main className="orbit-party-checkin-shell">
          <section className="orbit-party-done-card card">
            <div className="orbit-party-done-mark">
              <Icon name="check" size={42} stroke={2.2} />
            </div>
            <div className="eyebrow">CHECK-IN COMPLETE</div>
            <h1 className="h-title">签到完毕</h1>
            <p className="orbit-party-done-event">Tokyo Business Connect</p>
            <div className="orbit-party-done-meta">
              <span className="badge badge-live">
                <Icon name="check" size={13} />
                已签到
              </span>
              <span className="mono">{redirectIn} 秒后返回活动主页</span>
            </div>
            <button className="btn btn-primary btn-lg btn-block" onClick={returnToParty} type="button">
              <Icon color="var(--on-accent)" name="arrow" size={18} />
              立即返回
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="orbit-party-page orbit-live-checkin-page">
      <header className="orbit-party-checkin-top">
        <button aria-label="返回" className="orbit-party-icon-button" onClick={returnToParty} type="button">
          <Icon name="chevL" size={20} />
        </button>
        <div className="orbit-party-checkin-title">
          <div className="eyebrow">STEP 03 / 03</div>
          <div>现场签到</div>
        </div>
        <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
          中 / 日
        </span>
      </header>
      <main className="orbit-party-checkin-shell">
        <section className="orbit-party-checkin-hero card">
          <div className="orbit-party-checkin-meta">
            <span className="eyebrow">现场签到</span>
            <span className="badge badge-live">
              <span className="dot dot-live" />
              进行中
            </span>
          </div>
          <div className="orbit-party-checkin-icon">
            <Icon name="ticket" size={30} />
          </div>
          <h1 className="h-display">
            点击按钮<span>完成签到</span>
          </h1>
          <p>签到开放后，点击下方按钮即可完成签到。无需扫描二维码。</p>
          <div className="orbit-party-status-strip">
            <span className="eyebrow">当前状态</span>
            <strong>可以签到</strong>
          </div>
        </section>
        <section className="orbit-party-action-card card">
          <div className="orbit-party-card-head">
            <div>
              <div className="eyebrow">现场签到</div>
              <h2 className="h-section">一键签到</h2>
            </div>
            <span className="chip chip-accent">开放中</span>
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={submitting} onClick={submit} type="button">
            <Icon color="var(--on-accent)" name={submitting ? "clock" : "check"} size={18} />
            {submitting ? "签到中..." : "一键签到"}
          </button>
          <div className="orbit-party-note">
            <span className="dot dot-live" />
            <div>点击按钮后会记录你的签到时间。</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function OrbitRealPartyGraph({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const [bulkMessage, setBulkMessage] = useState("");
  const [scale, setScale] = useState(0.95);
  const [selected, setSelected] = useState<OrbitPartyPersonView | null>(null);

  return (
    <div className="orbit-party-graph-screen" data-orbit-real-page style={{ minHeight: "100dvh" }}>
      <div style={{ margin: "0 auto", maxWidth: 720, minHeight: "100dvh", padding: "18px clamp(16px,4vw,32px) 48px", position: "relative", zIndex: 1 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
          <button className="btn btn-ghost" onClick={() => navigateTo("/app/party")} style={{ minWidth: 40, padding: 0 }} type="button">
            <Icon name="chevL" size={18} />
          </button>
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>
              STEP 02 / 02
            </div>
            <div style={{ color: "var(--ink)", fontSize: 12 }}>社交图谱</div>
          </div>
          <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
            中 / 日
          </span>
        </div>
        <div style={{ background: "linear-gradient(180deg, var(--surface) 0%, var(--bg-sunken) 100%)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "var(--sh-lg)", marginTop: 16, padding: 22 }}>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontFamily: "var(--ff-mono)", fontSize: 10, justifyContent: "space-between", letterSpacing: "0.22em", textTransform: "uppercase" }}>
            <span>SOCIAL GRAPH</span>
            <span className="badge badge-live">
              <span className="dot dot-live" />
              已开放
            </span>
          </div>
          <div className="h-display" style={{ fontSize: 50, lineHeight: 0.94, marginTop: 18 }}>
            今晚的
            <br />
            <span style={{ color: "var(--accent)" }}>连接图。</span>
          </div>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.8, marginTop: 16 }}>放大看一眼整场连接关系。你可以缩放，并点击任意节点查看对方详情。</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <span className="chip badge-live">结果已开放</span>
            <span className="chip chip-accent">{viewModel.recommendations.length} 个节点</span>
            <span className="chip chip-accent">{viewModel.recommendations.length} 条连接</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 14, padding: 18 }}>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 11 }}>
                操作方式
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>缩放 / 点击节点</div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 11 }}>
                数据来源
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>真实推荐图谱</div>
            </div>
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => setBulkMessage(`已把 ${viewModel.recommendations.length} 位加入名片夹`)} style={{ flex: 1 }} type="button">
              <Icon color="#fff" name="wallet" size={16} />
              把当前人脉全部加入名片夹
            </button>
          </div>
          {bulkMessage ? <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 12 }}>{bulkMessage}</div> : null}
        </div>
        <div className="card" style={{ marginTop: 14, padding: 14 }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setScale((value) => Math.max(0.5, value - 0.2))} type="button">
              -
            </button>
            <span className="mono" style={{ alignSelf: "center", color: "var(--text-3)", fontSize: 12 }}>
              {Math.round(scale * 100)}%
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setScale((value) => Math.min(4, value + 0.2))} type="button">
              +
            </button>
          </div>
          <SocialGraphLite height={700} me={viewModel.me} onSelect={setSelected} people={viewModel.recommendations} scale={scale} width={880} />
        </div>
      </div>
      {selected ? <PersonDetailOverlay onClose={() => setSelected(null)} person={selected} /> : null}
    </div>
  );
}

function PartyGraphInline({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<OrbitPartyPersonView | null>(null);

  return (
    <div className="orbit-party-graph-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 96px" }}>
      <div className="orbit-party-graph-header">
        <div>
          <div className="eyebrow">SOCIAL GRAPH</div>
          <h1 className="h-display orbit-party-graph-title">社交图谱</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setScale((value) => Math.max(0.6, value - 0.2))} type="button">
            -
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setScale((value) => Math.min(2.5, value + 0.2))} type="button">
            +
          </button>
        </div>
      </div>
      <div className="orbit-party-graph-stats">
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">节点</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">{viewModel.recommendations.length}</div>
          <div className="mono">连接</div>
        </div>
        <div className="card orbit-party-graph-stat">
          <div className="h-title">已开放</div>
          <div className="mono">结果</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14, padding: 14 }}>
        <SocialGraphLite me={viewModel.me} onSelect={setSelected} people={viewModel.recommendations} scale={scale} />
      </div>
      {selected ? <PersonDetailOverlay onClose={() => setSelected(null)} person={selected} /> : null}
    </div>
  );
}

function PartyMe({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="orbit-party-me-scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 96px" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
        <div className="eyebrow">MY PASS</div>
        <span className="mono orbit-lang-inline" style={{ color: "var(--text-3)", fontSize: 12 }}>
          中 / 日
        </span>
      </div>
      <div className="orbit-party-me-hero">
        <span className="avatar g-indigo orbit-party-me-avatar">{viewModel.me.initial}</span>
        <div className="orbit-party-me-hero-info">
          <h1 className="h-display orbit-party-me-name">{viewModel.me.name}</h1>
          <div className="orbit-party-me-role">{viewModel.me.role}</div>
          <div className="orbit-party-me-chips">
            <span className="chip chip-accent" style={{ height: 24 }}>
              第{viewModel.me.groupNumber}组
            </span>
            <span className="chip" style={{ height: 24 }}>
              座位 {viewModel.me.seat}
            </span>
          </div>
        </div>
      </div>
      <div className="card orbit-party-me-code-card">
        <div className="orbit-party-me-code-icon">
          <Icon name="qr" size={26} />
        </div>
        <div className="orbit-party-me-code-body">
          <div className="eyebrow">通行码</div>
          <div className="mono orbit-party-me-code-value">{viewModel.accessCode}</div>
        </div>
        <button
          className="btn btn-ghost orbit-party-me-copy"
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
          <div className="mono">推荐人脉</div>
        </div>
        <div className="card orbit-party-me-stat">
          <div className="h-title">{viewModel.me.topics.length}</div>
          <div className="mono">话题标签</div>
        </div>
      </div>
      <div className="orbit-party-me-section-head">
        <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>
          AI 开场白建议
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
        <h2 className="h-section" style={{ fontSize: 18, margin: 0 }}>
          我的标签
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
        <span>编辑通用画像</span>
        <Icon color="var(--text-4)" name="chevR" size={17} />
      </button>
      <button className="card orbit-party-me-action-row orbit-party-me-logout" onClick={() => navigateTo("/app")} type="button">
        <Icon color="var(--rose)" name="logout" size={18} />
        <span>退出活动</span>
        <Icon color="var(--rose)" name="chevR" size={17} />
      </button>
    </div>
  );
}

export function OrbitRealParty({ viewModel }: { viewModel: OrbitPartyViewModel }) {
  const [tab, setTab] = useState<PartyTab>("home");
  const [showAuth, setShowAuth] = useState(false);
  const tabs: Array<[PartyTab, string, string]> = [
    ["home", "home", "主页"],
    ["table", "seat", "座位"],
    ["network", "users", "人脉"],
    ["graph", "network", "图谱"],
    ["me", "user", "我的"],
  ];

  return (
    <div className="orbit-party-page" data-orbit-real-page style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", position: "relative" }}>
      {tab === "home" ? <PartyHome go={setTab} viewModel={viewModel} /> : null}
      {tab === "table" ? <PartyTable viewModel={viewModel} /> : null}
      {tab === "network" ? <PartyNetwork viewModel={viewModel} /> : null}
      {tab === "graph" ? <PartyGraphInline viewModel={viewModel} /> : null}
      {tab === "me" ? <PartyMe viewModel={viewModel} /> : null}
      <div style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.9)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", height: 64, left: 0, position: "absolute", right: 0, zIndex: 35 }}>
        {tabs.map(([key, icon, label]) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              onClick={() => {
                if (key === "me") {
                  setShowAuth(true);
                  return;
                }
                setTab(key);
              }}
              style={{ alignItems: "center", background: "none", border: "none", color: selected ? "var(--accent)" : "var(--text-4)", cursor: "pointer", display: "flex", flex: 1, flexDirection: "column", gap: 3, padding: "9px 6px 1px" }}
              type="button"
            >
              <Icon name={icon} size={21} stroke={selected ? 2 : 1.7} />
              <span style={{ fontSize: 10, fontWeight: selected ? 600 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>
      {showAuth ? (
        <div className="orbit-party-auth-overlay">
          <OrbitRealAccountAuth
            onClose={() => setShowAuth(false)}
            viewModel={{ ...getOrbitAccountAuthViewModel("login"), defaultNext: "/party" }}
          />
        </div>
      ) : null}
    </div>
  );
}
