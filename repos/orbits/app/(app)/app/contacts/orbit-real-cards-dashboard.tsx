"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";

import { AccountTopNav } from "../orbit-account-shell";
import { useOrbitLanguage, type OrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import { Basis } from "./orbit-real-contacts";

type Translate = (copy: { en: string; zh: string }) => string;
type Copy = { en: string; zh: string };

// ---------------------------------------------------------------------------
// Static demo data (UI-only; ported from docs/designs/cards/03-dashboard.html)
// ---------------------------------------------------------------------------

const crmNav: { href: string; icon: string; key: string; label: Copy; count?: number }[] = [
  { key: "list", href: "/app/contacts", icon: "wallet", label: { en: "All contacts", zh: "全部人脉" }, count: 128 },
  { key: "pipeline", href: "/app/contacts/pipeline", icon: "list", label: { en: "Pipeline", zh: "跟进管线" }, count: 24 },
  { key: "graph", href: "/app/contacts/graph", icon: "users", label: { en: "Network graph", zh: "人脉图谱" } },
  { key: "intros", href: "/app/contacts/intros", icon: "share", label: { en: "Introductions", zh: "引荐记录" }, count: 6 },
  { key: "dashboard", href: "/app/contacts/dashboard", icon: "grid", label: { en: "Dashboard", zh: "人脉表盘" } },
];

const captureNav: { href: string; icon: string; key: string; label: Copy }[] = [
  { key: "import", href: "/app/contacts/new", icon: "download", label: { en: "Import hub", zh: "导入中心" } },
  { key: "scan", href: "/app/contacts/new", icon: "scan", label: { en: "Scan card", zh: "扫名片" } },
];

const overviewStats: {
  label: Copy;
  value: string;
  delta?: { dir: "up" | "down"; text: string };
  basis: { kind: "ai" | "rule"; copy: Copy; align?: "right" | "below" };
}[] = [
  { label: { en: "Total", zh: "总人脉" }, value: "128", basis: { kind: "rule", copy: { en: "Count of confirmed contacts.", zh: "已确认联系人计数。" }, align: "below" } },
  { label: { en: "Core", zh: "核心人脉" }, value: "18", basis: { kind: "rule", copy: { en: "Strong ties active in 30d.", zh: "强关系 且 近 30 天有互动。" }, align: "below" } },
  { label: { en: "High value", zh: "高价值" }, value: "34", basis: { kind: "ai", copy: { en: "Value score ≥ high (§16.3).", zh: "价值分 ≥ 高阈值（§16.3）。" }, align: "below" } },
  { label: { en: "New / mo", zh: "本月新增" }, value: "12", delta: { dir: "up", text: "▲ +12" }, basis: { kind: "rule", copy: { en: "Confirmed this month.", zh: "本月确认入库的联系人。" }, align: "below" } },
  { label: { en: "Follow-up", zh: "待跟进" }, value: "24", basis: { kind: "ai", copy: { en: "Open promise or stalled stage.", zh: "有未兑现承诺或阶段停滞。" }, align: "below" } },
  { label: { en: "Dormant", zh: "沉睡关系" }, value: "9", delta: { dir: "down", text: "▼ −3" }, basis: { kind: "rule", copy: { en: "No interaction > 150d.", zh: "超 150 天无互动。" }, align: "right" } },
];

const ringLegend: { color: string; label: Copy; n: string }[] = [
  { color: "var(--live)", label: { en: "Core · strong", zh: "核心圈 · 强" }, n: "46" },
  { color: "var(--sky)", label: { en: "Active · medium", zh: "进行圈 · 中" }, n: "39" },
  { color: "var(--accent)", label: { en: "Outer · weak", zh: "外圈 · 弱/待确认" }, n: "34" },
  { color: "var(--text-3)", label: { en: "Dormant", zh: "沉睡带" }, n: "9" },
];

const opportunities: {
  g: string;
  ini: string;
  name: string;
  why: Copy;
  basis: { kind: "ai" | "rule"; copy: Copy; evidenceId?: string };
  action: { icon: string; label: Copy };
  email?: boolean;
}[] = [
  {
    g: "g-sky",
    ini: "E",
    name: "Emily Wong",
    why: { en: "Signaled investing interest", zh: "昨天表达投资意向" },
    basis: { kind: "ai", copy: { en: "Basis: yesterday's on-site note + your goal. Suggest: book a 30-min call.", zh: "依据：昨日现场对话记录 + 你目标含“融资”。建议：约 30 分钟深聊。" }, evidenceId: "evidence:qr-exchange-emily" },
    action: { icon: "calendar", label: { en: "Book", zh: "约会议" } },
  },
  {
    g: "g-violet",
    ini: "花",
    name: "佐藤花 · Hana",
    why: { en: "Promised deck, not sent", zh: "承诺发资料未兑现" },
    basis: { kind: "ai", copy: { en: "Basis: salon summary noted a promise, 3 days idle.", zh: "依据：沙龙交流摘要“承诺发合作资料”，3 天未动作。" }, evidenceId: "evidence:summary-hana-0612" },
    action: { icon: "mail", label: { en: "Draft", zh: "起草邮件" } },
    email: true,
  },
  {
    g: "g-amber",
    ini: "伟",
    name: "陈伟 · Wei Chen",
    why: { en: "Goal-relevant · F&B prospect", zh: "目标相关 · 餐饮潜在客户" },
    basis: { kind: "ai", copy: { en: "Basis: industry=F&B matches your goal; met at event, no greeting yet.", zh: "依据：对方行业=餐饮，匹配你目标“找餐饮客户”；活动认识未打招呼。" }, evidenceId: "evidence:event-ai-summit-2026" },
    action: { icon: "mail", label: { en: "Draft", zh: "起草邮件" } },
    email: true,
  },
  {
    g: "g-slate",
    ini: "洋",
    name: "刘洋 · Yang Liu",
    why: { en: "Dormant high-value · 5mo silent", zh: "沉睡高价值 · 5 个月未联系" },
    basis: { kind: "rule", copy: { en: "Basis: last interaction > 150d and value ≥ high → dormant high-value.", zh: "依据：最近互动 > 150 天 且 价值分 ≥ 高阈值 → 沉睡高价值。" } },
    action: { icon: "refresh", label: { en: "Revive", zh: "重新激活" } },
  },
];

const industryRows: { label: Copy; pct: number; num: string; hot?: boolean }[] = [
  { label: { en: "AI / Tech", zh: "AI / 技术" }, pct: 100, num: "32" },
  { label: { en: "Founders", zh: "创业者" }, pct: 75, num: "24" },
  { label: { en: "Venture", zh: "投资" }, pct: 47, num: "15" },
  { label: { en: "Retail", zh: "零售" }, pct: 34, num: "11" },
  { label: { en: "F&B ★", zh: "餐饮 ★" }, pct: 28, num: "9", hot: true },
  { label: { en: "Organizers", zh: "主办方" }, pct: 22, num: "7" },
];

const donutSlices: { color: string; label: Copy; c: string; p: string }[] = [
  { color: "var(--accent)", label: { en: "Prospect", zh: "潜在客户" }, c: "41", p: "32%" },
  { color: "var(--live)", label: { en: "Partner", zh: "合作伙伴" }, c: "31", p: "24%" },
  { color: "var(--sky)", label: { en: "Investor", zh: "投资人" }, c: "23", p: "18%" },
  { color: "var(--amber)", label: { en: "Connector", zh: "资源介绍人" }, c: "20", p: "16%" },
  { color: "var(--rose)", label: { en: "Advisor", zh: "技术顾问" }, c: "13", p: "10%" },
];

// ---------------------------------------------------------------------------
// Relationship star-map generator (ported 1:1 from the prototype <script>).
// Deterministic seed keeps the layout stable across renders / SSR hydration.
// ---------------------------------------------------------------------------

interface Sector { id: string; zh: string; en: string; w: number; hot?: boolean }
const SECTORS: Sector[] = [
  { id: "ai", zh: "AI/技术", en: "AI / Tech", w: 32 },
  { id: "founder", zh: "创业者", en: "Founders", w: 24 },
  { id: "venture", zh: "投资", en: "Venture", w: 15 },
  { id: "retail", zh: "零售", en: "Retail", w: 11 },
  { id: "fnb", zh: "餐饮", en: "F&B", w: 9, hot: true },
  { id: "organizer", zh: "主办方", en: "Organizers", w: 7 },
  { id: "other", zh: "其他", en: "Other", w: 30 },
];
const RINGS = [
  { rf: 0.3, color: "#34C98E", n: 46, dim: false },
  { rf: 0.52, color: "#6FA8F8", n: 39, dim: false },
  { rf: 0.74, color: "#8B7BF0", n: 34, dim: false },
  { rf: 0.95, color: "#73737B", n: 9, dim: true },
];
const KEY_NODES = [
  { ring: 0, sector: "ai", ini: "花", tone: "#B892EC" },
  { ring: 0, sector: "venture", ini: "E", tone: "#8A9CEC" },
  { ring: 3, sector: "ai", ini: "洋", tone: "#9490AE" },
];
const TOTAL_W = SECTORS.reduce((sum, s) => sum + s.w, 0);

interface OrbitModel {
  S: number;
  cx: number;
  cy: number;
  maxR: number;
  lines: { x2: number; y2: number }[];
  labels: { x: number; y: number; fontSize: number; fill: string; anchor: string; id: string }[];
  rings: { r: number; color: string; opacity: number; delay: number }[];
  sweep: { r: number; strokeWidth: number; dash: string };
  dots: { x: number; y: number; r: number; fill: string; opacity: number }[];
  keyNodes: { x: number; y: number; r: number; tone: string; ini: string; fontSize: number }[];
  hits: { d: string; id: string }[];
  centerR1: number;
  centerR2: number;
  meFont: number;
}

function sectorRange(id: string): [number, number, number] {
  let cur = -90;
  for (const s of SECTORS) {
    const span = (s.w / TOTAL_W) * 360;
    if (s.id === id) return [cur, cur + span, cur + span / 2];
    cur += span;
  }
  return [0, 0, 0];
}

function buildOrbit(S: number, rnd: () => number): OrbitModel {
  const cx = S / 2;
  const cy = S / 2;
  const maxR = S * 0.4;

  const pick = () => {
    const r = rnd() * TOTAL_W;
    let acc = 0;
    for (const s of SECTORS) {
      acc += s.w;
      if (r <= acc) return s.id;
    }
    return SECTORS[SECTORS.length - 1].id;
  };

  // Round all trig-derived coordinates to a fixed precision so server-rendered
  // strings match client numbers exactly (avoids React hydration mismatch).
  const q = (n: number) => Math.round(n * 1000) / 1000;

  const sweep = { r: q(maxR * 0.66), strokeWidth: q(maxR * 0.7), dash: `${q(maxR * 0.7)} ${q(maxR * 9)}` };

  const lines: OrbitModel["lines"] = [];
  const labels: OrbitModel["labels"] = [];
  let cur = -90;
  for (const s of SECTORS) {
    const a = (cur * Math.PI) / 180;
    lines.push({ x2: q(cx + Math.cos(a) * maxR), y2: q(cy + Math.sin(a) * maxR) });
    const mid = cur + (s.w / TOTAL_W) * 180;
    const am = (mid * Math.PI) / 180;
    const lr = maxR * 1.14;
    labels.push({
      x: q(cx + Math.cos(am) * lr),
      y: q(cy + Math.sin(am) * lr),
      fontSize: q(S * 0.027),
      fill: s.hot ? "#E0B472" : "#8A86A6",
      anchor: Math.cos(am) > 0.3 ? "end" : Math.cos(am) < -0.3 ? "start" : "middle",
      id: s.id,
    });
    cur += (s.w / TOTAL_W) * 360;
  }

  const rings: OrbitModel["rings"] = RINGS.map((ring, index) => ({
    r: q(maxR * ring.rf),
    color: ring.color,
    opacity: ring.dim ? 0.28 : 0.5,
    delay: index === 0 ? 1.2 : index === 1 ? 2.4 : 0,
  }));

  const dots: OrbitModel["dots"] = [];
  for (const ring of RINGS) {
    for (let i = 0; i < ring.n; i += 1) {
      const lab = pick();
      const rg = sectorRange(lab);
      const pad = (rg[1] - rg[0]) * 0.12;
      const ang = ((rg[0] + pad + rnd() * (rg[1] - rg[0] - 2 * pad)) * Math.PI) / 180;
      const rad = maxR * ring.rf + (rnd() - 0.5) * S * 0.045;
      const x = q(cx + Math.cos(ang) * rad);
      const y = q(cy + Math.sin(ang) * rad);
      const sz = q((ring.dim ? 1.3 : 1.6) + rnd() * 1.4);
      const opacity = q(ring.dim ? 0.42 : 0.55 + rnd() * 0.4);
      dots.push({ x, y, r: sz, fill: ring.color, opacity });
    }
  }

  const keyNodes: OrbitModel["keyNodes"] = KEY_NODES.map((k) => {
    const ring = RINGS[k.ring];
    const rg = sectorRange(k.sector);
    const ang = (rg[2] * Math.PI) / 180;
    const rad = maxR * ring.rf;
    return {
      x: q(cx + Math.cos(ang) * rad),
      y: q(cy + Math.sin(ang) * rad),
      r: q(S * 0.03),
      tone: k.tone,
      ini: k.ini,
      fontSize: q(S * 0.03),
    };
  });

  const hits: OrbitModel["hits"] = [];
  cur = -90;
  for (const s of SECTORS) {
    const a0 = (cur * Math.PI) / 180;
    const a1 = ((cur + (s.w / TOTAL_W) * 360) * Math.PI) / 180;
    const x0 = q(cx + Math.cos(a0) * maxR);
    const y0 = q(cy + Math.sin(a0) * maxR);
    const x1 = q(cx + Math.cos(a1) * maxR);
    const y1 = q(cy + Math.sin(a1) * maxR);
    const large = (s.w / TOTAL_W) * 360 > 180 ? 1 : 0;
    hits.push({ d: `M${cx} ${cy} L${x0} ${y0} A${maxR} ${maxR} 0 ${large} 1 ${x1} ${y1} Z`, id: s.id });
    cur += (s.w / TOTAL_W) * 360;
  }

  return {
    S,
    cx,
    cy,
    maxR,
    lines,
    labels,
    rings,
    sweep,
    dots,
    keyNodes,
    hits,
    centerR1: q(S * 0.06),
    centerR2: q(S * 0.038),
    meFont: q(S * 0.032),
  };
}

function OrbitMap({ model, language, t }: { model: OrbitModel; language: OrbitLanguage; t: Translate }) {
  const { S, cx, cy } = model;
  const glow = `glow${S}`;
  const ctr = `ctr${S}`;
  const sectorLabel = (id: string) => {
    const s = SECTORS.find((sector) => sector.id === id);
    return s ? (language === "en" ? s.en : s.zh) : id;
  };

  return (
    <svg className="nc-orbit-svg" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={t({ en: "Relationship star map", zh: "关系星图" })}>
      <defs>
        <radialGradient id={ctr} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#B4A7FF" stopOpacity="1" />
          <stop offset="100%" stopColor="#6359E9" stopOpacity="0.12" />
        </radialGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        className="nc-orbit-sweep"
        cx={cx}
        cy={cy}
        r={model.sweep.r}
        fill="none"
        stroke="#8B7BF0"
        strokeWidth={model.sweep.strokeWidth}
        strokeDasharray={model.sweep.dash}
        opacity="0.05"
      />

      {model.lines.map((line, index) => (
        <line key={`l${index}`} x1={cx} y1={cy} x2={line.x2} y2={line.y2} stroke="rgba(150,145,200,0.10)" strokeWidth={1} />
      ))}

      {model.labels.map((label) => (
        <text
          key={`lb${label.id}`}
          x={label.x}
          y={label.y}
          fontSize={label.fontSize}
          fontWeight={600}
          fill={label.fill}
          textAnchor={label.anchor}
          dominantBaseline="middle"
          fontFamily="var(--ff)"
        >
          {sectorLabel(label.id)}
        </text>
      ))}

      {model.rings.map((ring, index) => (
        <circle
          key={`r${index}`}
          className="nc-orbit-ring"
          cx={cx}
          cy={cy}
          r={ring.r}
          fill="none"
          stroke={ring.color}
          strokeWidth={1}
          opacity={ring.opacity}
          style={{ animationDelay: `${ring.delay}s` }}
        />
      ))}

      {model.dots.map((dot, index) => (
        <circle key={`d${index}`} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.fill} opacity={dot.opacity} />
      ))}

      {model.keyNodes.map((node, index) => (
        <g key={`k${index}`}>
          <circle cx={node.x} cy={node.y} r={node.r} fill={node.tone} opacity="0.95" filter={`url(#${glow})`} />
          <text
            x={node.x}
            y={node.y + 0.5}
            fontSize={node.fontSize}
            fontWeight={700}
            fill="#0B0A15"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--ff)"
          >
            {node.ini}
          </text>
        </g>
      ))}

      {model.hits.map((hit) => (
        <path key={`h${hit.id}`} className="nc-orbit-sector-hit" d={hit.d}>
          <title>{sectorLabel(hit.id)}</title>
        </path>
      ))}

      <circle cx={cx} cy={cy} r={model.centerR1} fill={`url(#${ctr})`} />
      <circle cx={cx} cy={cy} r={model.centerR2} fill="#7A69E6" stroke="#B4A7FF" strokeWidth={1.2} />
      <text
        x={cx}
        y={cy + 0.5}
        fontSize={model.meFont}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--ff)"
      >
        {t({ en: "You", zh: "你" })}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function SideNav({ t }: { t: Translate }) {
  const groups: { title: Copy; items: typeof crmNav }[] = [
    { title: { en: "Wallet", zh: "名片夹" }, items: crmNav },
    { title: { en: "Capture", zh: "采集" }, items: captureNav },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {groups.map((group, gi) => (
        <div key={gi} style={{ marginTop: gi === 0 ? 0 : 18 }}>
          <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t(group.title)}</div>
          {group.items.map((item) => {
            const on = item.key === "dashboard";
            return (
              <a
                href={item.href}
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
                  gap: 12,
                  padding: "10px 12px",
                  textDecoration: "none",
                }}
              >
                <Icon name={item.icon} size={19} stroke={on ? 2 : 1.7} />
                <span style={{ flex: 1 }}>{t(item.label)}</span>
                {item.count != null ? (
                  <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.7 }}>{item.count}</span>
                ) : null}
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ icon, iconColor, title, note, t }: { icon: string; iconColor: string; title: Copy; note?: Copy; t: Translate }) {
  return (
    <div className="nc-sec-title">
      <Icon name={icon} size={16} color={iconColor} />
      <h2>{t(title)}</h2>
      {note ? <span className="nc-dim13">{t(note)}</span> : null}
    </div>
  );
}

function ActionQueue({ t, toast, dense }: { t: Translate; toast: (copy: Copy) => void; dense?: boolean }) {
  return (
    <div className="nc-aq">
      {opportunities.map((op) => (
        <div className="nc-aq-item" key={op.name} style={dense ? ({ gridTemplateColumns: "34px 1fr auto" } as CSSProperties) : undefined}>
          <Avatar letter={op.ini} g={op.g} size={dense ? 34 : 38} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--ink)", fontSize: dense ? 13.5 : 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.name}</div>
            <div className="nc-why">
              <span>{t(op.why)}</span>
              <Basis kind={op.basis.kind} copy={op.basis.copy} evidenceId={op.basis.evidenceId} align="below" t={t} />
            </div>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => toast(op.action.label)} type="button">
            <Icon name={op.action.icon} size={16} />
            {!dense ? t(op.action.label) : null}
          </button>
        </div>
      ))}
    </div>
  );
}

function StatTiles({ items }: { items: typeof overviewStats }) {
  const { t } = useOrbitLanguage();
  return (
    <div className="nc-tiles">
      {items.map((stat) => (
        <div className="card nc-stat" key={stat.label.en}>
          <div className="nc-stat-k">
            <span>{t(stat.label)}</span>
            <Basis kind={stat.basis.kind} copy={stat.basis.copy} align={stat.basis.align} t={t} />
          </div>
          <div className="nc-stat-v">{stat.value}</div>
          {stat.delta ? <div className={`nc-stat-d ${stat.delta.dir}`}>{stat.delta.text}</div> : null}
        </div>
      ))}
    </div>
  );
}

function IndustryBars({ rows, t }: { rows: typeof industryRows; t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((row) => (
        <div className="nc-hbar" key={row.label.en}>
          <span className="nc-hbar-lab" style={row.hot ? { color: "var(--amber)" } : undefined}>{t(row.label)}</span>
          <span className="nc-hbar-track">
            <span style={{ width: `${row.pct}%`, ...(row.hot ? { background: "linear-gradient(90deg,var(--amber),#c98f3e)" } : null) }} />
          </span>
          <span className="nc-hbar-num" style={row.hot ? { color: "var(--amber)" } : undefined}>{row.num}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function OrbitRealCardsDashboard() {
  const { t, language } = useOrbitLanguage();
  const [encoding, setEncoding] = useState<"industry" | "value">("industry");
  const [toast, setToast] = useState<string | null>(null);

  const { desktop, mobile } = useMemo(() => {
    let seed = 20260707;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    return { desktop: buildOrbit(460, rnd), mobile: buildOrbit(360, rnd) };
  }, []);

  const showToast = (copy: Copy) => {
    setToast(t(copy));
    window.setTimeout(() => setToast(null), 1800);
  };

  const goalChip = (compact?: boolean): ReactNode => (
    <>
      <a className="chip chip-accent" href="/app/profile" style={{ height: compact ? 34 : 36, textDecoration: "none" }}>
        <Icon name="target" size={16} />
        {compact ? t({ en: "Goal: F&B clients", zh: "目标：找餐饮客户" }) : t({ en: "Goal: find F&B clients", zh: "当前目标：找餐饮行业客户" })}
      </a>
      <Basis
        kind="you"
        copy={{
          en: "From your profile goal, set on 6/20 in onboarding. Edit it in Profile. Every goal-driven insight links back here.",
          zh: "来自你的画像目标，6/20 在引导问题中设定，可在画像页修改。所有基于目标的分析（缺口/机会/匹配）都回指这里。",
        }}
        align="below"
        t={t}
      />
    </>
  );

  const encodingBasis = (
    <Basis
      kind="rule"
      copy={{
        en: "Radius = closeness, angle sector = industry, dot = a contact, size/glow = value score. At thousands, dots become density; only key people are highlighted.",
        zh: "半径=关系近度(强度+阶段)，扇区角度=行业，光点=一位联系人，大小/亮度=价值分。上千人脉时光点转为密度显示，仅高亮关键人。",
      }}
      t={t}
    />
  );

  const orbitToggle = (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        className={`chip nc-chip-sm${encoding === "industry" ? " is-active" : ""}`}
        onClick={() => setEncoding("industry")}
        type="button"
      >
        {t({ en: "Industry", zh: "按行业" })}
      </button>
      <button
        className={`chip nc-chip-sm${encoding === "value" ? " is-active" : ""}`}
        onClick={() => setEncoding("value")}
        type="button"
      >
        {t({ en: "Value", zh: "按价值" })}
      </button>
    </div>
  );

  const ringLegendBlock = (
    <div className="nc-ring-legend">
      {ringLegend.map((r) => (
        <div className="nc-rl" key={r.label.en} onClick={() => showToast(r.label)}>
          <span className="nc-rd" style={{ background: r.color }} />
          <span className="nc-rt">{t(r.label)}</span>
          <span className="nc-rn">{r.n}</span>
          <Icon name="chevR" size={14} color="var(--text-4)" />
        </div>
      ))}
    </div>
  );

  const donutBlock = (
    <div className="nc-donut-wrap">
      <div className="nc-donut">
        <div className="nc-donut-mid">
          <span className="nc-donut-v mono">128</span>
          <span className="nc-donut-l">{t({ en: "typed", zh: "已分类" })}</span>
        </div>
      </div>
      <div className="nc-leg">
        {donutSlices.map((slice) => (
          <div className="nc-li" key={slice.label.en} onClick={() => showToast(slice.label)}>
            <span className="nc-sw" style={{ background: slice.color }} />
            <span>{t(slice.label)}</span>
            <span className="nc-c">{slice.c}</span>
            <span className="nc-p">{slice.p}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const gapNote = (compact?: boolean): ReactNode => (
    <div className="nc-note nc-note-amber" style={compact ? undefined : { flex: 1 }}>
      <Icon name="target" size={16} color="var(--amber)" />
      <div>
        <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 3 }}>
          {compact
            ? t({ en: "F&B is only 7% — below your goal. Add restaurant owners / local merchants.", zh: "餐饮人脉仅 7%，低于目标所需。建议补充餐饮经营者 / 本地商户。" })
            : t({ en: "For your goal “find F&B clients”, F&B contacts are only 7% (9/128) — a clear shortfall.", zh: "按你的目标「找餐饮客户」，餐饮人脉仅占 7%（9/128）——明显偏低。" })}
          {!compact ? (
            <span style={{ marginLeft: 4, display: "inline-flex", verticalAlign: "middle" }}>
              <Basis
                kind="ai"
                copy={{ en: "Basis: goal (profile) × industry distribution gap. Changes with your goal.", zh: "依据：目标(画像) × 行业分布 差值。目标变了这里就变。" }}
                t={t}
              />
            </span>
          ) : null}
        </div>
        {!compact ? (
          <div>{t({ en: "Suggested: restaurant owners · local merchants · F&B event organizers.", zh: "建议补充：餐饮经营者 · 本地商户 · 餐饮活动主办方。" })}</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-soft btn-sm" onClick={() => showToast({ en: "Find F&B events", zh: "找餐饮活动" })} type="button">
              {t({ en: "Find F&B events", zh: "找餐饮活动" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      <style>{dashboardCss}</style>

      {/* ===================== DESKTOP ===================== */}
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: "212px 1fr", height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "22px 14px" }}>
            <SideNav t={t} />
          </div>
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            {/* header */}
            <div style={{ alignItems: "flex-end", display: "flex", gap: 16, justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Network dashboard", zh: "人脉表盘" })}</h1>
                <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 6 }}>{t({ en: "Your relationship assets · updated today", zh: "你的关系资产 · 更新于今天" })}</div>
              </div>
              <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                {goalChip()}
                <a className="btn btn-ghost btn-sm" href="/app/contacts" style={{ textDecoration: "none" }}>
                  <Icon name="download" size={16} />
                  {t({ en: "Export", zh: "导出" })}
                </a>
              </div>
            </div>

            {/* HERO */}
            <div className="nc-hero">
              {/* star map */}
              <div className="card nc-orbit-card">
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <Icon name="share" size={16} color="var(--accent)" />
                    <h2 style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700, margin: 0 }}>{t({ en: "Relationship map", zh: "关系星图" })}</h2>
                  </div>
                  {orbitToggle}
                </div>
                <div className="nc-cap" style={{ marginBottom: 8 }}>
                  {encodingBasis}
                  <span>{t({ en: "128 contacts · every dot is a real person", zh: "共 128 位 · 每个光点都是真实联系人" })}</span>
                </div>
                <div className="nc-orbit-stage">
                  <OrbitMap model={desktop} language={language} t={t} />
                </div>
                {ringLegendBlock}
                <div className="nc-drill-hint" style={{ justifyContent: "center", marginTop: 8 }}>
                  <Icon name="target" size={13} />
                  {t({ en: "Click a sector or ring → view that group", zh: "点击扇区或轨道 → 查看该组名单" })}
                </div>
              </div>

              {/* action queue */}
              <div className="card" style={{ padding: 18 }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <Icon name="sparkle" size={16} color="var(--accent)" />
                    <h2 style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700, margin: 0 }}>{t({ en: "This week", zh: "本周行动队列" })}</h2>
                  </div>
                  <span className="chip nc-chip-sm">{t({ en: "4", zh: "4 项" })}</span>
                </div>
                <div className="nc-dim13" style={{ marginBottom: 6 }}>{t({ en: "Each with a reason — act in one tap", zh: "每条都有依据，一键处理" })}</div>
                <ActionQueue t={t} toast={showToast} />
              </div>
            </div>

            {/* asset overview */}
            <SectionTitle icon="grid" iconColor="var(--text-3)" title={{ en: "Asset overview", zh: "关系资产总览" }} note={{ en: "· tap any figure for method & list", zh: "· 每个数字可点开算法与名单" }} t={t} />
            <StatTiles items={overviewStats} />

            {/* structure distributions */}
            <SectionTitle icon="grid" iconColor="var(--text-3)" title={{ en: "Structure", zh: "结构分布" }} t={t} />
            <div style={{ alignItems: "stretch", display: "flex", gap: 16 }}>
              <div className="card" style={{ flex: 1, minWidth: 0, padding: 18 }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                  <h3 className="h-section" style={{ fontSize: 15 }}>{t({ en: "Industry", zh: "行业分布" })}</h3>
                  <Basis kind="rule" copy={{ en: "Source: each contact's industry field (from card OCR / profile / import).", zh: "依据：每位联系人的“行业”字段（来自名片 OCR / 画像 / 导入）聚合计数。" }} align="right" t={t} />
                </div>
                <div className="nc-cap" style={{ marginBottom: 12 }}>{t({ en: "Click a bar to view contacts", zh: "点条形查看该行业名单" })}</div>
                <IndustryBars rows={industryRows} t={t} />
              </div>
              <div className="card" style={{ flex: 1, minWidth: 0, padding: 18 }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                  <h3 className="h-section" style={{ fontSize: 15 }}>{t({ en: "Value types", zh: "价值类型分布" })}</h3>
                  <Basis kind="ai" copy={{ en: "Source: value scoring (§16.3) → each contact's primary value type. Editable per contact.", zh: "依据：价值评分（§16.3：你的 seeking × 对方 offering + 关系强度）得出每人主价值类型。可在联系人页修改。" }} align="right" t={t} />
                </div>
                <div className="nc-cap" style={{ marginBottom: 14 }}>{t({ en: "Click a slice to view", zh: "点图例查看该类名单" })}</div>
                {donutBlock}
              </div>
            </div>

            {/* network gaps */}
            <SectionTitle icon="target" iconColor="var(--amber)" title={{ en: "Network gaps", zh: "人脉缺口" }} t={t} />
            <div className="card" style={{ marginBottom: 8, padding: 18 }}>
              <div style={{ alignItems: "flex-start", display: "flex", gap: 12 }}>
                {gapNote()}
                <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: 8, width: 190 }}>
                  <button className="btn btn-soft btn-sm btn-block" onClick={() => showToast({ en: "Find F&B events", zh: "找餐饮活动" })} type="button">
                    <Icon name="calendar" size={16} />
                    {t({ en: "Find F&B events", zh: "找餐饮活动" })}
                  </button>
                  <button className="btn btn-ghost btn-sm btn-block" onClick={() => showToast({ en: "Ask for intro", zh: "请人引荐" })} type="button">
                    <Icon name="share" size={16} />
                    {t({ en: "Ask for intro", zh: "请人引荐" })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== MOBILE ===================== */}
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 40px" }}>
          <h1 className="h-display" style={{ margin: "2px 0 12px" }}>{t({ en: "Network dashboard", zh: "人脉表盘" })}</h1>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>{goalChip(true)}</div>

          {/* orbit map */}
          <div className="card nc-orbit-card nc-mobile-orbit" style={{ marginTop: 14 }}>
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <Icon name="share" size={16} color="var(--accent)" />
                <h2 style={{ color: "var(--ink)", fontSize: 14, fontWeight: 700, margin: 0 }}>{t({ en: "Relationship map", zh: "关系星图" })}</h2>
              </div>
              {encodingBasis}
            </div>
            <div className="nc-orbit-stage">
              <OrbitMap model={mobile} language={language} t={t} />
            </div>
            {ringLegendBlock}
          </div>

          {/* action queue */}
          <div className="card" style={{ marginTop: 14, padding: 18 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 8 }}>
              <Icon name="sparkle" size={16} color="var(--accent)" />
              <h2 style={{ color: "var(--ink)", fontSize: 14, fontWeight: 700, margin: 0 }}>{t({ en: "This week", zh: "本周行动队列" })}</h2>
            </div>
            <ActionQueue dense t={t} toast={showToast} />
          </div>

          {/* tiles */}
          <div style={{ marginTop: 14 }}>
            <StatTiles items={overviewStats.filter((s) => ["Total", "High value", "Follow-up", "Dormant"].includes(s.label.en))} />
          </div>

          {/* industry */}
          <div className="card" style={{ marginTop: 14, padding: 18 }}>
            <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
              <h3 className="h-section" style={{ fontSize: 14 }}>{t({ en: "Industry", zh: "行业分布" })}</h3>
              <Basis kind="rule" copy={{ en: "Aggregated industry field.", zh: "联系人行业字段聚合。" }} align="right" t={t} />
            </div>
            <div style={{ marginTop: 12 }}>
              <IndustryBars rows={[industryRows[0], industryRows[1], industryRows[4]]} t={t} />
            </div>
          </div>

          {/* gap */}
          <div style={{ marginTop: 14 }}>{gapNote(true)}</div>
        </div>
      </div>

      {toast ? (
        <div className="nc-toast-host">
          <div className="nc-toast show">
            <Icon name="check" size={15} color="var(--accent)" />
            {toast}
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Local styles (screen-specific; scoped to this page via [data-orbit-real-page])
// ---------------------------------------------------------------------------

const dashboardCss = `
[data-orbit-real-page] .nc-sec-title { display:flex; align-items:center; gap:10px; margin:26px 0 14px; }
[data-orbit-real-page] .nc-sec-title h2 { font-size:16px; color:var(--ink); margin:0; font-weight:700; }
[data-orbit-real-page] .nc-dim13 { font-size:13px; color:var(--text-3); }
[data-orbit-real-page] .nc-cap { font-size:11.5px; color:var(--text-3); display:flex; align-items:center; gap:6px; margin-top:2px; }
[data-orbit-real-page] .nc-drill-hint { display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--text-3); }

[data-orbit-real-page] .nc-hero { display:grid; grid-template-columns:1.12fr .88fr; gap:18px; }
[data-orbit-real-page] .nc-chip-sm { height:24px; font-size:12px; padding:0 9px; }

[data-orbit-real-page] .nc-orbit-card { padding:18px 18px 16px; display:flex; flex-direction:column; }
[data-orbit-real-page] .nc-orbit-stage { position:relative; width:100%; }
[data-orbit-real-page] .nc-orbit-svg { display:block; width:100%; height:auto; }
[data-orbit-real-page] .nc-mobile-orbit .nc-orbit-svg { max-width:330px; margin:0 auto; }
[data-orbit-real-page] .nc-orbit-ring { animation:nc-orbBreath 7s ease-in-out infinite; transform-origin:center; transform-box:fill-box; }
@keyframes nc-orbBreath { 0%,100%{ opacity:.45 } 50%{ opacity:.85 } }
[data-orbit-real-page] .nc-orbit-sweep { animation:nc-orbSpin 48s linear infinite; transform-origin:center; transform-box:fill-box; }
@keyframes nc-orbSpin { to { transform:rotate(360deg) } }
[data-orbit-real-page] .nc-orbit-sector-hit { fill:transparent; cursor:pointer; transition:fill .16s; }
[data-orbit-real-page] .nc-orbit-sector-hit:hover { fill:rgba(139,123,240,.06); }
@media (prefers-reduced-motion:reduce){ [data-orbit-real-page] .nc-orbit-ring, [data-orbit-real-page] .nc-orbit-sweep { animation:none } }

[data-orbit-real-page] .nc-ring-legend { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; margin-top:14px; }
[data-orbit-real-page] .nc-rl { display:flex; align-items:center; gap:9px; cursor:pointer; padding:6px 8px; border-radius:var(--r-sm); }
[data-orbit-real-page] .nc-rl:hover { background:var(--surface-2); }
[data-orbit-real-page] .nc-rd { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
[data-orbit-real-page] .nc-rn { margin-left:auto; font-family:var(--ff-mono); font-size:13px; color:var(--text); }
[data-orbit-real-page] .nc-rt { font-size:12.5px; color:var(--text-2); }

[data-orbit-real-page] .nc-aq { display:flex; flex-direction:column; }
[data-orbit-real-page] .nc-aq-item { display:grid; grid-template-columns:38px 1fr auto; gap:11px; align-items:center; padding:13px 4px; border-bottom:1px solid var(--hairline); }
[data-orbit-real-page] .nc-aq-item:last-child { border-bottom:0; }
[data-orbit-real-page] .nc-why { font-size:12px; color:var(--text-3); margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }

[data-orbit-real-page] .nc-tiles { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
[data-orbit-real-page] .nc-stat { position:relative; padding:16px 18px; }
[data-orbit-real-page] .nc-stat-k { font-size:12px; color:var(--text-2); font-weight:500; display:flex; align-items:center; justify-content:space-between; gap:6px; }
[data-orbit-real-page] .nc-stat-v { font-family:var(--ff-mono); font-size:30px; font-weight:600; color:var(--ink); line-height:1.1; margin-top:8px; letter-spacing:-.01em; }
[data-orbit-real-page] .nc-stat-d { font-size:12px; margin-top:4px; }
[data-orbit-real-page] .nc-stat-d.up { color:var(--live); }
[data-orbit-real-page] .nc-stat-d.down { color:var(--rose); }

[data-orbit-real-page] .nc-hbar { display:grid; grid-template-columns:120px 1fr 44px; align-items:center; gap:12px; }
[data-orbit-real-page] .nc-hbar-lab { font-size:13px; color:var(--text-2); }
[data-orbit-real-page] .nc-hbar-track { height:10px; border-radius:var(--r-pill); background:var(--surface-3); overflow:hidden; }
[data-orbit-real-page] .nc-hbar-track > span { display:block; height:100%; border-radius:var(--r-pill); background:var(--accent-grad-bar); }
[data-orbit-real-page] .nc-hbar-num { font-family:var(--ff-mono); font-size:13px; color:var(--text); text-align:right; }

[data-orbit-real-page] .nc-donut-wrap { display:flex; align-items:center; gap:22px; }
[data-orbit-real-page] .nc-donut { --sz:150px; width:var(--sz); height:var(--sz); border-radius:50%; position:relative; flex-shrink:0; background:conic-gradient(from -90deg, var(--accent) 0 115.3deg, var(--live) 115.3deg 202.5deg, var(--sky) 202.5deg 267.2deg, var(--amber) 267.2deg 323.4deg, var(--rose) 323.4deg 360deg); }
[data-orbit-real-page] .nc-donut::after { content:""; position:absolute; inset:26px; border-radius:50%; background:var(--surface); }
[data-orbit-real-page] .nc-donut-mid { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1; }
[data-orbit-real-page] .nc-donut-v { font-family:var(--ff-mono); font-size:26px; font-weight:600; color:var(--ink); }
[data-orbit-real-page] .nc-donut-l { font-size:11px; color:var(--text-3); }
[data-orbit-real-page] .nc-leg { display:flex; flex-direction:column; gap:9px; flex:1; }
[data-orbit-real-page] .nc-li { display:grid; grid-template-columns:auto 1fr auto auto; gap:10px; align-items:center; font-size:13px; cursor:pointer; color:var(--text-2); }
[data-orbit-real-page] .nc-li:hover { color:var(--ink); }
[data-orbit-real-page] .nc-sw { width:10px; height:10px; border-radius:3px; }
[data-orbit-real-page] .nc-c { font-family:var(--ff-mono); color:var(--text); }
[data-orbit-real-page] .nc-p { font-family:var(--ff-mono); color:var(--text-3); font-size:12px; width:38px; text-align:right; }

[data-orbit-real-page] .nc-note { display:flex; gap:8px; align-items:flex-start; padding:10px 12px; border-radius:var(--r-md); background:var(--accent-softer); color:var(--text-2); font-size:12.5px; line-height:1.5; }
[data-orbit-real-page] .nc-note-amber { background:var(--amber-soft); }

[data-orbit-real-page] .nc-toast-host { position:fixed; left:0; right:0; bottom:26px; display:flex; justify-content:center; z-index:200; pointer-events:none; }
[data-orbit-real-page] .nc-toast { display:inline-flex; align-items:center; gap:9px; max-width:82%; padding:11px 16px; border-radius:var(--r-pill); background:var(--surface-3); border:1px solid var(--border-2); box-shadow:var(--sh-pop); color:var(--text); font-size:13px; font-weight:500; opacity:0; transform:translateY(8px); transition:opacity .18s, transform .18s; }
[data-orbit-real-page] .nc-toast.show { opacity:1; transform:translateY(0); }

@media (max-width:640px){
  [data-orbit-real-page] .nc-hero { grid-template-columns:1fr; }
  [data-orbit-real-page] .nc-tiles { grid-template-columns:repeat(2,1fr); }
}
`;
