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
import { Basis, SourceBadge } from "./orbit-real-contacts";

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
  to_contact: "nc-cdot-amber",
  in_progress: "nc-cdot-sky",
  partnered: "nc-cdot-live",
};

const LOCAL_STYLES = `
[data-orbit-real-page="contacts-pipeline"] .nc-readonly { display:flex; align-items:center; gap:7px; max-width:520px; padding:9px 12px; border-radius:var(--r-md); background:var(--surface-2); border:1px solid var(--hairline); color:var(--text-3); font-size:12.5px; line-height:1.4; }
[data-orbit-real-page="contacts-pipeline"] .nc-readonly svg { color:var(--accent); flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kanban { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; align-items:start; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol { background:var(--surface-2); border:1px solid var(--hairline); border-radius:var(--r-md); padding:12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head { display:flex; align-items:center; gap:8px; padding:2px 4px 12px; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-cdot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-clab { font-size:13.5px; font-weight:700; color:var(--ink); }
[data-orbit-real-page="contacts-pipeline"] .nc-kcol-head .nc-ccount { margin-left:auto; font-family:var(--ff-mono); font-size:12px; color:var(--text-2); background:var(--surface-3); border-radius:var(--r-pill); padding:2px 9px; }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-amber { background:var(--amber); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-sky { background:var(--sky); }
[data-orbit-real-page="contacts-pipeline"] .nc-cdot-live { background:var(--live); }
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
`;

export function OrbitRealCardsPipelineView({
  viewModel,
}: {
  viewModel: OrbitContactsViewModel;
}) {
  const { t } = useOrbitLanguage();
  const liveColumns = viewModel.pipelineStatuses.map((status) => ({
    cdot: cdotByStatus[status.value],
    cards: viewModel.connections.filter(
      (contact) => contact.pipelineStatus === status.value,
    ),
    label: status.label,
    value: status.value,
  }));
  const total = liveColumns.reduce(
    (sum, column) => sum + column.cards.length,
    0,
  );
  const classificationCopy = t({
    en: "Read-only grouping from follow-up signals and relationship-value evidence. Open a contact to review its source records.",
    zh: "只读分类，依据跟进信号与关系价值证据生成。打开联系人可查看来源记录。",
  });

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
            <div
              style={{
                alignItems: "flex-end",
                display: "flex",
                gap: 16,
                justifyContent: "space-between",
                marginBottom: 22,
              }}
            >
              <div>
                <h1 className="h-display" style={{ margin: 0 }}>
                  {t({ en: "Pipeline", zh: "跟进管线" })}
                </h1>
                <div
                  style={{
                    color: "var(--text-3)",
                    fontSize: 14,
                    marginTop: 6,
                  }}
                >
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

            <div className="nc-kanban">
              {liveColumns.map((column) => (
                <section className="nc-kcol" key={column.value}>
                  <header className="nc-kcol-head">
                    <span className={`nc-cdot ${column.cdot}`} />
                    <span className="nc-clab">{column.label}</span>
                    <span className="nc-ccount">{column.cards.length}</span>
                  </header>
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
                {t({ en: "Pipeline", zh: "跟进管线" })}
              </h1>
              <div
                style={{
                  color: "var(--text-3)",
                  fontSize: 12.5,
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
