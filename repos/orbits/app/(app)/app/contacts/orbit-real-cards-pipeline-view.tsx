"use client";

import type { CSSProperties } from "react";

import { AccountTopNav } from "../orbit-account-shell";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { useOrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import type {
  OrbitContactPipelineStatus,
  OrbitContactView,
  OrbitContactsViewModel,
} from "../orbit-contacts-route-view-model";
import { CrmSidebar as SharedCrmSidebar } from "./orbit-crm-sidebar";
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { Basis, SourceBadge, filterConnections } from "./orbit-real-contacts";
import { ORBIT_0918_COLORS as C0918 } from "../orbit-0918-tokens";
import { useState } from "react";

type Copy = { en: string; zh: string };
type Translate = (copy: Copy) => string;
type Strength = "strong" | "medium" | "dormant";

const strengthMeta: Record<Strength, { cls: string; label: Copy }> = {
  strong: { cls: "nc-st-strong", label: { en: "Strong", zh: "强" } },
  medium: { cls: "nc-st-medium", label: { en: "Medium", zh: "中" } },
  dormant: { cls: "nc-st-dormant", label: { en: "Dormant", zh: "沉睡" } },
};

function StrengthTag({
  strength,
  t,
}: {
  strength: Strength;
  t: Translate;
}) {
  const meta = strengthMeta[strength];

  return (
    <span className={`nc-strength ${meta.cls}`}>
      <span className="nc-dot" />
      {t(meta.label)}
    </span>
  );
}

const ellip: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function PipelineCard({
  contact,
  t,
}: {
  contact: OrbitContactView;
  t: Translate;
}) {
  const showStrength =
    contact.strength === "strong" || contact.strength === "dormant";

  return (
    <a className="nc-kcard" href={`/app/contacts/${contact.id}`}>
      <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Avatar
          g={contact.g || "g-violet"}
          letter={contact.initial}
          size={44}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nc-knm" style={ellip}>
            {contact.displayName}
          </div>
          <div className="nc-korg" style={ellip}>
            {contact.company}
            {contact.title ? ` · ${contact.title}` : ""}
          </div>
        </div>
      </div>
      <div className="nc-krow1">
        <SourceBadge source={contact.source} t={t} />
        {showStrength ? (
          <StrengthTag
            strength={
              contact.strength === "dormant" ? "dormant" : "strong"
            }
            t={t}
          />
        ) : null}
        {contact.valueTags[0] ? (
          <span className="nc-tag nc-tag-value">{contact.valueTags[0]}</span>
        ) : null}
      </div>
      {contact.nextAction ? (
        <div className="nc-knext">
          <Icon name={contact.dormant ? "refresh" : "arrow"} size={16} />
          <span style={{ flex: 1 }}>{contact.nextAction.text}</span>
          <Basis
            copy={{
              en: contact.nextAction.reason,
              zh: contact.nextAction.reason,
            }}
            evidenceId={contact.nextAction.evidenceId}
            kind={contact.dormant ? "rule" : "ai"}
            t={t}
          />
        </div>
      ) : null}
      <div className="nc-open">
        <span>{t({ en: "Open contact", zh: "打开联系人" })}</span>
        <Icon name="chevR" size={15} />
      </div>
    </a>
  );
}

const cdotByStatus: Record<OrbitContactPipelineStatus, string> = {
  pending_initialization: "nc-cdot-pending",
  archived: "nc-cdot-archived",
  to_contact: "nc-cdot-amber",
  in_progress: "nc-cdot-sky",
  partnered: "nc-cdot-live",
};

/** Orbit_0918 批次 3b：看板列图标与强调色（纯视觉映射，不改分类逻辑）。 */
const stageVisual: Record<OrbitContactPipelineStatus, { accent: string; bg: string; desc: Copy; icon: string }> = {
  pending_initialization: { accent: C0918.text3, bg: C0918.panelSoft, desc: { en: "Relationship not set yet", zh: "还没设定关系阶段" }, icon: "clock" },
  to_contact: { accent: "#9A6B22", bg: "#FBF1E4", desc: { en: "Reach out next", zh: "下一步该主动联系" }, icon: "bell" },
  in_progress: { accent: C0918.accent, bg: C0918.panel, desc: { en: "Actively moving forward", zh: "正在推进的关系" }, icon: "arrow" },
  partnered: { accent: "#2F6B4F", bg: "#E6F1EC", desc: { en: "Collaborating", zh: "已经在合作" }, icon: "checkCircle" },
  archived: { accent: C0918.text4, bg: C0918.panelSoft, desc: { en: "Set aside for now", zh: "暂时搁置的关系" }, icon: "user" },
};

const LOCAL_STYLES = `
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-pending { background:var(--text-2); }
[data-orbit-real-page="contacts-pipeline"] .nc-readonly { display:flex; align-items:center; gap:7px; max-width:520px; padding:9px 12px; border-radius:var(--r-md); background:var(--surface-2); border:1px solid var(--hairline); color:var(--text-3); font-size:12.5px; line-height:1.4; }
[data-orbit-real-page="contacts-pipeline"] .nc-readonly svg { color:var(--accent); flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kanban { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; align-items:start; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol { background:var(--surface-2); border:1px solid var(--hairline); border-radius:var(--r-md); padding:12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head { display:flex; align-items:center; gap:8px; padding:2px 4px 12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-cdot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-clab { font-size:13.5px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-ccount { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-2); background:var(--surface-3); border-radius:var(--r-pill); padding:2px 9px; }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-amber { background:var(--amber); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-sky { background:var(--sky); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-live { background:var(--live); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-archived { background:var(--text-3); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcards { display:flex; flex-direction:column; gap:10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard { display:block; background:var(--surface); border:1px solid var(--border); border-radius:var(--r-md); padding:13px; box-shadow:var(--sh-xs); cursor:pointer; text-decoration:none; color:inherit; transition:box-shadow .18s, transform .18s, border-color .18s; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard:hover { border-color:var(--border-2); box-shadow:var(--sh-md); transform:translateY(-2px); }
[data-orbit-real-page="contacts-pipeline"] .nc-knm { font-size:14px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-korg { font-size:12px; color:var(--text-3); margin-top:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-krow1 { display:flex; align-items:center; gap:6px; margin-top:9px; flex-wrap:wrap; }
[data-orbit-real-page="contacts-pipeline"] .nc-knext { display:flex; gap:7px; align-items:flex-start; font-size:12.5px; line-height:1.4; color:var(--text-2); margin-top:10px; padding:8px 10px; background:var(--surface-2); border-radius:var(--r-sm); }
[data-orbit-real-page="contacts-pipeline"] .nc-knext > svg { color:var(--accent); flex-shrink:0; margin-top:1px; }
[data-orbit-real-page="contacts-pipeline"] .nc-open { display:flex; align-items:center; justify-content:flex-end; gap:4px; margin-top:11px; padding-top:10px; border-top:1px solid var(--hairline); color:var(--accent); font-size:12px; font-weight:600; }
[data-orbit-real-page="contacts-pipeline"] .nc-mobile-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp { display:flex; align-items:center; gap:8px; margin:16px 2px 10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-cdot { width:8px; height:8px; border-radius:50%; }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-lab { font-size:13px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-mgrp .nc-n { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-3); }

/* Orbit_0918 批次 3b：关系管线看板 */
[data-orbit-real-page="contacts-pipeline"] { background:#FBFBFE; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-panel { background:#FFFFFF; border:1px solid #E8E9F6; border-radius:18px; padding:26px; display:flex; flex-direction:column; gap:20px; max-width:1240px; margin:0 auto 20px; width:100%; box-sizing:border-box; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-panel:last-child { margin-bottom:0; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-title { margin:0; font-family:'Noto Serif SC','Songti SC','SimSun',serif; font-weight:900; font-size:26px; line-height:1.15; letter-spacing:-0.02em; color:#0E1225; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-h2 { margin:0; font-family:'Noto Serif SC','Songti SC','SimSun',serif; font-weight:900; font-size:22px; letter-spacing:-0.02em; color:#0E1225; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-sub { margin-top:6px; font-size:14px; color:#6B6F99; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr)); gap:8px; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-stat { display:flex; flex-direction:column; align-items:center; gap:10px; padding:16px 6px; border-radius:14px; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-stat-icon { width:46px; height:46px; border-radius:50%; background:#FFFFFF; color:#4B4FC7; display:flex; align-items:center; justify-content:center; border:1px solid #E8E9F6; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-stat-n { font-family:'Noto Serif SC','Songti SC','SimSun',serif; font-weight:900; font-size:28px; letter-spacing:-0.02em; color:#0E1225; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-stat-label { font-size:13px; color:#3B3F7A; white-space:nowrap; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest { display:flex; align-items:center; gap:14px; padding:12px 14px; border:1px solid #E8E9F6; border-radius:12px; background:#FFFFFF; text-decoration:none; color:inherit; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest:hover { background:#F7F7FD; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest-icon { width:40px; height:40px; border-radius:10px; background:#ECEEFB; color:#2E3270; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest-title { font-size:15px; font-weight:600; color:#0E1225; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest-desc { font-size:13px; color:#6B6F99; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-suggest-tag { padding:4px 10px; border-radius:999px; background:#ECEEFB; color:#2E3270; font-size:12px; white-space:nowrap; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-search { flex:1; min-width:220px; padding:10px 16px; border:1px solid #E8E9F6; border-radius:10px; background:#F7F7FD; font-size:14px; outline:none; font-family:inherit; }
[data-orbit-real-page="contacts-pipeline"] .nc0918-search:focus { border-color:#4B4FC7; background:#FFFFFF; }
[data-orbit-real-page="contacts-pipeline"] .nc-kanban { grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr)); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol { border:0; border-radius:16px; padding:14px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head { gap:10px; padding:4px 4px 12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-clab { font-size:15px; font-weight:600; color:#0E1225; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-ccount { background:#FFFFFF; color:#3B3F7A; font-family:inherit; font-size:13px; font-weight:600; padding:2px 10px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-icon { width:30px; height:30px; border-radius:8px; background:#FFFFFF; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-desc { font-size:12px; color:#6B6F99; padding:0 4px 10px; margin-top:-6px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard { border-radius:12px; border:1px solid #E8E9F6; box-shadow:none; padding:14px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcard:hover { border-color:#B9BCEB; box-shadow:0 8px 24px rgba(59,63,122,0.10); transform:translateY(-1px); }
[data-orbit-real-page="contacts-pipeline"] .nc-knext { background:#F7F7FD; }
[data-orbit-real-page="contacts-pipeline"] .nc-open { color:#4B4FC7; }
`;

export function OrbitRealCardsPipelineView({
  viewModel,
}: {
  viewModel: OrbitContactsViewModel;
}) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const visible = filterConnections(viewModel.connections, query);
  const liveColumns = viewModel.pipelineStatuses.map((status) => ({
    accent: stageVisual[status.value].accent,
    bg: stageVisual[status.value].bg,
    cdot: cdotByStatus[status.value],
    cards: visible.filter(
      (contact) => contact.pipelineStatus === status.value,
    ),
    desc: stageVisual[status.value].desc,
    icon: stageVisual[status.value].icon,
    label: status.label,
    value: status.value,
  }));
  const total = liveColumns.reduce(
    (sum, column) => sum + column.cards.length,
    0,
  );
  // Orbit_0918 批次 3b：建议行动卡直接取真实的 nextAction（每条都带依据），
  // 不伪造设计稿里没有数据源支撑的 "AI 换一批" 推荐。
  const suggestedActions = visible
    .filter((contact) => contact.nextAction)
    .slice(0, 3);
  const stageLabelOf = (contact: OrbitContactView) =>
    viewModel.pipelineStatuses.find((status) => status.value === contact.pipelineStatus)?.label ?? contact.pipelineStatus;
  const classificationCopy = t({
    en: "Read-only grouping from follow-up signals and relationship-value evidence. Open a contact to review its source records.",
    zh: "只读分类，依据跟进信号与关系价值证据生成。打开联系人可查看来源记录。",
  });
  const searchInput = (
    <input
      aria-label={t({ en: "Search pipeline contacts", zh: "搜索管线联系人" })}
      className="nc0918-search"
      onChange={(event) => setQuery(event.target.value)}
      placeholder={t({ en: "Search name, company, or title…", zh: "搜索联系人姓名、公司或职位…" })}
      type="search"
      value={query}
    />
  );

  return (
    <main className="orbit-page" data-orbit-real-page="contacts-pipeline">
      <OrbitCardsInteractions />
      <style dangerouslySetInnerHTML={{ __html: LOCAL_STYLES }} />

      <div
        className="orbit-desktop-only"
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
        }}
      >
        <AccountTopNav active="cards" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`,
            height: "calc(100dvh - 64px)",
            minHeight: 0,
          }}
        >
          <SharedCrmSidebar active="pipeline" counts={{ pipeline: total }} />
          <div
            className="scroll"
            data-appscroll
            style={{ overflowY: "auto", padding: "28px 32px 60px" }}
          >
            <section className="nc0918-panel">
              <div
                style={{
                  alignItems: "flex-end",
                  display: "flex",
                  gap: 16,
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h1 className="nc0918-title" style={{ margin: 0 }}>
                    {t({ en: "Relationship progress", zh: "关系进展" })}
                  </h1>
                  <div className="nc0918-sub">
                    {t({
                      en: `${total} source-backed contacts grouped for review`,
                      zh: `${total} 位有来源依据的联系人，按关系信号分类`,
                    })}
                  </div>
                </div>
                <div className="nc-readonly">
                  <Icon name="eye" size={16} />
                  {classificationCopy}
                </div>
              </div>

              <div className="nc0918-stats">
                {liveColumns.map((column) => (
                  <div className="nc0918-stat" key={column.value} style={{ background: column.bg }}>
                    <span className="nc0918-stat-icon" style={{ color: column.accent }}>
                      <Icon name={column.icon} size={18} />
                    </span>
                    <strong className="nc0918-stat-n">{column.cards.length}</strong>
                    <span className="nc0918-stat-label">{column.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {suggestedActions.length ? (
              <section className="nc0918-panel">
                <div>
                  <h2 className="nc0918-h2">{t({ en: "Suggested actions", zh: "建议行动" })}</h2>
                  <div className="nc0918-sub">
                    {t({
                      en: "Each suggestion carries its evidence — open the contact to review the source record.",
                      zh: "每条建议都来自联系人的跟进信号与依据，打开联系人可查看来源记录。",
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {suggestedActions.map((contact) => (
                    <a className="nc0918-suggest" href={`/app/contacts/${contact.id}`} key={contact.id}>
                      <span className="nc0918-suggest-icon">
                        <Icon name={contact.dormant ? "refresh" : "arrow"} size={16} />
                      </span>
                      <span className="nc0918-suggest-main">
                        <strong className="nc0918-suggest-title">{contact.displayName}</strong>
                        <span className="nc0918-suggest-desc">{contact.nextAction?.text}</span>
                      </span>
                      <span className="nc0918-suggest-tag">{stageLabelOf(contact)}</span>
                      <Icon color={C0918.text4} name="chevR" size={15} />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="nc0918-panel" style={{ padding: 14 }}>
              {searchInput}
            </section>

            <div className="nc-kanban">
              {liveColumns.map((column) => (
                <section className="nc-kcol" key={column.value} style={{ background: column.bg }}>
                  <header className="nc-kcol-head">
                    <span className="nc-kcol-icon" style={{ color: column.accent }}>
                      <Icon name={column.icon} size={15} />
                    </span>
                    <span className={`nc-cdot ${column.cdot}`} />
                    <span className="nc-clab">{column.label}</span>
                    <span className="nc-ccount">{column.cards.length}</span>
                  </header>
                  <div className="nc-kcol-desc">{t(column.desc)}</div>
                  <div className="nc-kcards">
                    {column.cards.map((contact) => (
                      <PipelineCard contact={contact} key={contact.id} t={t} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="orbit-mobile-only"
        style={{
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          minHeight: "100dvh",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <AccountTopNav active="cards" />
        <div
          className="scroll"
          data-appscroll
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px 16px 36px",
          }}
        >
          <div className="nc-mobile-head">
            <div>
              <h1 className="h-title" style={{ margin: 0 }}>
                {t({ en: "Relationship progress", zh: "关系进展" })}
              </h1>
              <div
                style={{
                  color: "var(--text-3)",
                  fontSize: 13,
                  marginTop: 5,
                }}
              >
                {t({
                  en: `${total} source-backed contacts`,
                  zh: `${total} 位有来源依据的联系人`,
                })}
              </div>
            </div>
          </div>
          <div className="nc-readonly">
            <Icon name="eye" size={16} />
            {classificationCopy}
          </div>
          <div style={{ marginTop: 12 }}>{searchInput}</div>

          {liveColumns.map((column) => (
            <div key={column.value}>
              <div className="nc-mgrp">
                <span className={`nc-cdot ${column.cdot}`} />
                <span className="nc-lab">{column.label}</span>
                <span className="nc-n">{column.cards.length}</span>
              </div>
              <div className="nc-kcards">
                {column.cards.map((contact) => (
                  <PipelineCard contact={contact} key={contact.id} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
