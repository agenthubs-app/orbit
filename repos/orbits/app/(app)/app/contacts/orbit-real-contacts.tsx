"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  OrbitContactEncounterView,
  OrbitContactPipelineStatus,
  OrbitContactPublicProfileView,
  OrbitContactsViewModel,
  OrbitContactView,
  OrbitIntroStatus,
  OrbitIntroView,
} from "../orbit-contacts-route-view-model";
import { AccountTopNav, MobileBar, ModalShell, orbitNavigate, StatusBar } from "../orbit-account-shell";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, gradientFromString, Icon } from "../orbit-reference-primitives";

type CrmMode = "list" | "pipeline" | "graph" | "intros" | "scan";

const crmNav: { href: string; icon: string; key: CrmMode; label: string }[] = [
  { key: "list", href: "/home/cards", icon: "wallet", label: "全部人脉" },
  { key: "pipeline", href: "/home/cards/pipeline", icon: "list", label: "跟进管线" },
  { key: "graph", href: "/home/cards/graph", icon: "users", label: "人脉图谱" },
  { key: "intros", href: "/home/cards/intros", icon: "share", label: "引荐记录" },
  { key: "scan", href: "/home/cards/scan", icon: "ticket", label: "扫名片" },
];

const mobileCrmTabs: { href: string; key: CrmMode; label: string }[] = [
  { key: "list", href: "/home/cards", label: "全部" },
  { key: "pipeline", href: "/home/cards/pipeline", label: "管线" },
  { key: "graph", href: "/home/cards/graph", label: "图谱" },
  { key: "intros", href: "/home/cards/intros", label: "引荐" },
];

const stageColors = ["var(--amber)", "var(--sky)", "var(--live)"];
const stageSoft = ["var(--amber-soft)", "var(--sky-soft)", "var(--live-soft)"];
const graphWidth = 720;
const graphHeight = 560;
const graphStatusColor: Record<OrbitContactPipelineStatus, string> = {
  in_progress: "var(--sky)",
  partnered: "var(--live)",
  to_contact: "var(--amber)",
};
const graphStatusSoft: Record<OrbitContactPipelineStatus, string> = {
  in_progress: "var(--sky-soft)",
  partnered: "var(--live-soft)",
  to_contact: "var(--amber-soft)",
};

function crmInitial(value: string) {
  return String(value || "?").trim().slice(0, 1).toUpperCase() || "?";
}

function crmRole(contact: Pick<OrbitContactView, "company" | "title">) {
  return [contact.company, contact.title].filter(Boolean).join(" · ") || "暂无公司职位";
}

function crmHref(prototypeHref: string) {
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  return productHref(prototypeHref);
}

function groupConnectionsByStatus(viewModel: OrbitContactsViewModel, list: OrbitContactView[]) {
  const grouped = Object.fromEntries(
    viewModel.pipelineStatuses.map((status) => [status.value, [] as OrbitContactView[]]),
  ) as Record<OrbitContactPipelineStatus, OrbitContactView[]>;

  for (const contact of list) {
    grouped[contact.pipelineStatus].push(contact);
  }

  return grouped;
}

function CrmNav({
  active,
  counts,
}: {
  active: CrmMode;
  counts?: { all: number };
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div className="eyebrow" style={{ padding: "0 12px 10px" }}>名片夹</div>
      {crmNav.map((item) => {
        const on = active === item.key;
        const count = item.key === "list" && counts ? counts.all : null;

        return (
          <a
            href={crmHref(item.href)}
            key={item.key}
            style={{
              alignItems: "center",
              background: on ? "var(--accent-soft)" : "transparent",
              borderRadius: 11,
              color: on ? "var(--accent)" : "var(--text-2)",
              display: "flex",
              fontFamily: "var(--ff)",
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              gap: 11,
              padding: "10px 12px",
              textDecoration: "none",
            }}
          >
            <Icon name={item.icon} size={19} stroke={on ? 2 : 1.7} />
            <span style={{ flex: 1 }}>{item.label}</span>
            {count != null ? (
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.8 }}>{count}</span>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}

function MobileCrmHeader({
  active = "list",
  action,
  onQueryChange,
  placeholder = "搜索姓名 / 公司 / 行业",
  query = "",
}: {
  active?: CrmMode;
  action?: ReactNode;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  query?: string;
}) {
  return (
    <div style={{ flexShrink: 0, padding: "16px 18px 0" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 className="h-display" style={{ fontSize: 26, margin: "6px 0" }}>名片夹</h1>
        {action || (
          <a
            aria-label="扫名片"
            href="/app/contacts/new"
            style={{
              alignItems: "center",
              background: "var(--accent-soft)",
              borderRadius: 999,
              color: "var(--accent)",
              display: "flex",
              height: 38,
              justifyContent: "center",
              textDecoration: "none",
              width: 38,
            }}
          >
            <Icon name="scan" size={19} />
          </a>
        )}
      </div>
      <div style={{ margin: "8px 0 14px", position: "relative" }}>
        <Icon name="search" size={17} color="var(--text-3)" style={{ left: 13, position: "absolute", top: 14 }} />
        <input
          className="field"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={placeholder}
          style={{ background: "var(--surface-2)", height: 44, paddingLeft: 40 }}
          value={query}
        />
      </div>
      <div className="scroll noscroll" style={{ display: "flex", gap: 7, margin: "0 -18px", overflowX: "auto", padding: "0 18px 12px" }}>
        {mobileCrmTabs.map((item) => (
          <a
            className={`chip${active === item.key ? " is-active" : ""}`}
            href={crmHref(item.href)}
            key={item.key}
            style={{ flexShrink: 0, textDecoration: "none" }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function stageMeta(viewModel: OrbitContactsViewModel, status: OrbitContactPipelineStatus) {
  const index = Math.max(0, viewModel.pipelineStatuses.findIndex((item) => item.value === status));
  const label = viewModel.pipelineStatuses.find((item) => item.value === status)?.label ?? status;

  return { color: stageColors[index % 3], label, soft: stageSoft[index % 3] };
}

function StageDot({
  status,
  viewModel,
  withLabel,
}: {
  status: OrbitContactPipelineStatus;
  viewModel: OrbitContactsViewModel;
  withLabel?: boolean;
}) {
  const meta = stageMeta(viewModel, status);

  return (
    <span style={{ alignItems: "center", background: withLabel ? meta.soft : "transparent", borderRadius: 999, display: "inline-flex", gap: 6, height: 24, padding: withLabel ? "0 9px 0 8px" : 0 }}>
      <span style={{ background: meta.color, borderRadius: 999, height: 7, width: 7 }} />
      {withLabel ? <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>{meta.label}</span> : null}
    </span>
  );
}

function PersonCard({
  item,
  viewModel,
}: {
  item: OrbitContactView;
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <a
      className="card-hover"
      href={`/app/contacts/${item.id}`}
      style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, display: "flex", gap: 13, padding: "14px 16px", textDecoration: "none" }}
    >
      <Avatar letter={crmInitial(item.displayName)} g="g-violet" size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span className="h-section" style={{ color: "var(--ink)", fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.displayName || "未命名联系人"}</span>
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crmRole(item)}</div>
      </div>
      <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", flexShrink: 0, gap: 7 }}>
        <StageDot status={item.pipelineStatus} viewModel={viewModel} withLabel />
      </div>
    </a>
  );
}

function filterConnections(connections: OrbitContactView[], query: string, stage: "all" | OrbitContactPipelineStatus = "all") {
  const keyword = query.trim().toLowerCase();

  return connections.filter((item) => {
    const matchesStage = stage === "all" || item.pipelineStatus === stage;
    const haystack = [item.displayName, item.company, item.title, item.industry].filter(Boolean).join(" ").toLowerCase();
    return matchesStage && (!keyword || haystack.includes(keyword));
  });
}

export function OrbitRealCardsList({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | OrbitContactPipelineStatus>("all");
  const items = viewModel.connections;
  const counts: Record<string, number> & { all: number } = { all: items.length };
  for (const status of viewModel.pipelineStatuses) {
    counts[status.value] = items.filter((item) => item.pipelineStatus === status.value).length;
  }
  const eventCount = new Set(items.map((item) => item.lastEventId).filter(Boolean)).size;
  const filtered = filterConnections(items, query, stage);
  const filters: ["all" | OrbitContactPipelineStatus, string][] = [["all", "全部"], ...viewModel.pipelineStatuses.map((status) => [status.value, status.label] as ["all" | OrbitContactPipelineStatus, string])];
  const subtitle = `${items.length} 位联系人${eventCount ? ` · 来自 ${eventCount} 场活动` : ""}`;

  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}>
            <CrmNav active="list" counts={counts} />
          </div>
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ fontSize: 30, margin: 0 }}>全部人脉</h1>
                <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 4 }}>{subtitle}</div>
              </div>
              <a className="btn btn-ghost btn-sm" href="/app/contacts/new"><Icon name="ticket" size={16} />扫名片</a>
            </div>
            <div style={{ alignItems: "center", display: "flex", gap: 16, marginBottom: 18 }}>
              <div style={{ flex: 1, maxWidth: 320, position: "relative" }}>
                <Icon name="search" size={17} color="var(--text-3)" style={{ left: 13, position: "absolute", top: 14 }} />
                <input className="field" onChange={(event) => setQuery(event.target.value)} placeholder="按姓名、公司、职位搜索" style={{ height: 44, paddingLeft: 40 }} value={query} />
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                {filters.map(([key, label]) => (
                  <button className={`chip${stage === key ? " is-active" : ""}`} key={key} onClick={() => setStage(key)} type="button">
                    {label}<span className="mono">{counts[key] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            {!filtered.length ? <div className="card-flat" style={{ color: "var(--text-3)", fontSize: 13.5, padding: 18 }}>当前还没有匹配的联系人。</div> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{filtered.map((item) => <PersonCard item={item} key={item.id} viewModel={viewModel} />)}</div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="list" onQueryChange={setQuery} query={query} />
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "2px 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 10 }}>{subtitle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>{filtered.map((item) => <PersonCard item={item} key={item.id} viewModel={viewModel} />)}</div>
        </div>
      </div>
    </main>
  );
}

function PipelineCard({ connection }: { connection: OrbitContactView }) {
  return (
    <a
      className="card-hover"
      href={`/app/contacts/${connection.id}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "inherit", cursor: "pointer", display: "block", padding: 13, textDecoration: "none" }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Avatar letter={crmInitial(connection.displayName)} g="g-violet" size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{connection.displayName || "未命名联系人"}</div>
          <div style={{ color: "var(--text-3)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crmRole(connection)}</div>
        </div>
        <Icon name="chevR" size={16} color="var(--text-4)" />
      </div>
    </a>
  );
}

function PipelineBoard({
  grouped,
  viewModel,
}: {
  grouped: Record<OrbitContactPipelineStatus, OrbitContactView[]>;
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <div style={{ display: "flex", gap: 14, height: "100%" }}>
      {viewModel.pipelineStatuses.map((status, index) => {
        const items = grouped[status.value] || [];
        const color = stageColors[index % 3];

        return (
          <div key={status.value} style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: 14, display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8, padding: "13px 14px" }}>
              <span style={{ background: color, borderRadius: 999, height: 8, width: 8 }} />
              <span style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 600 }}>{status.label}</span>
              <span style={{ color: "var(--text-4)", fontFamily: "var(--ff-mono)", fontSize: 12 }}>{items.length}</span>
              <div style={{ flex: 1 }} />
            </div>
            <div className="scroll" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 10, overflowY: "auto", padding: "0 11px 14px" }}>
              {items.length ? items.map((contact) => <PipelineCard connection={contact} key={contact.id} />) : <div style={{ color: "var(--text-4)", fontSize: 13, padding: "4px 2px" }}>暂无联系人。</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobilePipeline({
  grouped,
  viewModel,
}: {
  grouped: Record<OrbitContactPipelineStatus, OrbitContactView[]>;
  viewModel: OrbitContactsViewModel;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <>
      {viewModel.pipelineStatuses.map((status, index) => {
        const items = grouped[status.value] || [];
        const color = stageColors[index % 3];
        const soft = stageSoft[index % 3];
        const isCollapsed = collapsed[status.value];

        return (
          <div key={status.value} style={{ marginBottom: 14 }}>
            <div onClick={() => setCollapsed((current) => ({ ...current, [status.value]: !current[status.value] }))} style={{ alignItems: "center", background: "var(--bg)", borderBottom: "1px solid var(--border)", cursor: "pointer", display: "flex", gap: 8, padding: "10px 0", position: "sticky", top: 0, zIndex: 5 }}>
              <Icon name={isCollapsed ? "chevR" : "chevD"} size={16} color="var(--text-3)" />
              <span style={{ background: color, borderRadius: 999, height: 9, width: 9 }} />
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{status.label}</span>
              <span style={{ alignItems: "center", background: soft, borderRadius: 999, color, display: "flex", fontSize: 11.5, fontWeight: 600, height: 20, justifyContent: "center", minWidth: 20, padding: "0 6px" }}>{items.length}</span>
              <div style={{ flex: 1 }} />
            </div>
            {!isCollapsed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {items.map((contact) => <PipelineCard connection={contact} key={contact.id} />)}
                {items.length === 0 ? <div style={{ color: "var(--text-4)", fontSize: 13, padding: "4px 2px" }}>暂无</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function OrbitRealCardsPipeline({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const [query, setQuery] = useState("");
  const visible = filterConnections(viewModel.connections, query);
  const grouped = groupConnectionsByStatus(viewModel, visible);

  return (
    <main data-orbit-real-page="contacts-pipeline" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}>
            <CrmNav active="pipeline" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, padding: "28px 32px 28px" }}>
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow">PIPELINE</div>
              <h1 className="h-display" style={{ fontSize: 30, margin: "2px 0 0" }}>跟进管线</h1>
              <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 4 }}>把每段关系往前推一格 · 按状态分组</div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PipelineBoard grouped={grouped} viewModel={viewModel} />
            </div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", position: "relative" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="pipeline" onQueryChange={setQuery} query={query} />
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 18px 36px" }}>
          <MobilePipeline grouped={grouped} viewModel={viewModel} />
        </div>
      </div>
    </main>
  );
}

type GraphNode =
  | { id: string; name: string; type: "event" }
  | { company: string; displayName: string; id: string; industry: string; pipelineStatus: OrbitContactPipelineStatus; type: "connection" };

interface GraphEdge {
  source: string;
  target: string;
}

interface ConnGraph {
  edges: GraphEdge[];
  nodes: GraphNode[];
}

function buildConnGraph(viewModel: OrbitContactsViewModel): ConnGraph {
  const eventIdsForContacts = [...new Set(viewModel.connections.map((contact) => contact.lastEventId))];

  return {
    edges: viewModel.connections.map((contact) => ({ source: contact.id, target: contact.lastEventId })),
    nodes: [
      ...eventIdsForContacts.map((id) => ({ id, name: viewModel.events.find((event) => event.id === id)?.name || "活动", type: "event" as const })),
      ...viewModel.connections.map((contact) => ({
        company: contact.company,
        displayName: contact.displayName,
        id: contact.id,
        industry: contact.industry,
        pipelineStatus: contact.pipelineStatus,
        type: "connection" as const,
      })),
    ],
  };
}

function graphLayout(graph: ConnGraph) {
  const cx = graphWidth / 2;
  const cy = graphHeight / 2;
  const events = graph.nodes.filter((node): node is Extract<GraphNode, { type: "event" }> => node.type === "event");
  const connections = graph.nodes.filter((node): node is Extract<GraphNode, { type: "connection" }> => node.type === "connection");
  const eventAngle = new Map<string, number>();
  const eventPos = new Map<string, { x: number; y: number }>();

  events.forEach((event, index) => {
    const angle = events.length ? (2 * Math.PI * index) / events.length : 0;
    eventAngle.set(event.id, angle);
    eventPos.set(event.id, { x: cx + Math.cos(angle) * 150, y: cy + Math.sin(angle) * 150 });
  });

  const connEvents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    connEvents.set(edge.source, [...(connEvents.get(edge.source) || []), edge.target]);
  }

  const connPos = new Map<string, { x: number; y: number }>();
  connections.forEach((connection, index) => {
    const linked = connEvents.get(connection.id) || [];
    const angles = linked.map((id) => eventAngle.get(id)).filter((angle): angle is number => angle !== undefined);
    const base = angles.length
      ? Math.atan2(
          angles.reduce((sum, angle) => sum + Math.sin(angle), 0) / angles.length,
          angles.reduce((sum, angle) => sum + Math.cos(angle), 0) / angles.length,
        )
      : (2 * Math.PI * index) / Math.max(1, connections.length);
    const angle = base + ((index % 5) - 2) * 0.16;
    connPos.set(connection.id, { x: cx + Math.cos(angle) * 250, y: cy + Math.sin(angle) * 235 });
  });

  return { connPos, connections, cx, cy, edges: graph.edges, eventPos, events };
}

function GraphCanvas({
  scale,
  view,
  viewModel,
}: {
  scale: number;
  view: ReturnType<typeof graphLayout>;
  viewModel: OrbitContactsViewModel;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="card orbit-graph-canvas">
      <div className="orbit-graph-legend">
        {viewModel.pipelineStatuses.map((status) => (
          <span
            key={status.value}
            style={{
              "--stage-color": graphStatusColor[status.value],
              "--stage-soft": graphStatusSoft[status.value],
            } as CSSProperties}
          >
            <i />{status.label}
          </span>
        ))}
      </div>
      {mounted ? (
      <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} width="100%" style={{ minWidth: 320 }}>
        <g transform={`translate(${graphWidth / 2} ${graphHeight / 2}) scale(${scale}) translate(${-graphWidth / 2} ${-graphHeight / 2})`}>
          {view.events.map((event) => {
            const point = view.eventPos.get(event.id);
            if (!point) return null;
            return <line key={`me-${event.id}`} x1={view.cx} y1={view.cy} x2={point.x} y2={point.y} stroke="rgba(99,89,233,0.18)" strokeWidth="1" />;
          })}
          {view.edges.map((edge, index) => {
            const a = view.connPos.get(edge.source);
            const b = view.eventPos.get(edge.target);
            if (!a || !b) return null;
            return <line key={`e-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(29,29,34,0.12)" strokeWidth="1" />;
          })}
          {view.events.map((event) => {
            const point = view.eventPos.get(event.id);
            if (!point) return null;
            return (
              <g key={event.id}>
                <circle cx={point.x} cy={point.y} r="9" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.5" />
                <text x={point.x} y={point.y + 22} textAnchor="middle" fontSize="9" fill="var(--text-3)">活动</text>
              </g>
            );
          })}
          {view.connections.map((connection) => {
            const point = view.connPos.get(connection.id);
            if (!point) return null;
            return (
              <g key={connection.id}>
                <circle cx={point.x} cy={point.y} r="6" fill={graphStatusColor[connection.pipelineStatus] || "var(--amber)"} />
                <text x={point.x} y={point.y - 11} textAnchor="middle" fontSize="10" fill="var(--ink)">{(connection.displayName || "?").slice(0, 8)}</text>
              </g>
            );
          })}
          <circle cx={view.cx} cy={view.cy} r="11" fill="var(--accent)" />
          <text x={view.cx} y={view.cy + 4} textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">我</text>
        </g>
      </svg>
      ) : null}
    </section>
  );
}

export function OrbitRealCardsGraph({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const graph = useMemo(() => buildConnGraph(viewModel), [viewModel]);
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return graph;
    const matched = graph.nodes.filter((node) => node.type === "connection" && [node.displayName, node.company, node.industry].filter(Boolean).join(" ").toLowerCase().includes(keyword));
    const ids = new Set(matched.map((node) => node.id));
    const keptEdges = graph.edges.filter((edge) => ids.has(edge.source));
    const eventIdsFromEdges = new Set(keptEdges.map((edge) => edge.target));
    return { edges: keptEdges, nodes: graph.nodes.filter((node) => ids.has(node.id) || (node.type === "event" && eventIdsFromEdges.has(node.id))) };
  }, [graph, query]);
  const view = useMemo(() => graphLayout(visible), [visible]);
  const summary = `${view.connections.length} 位联系人 · ${view.events.length} 场活动`;
  const zoom = (className: string) => (
    <div className={className}>
      <button className="btn btn-ghost btn-sm" onClick={() => setScale((value) => Math.max(0.5, value - 0.2))} type="button">-</button>
      <span className="mono">{Math.round(scale * 100)}%</span>
      <button className="btn btn-primary btn-sm" onClick={() => setScale((value) => Math.min(2.2, value + 0.2))} type="button">+</button>
    </div>
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="contacts-graph">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}>
            <CrmNav active="graph" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ alignItems: "flex-end", display: "flex", gap: 20, justifyContent: "space-between", padding: "24px 32px 16px" }}>
              <div>
                <h1 className="h-display" style={{ fontSize: 30, margin: 0 }}>人脉图谱</h1>
                <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 4 }}>{summary}</div>
              </div>
              {zoom("orbit-graph-zoom")}
            </div>
            <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
              <GraphCanvas scale={scale} view={view} viewModel={viewModel} />
            </div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="graph" onQueryChange={setQuery} query={query} />
        <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "0 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 10 }}>{summary}</div>
          {zoom("orbit-graph-mobile-zoom")}
          <GraphCanvas scale={scale} view={view} viewModel={viewModel} />
        </div>
      </div>
    </main>
  );
}

function introStatusLabel(status: OrbitIntroStatus) {
  return status === "sent" ? "已发送" : "草稿";
}

function introStatusClass(status: OrbitIntroStatus) {
  return status === "sent" ? "badge-live" : "badge-soon";
}

function IntroRow({ intro }: { intro: OrbitIntroView }) {
  return (
    <article className="card orbit-intro-row">
      <div className="orbit-intro-route">
        <Avatar letter={crmInitial(intro.labelA)} g="g-sky" size={42} />
        <div className="orbit-intro-name"><span>联系人 A</span><strong>{intro.labelA}</strong></div>
        <span className="orbit-intro-arrow"><Icon name="arrow" size={17} /></span>
        <Avatar letter={crmInitial(intro.labelB)} g="g-emerald" size={42} />
        <div className="orbit-intro-name"><span>联系人 B</span><strong>{intro.labelB}</strong></div>
      </div>
      <span className={`badge ${introStatusClass(intro.statusBadge)}`}>{introStatusLabel(intro.statusBadge)}</span>
      {intro.blurb ? <p className="orbit-intro-blurb">{intro.blurb}</p> : null}
    </article>
  );
}

function PickerSlot({
  label,
  onPick,
  person,
}: {
  label: string;
  onPick: () => void;
  person: OrbitContactView | null;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label className="field-label">{label}</label>
      {person ? (
        <button onClick={onPick} style={{ alignItems: "center", background: "var(--accent-softer)", border: "1px solid var(--accent-soft)", borderRadius: 14, cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 8, padding: 14, width: "100%" }} type="button">
          <Avatar letter={crmInitial(person.displayName)} g="g-violet" size={48} />
          <div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>{person.displayName}</div>
        </button>
      ) : (
        <button onClick={onPick} style={{ alignItems: "center", background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: 14, color: "var(--text-2)", cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 8, padding: 14, width: "100%" }} type="button">
          <span style={{ alignItems: "center", background: "var(--surface)", borderRadius: 999, display: "flex", height: 48, justifyContent: "center", width: 48 }}><Icon name="plus" size={22} /></span>
          <span style={{ fontSize: 12.5, fontWeight: 550 }}>选择联系人</span>
        </button>
      )}
    </div>
  );
}

function IntroComposerModal({
  onClose,
  onCreated,
  viewModel,
}: {
  onClose: () => void;
  onCreated: () => void;
  viewModel: OrbitContactsViewModel;
}) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [blurb, setBlurb] = useState("");
  const [picking, setPicking] = useState("");
  const [query, setQuery] = useState("");
  const selectedA = viewModel.connections.find((contact) => contact.id === aId) || null;
  const selectedB = viewModel.connections.find((contact) => contact.id === bId) || null;
  const keyword = query.trim().toLowerCase();
  const selectable = viewModel.connections.filter((item) => {
    if (picking === "a" && item.id === bId) return false;
    if (picking === "b" && item.id === aId) return false;
    return !keyword || [item.displayName, item.company, item.title].filter(Boolean).join(" ").toLowerCase().includes(keyword);
  });

  function pick(id: string) {
    if (picking === "a") setAId(id);
    if (picking === "b") setBId(id);
    setPicking("");
    setQuery("");
  }

  if (picking) {
    return (
      <ModalShell maxW={520} onClose={() => setPicking("")} step="选择联系人">
        <h2 className="h-title" style={{ fontSize: 20, margin: "4px 0 14px" }}>选择{picking === "a" ? "第一位" : "第二位"}联系人</h2>
        <div style={{ marginBottom: 14, position: "relative" }}>
          <Icon name="search" size={17} color="var(--text-3)" style={{ left: 13, position: "absolute", top: 14 }} />
          <input autoFocus className="field" onChange={(event) => setQuery(event.target.value)} placeholder="搜索名片夹" style={{ paddingLeft: 40 }} value={query} />
        </div>
        <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {selectable.map((item) => (
            <button className="card-hover" key={item.id} onClick={() => pick(item.id)} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 11, padding: 11, textAlign: "left" }} type="button">
              <Avatar letter={crmInitial(item.displayName)} g="g-violet" size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{item.displayName}</div>
                <div style={{ color: "var(--text-3)", fontSize: 12 }}>{crmRole(item)}</div>
              </div>
              <Icon name="chevR" size={16} color="var(--text-4)" />
            </button>
          ))}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell maxW={560} onClose={onClose} step="创建引荐">
      <form onSubmit={(event) => { event.preventDefault(); if (aId && bId) onCreated(); }}>
        <h2 className="h-title" style={{ fontSize: 22, margin: "4px 0 6px" }}>发起引荐</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13.5, margin: "0 0 18px" }}>从名片夹里选择两位联系人。你填写引荐词，或者留空交给当前 AI 能力生成。</p>
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <PickerSlot label="联系人 A" onPick={() => setPicking("a")} person={selectedA} />
          <div style={{ color: "var(--accent)", marginTop: 18 }}><Icon name="share" size={20} /></div>
          <PickerSlot label="联系人 B" onPick={() => setPicking("b")} person={selectedB} />
        </div>
        <label className="field-label" style={{ marginTop: 18 }}>引荐词</label>
        <textarea className="field" onChange={(event) => setBlurb(event.target.value)} placeholder="留空则尝试用 AI 生成；如果当前没配 AI，会明确报错。" style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} value={blurb} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">取消</button>
          <button className="btn btn-primary" disabled={!aId || !bId} type="submit"><Icon name="share" size={16} color="#fff" />保存引荐</button>
        </div>
      </form>
    </ModalShell>
  );
}

export function OrbitRealCardsIntros({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | OrbitIntroStatus>("all");
  const [query, setQuery] = useState("");
  const stats = {
    draft: viewModel.intros.filter((intro) => intro.statusBadge === "draft").length,
    sent: viewModel.intros.filter((intro) => intro.statusBadge === "sent").length,
    total: viewModel.intros.length,
  };
  const filters: { count: number; key: "all" | OrbitIntroStatus; label: string }[] = [
    { key: "all", label: "全部", count: stats.total },
    { key: "draft", label: "草稿", count: stats.draft },
    { key: "sent", label: "已发送", count: stats.sent },
  ];
  const visible = viewModel.intros.filter((intro) => {
    const matchesFilter = filter === "all" || intro.statusBadge === filter;
    const haystack = [intro.labelA, intro.labelB, intro.blurb].filter(Boolean).join(" ").toLowerCase();
    return matchesFilter && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  });
  const statsNode = (
    <section className="orbit-intro-stats">
      <div className="card-flat"><strong>{stats.total}</strong><span>全部</span></div>
      <div className="card-flat"><strong>{stats.draft}</strong><span>草稿</span></div>
      <div className="card-flat"><strong>{stats.sent}</strong><span>已发送</span></div>
    </section>
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="contacts-intros">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}>
            <CrmNav active="intros" />
          </div>
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ alignItems: "flex-end", display: "flex", gap: 20, justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ fontSize: 30, margin: 0 }}>引荐记录</h1>
                <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 4 }}>你已经发出或保存过的引荐，都在这里。</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setComposerOpen(true)} type="button"><Icon name="share" size={16} color="#fff" />发起引荐</button>
            </div>
            {statsNode}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
              {filters.map((item) => (
                <button className={`chip${filter === item.key ? " is-active" : ""}`} key={item.key} onClick={() => setFilter(item.key)} type="button">
                  {item.label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{item.count}</span>
                </button>
              ))}
            </div>
            {!visible.length ? <div className="card-flat orbit-empty">还没有符合筛选条件的引荐记录。</div> : null}
            <section className="orbit-intro-list">{visible.map((intro) => <IntroRow intro={intro} key={intro.id} />)}</section>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader
          action={<button aria-label="发起引荐" style={{ alignItems: "center", background: "var(--accent-soft)", border: "none", borderRadius: 999, color: "var(--accent)", cursor: "pointer", display: "flex", height: 38, justifyContent: "center", width: 38 }} type="button"><Icon name="plus" size={19} /></button>}
          active="intros"
          onQueryChange={setQuery}
          placeholder="搜索联系人 / 引荐词"
          query={query}
        />
        <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "2px 18px 36px" }}>
          {statsNode}
          <div className="scroll noscroll" style={{ display: "flex", gap: 7, margin: "0 -18px 14px", overflowX: "auto", padding: "0 18px" }}>
            {filters.map((item) => (
              <button className={`chip${filter === item.key ? " is-active" : ""}`} key={item.key} onClick={() => setFilter(item.key)} style={{ flexShrink: 0 }} type="button">
                {item.label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{item.count}</span>
              </button>
            ))}
          </div>
          {!visible.length ? <div className="card-flat orbit-empty">还没有符合筛选条件的引荐记录。</div> : null}
          <section className="orbit-intro-list">{visible.map((intro) => <IntroRow intro={intro} key={intro.id} />)}</section>
        </div>
      </div>
      {composerOpen ? <IntroComposerModal onClose={() => setComposerOpen(false)} onCreated={() => setComposerOpen(false)} viewModel={viewModel} /> : null}
    </main>
  );
}

const sourceLabels: Record<OrbitContactView["source"], string> = {
  exchange: "活动交换",
  manual: "手动添加",
  scan: "名片扫描",
};

const aiActions = [
  { icon: "bell", kind: "reminder", label: "到点提醒" },
  { icon: "mail", kind: "message_draft", label: "跟进文案" },
  { icon: "share", kind: "intro_blurb", label: "引荐词" },
] as const;

const aiSample: Record<(typeof aiActions)[number]["kind"], string> = {
  intro_blurb: "想把你引荐给我的朋友——他在做你正寻找的渠道资源，背景很契合，要不要我牵个线？",
  message_draft: "你好！很高兴在活动上认识你。想继续上次聊到的出海合作，方便这周约个 30 分钟线上电话吗？",
  reminder: "已为你设置提醒：3 天后跟进，附上今天聊到的合作要点。",
};

type AiActionKind = keyof typeof aiSample;

function CdGlyph({
  color = "currentColor",
  name,
  size = 16,
  stroke = 1.7,
  style,
}: {
  color?: string;
  name: "briefcase" | "copy" | "message";
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}) {
  const paths = {
    briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3.5 13h17" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
    message: <path d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />,
  };

  return (
    <svg aria-hidden fill="none" height={size} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={stroke} style={{ display: "block", flexShrink: 0, ...style }} viewBox="0 0 24 24" width={size}>
      {paths[name]}
    </svg>
  );
}

function cdDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function cdStageMeta(viewModel: OrbitContactsViewModel, status: OrbitContactPipelineStatus) {
  const index = Math.max(0, viewModel.pipelineStatuses.findIndex((item) => item.value === status));
  const label = viewModel.pipelineStatuses.find((item) => item.value === status)?.label ?? status;

  return { color: stageColors[index % 3], label, soft: stageSoft[index % 3] };
}

function CdStageDot({
  status,
  viewModel,
  withLabel,
}: {
  status: OrbitContactPipelineStatus;
  viewModel: OrbitContactsViewModel;
  withLabel?: boolean;
}) {
  const meta = cdStageMeta(viewModel, status);

  return (
    <span style={{ alignItems: "center", background: withLabel ? meta.soft : "transparent", borderRadius: 999, display: "inline-flex", gap: 6, height: 24, padding: withLabel ? "0 9px 0 8px" : 0 }}>
      <span style={{ background: meta.color, borderRadius: 999, height: 7, width: 7 }} />
      {withLabel ? <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>{meta.label}</span> : null}
    </span>
  );
}

function TagBlock({
  items,
  label,
  tone,
}: {
  items: string[];
  label: string;
  tone?: "accent";
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ color: "var(--ink)", fontSize: 12.5, fontWeight: 650, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((item) => (
          <span className="chip" key={item} style={{ background: tone === "accent" ? "var(--accent-softer)" : "var(--surface-2)", color: tone === "accent" ? "var(--accent)" : "var(--text-2)" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventPublicProfileCard({ profile }: { profile: OrbitContactPublicProfileView | null }) {
  if (!profile) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <span className="eyebrow">活动报名资料</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
        {profile.industry ? <span className="chip" style={{ background: "var(--accent-softer)", color: "var(--accent)" }}>{profile.industry}</span> : null}
      </div>
      {profile.bio ? <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6, margin: "12px 0 0" }}>{profile.bio}</p> : null}
      {profile.intro ? <p style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.6, margin: "8px 0 0" }}>{profile.intro}</p> : null}
      {profile.offering.length ? <TagBlock items={profile.offering} label="能提供" tone="accent" /> : null}
      {profile.seeking.length ? <TagBlock items={profile.seeking} label="想寻找" /> : null}
      {profile.topics.length ? <TagBlock items={profile.topics} label="兴趣话题" /> : null}
      {profile.conversationPrompts.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "var(--ink)", fontSize: 12.5, fontWeight: 650, marginBottom: 8 }}>AI 破冰问题</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {profile.conversationPrompts.slice(0, 3).map((prompt, index) => (
              <div key={prompt} style={{ display: "flex", gap: 10 }}>
                <span className="mono" style={{ alignItems: "center", background: "var(--surface-2)", borderRadius: 999, color: "var(--text-3)", display: "flex", flexShrink: 0, fontSize: 10.5, height: 24, justifyContent: "center", width: 24 }}>0{index + 1}</span>
                <span style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>{prompt}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function latestPublicProfile(encounters: OrbitContactEncounterView[]) {
  for (let index = encounters.length - 1; index >= 0; index -= 1) {
    const profile = encounters[index]?.context.publicProfile;
    if (profile) return profile;
  }
  return null;
}

export function OrbitRealCardDetail({
  contactId,
  viewModel,
}: {
  contactId: string;
  viewModel: OrbitContactsViewModel;
}) {
  const base = viewModel.connections.find((item) => item.id === contactId) ?? viewModel.connections[0];
  const [connection, setConnection] = useState<OrbitContactView>(() => ({ ...base }));
  const [notes, setNotes] = useState(() => [...base.notes]);
  const [noteBody, setNoteBody] = useState("");
  const [notice, setNotice] = useState("");
  const [aiBusy, setAiBusy] = useState<AiActionKind | "">("");
  const [aiDrafts, setAiDrafts] = useState<{ content: string; id: string; kind: AiActionKind }[]>([]);
  const [copiedKey, setCopiedKey] = useState("");
  const cover = gradientFromString(connection.displayName || contactId || "orbit");
  const roleLine = crmRole(connection);
  const profile = latestPublicProfile(base.encounters);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1400);
  }

  function setStatus(status: OrbitContactPipelineStatus) {
    if (status === connection.pipelineStatus) return;
    setConnection((current) => ({ ...current, pipelineStatus: status }));
    showNotice("阶段已更新。");
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    if (!noteBody.trim()) return;
    setNotes((current) => [...current, { id: `n${Date.now()}`, body: noteBody, createdAt: new Date().toISOString() }]);
    setNoteBody("");
    showNotice("备注已保存。");
  }

  function generateAi(kind: AiActionKind) {
    setAiBusy(kind);
    window.setTimeout(() => {
      setAiDrafts((current) => [{ id: `d${Date.now()}`, kind, content: aiSample[kind] }, ...current]);
      setAiBusy("");
    }, 700);
  }

  function copyValue(key: string) {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 1400);
  }

  const contactRows = [
    { glyph: true, icon: "message", key: "wechat", label: "微信", value: connection.wechat },
    { glyph: true, icon: "message", key: "lineId", label: "LINE ID", value: connection.lineId },
    { glyph: true, icon: "message", key: "phone", label: "电话", value: connection.phone },
    { glyph: false, icon: "mail", key: "email", label: "邮箱", value: connection.email },
    { glyph: true, icon: "briefcase", key: "company", label: "公司", value: [connection.company, connection.title].filter(Boolean).join(" · ") },
  ].filter((row) => row.value);
  const nextStep = connection.pipelineStatus === "partnered"
    ? "已进入合作阶段，记得同步项目进展并维护长期关系。"
    : connection.pipelineStatus === "in_progress"
      ? "保持节奏，约下一次沟通并把讨论要点记进笔记。"
      : "趁热打铁，发一条跟进消息，约一次正式沟通。";
  const StatusCard = ({ pad }: { pad: number }) => (
    <div className="card" style={{ padding: pad }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="eyebrow">跟进状态</span>
        <CdStageDot status={connection.pipelineStatus || "to_contact"} viewModel={viewModel} withLabel />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {viewModel.pipelineStatuses.map((status) => {
          const meta = cdStageMeta(viewModel, status.value);
          const selected = (connection.pipelineStatus || "to_contact") === status.value;

          return (
            <button
              key={status.value}
              onClick={() => setStatus(status.value)}
              style={{ background: selected ? meta.soft : "var(--surface-2)", border: `1px solid ${selected ? "transparent" : "var(--border)"}`, borderRadius: 10, color: selected ? meta.color : "var(--text-3)", cursor: "pointer", flex: 1, fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, padding: "9px 0", textAlign: "center" }}
              type="button"
            >
              {status.label}
            </button>
          );
        })}
      </div>
      <div style={{ background: "var(--accent-softer)", borderRadius: 11, display: "flex", gap: 10, marginTop: 14, padding: 13 }}>
        <Icon name="sparkle" size={17} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}>下一步建议</div>
          <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.5, marginTop: 3 }}>{nextStep}</div>
        </div>
      </div>
    </div>
  );
  const AiCard = ({ pad }: { pad: number }) => (
    <div className="card" style={{ padding: pad }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span className="eyebrow">AI 跟进引擎</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {aiActions.map((item) => (
          <button className={`btn btn-sm ${item.kind === "message_draft" ? "btn-primary" : "btn-ghost"}`} disabled={Boolean(aiBusy)} key={item.kind} onClick={() => generateAi(item.kind)} type="button">
            <Icon name={item.icon} size={16} color={item.kind === "message_draft" ? "#fff" : undefined} />
            {aiBusy === item.kind ? "生成中…" : item.label}
          </button>
        ))}
      </div>
      {aiDrafts.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {aiDrafts.map((draft) => (
            <div key={draft.id} style={{ background: "var(--surface-2)", borderRadius: 11, padding: 12 }}>
              <div style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{aiActions.find((action) => action.kind === draft.kind)?.label || draft.kind}</div>
              <div style={{ color: "var(--text)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{draft.content}</div>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 12 }}>用 AI 生成提醒、跟进文案或引荐词。</div>}
    </div>
  );
  const NotesCard = ({ pad }: { pad: number }) => (
    <div className="card" style={{ padding: pad }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span className="eyebrow">笔记</span><span style={{ color: "var(--text-4)", fontSize: 11.5 }}>{notes.length} 条</span></div>
      <form onSubmit={addNote} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: notes.length ? 12 : 0 }}>
        <textarea className="field" onChange={(event) => setNoteBody(event.target.value)} placeholder="记录下一步、对方偏好或合作线索" rows={3} style={{ height: "auto", lineHeight: 1.5, padding: "11px 13px", resize: "vertical" }} value={noteBody} />
        <button className="btn btn-primary btn-sm" disabled={!noteBody.trim()} style={{ alignSelf: "flex-start" }} type="submit"><Icon name="plus" size={15} color="#fff" />添加笔记</button>
      </form>
      {notes.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notes.map((note) => (
            <div key={note.id} style={{ background: "var(--surface-2)", borderRadius: 11, padding: 12 }}>
              <div style={{ color: "var(--text)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{note.body}</div>
              <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 6 }}>{cdDate(note.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : <div style={{ color: "var(--text-3)", fontSize: 12.5 }}>暂无笔记。</div>}
    </div>
  );
  const Timeline = ({ pad }: { pad: number }) => (
    <div className="card" style={{ padding: pad }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}><span className="eyebrow">交往记录</span><span style={{ color: "var(--text-4)", fontSize: 11.5 }}>{base.encounters.length} 次相见</span></div>
      <div style={{ marginTop: 14 }}>
        {base.encounters.map((encounter, index) => {
          const last = index === base.encounters.length - 1;
          const context = encounter.context;

          return (
            <div key={encounter.id} style={{ display: "flex", gap: 14, paddingBottom: last ? 0 : 16 }}>
              <div style={{ alignItems: "center", display: "flex", flexDirection: "column" }}>
                <span style={{ background: "var(--text-4)", borderRadius: 999, height: 10, width: 10 }} />
                {last ? null : <span style={{ background: "var(--border-2)", flex: 1, marginTop: 3, width: 2 }} />}
              </div>
              <div style={{ flex: 1, marginTop: -3, minWidth: 0 }}>
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 7 }}>
                  <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{cdDate(context.metAt || encounter.createdAt) || "时间未记录"}</span>
                  {context.tableNo ? <span className="chip" style={{ background: "var(--surface-2)", fontSize: 11.5, height: 22 }}>桌号 {context.tableNo}</span> : null}
                </div>
                {context.reason ? <div style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{context.reason}</div> : null}
                <div style={{ color: "var(--text-4)", fontSize: 11.5, marginTop: 3 }}>{context.score != null ? `匹配分数 ${context.score} · ` : ""}活动 {encounter.eventId}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
  const ContactCard = ({ pad, showSource }: { pad: number; showSource?: boolean }) => (
    <div className="card" style={{ padding: pad }}>
      <span className="eyebrow">联系方式</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12 }}>
        {contactRows.map((row) => (
          <div key={row.key} style={{ alignItems: "center", display: "flex", gap: 11 }}>
            {row.glyph ? <CdGlyph name={row.icon as "briefcase" | "copy" | "message"} size={16} color="var(--text-3)" /> : <Icon name={row.icon} size={16} color="var(--text-3)" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--text-4)", fontSize: 11 }}>{row.label}</div>
              <div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</div>
            </div>
            <button onClick={() => copyValue(row.key)} style={{ alignItems: "center", background: copiedKey === row.key ? "var(--live-soft)" : "var(--surface-2)", border: "none", borderRadius: 8, color: copiedKey === row.key ? "var(--live)" : "var(--text-3)", cursor: "pointer", display: "flex", flexShrink: 0, height: 28, justifyContent: "center", width: 28 }} title="复制" type="button">
              {copiedKey === row.key ? <Icon name="check" size={14} /> : <CdGlyph name="copy" size={14} />}
            </button>
          </div>
        ))}
        {showSource ? (
          <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", gap: 11, paddingTop: 11 }}>
            <Icon name="wallet" size={16} color="var(--text-3)" />
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ color: "var(--text-4)", fontSize: 11 }}>来源</div><div style={{ color: "var(--ink)", fontSize: 13.5, fontWeight: 500 }}>{sourceLabels[connection.source] || connection.source || "—"}</div></div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <main className="orbit-page" data-orbit-real-page="contact-detail" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
      <div className="orbit-desktop-only" data-appscroll style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", overflowY: "auto" }}>
        <AccountTopNav active="cards" />
        <div style={{ height: 120, position: "relative" }}>
          <Cover g={cover} style={{ inset: 0, position: "absolute" }} />
          <button onClick={() => orbitNavigate("/home/cards")} style={{ alignItems: "center", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: 999, boxShadow: "var(--sh-sm)", color: "var(--ink)", cursor: "pointer", display: "flex", fontSize: 13.5, fontWeight: 550, gap: 6, height: 36, left: 24, padding: "0 14px", position: "absolute", top: 18 }} type="button"><Icon name="chevL" size={17} />名片夹</button>
        </div>
        <div style={{ margin: "0 auto", maxWidth: 880, padding: "0 32px 60px", width: "100%" }}>
          {notice ? <div style={{ background: "var(--live-soft)", borderRadius: 10, color: "var(--live)", fontSize: 13, marginTop: 12, padding: "10px 12px" }}>{notice}</div> : null}
          <div style={{ alignItems: "flex-end", display: "flex", gap: 18, marginTop: -26, position: "relative", zIndex: 1 }}>
            <Avatar letter={crmInitial(connection.displayName)} g={cover} ring="var(--bg)" size={92} />
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}><h1 className="h-display" style={{ fontSize: 28, margin: 0, whiteSpace: "nowrap" }}>{connection.displayName}</h1><div style={{ color: "var(--text-2)", fontSize: 14.5, marginTop: 3 }}>{roleLine}</div></div>
          </div>
          <div style={{ alignItems: "start", display: "grid", gap: 28, gridTemplateColumns: "1fr 300px", marginTop: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}><StatusCard pad={18} /><EventPublicProfileCard profile={profile} /><AiCard pad={18} /><NotesCard pad={18} /><Timeline pad={18} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><ContactCard pad={16} showSource /></div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" data-appscroll style={{ flexDirection: "column", minHeight: "100dvh", overflowY: "auto", position: "relative" }}>
        <div style={{ flexShrink: 0, height: 120, position: "relative" }}>
          <Cover g={cover} style={{ inset: 0, position: "absolute" }} />
          <StatusBar dark />
          <MobileBar dark onBack={() => orbitNavigate("/home/cards")} transparent />
        </div>
        <div style={{ padding: "0 18px 24px 18px" }}>
          {notice ? <div style={{ background: "var(--live-soft)", borderRadius: 10, color: "var(--live)", fontSize: 13, marginTop: 12, padding: "10px 12px" }}>{notice}</div> : null}
          <div style={{ alignItems: "flex-end", display: "flex", gap: 14, marginTop: -26, position: "relative", zIndex: 1 }}>
            <Avatar letter={crmInitial(connection.displayName)} g={cover} ring="var(--bg)" size={80} />
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}><h1 className="h-display" style={{ fontSize: 24, margin: 0 }}>{connection.displayName}</h1><div style={{ color: "var(--text-2)", fontSize: 13.5, marginTop: 3 }}>{roleLine}</div></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}><StatusCard pad={16} /><EventPublicProfileCard profile={profile} /><ContactCard pad={16} /><AiCard pad={16} /><NotesCard pad={16} /><Timeline pad={16} /></div>
        </div>
      </div>
    </main>
  );
}

function ScanContent({
  connection,
  loading,
  mobile,
  onPick,
}: {
  connection: OrbitContactView | null;
  loading: boolean;
  mobile?: boolean;
  onPick: () => void;
}) {
  return (
    <div style={{ margin: "0 auto", maxWidth: 520 }}>
      {!connection ? (
        <>
          <button disabled={loading} onClick={onPick} style={{ background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: 18, cursor: "pointer", fontFamily: "var(--ff)", padding: mobile ? "36px 20px" : "52px 30px", textAlign: "center", width: "100%" }} type="button">
            <div style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: 18, color: "var(--accent)", display: "flex", height: 64, justifyContent: "center", margin: "0 auto 16px", width: 64 }}><Icon name="ticket" size={30} /></div>
            <div className="h-section" style={{ color: "var(--ink)", fontSize: 18 }}>{loading ? "正在扫描…" : "点击上传名片"}</div>
            <div style={{ color: "var(--text-3)", fontSize: 13.5, marginTop: 6 }}>支持 JPG / PNG / PDF · AI 自动提取字段</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}><span className="btn btn-primary btn-sm"><Icon name="share" size={16} color="#fff" />上传文件</span></div>
          </button>
          <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12.5, gap: 8, marginTop: 16 }}><Icon name="sparkle" size={15} color="var(--accent)" />提取后自动去重并并入名片夹，重复人脉会智能合并</div>
        </>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 16 }}><Icon name="check" size={20} color="var(--live)" /><span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>AI 已提取以下信息</span></div>
          <div style={{ display: "flex", gap: 16 }}>
            <Cover g="g-sky" monogram={{ text: crmInitial(connection.displayName), size: 22 }} style={{ borderRadius: 10, flexShrink: 0, height: 54, width: 84 }} />
            <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, minWidth: 0 }}>
              <div><div style={{ color: "var(--text-2)", fontSize: 11, fontWeight: 550, marginBottom: 4 }}>姓名</div><div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{connection.displayName}</div></div>
              <div><div style={{ color: "var(--text-2)", fontSize: 11, fontWeight: 550, marginBottom: 4 }}>公司 / 职位</div><div style={{ color: "var(--text)", fontSize: 13.5 }}>{crmRole(connection)}</div></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={onPick} style={{ flex: 1 }} type="button">重新上传</button>
            <a className="btn btn-primary" href={`/app/contacts/${connection.id}`} style={{ flex: 1 }}><Icon name="chevR" size={16} color="#fff" />查看名片</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrbitRealCardsScan({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<OrbitContactView | null>(null);

  function pick() {
    setConnection(null);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setConnection(viewModel.connections[2] ?? viewModel.connections[0] ?? null);
    }, 900);
  }

  return (
    <main data-orbit-real-page="contacts-scan" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh", position: "relative" }}>
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}><CrmNav active="scan" /></div>
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <h1 className="h-display" style={{ fontSize: 30, margin: "0 0 4px" }}>扫名片</h1>
            <div style={{ color: "var(--text-3)", fontSize: 13.5, marginBottom: 28 }}>上传纸质名片，AI 提取并入你的名片夹</div>
            <ScanContent connection={connection} loading={loading} onPick={pick} />
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <MobileBar onBack={() => orbitNavigate("/home/cards")} title="扫名片" />
        <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "18px 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13.5, marginBottom: 20 }}>上传纸质名片，AI 提取并入你的名片夹</div>
          <ScanContent connection={connection} loading={loading} mobile onPick={pick} />
        </div>
      </div>
    </main>
  );
}
