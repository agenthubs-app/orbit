"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  OrbitAgentEventResultView,
  OrbitAgentHistoryView,
  OrbitAgentPeopleResultView,
  OrbitAgentScenarioView,
  OrbitAgentViewModel,
} from "../orbit-agent-route-view-model";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, Icon, Logo, gradientFromString } from "../orbit-reference-primitives";

interface OrbitRealAgentProps {
  viewModel: OrbitAgentViewModel;
}

type AgentPanel = Pick<OrbitAgentScenarioView, "items" | "kind" | "panelTitle">;

type AgentMessage =
  | { role: "user"; text: string }
  | {
      items: OrbitAgentScenarioView["items"];
      kind: OrbitAgentScenarioView["kind"];
      note?: string;
      panelTitle: string;
      role: "assistant";
      text: string;
    };

const depth = {
  to_contact: { label: "待破冰 · 一面之缘", color: "var(--amber)", soft: "var(--amber-soft)" },
  in_progress: { label: "在推进 · 已有交流", color: "var(--sky)", soft: "var(--sky-soft)" },
  partnered: { label: "已合作 · 关系稳固", color: "var(--live)", soft: "var(--live-soft)" },
};

const TZ = { timeZone: "Asia/Tokyo" };

function fmtMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", ...TZ }).format(date);
}

function fmtDay(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", ...TZ }).format(date);
}

function parseDate(value: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function isPeopleResult(item: OrbitAgentPeopleResultView | OrbitAgentEventResultView): item is OrbitAgentPeopleResultView {
  return "connection" in item;
}

function routeScenario(query: string, scenarios: OrbitAgentViewModel["scenarios"]) {
  const text = String(query || "");
  if (/女装|服装|时尚|设计|fashion|买手|面料|服饰|穿搭/i.test(text)) return scenarios.peopleToEvents;
  if (/活动|参加|想去|meetup|沙龙|局\b|聚会|峰会|展会|类型的活动|去哪/i.test(text)) return scenarios.events;
  return scenarios.people;
}

function currentAgentQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function AgentHistoryList({
  activeQ,
  history,
  onPick,
}: {
  activeQ: string;
  history: OrbitAgentHistoryView[];
  onPick: (history: OrbitAgentHistoryView) => void;
}) {
  const groups = useMemo(() => [...new Set(history.map((item) => item.group))], [history]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {groups.map((group) => (
        <div key={group}>
          <div className="eyebrow" style={{ padding: "0 8px 6px" }}>
            {group}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {history
              .filter((item) => item.group === group)
              .map((item) => {
                const active = Boolean(activeQ && item.q === activeQ);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPick(item)}
                    style={{
                      alignItems: "center",
                      background: active ? "var(--accent-softer)" : "transparent",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      display: "flex",
                      fontFamily: "var(--ff)",
                      gap: 9,
                      padding: "9px 10px",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <Icon name="message" size={15} color={active ? "var(--accent)" : "var(--text-4)"} />
                    <span style={{ color: active ? "var(--accent)" : "var(--text)", flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </span>
                    <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, fontSize: 10.5 }}>
                      {item.when}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentWelcome({ onPick, viewModel }: { onPick: (query: string) => void; viewModel: OrbitAgentViewModel }) {
  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "50vh", padding: "24px 8px", textAlign: "center" }}>
      <span className="avatar g-indigo" style={{ alignItems: "center", borderRadius: 16, display: "flex", fontSize: 0, height: 54, justifyContent: "center", width: 54 }}>
        <Icon name="sparkle" size={26} color="#fff" />
      </span>
      <h2 className="h-title" style={{ fontSize: 22, margin: "16px 0 6px" }}>
        我是 Orbit Agent
      </h2>
      <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.65, margin: "0 0 22px", maxWidth: 380 }}>
        说出你想做的事，我帮你从人脉里找对的人、从活动里找对的局，并告诉你该怎么开口。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "min(420px, 100%)" }}>
        {viewModel.suggests.map((suggest) => (
          <button
            key={suggest.label}
            type="button"
            onClick={() => onPick(suggest.q)}
            style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 13, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 11, padding: "13px 15px", textAlign: "left" }}
          >
            <Icon name={suggest.icon} size={17} color="var(--accent)" />
            <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 550 }}>{suggest.label}</span>
            <div style={{ flex: 1 }} />
            <Icon name="arrow" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentPeopleCard({ item, navigate }: { item: OrbitAgentPeopleResultView; navigate: (href: string) => void }) {
  const connection = item.connection;
  const status = depth[connection.pipelineStatus] ?? depth.to_contact;

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", padding: 15, textAlign: "left", width: "100%" }} onClick={() => navigate(`/home/cards/${connection.id}`)}>
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <Avatar letter={connection.initial} g={connection.g} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650 }}>{connection.displayName}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 1 }}>
            {connection.title} · {connection.company}
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.match}%</div>
          <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>匹配度</div>
        </div>
      </div>
      <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 6, marginTop: 12, overflow: "hidden" }}>
        <span style={{ background: "linear-gradient(90deg,#8B7BF0,#6359E9)", display: "block", height: "100%", width: `${item.match}%` }} />
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 11 }}>
        <span style={{ alignItems: "center", background: status.soft, borderRadius: 999, color: status.color, display: "inline-flex", fontSize: 11.5, fontWeight: 600, gap: 6, height: 24, padding: "0 10px" }}>
          <span style={{ background: status.color, borderRadius: 999, height: 6, width: 6 }} />
          {status.label}
        </span>
        <span className="chip" style={{ height: 24 }}>{connection.industry}</span>
      </div>
      <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginTop: 11 }}>{item.reason}</div>
      <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
        <Icon name="message" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>怎么开口</div>
          <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.opener}</div>
        </div>
      </div>
      <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
        查看名片
        <Icon name="chevR" size={14} />
      </div>
    </button>
  );
}

function AgentEventCard({ item, navigate }: { item: OrbitAgentEventResultView; navigate: (href: string) => void }) {
  const event = item.event;
  const date = parseDate(event.startsAt);
  const dateLabel = date ? `${fmtMonth(date)}${fmtDay(date)}日 · ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo", weekday: "short" }).format(date)}` : "时间待定";

  return (
    <button type="button" className="card card-hover" style={{ cursor: "pointer", display: "block", fontFamily: "var(--ff)", overflow: "hidden", padding: 0, textAlign: "left", width: "100%" }} onClick={() => navigate(`/events/${event.code}`)}>
      <div style={{ display: "flex", gap: 13, padding: 15 }}>
        <Cover g={gradientFromString(event.code)} monogram={{ text: event.name.slice(0, 1), size: 22 }} style={{ borderRadius: 13, flexShrink: 0, height: 60, width: 60 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "flex-start", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 650, lineHeight: 1.25 }}>{event.name}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 3 }}>{dateLabel}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ color: "var(--accent)", fontFamily: "var(--ff-tight)", fontSize: 20, fontWeight: 750, lineHeight: 1 }}>{item.score}</div>
              <div className="mono" style={{ color: "var(--text-4)", fontSize: 9.5 }}>匹配分</div>
            </div>
          </div>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 8, marginTop: 8 }}>
            <Icon name="pin" size={13} />
            {event.place}
          </div>
        </div>
      </div>
      <div style={{ padding: "0 15px 15px" }}>
        <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6 }}>{item.reason}</div>
        <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 9, marginTop: 11, padding: 11 }}>
          <Icon name="sparkle" size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 650 }}>怎么在现场社交</div>
            <div style={{ color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{item.howto}</div>
          </div>
        </div>
        <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12.5, fontWeight: 650, gap: 3, justifyContent: "flex-end", marginTop: 12 }}>
          查看活动
          <Icon name="chevR" size={14} />
        </div>
      </div>
    </button>
  );
}

function PanelCards({ navigate, panel }: { navigate: (href: string) => void; panel: AgentPanel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {panel.items.map((item, index) =>
        isPeopleResult(item) ? (
          <AgentPeopleCard key={`${item.connection.id}-${index}`} item={item} navigate={navigate} />
        ) : (
          <AgentEventCard key={`${item.event.code}-${index}`} item={item} navigate={navigate} />
        ),
      )}
    </div>
  );
}

function ChatBox({ big, onChange, onSend, value }: { big?: boolean; onChange: (value: string) => void; onSend: () => void; value: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 20, boxShadow: "0 18px 50px rgba(99,89,233,0.12), 0 2px 8px rgba(18,18,28,0.05)", padding: big ? "18px 18px 12px" : "12px 12px 8px", width: "100%" }}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder="问问 Orbit：想做什么、想认识谁、想去什么活动…"
        rows={big ? 2 : 1}
        style={{ background: "transparent", border: "none", color: "var(--ink)", fontFamily: "var(--ff)", fontSize: big ? 17 : 15, lineHeight: 1.5, outline: "none", padding: "2px 4px", resize: "none", width: "100%" }}
      />
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: big ? 8 : 4 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 999, color: "var(--accent)", display: "inline-flex", fontSize: 12.5, fontWeight: 650, gap: 6, height: 32, padding: "0 12px" }}>
            <Icon name="sparkle" size={14} />
            Orbit Agent
          </span>
          <span style={{ color: "var(--text-4)", fontSize: 12 }}>人脉 · 活动 · 商业价值</span>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="发送"
          style={{ alignItems: "center", background: value.trim() ? "linear-gradient(180deg,#8170F1,#614CE2)" : "var(--surface-3)", border: "none", borderRadius: 12, boxShadow: value.trim() ? "0 8px 18px rgba(99,76,226,0.28)" : "none", color: value.trim() ? "#fff" : "var(--text-4)", cursor: value.trim() ? "pointer" : "default", display: "flex", height: 40, justifyContent: "center", width: 40 }}
        >
          <Icon name="arrow" size={19} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ animation: `blink 1s ${index * 0.2}s infinite`, background: "var(--text-4)", borderRadius: 999, height: 6, width: 6 }} />
      ))}
    </span>
  );
}

export function OrbitRealAgent({ viewModel }: OrbitRealAgentProps) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [panel, setPanel] = useState<AgentPanel | null>(null);
  const [thinking, setThinking] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [activeQ, setActiveQ] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const navigate = useCallback((prototypeHref: string) => {
    const href = productHref(prototypeHref);
    if (typeof window === "undefined") return;

    if (href.startsWith("/app/agent")) {
      window.history.pushState({}, "", href);
      setActiveQ(new URL(href, window.location.origin).searchParams.get("q") ?? "");
      return;
    }

    window.location.href = href;
  }, []);

  const ask = useCallback((query: string) => {
    const scenario = routeScenario(query, viewModel.scenarios);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    setMessages((current) => [...current, { role: "user", text: query }]);
    setThinking(true);
    setPanel(null);
    timerRef.current = window.setTimeout(() => {
      setThinking(false);
      setMessages((current) => [
        ...current,
        {
          items: scenario.items,
          kind: scenario.kind,
          note: scenario.note,
          panelTitle: scenario.panelTitle,
          role: "assistant",
          text: scenario.intro,
        },
      ]);
      setPanel({ items: scenario.items, kind: scenario.kind, panelTitle: scenario.panelTitle });
    }, 750);
  }, [viewModel.scenarios]);

  useEffect(() => {
    const query = currentAgentQuery();
    setActiveQ(query);
    if (query) {
      setMessages([]);
      setPanel(null);
      setText("");
      ask(query);
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [ask]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }, [messages, thinking]);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    ask(value);
  };

  const pickHistory = (item: OrbitAgentHistoryView) => {
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    navigate(`/agent?q=${encodeURIComponent(item.q)}`);
    ask(item.q);
  };

  const newChat = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setHistOpen(false);
    setMessages([]);
    setPanel(null);
    setText("");
    setThinking(false);
    setActiveQ("");
    navigate("/agent");
  };

  const renderBubbles = (inlinePanel: boolean) => (
    <>
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={`user-${index}`} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <div style={{ background: "var(--accent)", borderRadius: "16px 16px 4px 16px", color: "#fff", fontSize: 14.5, lineHeight: 1.55, maxWidth: "82%", padding: "11px 15px" }}>{message.text}</div>
          </div>
        ) : (
          <div key={`assistant-${index}`} style={{ display: "flex", gap: 11, marginBottom: 18 }}>
            <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
              <Icon name="sparkle" size={16} color="#fff" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {message.note ? (
                <div style={{ alignItems: "center", background: "var(--amber-soft)", borderRadius: 12, color: "var(--amber)", display: "inline-flex", fontSize: 13, fontWeight: 550, gap: 7, marginBottom: 10, padding: "7px 12px" }}>
                  <Icon name="eye" size={14} />
                  {message.note}
                </div>
              ) : null}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", color: "var(--text)", fontSize: 14.5, lineHeight: 1.6, padding: "12px 15px" }}>{message.text}</div>
              {inlinePanel ? (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>{message.panelTitle}</div>
                  <PanelCards panel={{ items: message.items, kind: message.kind, panelTitle: message.panelTitle }} navigate={navigate} />
                </div>
              ) : null}
            </div>
          </div>
        ),
      )}
      {thinking ? (
        <div style={{ display: "flex", gap: 11, marginBottom: 18 }}>
          <span className="avatar g-indigo" style={{ borderRadius: 10, flexShrink: 0, fontSize: 0, height: 32, width: 32 }}>
            <Icon name="sparkle" size={16} color="#fff" />
          </span>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 16px 16px 16px", padding: "14px 16px" }}>
            <TypingDots />
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div data-orbit-real-page="agent" style={{ background: "var(--bg-soft)", display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div style={{ alignItems: "center", backdropFilter: "blur(14px)", background: "rgba(255,255,255,0.86)", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, gap: 10, height: 56, padding: "0 12px" }}>
        <button type="button" className="orbit-mobile-only" onClick={() => setHistOpen(true)} aria-label="对话历史" style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 4 }}>
          <Icon name="clock" size={20} />
        </button>
        <a href="/app" onClick={(event) => { event.preventDefault(); navigate("/"); }} style={{ display: "inline-flex", textDecoration: "none" }}>
          <Logo size={22} withText={false} />
        </a>
        <span style={{ alignItems: "center", color: "var(--ink)", display: "inline-flex", fontSize: 13.5, fontWeight: 650, gap: 6 }}>
          <Icon name="sparkle" size={15} color="var(--accent)" />
          Orbit Agent
        </span>
        <nav className="orbit-desktop-only" style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {[
            ["/explore", "活动浏览"],
            ["/home/schedule", "日程"],
            ["/home/cards", "名片夹"],
          ].map(([href, label]) => (
            <a key={href} href={productHref(href)} onClick={(event) => { event.preventDefault(); navigate(href); }} className="orbit-nav-link">
              {label}
            </a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ color: "var(--text-3)", fontSize: 12.5, marginRight: 4 }}>中 / 日</span>
        <button className="btn btn-ghost btn-sm" onClick={newChat}>
          <Icon name="plus" size={14} />
          新对话
        </button>
      </div>

      <div className="orbit-desktop-only" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside style={{ background: "var(--bg)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 248 }}>
          <div style={{ padding: 14 }}>
            <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
              <Icon name="plus" size={16} color="var(--accent)" />
              新对话
            </button>
          </div>
          <div style={{ padding: "4px 18px 8px" }}>
            <div className="eyebrow">对话历史</div>
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 10px 18px" }}>
            <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
          </div>
        </aside>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
          <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(false)}
            </div>
          </div>
          <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "12px 28px 18px" }}>
            <div style={{ margin: "0 auto", maxWidth: 720 }}>
              <ChatBox value={text} onChange={setText} onSend={send} />
            </div>
          </div>
        </div>
        {panel ? (
          <aside key={`${panel.panelTitle}-${messages.length}`} style={{ animation: "agentpanel .32s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, width: 444 }}>
            <div style={{ borderBottom: "1px solid var(--border)", padding: "18px 20px 12px" }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 9, color: "var(--accent)", display: "flex", height: 30, justifyContent: "center", width: 30 }}>
                  <Icon name={panel.kind === "people" ? "users" : "calendar"} size={17} />
                </span>
                <div className="h-section" style={{ fontSize: 16 }}>{panel.panelTitle}</div>
              </div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>点卡片可直接跳转到对应{panel.kind === "people" ? "名片" : "活动"}页</div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 24px" }}>
              <PanelCards panel={panel} navigate={navigate} />
            </div>
          </aside>
        ) : null}
      </div>

      <div className="orbit-mobile-only" style={{ flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 16px 12px" }}>
          {!messages.length && !thinking ? <AgentWelcome onPick={ask} viewModel={viewModel} /> : renderBubbles(true)}
        </div>
        <div style={{ background: "var(--bg)", borderTop: "1px solid var(--border)", padding: "10px 16px 18px" }}>
          <ChatBox value={text} onChange={setText} onSend={send} />
        </div>
      </div>

      {histOpen ? (
        <div className="orbit-mobile-only" style={{ inset: 0, position: "fixed", zIndex: 90 }}>
          <div onClick={() => setHistOpen(false)} style={{ backdropFilter: "blur(3px)", background: "rgba(20,20,28,0.42)", inset: 0, position: "absolute" }} />
          <div style={{ animation: "slideInLeft .26s cubic-bezier(.22,1,.36,1)", background: "var(--bg)", bottom: 0, boxShadow: "var(--sh-pop)", display: "flex", flexDirection: "column", left: 0, maxWidth: 320, position: "absolute", top: 0, width: "84%" }}>
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", flexShrink: 0, height: 54, padding: "0 14px" }}>
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700 }}>对话历史</span>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => setHistOpen(false)} aria-label="关闭" style={{ alignItems: "center", background: "var(--surface-2)", border: "none", borderRadius: 999, color: "var(--text-2)", cursor: "pointer", display: "flex", fontSize: 15, height: 30, justifyContent: "center", width: 30 }}>✕</button>
            </div>
            <div style={{ padding: 12 }}>
              <button type="button" onClick={newChat} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 11, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 7, height: 40, justifyContent: "center", width: "100%" }}>
                <Icon name="plus" size={16} color="var(--accent)" />
                新对话
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 12px 4px" }}>
              <div className="eyebrow" style={{ padding: "2px 8px 6px" }}>前往</div>
              {[
                ["/", "home", "首页"],
                ["/explore", "calendar", "活动浏览"],
                ["/home/schedule", "clock", "日程"],
                ["/home/cards", "wallet", "名片夹"],
              ].map(([href, icon, label]) => (
                <button key={href} type="button" onClick={() => { setHistOpen(false); navigate(href); }} style={{ alignItems: "center", background: "none", border: "none", borderRadius: 9, color: "var(--ink)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 550, gap: 11, padding: "9px 8px", textAlign: "left", width: "100%" }}>
                  <Icon name={icon} size={17} color="var(--accent)" />
                  {label}
                </button>
              ))}
              <div style={{ background: "var(--border)", height: 1, margin: "7px 8px 2px" }} />
              <div className="eyebrow" style={{ padding: "2px 8px 4px" }}>对话历史</div>
            </div>
            <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 18px" }}>
              <AgentHistoryList activeQ={activeQ} history={viewModel.history} onPick={pickHistory} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
