"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  OrbitContactPipelineStatus,
  OrbitContactsViewModel,
  OrbitContactView,
  OrbitIntroStatus,
  OrbitIntroView,
} from "../orbit-contacts-route-view-model";
import { AccountTopNav, MobileBar, ModalShell, orbitNavigate } from "../orbit-account-shell";
import { CrmSidebar } from "./orbit-crm-sidebar";
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { OrbitContactAvatar } from "./orbit-contact-avatar";
import { useOrbitLanguage } from "../orbit-language-context";
import { productHref } from "../orbit-public-shell";
import { Avatar, Cover, Icon, IconButton } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { ORBIT_Z } from "../orbit-z";

type Translate = (copy: { en: string; zh: string }) => string;

type CrmMode = "list" | "pipeline" | "graph" | "intros" | "dashboard" | "scan";

function crmNavItems(t: Translate): { href: string; icon: string; key: CrmMode; label: string }[] {
  return [
    { key: "list", href: "/home/cards", icon: "wallet", label: t({ en: "All contacts", zh: "全部人脉" }) },
    { key: "pipeline", href: "/home/cards/pipeline", icon: "list", label: t({ en: "Pipeline", zh: "跟进管线" }) },
    { key: "graph", href: "/home/cards/graph", icon: "users", label: t({ en: "Network graph", zh: "人脉图谱" }) },
    { key: "intros", href: "/home/cards/intros", icon: "share", label: t({ en: "Introductions", zh: "引荐记录" }) },
    { key: "dashboard", href: "/home/cards/dashboard", icon: "grid", label: t({ en: "Dashboard", zh: "人脉表盘" }) },
  ];
}

function mobileCrmTabItems(t: Translate): { href: string; key: CrmMode | "allActions"; label: string }[] {
  // 与桌面 CrmSidebar 保持目的地对齐：表盘与 All actions 此前只有桌面入口，
  // 移动端到不了（采集入口不在此列——标题行的扫描按钮已直达 /app/contacts/new）。
  return [
    { key: "list", href: "/home/cards", label: t({ en: "All", zh: "全部" }) },
    { key: "pipeline", href: "/home/cards/pipeline", label: t({ en: "Pipeline", zh: "管线" }) },
    { key: "graph", href: "/home/cards/graph", label: t({ en: "Graph", zh: "图谱" }) },
    { key: "intros", href: "/home/cards/intros", label: t({ en: "Intros", zh: "引荐" }) },
    { key: "dashboard", href: "/home/cards/dashboard", label: t({ en: "Dashboard", zh: "表盘" }) },
    { key: "allActions", href: "/app/contacts/all-actions", label: t({ en: "All actions", zh: "操作账本" }) },
  ];
}

/**
 * SVG <text> cannot ellipsize, so graph labels are trimmed in JS. An explicit
 * ellipsis marks the cut: without it "Kenji Watanabe" rendered as "Kenji Wa",
 * which reads as somebody's actual name rather than a shortened one
 * (UI audit L5). Pair every call with a <title> carrying the full value.
 */
function truncateGraphLabel(value: string | undefined | null, max = 10): string {
  const text = String(value ?? "").trim();
  if (!text) return "?";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

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

function crmRole(contact: Pick<OrbitContactView, "company" | "title">, t: Translate) {
  return [contact.company, contact.title].filter(Boolean).join(" · ") || t({ en: "No company or title yet", zh: "暂无公司职位" });
}

function crmHref(prototypeHref: string) {
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  if (prototypeHref === "/home/cards/dashboard") return "/app/contacts/dashboard";
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
  t,
}: {
  active: CrmMode;
  counts?: { all: number };
  t: Translate;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t({ en: "Contacts", zh: "名片夹" })}</div>
      {crmNavItems(t).map((item) => {
        const on = active === item.key;
        const count = item.key === "list" && counts ? counts.all : null;

        return (
          <a
            href={crmHref(item.href)}
            key={item.key}
            style={{
              alignItems: "center",
              background: on ? "var(--accent-soft)" : "transparent",
              borderRadius: "var(--r-sm)",
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
  placeholder,
  query = "",
  t,
}: {
  active?: CrmMode;
  action?: ReactNode;
  onQueryChange?: (value: string) => void;
  placeholder?: string;
  query?: string;
  t: Translate;
}) {
  const resolvedPlaceholder = placeholder ?? t({ en: "Search name / company / industry", zh: "搜索姓名 / 公司 / 行业" });
  return (
    <div style={{ flexShrink: 0, padding: "16px 18px 0" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 className="h-display" style={{ margin: "6px 0" }}>{t({ en: "All contacts", zh: "全部人脉" })}</h1>
        {action || (
          <a
            aria-label={t({ en: "Scan card", zh: "扫名片" })}
            className="hit-44"
            href="/app/contacts/new"
            style={{
              alignItems: "center",
              background: "var(--accent-soft)",
              borderRadius: "var(--r-pill)",
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
          aria-label={resolvedPlaceholder}
          className="field"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={resolvedPlaceholder}
          style={{ background: "var(--surface-2)", height: 44, paddingLeft: 40 }}
          type="search"
          value={query}
        />
      </div>
      <div className="scroll noscroll orbit-chip-scroller" style={{ display: "flex", gap: 8, margin: "0 -18px", overflowX: "auto", padding: "0 18px 12px" }}>
        {mobileCrmTabItems(t).map((item) => (
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
    <span style={{ alignItems: "center", background: withLabel ? meta.soft : "transparent", borderRadius: "var(--r-pill)", display: "inline-flex", gap: 4, height: 24, padding: withLabel ? "0 9px 0 8px" : 0 }}>
      <span style={{ background: meta.color, borderRadius: "var(--r-pill)", height: 7, width: 7 }} />
      {withLabel ? <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>{meta.label}</span> : null}
    </span>
  );
}

const sourceMeta: Record<OrbitContactView["source"], { icon: string; cls: string; label: { en: string; zh: string } }> = {
  scan: { icon: "scan", cls: "nc-src-scan", label: { en: "Scanned", zh: "名片扫描" } },
  exchange: { icon: "scan", cls: "nc-src-scan", label: { en: "Exchanged", zh: "名片交换" } },
  qr: { icon: "qr", cls: "nc-src-qr", label: { en: "QR scan", zh: "现场扫码" } },
  event: { icon: "calendar", cls: "nc-src-event", label: { en: "Event", zh: "活动导入" } },
  contact: { icon: "user", cls: "nc-src-contact", label: { en: "Imported", zh: "通讯录" } },
  referral: { icon: "share", cls: "nc-src-referral", label: { en: "Referral", zh: "朋友推荐" } },
  manual: { icon: "user", cls: "nc-src-contact", label: { en: "Manual", zh: "手动" } },
};

const strengthMeta: Record<OrbitContactView["strength"], { cls: string; label: { en: string; zh: string } }> = {
  strong: { cls: "nc-st-strong", label: { en: "Strong", zh: "强关系" } },
  medium: { cls: "nc-st-medium", label: { en: "Medium", zh: "中关系" } },
  weak: { cls: "nc-st-weak", label: { en: "Weak", zh: "弱关系" } },
  dormant: { cls: "nc-st-dormant", label: { en: "Dormant", zh: "沉睡" } },
};

export function SourceBadge({ source, t }: { source: OrbitContactView["source"]; t: Translate }) {
  const meta = sourceMeta[source];
  return (
    <span className={`nc-src ${meta.cls}`}><Icon name={meta.icon} size={12} />{t(meta.label)}</span>
  );
}

function StrengthTag({ strength, t }: { strength: OrbitContactView["strength"]; t: Translate }) {
  const meta = strengthMeta[strength];
  return (
    <span className={`nc-strength ${meta.cls}`}><span className="nc-dot" />{t(meta.label)}</span>
  );
}

export function Basis({
  kind,
  copy,
  evidenceId,
  align,
  t,
}: {
  kind: "ai" | "rule" | "evidence" | "you";
  copy: { en: string; zh: string };
  evidenceId?: string;
  align?: "right" | "below";
  t: Translate;
}) {
  const icon = kind === "ai" ? "sparkle" : kind === "evidence" ? "checkCircle" : kind === "rule" ? "target" : "user";
  const mm = { ai: { en: "AI", zh: "AI 推断" }, rule: { en: "Rule", zh: "统计规则" }, evidence: { en: "Evidence", zh: "证据直采" }, you: { en: "You set", zh: "你设定" } }[kind];
  const mmBg = { ai: "var(--live-soft)", rule: "var(--accent-soft)", evidence: "var(--sky-soft)", you: "var(--surface-2)" }[kind];
  return (
    <span
      className={`nc-basis nc-basis-${kind} hit-44`}
      tabIndex={0}
      role="button"
      aria-expanded="false"
      aria-label={t({ en: "Show basis", zh: "查看依据" })}
      onClick={(event) => { event.preventDefault(); }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.currentTarget.click();
      }}
    >
      <Icon name={icon} size={13} />
      <span className={`nc-basis-pop${align ? ` ${align}` : ""}`}>
        <span className="mm" style={{ background: mmBg }}>{t(mm)}</span>
        <br />
        {t(copy)}
        {evidenceId ? <span className="ev"><Icon name="checkCircle" size={12} />{evidenceId}</span> : null}
      </span>
    </span>
  );
}

function PersonCard({
  item,
  t,
  viewModel,
}: {
  item: OrbitContactView;
  t: Translate;
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <a className="card card-hover nc-pcard" href={`/app/contacts/${item.id}`}>
      <OrbitContactAvatar contact={item} size={56} />
      <div style={{ minWidth: 0 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          {/* Mobile audit P2: single-line ellipsis truncated names hard
              ("Kenji Wat…") at 390px because the fixed-width chip cluster on
              the right squeezes this column. Allow up to 2 lines instead of
              cutting the name — smaller diff than reshaping the chip
              cluster's width, and it shows full names in the common case. */}
          <h2 className="h-section" style={{ color: "var(--ink)", display: "-webkit-box", margin: 0, overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>{item.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</h2>
          <SourceBadge source={item.source} t={t} />
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crmRole(item, t)}{item.industry ? ` · ${item.industry}` : ""}</div>
        {item.valueTags.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {item.valueTags.map((tag) => <span className="nc-tag nc-tag-value" key={tag}>{tag}</span>)}
          </div>
        ) : null}
      </div>
      <div className="nc-right" style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", flexShrink: 0, gap: 8 }}>
        <StageDot status={item.pipelineStatus} viewModel={viewModel} withLabel />
        <StrengthTag strength={item.strength} t={t} />
      </div>
      {item.nextAction ? (
        <div className="nc-foot">
          <span className="nc-act"><Icon name={item.dormant ? "bell" : "arrow"} size={16} />{t({ en: "Suggested", zh: "建议" })}：{item.nextAction.text}</span>
          <Basis kind={item.dormant ? "rule" : "ai"} copy={{ en: item.nextAction.reason, zh: item.nextAction.reason }} evidenceId={item.nextAction.evidenceId} t={t} />
          <span style={{ color: "var(--text-3)", fontSize: 13, marginLeft: "auto" }}>· {item.lastInteraction}</span>
        </div>
      ) : null}
    </a>
  );
}

export function filterConnections(
  connections: OrbitContactView[],
  query: string,
  stage: "all" | OrbitContactPipelineStatus = "all",
  valueTag: string | null = null,
) {
  const queryTokens = contactSearchTokens(query);
  const normalizedValueTag = valueTag?.trim().toLowerCase() ?? "";

  return connections.filter((item) => {
    const matchesStage = stage === "all" || item.pipelineStatus === stage;
    const matchesValueTag =
      !normalizedValueTag ||
      item.valueTags.some(
        (tag) => tag.trim().toLowerCase() === normalizedValueTag,
      );
    const haystack = [
      item.displayName,
      item.company,
      item.title,
      item.industry,
      item.offering,
      item.seeking,
      item.nextAction?.text,
      item.nextAction?.reason,
      item.pipelineStatus,
      item.pipelineStatus === "to_contact"
        ? "待联系 待跟进"
        : item.pipelineStatus === "in_progress"
          ? "在推进"
          : "已合作",
      item.strength,
      item.strength === "strong"
        ? "强关系 高价值"
        : item.strength === "medium"
          ? "中关系"
          : "弱关系",
      ...item.valueTags,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      matchesStage &&
      matchesValueTag &&
      matchesContactSearchText(haystack, queryTokens)
    );
  });
}

function contactSearchTokens(query: string): readonly string[] {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();

  if (!normalized) {
    return [];
  }

  return [
    ...new Intl.Segmenter("zh", { granularity: "word" }).segment(normalized),
  ]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.trim())
    .filter(Boolean);
}

function alternativesForContactSearchToken(token: string): readonly string[] {
  switch (token) {
    case "投资人":
      return ["投资人", "投资"];
    case "高价值":
      return ["高价值", "强关系", "strong"];
    default:
      return [token];
  }
}

function matchesContactSearchText(
  haystack: string,
  queryTokens: readonly string[],
): boolean {
  if (queryTokens.length === 0) {
    return true;
  }

  const normalizedHaystack = haystack
    .normalize("NFKC")
    .toLocaleLowerCase();

  return queryTokens.every((token) =>
    alternativesForContactSearchToken(token).some((alternative) =>
      normalizedHaystack.includes(alternative),
    ),
  );
}

export function OrbitRealCardsList({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<"all" | OrbitContactPipelineStatus>("all");
  const [valueTag, setValueTag] = useState<string | null>(null);
  const items = viewModel.connections;
  const counts: Record<string, number> & { all: number } = { all: items.length };
  for (const status of viewModel.pipelineStatuses) {
    counts[status.value] = items.filter((item) => item.pipelineStatus === status.value).length;
  }
  const eventCount = new Set(items.map((item) => item.lastEventId).filter(Boolean)).size;
  const valueFilters = Array.from(
    new Set(items.flatMap((item) => item.valueTags.map((tag) => tag.trim()))),
  )
    .filter(Boolean)
    .slice(0, 3);
  const filtered = filterConnections(items, query, stage, valueTag);
  const filters: ["all" | OrbitContactPipelineStatus, string][] = [["all", t({ en: "All", zh: "全部" })], ...viewModel.pipelineStatuses.map((status) => [status.value, status.label] as ["all" | OrbitContactPipelineStatus, string])];
  const searchSuggestions = [
    {
      label: t({ en: "Who can intro an investor?", zh: "谁能介绍投资人？" }),
      query: t({ en: "Investor", zh: "投资人" }),
    },
    {
      label: t({ en: "Founders met in 3 months", zh: "近三个月认识的创始人" }),
      query: t({ en: "Founder", zh: "创始人" }),
    },
    {
      label: t({ en: "High-value to follow up", zh: "待跟进的高价值关系" }),
      query: t({ en: "High value", zh: "高价值" }),
      stage: "to_contact" as const,
    },
  ];
  const subtitle = `${items.length} ${t({ en: "contacts", zh: "位联系人" })}${eventCount ? ` · ${t({ en: `from ${eventCount} events`, zh: `来自 ${eventCount} 场活动` })}` : ""}`;
  const clearFilters = () => {
    setQuery("");
    setStage("all");
    setValueTag(null);
  };
  const applySearchSuggestion = (suggestion: (typeof searchSuggestions)[number]) => {
    setQuery(suggestion.query);
    setStage("stage" in suggestion ? suggestion.stage : "all");
    setValueTag(null);
  };

  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      <OrbitCardsInteractions />
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <CrmSidebar active="list" counts={{ list: items.length }} />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ alignItems: "flex-end", display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "All contacts", zh: "全部人脉" })}</h1>
                <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 6 }}>{subtitle}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <a className="btn btn-ghost btn-sm" href="/app/contacts/new"><Icon name="scan" size={16} />{t({ en: "Scan", zh: "扫名片" })}</a>
                <a className="btn btn-primary btn-sm" href="/app/contacts/new"><Icon name="download" size={16} />{t({ en: "Import", zh: "导入人脉" })}</a>
              </div>
            </div>
            <div className="nc-nlsearch">
              <span className="nc-lead"><Icon name="sparkle" size={22} /></span>
              <input aria-label={t({ en: "Search contacts", zh: "搜索人脉" })} className="field" onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search name, company, role, industry, or value", zh: "搜索姓名、公司、职位、行业或关系价值" })} style={{ paddingRight: 104 }} type="search" value={query} />
              <span aria-live="polite" className="mono" style={{ color: "var(--text-3)", fontSize: 12, position: "absolute", right: 16, top: 18 }}>
                {t({ en: `${filtered.length} results`, zh: `${filtered.length} 条` })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {searchSuggestions.map((suggestion) => (
                <button className="chip" key={suggestion.label} onClick={() => applySearchSuggestion(suggestion)} type="button">{suggestion.label}</button>
              ))}
            </div>
            <div style={{ alignItems: "center", display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 16px" }}>
              {filters.map(([key, label]) => (
                <button className={`chip${stage === key ? " is-active" : ""}`} key={key} onClick={() => setStage(key)} type="button">
                  {label}<span className="mono" style={{ marginLeft: 5 }}>{counts[key] || 0}</span>
                </button>
              ))}
              <span style={{ width: 1, height: 20, background: "var(--hairline)", margin: "0 2px" }} />
              {valueFilters.map((tag) => (
                <button
                  aria-pressed={valueTag === tag}
                  className={`chip${valueTag === tag ? " is-active" : ""}`}
                  key={tag}
                  onClick={() => setValueTag((current) => current === tag ? null : tag)}
                  type="button"
                >
                  {tag}
                  <span className="mono" style={{ marginLeft: 5 }}>
                    {items.filter((item) => item.valueTags.includes(tag)).length}
                  </span>
                </button>
              ))}
            </div>
            {!filtered.length ? (
              <div className="card-flat" style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 14, gap: 12, justifyContent: "space-between", padding: 18 }}>
                <span>{t({ en: "No matching contacts yet.", zh: "当前还没有匹配的联系人。" })}</span>
                <button className="btn btn-ghost btn-sm" onClick={clearFilters} type="button">
                  {t({ en: "Clear filters", zh: "清除筛选" })}
                </button>
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{filtered.map((item) => <PersonCard item={item} key={item.id} t={t} viewModel={viewModel} />)}</div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", height: "100dvh", minHeight: "100dvh", overflow: "hidden", position: "relative" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="list" onQueryChange={setQuery} query={query} t={t} />
        <div className="scroll" data-appscroll style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto", padding: "2px 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 10 }}>{subtitle}</div>
          <div
            aria-label={t({ en: "Contact filters", zh: "联系人筛选" })}
            className="scroll noscroll orbit-chip-scroller"
            style={{ display: "flex", gap: 8, margin: "0 -18px", overflowX: "auto", padding: "0 18px 8px" }}
          >
            {filters.map(([key, label]) => (
              <button
                aria-pressed={stage === key}
                className={`chip${stage === key ? " is-active" : ""}`}
                key={key}
                onClick={() => setStage(key)}
                style={{ flexShrink: 0 }}
                type="button"
              >
                {label}
              </button>
            ))}
            {valueFilters.map((tag) => (
              <button
                aria-pressed={valueTag === tag}
                className={`chip${valueTag === tag ? " is-active" : ""}`}
                key={tag}
                onClick={() => setValueTag((current) => current === tag ? null : tag)}
                style={{ flexShrink: 0 }}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
          {!filtered.length ? (
            <div className="card-flat" style={{ color: "var(--text-3)", display: "grid", fontSize: 14, gap: 8, padding: 16 }}>
              <span>{t({ en: "No matching contacts yet.", zh: "当前还没有匹配的联系人。" })}</span>
              <button className="btn btn-ghost btn-sm" onClick={clearFilters} type="button">
                {t({ en: "Clear filters", zh: "清除筛选" })}
              </button>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>{filtered.map((item) => <PersonCard item={item} key={item.id} t={t} viewModel={viewModel} />)}</div>
        </div>
      </div>
    </main>
  );
}

function PipelineCard({ connection, t }: { connection: OrbitContactView; t: Translate }) {
  return (
    <a
      className="card-hover"
      href={`/app/contacts/${connection.id}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", color: "inherit", cursor: "pointer", display: "block", padding: 13, textDecoration: "none" }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
        <Avatar letter={crmInitial(connection.displayName)} g="g-violet" size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{connection.displayName || t({ en: "Unnamed contact", zh: "未命名联系人" })}</div>
          <div style={{ color: "var(--text-3)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crmRole(connection, t)}</div>
        </div>
        <Icon name="chevR" size={16} color="var(--text-4)" />
      </div>
    </a>
  );
}

function PipelineBoard({
  grouped,
  t,
  viewModel,
}: {
  grouped: Record<OrbitContactPipelineStatus, OrbitContactView[]>;
  t: Translate;
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <div style={{ display: "flex", gap: 16, height: "100%" }}>
      {viewModel.pipelineStatuses.map((status, index) => {
        const items = grouped[status.value] || [];
        const color = stageColors[index % 3];

        return (
          <div key={status.value} style={{ background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: 8, padding: "13px 14px" }}>
              <span style={{ background: color, borderRadius: "var(--r-pill)", height: 8, width: 8 }} />
              <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{status.label}</span>
              <span style={{ color: "var(--text-4)", fontFamily: "var(--ff-mono)", fontSize: 12 }}>{items.length}</span>
              <div style={{ flex: 1 }} />
            </div>
            <div className="scroll" style={{ display: "flex", flex: 1, flexDirection: "column", gap: 12, overflowY: "auto", padding: "0 11px 14px" }}>
              {items.length ? items.map((contact) => <PipelineCard connection={contact} key={contact.id} t={t} />) : <div style={{ color: "var(--text-4)", fontSize: 13, padding: "4px 2px" }}>{t({ en: "No contacts yet.", zh: "暂无联系人。" })}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobilePipeline({
  grouped,
  t,
  viewModel,
}: {
  grouped: Record<OrbitContactPipelineStatus, OrbitContactView[]>;
  t: Translate;
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
            <div aria-expanded={!isCollapsed} aria-label={isCollapsed ? t({ en: "Expand stage", zh: "展开阶段" }) : t({ en: "Collapse stage", zh: "收起阶段" })} onClick={() => setCollapsed((current) => ({ ...current, [status.value]: !current[status.value] }))} role="button" style={{ alignItems: "center", background: "var(--bg)", borderBottom: "1px solid var(--border)", cursor: "pointer", display: "flex", gap: 8, padding: "10px 0", position: "sticky", top: 0, zIndex: ORBIT_Z.sticky }}>
              <Icon name={isCollapsed ? "chevR" : "chevD"} size={16} color="var(--text-3)" />
              <span style={{ background: color, borderRadius: "var(--r-pill)", height: 9, width: 9 }} />
              <span style={{ color: "var(--ink)", fontSize: 15, fontWeight: 600 }}>{status.label}</span>
              <span style={{ alignItems: "center", background: soft, borderRadius: "var(--r-pill)", color, display: "flex", fontSize: 12, fontWeight: 600, height: 20, justifyContent: "center", minWidth: 20, padding: "0 6px" }}>{items.length}</span>
              <div style={{ flex: 1 }} />
            </div>
            {!isCollapsed ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                {items.map((contact) => <PipelineCard connection={contact} key={contact.id} t={t} />)}
                {items.length === 0 ? <div style={{ color: "var(--text-4)", fontSize: 13, padding: "4px 2px" }}>{t({ en: "None", zh: "暂无" })}</div> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function OrbitRealCardsPipeline({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const visible = filterConnections(viewModel.connections, query);
  const grouped = groupConnectionsByStatus(viewModel, visible);

  return (
    <main data-orbit-real-page="contacts-pipeline" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100dvh" }}>
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <div style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", padding: "22px 14px" }}>
            <CrmNav active="pipeline" t={t} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, padding: "28px 32px 28px" }}>
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow">PIPELINE</div>
              <h1 className="h-display" style={{ margin: "2px 0 0" }}>{t({ en: "Pipeline", zh: "跟进管线" })}</h1>
              <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 4 }}>{t({ en: "Move each relationship forward a step · grouped by status", zh: "把每段关系往前推一格 · 按状态分组" })}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <PipelineBoard grouped={grouped} t={t} viewModel={viewModel} />
            </div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", flexDirection: "column", height: "100dvh", position: "relative" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="pipeline" onQueryChange={setQuery} query={query} t={t} />
        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 18px 36px" }}>
          <MobilePipeline grouped={grouped} t={t} viewModel={viewModel} />
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

function buildConnGraph(viewModel: OrbitContactsViewModel, t: Translate): ConnGraph {
  const eventIdsForContacts = [...new Set(viewModel.connections.map((contact) => contact.lastEventId))];

  return {
    edges: viewModel.connections.map((contact) => ({ source: contact.id, target: contact.lastEventId })),
    nodes: [
      ...eventIdsForContacts.map((id) => ({ id, name: viewModel.events.find((event) => event.id === id)?.name || t({ en: "Event", zh: "活动" }), type: "event" as const })),
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
  t,
  view,
  viewModel,
}: {
  scale: number;
  t: Translate;
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
                <title>{event.name || t({ en: "Event", zh: "活动" })}</title>
                <text x={point.x} y={point.y + 22} textAnchor="middle" fontSize="11" fill="var(--text-3)">{truncateGraphLabel(event.name) || t({ en: "Event", zh: "活动" })}</text>
              </g>
            );
          })}
          {view.connections.map((connection) => {
            const point = view.connPos.get(connection.id);
            if (!point) return null;
            return (
              <g key={connection.id}>
                <circle cx={point.x} cy={point.y} r="6" fill={graphStatusColor[connection.pipelineStatus] || "var(--amber)"} />
                <title>{connection.displayName || "?"}</title>
                <text x={point.x} y={point.y - 11} textAnchor="middle" fontSize="11" fill="var(--ink)">{truncateGraphLabel(connection.displayName)}</text>
              </g>
            );
          })}
          <circle cx={view.cx} cy={view.cy} r="11" fill="var(--accent)" />
          <text x={view.cx} y={view.cy + 4} textAnchor="middle" fontSize="10" fill="var(--on-dark)" fontWeight="700">{t({ en: "Me", zh: "我" })}</text>
        </g>
      </svg>
      ) : null}
    </section>
  );
}

export function OrbitRealCardsGraph({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [scale, setScale] = useState(1);
  const graph = useMemo(() => buildConnGraph(viewModel, t), [viewModel, t]);
  const visible = useMemo(() => {
    const queryTokens = contactSearchTokens(query);
    if (queryTokens.length === 0) return graph;
    const matched = graph.nodes.filter(
      (node) =>
        node.type === "connection" &&
        matchesContactSearchText(
          [node.displayName, node.company, node.industry]
            .filter(Boolean)
            .join(" "),
          queryTokens,
        ),
    );
    const ids = new Set(matched.map((node) => node.id));
    const keptEdges = graph.edges.filter((edge) => ids.has(edge.source));
    const eventIdsFromEdges = new Set(keptEdges.map((edge) => edge.target));
    return { edges: keptEdges, nodes: graph.nodes.filter((node) => ids.has(node.id) || (node.type === "event" && eventIdsFromEdges.has(node.id))) };
  }, [graph, query]);
  const view = useMemo(() => graphLayout(visible), [visible]);
  const summary = `${view.connections.length} ${t({ en: "contacts", zh: "位联系人" })} · ${view.events.length} ${t({ en: "events", zh: "场活动" })}`;
  // UI-audit fix P1-b: zoom out was btn-ghost and zoom in was btn-primary, so a
  // symmetric pair rendered at two different visual weights (and two widths,
  // 35px vs 38px). A control pair takes one variant; neither half of "zoom" is
  // the page's primary action. The class list is repeated literally rather than
  // hoisted to a const because tests/ui/orbit-button-ratchet.test.ts reads the
  // opening tag as source text — a variable reads as a hand-rolled button.
  const zoom = (className: string) => (
    <div className={className}>
      <button aria-label={t({ en: "Zoom out", zh: "缩小" })} className="btn btn-ghost btn-sm btn-icon hit-44" onClick={() => setScale((value) => Math.max(0.5, value - 0.2))} type="button">-</button>
      <span className="mono">{Math.round(scale * 100)}%</span>
      <button aria-label={t({ en: "Zoom in", zh: "放大" })} className="btn btn-ghost btn-sm btn-icon hit-44" onClick={() => setScale((value) => Math.min(2.2, value + 0.2))} type="button">+</button>
    </div>
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="contacts-graph">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <CrmSidebar active="graph" counts={{ list: view.connections.length }} />
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ alignItems: "flex-end", display: "flex", gap: 20, justifyContent: "space-between", padding: "24px 32px 16px" }}>
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Network graph", zh: "人脉图谱" })}</h1>
                <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 4 }}>{summary}</div>
              </div>
              {zoom("orbit-graph-zoom")}
            </div>
            <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
              <GraphCanvas scale={scale} t={t} view={view} viewModel={viewModel} />
            </div>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader active="graph" onQueryChange={setQuery} query={query} t={t} />
        <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "0 18px 36px" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 10 }}>{summary}</div>
          {zoom("orbit-graph-mobile-zoom")}
          <GraphCanvas scale={scale} t={t} view={view} viewModel={viewModel} />
        </div>
      </div>
    </main>
  );
}

function introStatusLabel(status: OrbitIntroStatus, t: Translate) {
  return status === "sent" ? t({ en: "Sent", zh: "已发送" }) : t({ en: "Draft", zh: "草稿" });
}

function introStatusClass(status: OrbitIntroStatus) {
  return status === "sent" ? "badge-live" : "badge-soon";
}

function IntroRow({
  intro,
  onOpen,
  t,
}: {
  intro: OrbitIntroView;
  onOpen: () => void;
  t: Translate;
}) {
  return (
    <button
      aria-label={t({
        en: `View introduction between ${intro.labelA} and ${intro.labelB}`,
        zh: `查看${intro.labelA}与${intro.labelB}的引荐记录`,
      })}
      className="btn card orbit-intro-row"
      onClick={onOpen}
      style={{
        color: "inherit",
        cursor: "pointer",
        fontFamily: "var(--ff)",
        textAlign: "left",
        width: "100%",
      }}
      type="button"
    >
      <div className="orbit-intro-route">
        <Avatar letter={crmInitial(intro.labelA)} g="g-sky" size={42} />
        <div className="orbit-intro-name"><span>{t({ en: "Contact A", zh: "联系人 A" })}</span><strong>{intro.labelA}</strong></div>
        <span className="orbit-intro-arrow"><Icon name="arrow" size={17} /></span>
        <Avatar letter={crmInitial(intro.labelB)} g="g-emerald" size={42} />
        <div className="orbit-intro-name"><span>{t({ en: "Contact B", zh: "联系人 B" })}</span><strong>{intro.labelB}</strong></div>
      </div>
      <span className={`badge ${introStatusClass(intro.statusBadge)}`}>{introStatusLabel(intro.statusBadge, t)}</span>
      {intro.blurb ? <p className="orbit-intro-blurb">{intro.blurb}</p> : null}
      <span style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12, gap: 4, gridColumn: "1 / -1" }}>
        {t({ en: "View details", zh: "查看详情" })}
        <Icon name="chevR" size={14} />
      </span>
    </button>
  );
}

function formatIntroDate(value: string | undefined, t: Translate): string {
  if (!value) return t({ en: "Not recorded", zh: "未记录" });

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return t({
    en: new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date),
    zh: new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(date),
  });
}

function IntroDetailModal({
  intro,
  onClose,
  t,
}: {
  intro: OrbitIntroView;
  onClose: () => void;
  t: Translate;
}) {
  return (
    <ModalShell
      maxW={620}
      onClose={onClose}
      step={t({ en: "Introduction details", zh: "引荐详情" })}
    >
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <h2 className="h-title" style={{ margin: "4px 0 6px" }}>
            {intro.labelA} <span style={{ color: "var(--accent)" }}>→</span> {intro.labelB}
          </h2>
          <span className={`badge ${introStatusClass(intro.statusBadge)}`}>
            {introStatusLabel(intro.statusBadge, t)}
          </span>
        </div>

        <section className="card-flat" style={{ padding: 16 }}>
          <div className="field-label">{t({ en: "Introduction note", zh: "引荐说明" })}</div>
          <p style={{ color: "var(--text)", fontSize: 15, lineHeight: 1.75, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
            {intro.blurb}
          </p>
        </section>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          {[
            { id: intro.contactAId, label: intro.labelA, role: t({ en: "Contact A", zh: "联系人 A" }) },
            { id: intro.contactBId, label: intro.labelB, role: t({ en: "Contact B", zh: "联系人 B" }) },
          ].map((contact) => (
            <a
              className="card-flat"
              href={contact.id ? `/app/contacts/${encodeURIComponent(contact.id)}` : "/app/contacts"}
              key={contact.role}
              style={{ alignItems: "center", color: "inherit", display: "flex", gap: 12, padding: 12, textDecoration: "none" }}
            >
              <Avatar g="g-violet" letter={crmInitial(contact.label)} size={38} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "var(--text-3)", display: "block", fontSize: 11 }}>{contact.role}</span>
                <strong style={{ color: "var(--ink)", display: "block", fontSize: 14, marginTop: 2 }}>{contact.label}</strong>
              </span>
              <Icon color="var(--text-4)" name="chevR" size={15} />
            </a>
          ))}
        </div>

        <dl style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2,minmax(0,1fr))", margin: 0 }}>
          <div>
            <dt className="field-label">{t({ en: "Created", zh: "创建时间" })}</dt>
            <dd style={{ color: "var(--text-2)", fontSize: 13, margin: "5px 0 0" }}>{formatIntroDate(intro.createdAt, t)}</dd>
          </div>
          <div>
            <dt className="field-label">{t({ en: "Last updated", zh: "最近更新" })}</dt>
            <dd style={{ color: "var(--text-2)", fontSize: 13, margin: "5px 0 0" }}>{formatIntroDate(intro.updatedAt, t)}</dd>
          </div>
        </dl>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onClose} type="button">
            {t({ en: "Done", zh: "完成" })}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function PickerSlot({
  label,
  onPick,
  person,
  t,
}: {
  label: string;
  onPick: () => void;
  person: OrbitContactView | null;
  t: Translate;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div className="field-label">{label}</div>
      {person ? (
        <button onClick={onPick} style={{ alignItems: "center", background: "var(--accent-softer)", border: "1px solid var(--accent-soft)", borderRadius: "var(--r-md)", cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 8, padding: 14, width: "100%" }} type="button">
          <Avatar letter={crmInitial(person.displayName)} g="g-violet" size={48} />
          <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600, textAlign: "center" }}>{person.displayName}</div>
        </button>
      ) : (
        <button onClick={onPick} style={{ alignItems: "center", background: "var(--surface-2)", border: "1.5px dashed var(--border-strong)", borderRadius: "var(--r-md)", color: "var(--text-2)", cursor: "pointer", display: "flex", flexDirection: "column", fontFamily: "var(--ff)", gap: 8, padding: 14, width: "100%" }} type="button">
          <span style={{ alignItems: "center", background: "var(--surface)", borderRadius: "var(--r-pill)", display: "flex", height: 48, justifyContent: "center", width: 48 }}><Icon name="plus" size={22} /></span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t({ en: "Pick a contact", zh: "选择联系人" })}</span>
        </button>
      )}
    </div>
  );
}

function IntroComposerModal({
  onClose,
  onCreated,
  t,
  viewModel,
}: {
  onClose: () => void;
  onCreated: (introduction: OrbitIntroView) => void;
  t: Translate;
  viewModel: OrbitContactsViewModel;
}) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [blurb, setBlurb] = useState("");
  const [picking, setPicking] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedA = viewModel.connections.find((contact) => contact.id === aId) || null;
  const selectedB = viewModel.connections.find((contact) => contact.id === bId) || null;
  const queryTokens = contactSearchTokens(query);
  const selectable = viewModel.connections.filter((item) => {
    if (picking === "a" && item.id === bId) return false;
    if (picking === "b" && item.id === aId) return false;
    return matchesContactSearchText(
      [item.displayName, item.company, item.title].filter(Boolean).join(" "),
      queryTokens,
    );
  });

  function pick(id: string) {
    if (picking === "a") setAId(id);
    if (picking === "b") setBId(id);
    setPicking("");
    setQuery("");
  }

  async function saveIntroduction() {
    if (!aId || !bId || !blurb.trim() || saving) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/contacts/introductions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactAId: aId,
          contactBId: bId,
          blurb,
        }),
      });
      const envelope = (await response.json()) as {
        success?: boolean;
        data?: {
          introduction?: {
            contactAId?: string;
            contactBId?: string;
            createdAt?: string;
            id?: string;
            labelA?: string;
            labelB?: string;
            blurb?: string;
            status?: OrbitIntroStatus;
            updatedAt?: string;
          };
        };
      };
      const introduction = envelope.data?.introduction;
      if (
        !response.ok ||
        envelope.success !== true ||
        !introduction?.id ||
        !introduction.labelA ||
        !introduction.labelB ||
        !introduction.blurb ||
        introduction.status !== "draft"
      ) {
        throw new Error("introduction-save-failed");
      }

      onCreated({
        blurb: introduction.blurb,
        contactAId: introduction.contactAId,
        contactBId: introduction.contactBId,
        createdAt: introduction.createdAt,
        id: introduction.id,
        labelA: introduction.labelA,
        labelB: introduction.labelB,
        statusBadge: introduction.status,
        updatedAt: introduction.updatedAt,
      });
    } catch {
      setError(
        t({
          en: "The introduction draft could not be saved. Please retry.",
          zh: "引荐草稿未能保存，请重试。",
        }),
      );
      setSaving(false);
    }
  }

  if (picking) {
    return (
      <ModalShell maxW={520} onClose={() => setPicking("")} step={t({ en: "Pick a contact", zh: "选择联系人" })}>
        <h2 className="h-title" style={{ margin: "4px 0 14px" }}>{picking === "a" ? t({ en: "Pick the first contact", zh: "选择第一位联系人" }) : t({ en: "Pick the second contact", zh: "选择第二位联系人" })}</h2>
        <div style={{ marginBottom: 14, position: "relative" }}>
          <Icon name="search" size={17} color="var(--text-3)" style={{ left: 13, position: "absolute", top: 14 }} />
          <input aria-label={t({ en: "Search contacts", zh: "搜索名片夹" })} autoFocus className="field" onChange={(event) => setQuery(event.target.value)} placeholder={t({ en: "Search contacts", zh: "搜索名片夹" })} style={{ paddingLeft: 40 }} type="search" value={query} />
        </div>
        <div className="scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {selectable.map((item) => (
            <button className="card-hover" key={item.id} onClick={() => pick(item.id)} style={{ alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", display: "flex", fontFamily: "var(--ff)", gap: 12, padding: 11, textAlign: "left" }} type="button">
              <Avatar letter={crmInitial(item.displayName)} g="g-violet" size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>{item.displayName}</div>
                <div style={{ color: "var(--text-3)", fontSize: 12 }}>{crmRole(item, t)}</div>
              </div>
              <Icon name="chevR" size={16} color="var(--text-4)" />
            </button>
          ))}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell maxW={560} onClose={onClose} step={t({ en: "Create introduction", zh: "创建引荐" })}>
      <form onSubmit={(event) => { event.preventDefault(); void saveIntroduction(); }}>
        <h2 className="h-title" style={{ margin: "4px 0 6px" }}>{t({ en: "Make an introduction", zh: "发起引荐" })}</h2>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 18px" }}>{t({ en: "Pick two contacts and write the introduction note. Saving creates an account-scoped draft; it does not send anything.", zh: "选择两位联系人并填写引荐词。保存后会生成仅属于当前账号的草稿，不会自动发送。" })}</p>
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <PickerSlot label={t({ en: "Contact A", zh: "联系人 A" })} onPick={() => setPicking("a")} person={selectedA} t={t} />
          <div style={{ color: "var(--accent)", marginTop: 18 }}><Icon name="share" size={20} /></div>
          <PickerSlot label={t({ en: "Contact B", zh: "联系人 B" })} onPick={() => setPicking("b")} person={selectedB} t={t} />
        </div>
        <label className="field-label" htmlFor="intro-note" style={{ marginTop: 18 }}>{t({ en: "Intro note", zh: "引荐词" })}</label>
        <textarea className="field" id="intro-note" onChange={(event) => setBlurb(event.target.value)} placeholder={t({ en: "Write the note both contacts will review.", zh: "填写给双方查看的引荐说明。" })} style={{ fontFamily: "var(--ff)", height: 88, lineHeight: 1.5, padding: 12, resize: "none" }} value={blurb} />
        {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose} type="button">{t({ en: "Cancel", zh: "取消" })}</button>
          <button className="btn btn-primary" disabled={!aId || !bId || !blurb.trim() || saving} type="submit"><Icon name="share" size={16} color="var(--on-dark)" />{saving ? t({ en: "Saving…", zh: "保存中…" }) : t({ en: "Save draft", zh: "保存草稿" })}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export function OrbitRealCardsIntros({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [composerOpen, setComposerOpen] = useState(false);
  const [introductions, setIntroductions] = useState(viewModel.intros);
  const [selectedIntroduction, setSelectedIntroduction] = useState<OrbitIntroView | null>(null);
  const [filter, setFilter] = useState<"all" | OrbitIntroStatus>("all");
  const [query, setQuery] = useState("");
  const stats = {
    draft: introductions.filter((intro) => intro.statusBadge === "draft").length,
    sent: introductions.filter((intro) => intro.statusBadge === "sent").length,
    total: introductions.length,
  };
  const filters: { count: number; key: "all" | OrbitIntroStatus; label: string }[] = [
    { key: "all", label: t({ en: "All", zh: "全部" }), count: stats.total },
    { key: "draft", label: t({ en: "Draft", zh: "草稿" }), count: stats.draft },
    { key: "sent", label: t({ en: "Sent", zh: "已发送" }), count: stats.sent },
  ];
  const visible = introductions.filter((intro) => {
    const matchesFilter = filter === "all" || intro.statusBadge === filter;
    const haystack = [intro.labelA, intro.labelB, intro.blurb].filter(Boolean).join(" ");
    return (
      matchesFilter &&
      matchesContactSearchText(haystack, contactSearchTokens(query))
    );
  });
  const statsNode = (
    <section className="orbit-intro-stats">
      <div className="card-flat"><strong>{stats.total}</strong><span>{t({ en: "All", zh: "全部" })}</span></div>
      <div className="card-flat"><strong>{stats.draft}</strong><span>{t({ en: "Draft", zh: "草稿" })}</span></div>
      <div className="card-flat"><strong>{stats.sent}</strong><span>{t({ en: "Sent", zh: "已发送" })}</span></div>
    </section>
  );

  return (
    <main className="orbit-personal-page" data-orbit-real-page="contacts-intros">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <CrmSidebar active="intros" counts={{ intros: stats.total }} />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ alignItems: "flex-end", display: "flex", gap: 20, justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Introductions", zh: "引荐记录" })}</h1>
                <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 4 }}>{t({ en: "Every introduction you've sent or saved lives here.", zh: "你已经发出或保存过的引荐，都在这里。" })}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setComposerOpen(true)} type="button"><Icon name="share" size={16} color="var(--on-dark)" />{t({ en: "Make introduction", zh: "发起引荐" })}</button>
            </div>
            {statsNode}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {filters.map((item) => (
                <button aria-pressed={filter === item.key} className={`chip${filter === item.key ? " is-active" : ""}`} key={item.key} onClick={() => setFilter(item.key)} type="button">
                  {item.label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{item.count}</span>
                </button>
              ))}
            </div>
            {!visible.length ? <div className="card-flat orbit-empty">{t({ en: "No introductions match these filters yet.", zh: "还没有符合筛选条件的引荐记录。" })}</div> : null}
            <section className="orbit-intro-list">{visible.map((intro) => <IntroRow intro={intro} key={intro.id} onOpen={() => setSelectedIntroduction(intro)} t={t} />)}</section>
          </div>
        </div>
      </div>
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <MobileCrmHeader
          action={<IconButton ariaLabel={t({ en: "Make introduction", zh: "发起引荐" })} name="plus" size={19} style={{ background: "var(--accent-soft)", color: "var(--accent)" }} />}
          active="intros"
          onQueryChange={setQuery}
          placeholder={t({ en: "Search contacts / intro notes", zh: "搜索联系人 / 引荐词" })}
          query={query}
          t={t}
        />
        <div className="scroll" data-appscroll style={{ flex: 1, overflowY: "auto", padding: "2px 18px 36px" }}>
          {statsNode}
          <div className="scroll noscroll orbit-chip-scroller" style={{ display: "flex", gap: 8, margin: "0 -18px 14px", overflowX: "auto", padding: "0 18px" }}>
            {filters.map((item) => (
              <button aria-pressed={filter === item.key} className={`chip${filter === item.key ? " is-active" : ""}`} key={item.key} onClick={() => setFilter(item.key)} style={{ flexShrink: 0 }} type="button">
                {item.label}<span style={{ fontFamily: "var(--ff-mono)", fontSize: 11, marginLeft: 4, opacity: 0.6 }}>{item.count}</span>
              </button>
            ))}
          </div>
          {!visible.length ? <div className="card-flat orbit-empty">{t({ en: "No introductions match these filters yet.", zh: "还没有符合筛选条件的引荐记录。" })}</div> : null}
          <section className="orbit-intro-list">{visible.map((intro) => <IntroRow intro={intro} key={intro.id} onOpen={() => setSelectedIntroduction(intro)} t={t} />)}</section>
        </div>
      </div>
      {composerOpen ? <IntroComposerModal onClose={() => setComposerOpen(false)} onCreated={(introduction) => { setIntroductions((current) => [introduction, ...current]); setComposerOpen(false); }} t={t} viewModel={viewModel} /> : null}
      {selectedIntroduction ? <IntroDetailModal intro={selectedIntroduction} onClose={() => setSelectedIntroduction(null)} t={t} /> : null}
    </main>
  );
}
