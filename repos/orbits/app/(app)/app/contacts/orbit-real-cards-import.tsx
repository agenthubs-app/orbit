"use client";

import { useState } from "react";

import type { BusinessCardCaptureAvailability } from "../../../../features/acquisition/business-card-capture-availability";
import { AccountTopNav } from "../orbit-account-shell";
import { CrmSidebar as SharedCrmSidebar } from "./orbit-crm-sidebar";
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { BusinessCardBatchEntry } from "./business-card-batch-entry";
import { BusinessCardCaptureWorkspace } from "./business-card-capture-workspace";

type Translate = (copy: { en: string; zh: string }) => string;
type Copy = { en: string; zh: string };

const SOURCES: {
  key: string;
  tile: string;
  icon: string;
  title: Copy;
  desc: Copy;
  trust: "high" | "med" | "low";
  trustLabel: Copy;
  badge?: Copy;
}[] = [
  {
    key: "scan",
    tile: "nc-tl-scan",
    icon: "scan",
    title: { en: "Scan business card", zh: "名片扫描" },
    desc: { en: "Photo or upload · OCR extraction", zh: "拍照或上传，OCR 自动识别" },
    trust: "med",
    trustLabel: { en: "Medium · field review", zh: "可信度 中 · 需逐字段复核" },
    badge: { en: "Active", zh: "当前" },
  },
  {
    key: "qr",
    tile: "nc-tl-qr",
    icon: "qr",
    title: { en: "QR connect", zh: "现场扫码" },
    desc: { en: "Both scan · mutually confirmed", zh: "双方扫码，可信度高" },
    trust: "high",
    trustLabel: { en: "High trust", zh: "可信度 高" },
  },
  {
    key: "event",
    tile: "nc-tl-event",
    icon: "calendar",
    title: { en: "Event attendees", zh: "活动名单导入" },
    desc: { en: "Import attendees · tag relationship state", zh: "导入参会者，区分关系状态" },
    trust: "med",
    trustLabel: { en: "Batch · pending", zh: "批量 · 待确认" },
  },
  {
    key: "contact",
    tile: "nc-tl-contact",
    icon: "user",
    title: { en: "Contacts import", zh: "通讯录导入" },
    desc: { en: "Phone / Google / CSV", zh: "手机 / Google / CSV" },
    trust: "low",
    trustLabel: { en: "Low · needs vetting", zh: "可信度 低 · 需核对" },
  },
  {
    key: "referral",
    tile: "nc-tl-referral",
    icon: "share",
    title: { en: "Referral", zh: "推荐关系" },
    desc: { en: "Requires intermediary consent", zh: "需中间人知情" },
    trust: "med",
    trustLabel: { en: "Consent required", zh: "需知情同意" },
  },
];

const SIDEBAR_GROUPS: {
  label: Copy;
  items: { href: string; icon: string; label: Copy; active?: boolean }[];
}[] = [
  {
    label: { en: "Contacts", zh: "名片夹" },
    items: [
      { href: "/app/contacts", icon: "wallet", label: { en: "All contacts", zh: "全部人脉" } },
      { href: "/app/contacts/pipeline", icon: "list", label: { en: "Pipeline", zh: "跟进管线" } },
      { href: "/app/contacts/dashboard?tab=structure", icon: "users", label: { en: "Network graph", zh: "人脉图谱" } },
      { href: "/app/contacts/dashboard", icon: "grid", label: { en: "Dashboard", zh: "人脉表盘" } },
    ],
  },
  {
    label: { en: "Capture", zh: "采集" },
    items: [
      { href: "/app/contacts/new", icon: "download", label: { en: "Import hub", zh: "导入中心" }, active: true },
      { href: "/app/contacts/new", icon: "scan", label: { en: "Scan card", zh: "扫名片" } },
    ],
  },
];

function Sidebar({ t }: { t: Translate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {SIDEBAR_GROUPS.map((group, groupIndex) => (
        <div key={group.label.en} style={{ marginTop: groupIndex ? 18 : 0 }}>
          <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t(group.label)}</div>
          {group.items.map((item, itemIndex) => {
            const on = Boolean(item.active);
            return (
              <a
                href={item.href}
                key={`${item.label.en}-${itemIndex}`}
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
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SourceCard({
  source,
  selected,
  businessCardAvailability,
  onSelect,
  t,
}: {
  source: (typeof SOURCES)[number];
  selected: boolean;
  businessCardAvailability: BusinessCardCaptureAvailability;
  onSelect: () => void;
  t: Translate;
}) {
  const available =
    source.key === "scan" && businessCardAvailability.available;
  const scanUnavailable = source.key === "scan" && !available;
  const unavailableTitle = scanUnavailable
    ? t({
        en: "Cloud business-card recognition is not configured for this environment.",
        zh: "当前环境尚未配置云端名片识别。",
      })
    : t({
        en: "This source is not connected in the current environment.",
        zh: "当前环境尚未连接这个来源。",
      });

  return (
    <button
      aria-disabled={!available}
      className={`card card-hover nc-source-card${selected ? " is-selected" : ""}`}
      disabled={!available}
      onClick={available ? onSelect : undefined}
      title={available ? undefined : unavailableTitle}
      type="button"
    >
      <span className={`nc-src-tile ${source.tile}`}><Icon name={source.icon} size={22} /></span>
      <span className="nc-source-title-row">
        <span className="h-section nc-source-title">{t(source.title)}</span>
        {source.badge && available ? <span className="nc-src nc-src-scan">{t(source.badge)}</span> : null}
        {!available ? (
          <span className="nc-src nc-src-contact">
            {scanUnavailable
              ? t({ en: "Unavailable", zh: "不可用" })
              : t({ en: "Not connected", zh: "未连接" })}
          </span>
        ) : null}
      </span>
      <span className="nc-source-desc">{t(source.desc)}</span>
      <span className="nc-source-hint">
        <span className={`nc-trust nc-trust-${source.trust}`}><span className="nc-trust-dot" />{t(source.trustLabel)}</span>
      </span>
    </button>
  );
}

/** Orbit_0918 批次 3c：导入说明（静态说明文案，均为真实产品行为描述）。 */
const IMPORT_NOTES: { icon: string; title: Copy; desc: Copy }[] = [
  {
    icon: "lock",
    title: { en: "Draft first, confirm later", zh: "草稿先行，确认后入库" },
    desc: { en: "Every source creates a draft first; nothing is written to your contacts until you confirm.", zh: "所有来源都先生成待确认草稿，确认前不会写入联系人库。" },
  },
  {
    icon: "sparkle",
    title: { en: "Trust levels", zh: "可信度标注" },
    desc: { en: "Each source carries a trust level; OCR-extracted fields need a field-by-field review.", zh: "每个来源都标了可信度等级；OCR 识别结果需要逐字段复核。" },
  },
  {
    icon: "users",
    title: { en: "Batch scanning", zh: "名片批量导入" },
    desc: { en: "Batch card entry lives with the source list; each card is confirmed individually.", zh: "批量名片从左侧入口进入，每张名片单独确认后入库。" },
  },
];

export function OrbitRealCardsImport({
  businessCardAvailability,
}: {
  businessCardAvailability: BusinessCardCaptureAvailability;
}) {
  const { t } = useOrbitLanguage();
  const [selectedSource, setSelectedSource] = useState("scan");

  return (
    <main className="orbit-page" data-orbit-real-page="contacts">
      <OrbitCardsInteractions />
      <style>{LOCAL_STYLE}</style>

      {/* ============ DESKTOP ============ */}
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <SharedCrmSidebar active="import" />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            <div style={{ marginBottom: 22 }}>
              <h1 className="nc0918i-title">{t({ en: "Import hub", zh: "导入中心" })}</h1>
              <div className="nc0918i-sub">
                {t({ en: "Pick a source, or review the scanned card draft", zh: "选择来源，或复核右侧名片扫描草稿" })}
              </div>
            </div>

            <div className="nc-imp-grid">
              {/* LEFT · import methods + real capture flow */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
                <section className="nc0918i-panel">
                  <div>
                    <h2 className="nc0918i-h2">{t({ en: "Choose an import method", zh: "选择导入方式" })}</h2>
                    <p className="nc0918i-desc">{t({ en: "Import contacts from different sources and grow your network faster.", zh: "从不同来源导入联系人，快速扩充你的人脉网络。" })}</p>
                  </div>
                  <div className="nc0918i-methods">
                    {SOURCES.map((source) => (
                      <SourceCard
                        businessCardAvailability={businessCardAvailability}
                        key={source.key}
                        onSelect={() => setSelectedSource(source.key)}
                        selected={selectedSource === source.key}
                        source={source}
                        t={t}
                      />
                    ))}
                  </div>
                  {businessCardAvailability.available ? <BusinessCardBatchEntry /> : null}
                </section>

                {/* real business-card capture and confirmation flow */}
                <BusinessCardCaptureWorkspace
                  availability={businessCardAvailability}
                />
              </div>

              {/* RIGHT · import notes */}
              <aside className="nc0918i-panel">
                <h2 className="nc0918i-h2">{t({ en: "Import notes", zh: "导入说明" })}</h2>
                {IMPORT_NOTES.map((note) => (
                  <div className="nc0918i-note" key={note.title.en}>
                    <span className="nc0918i-note-icon"><Icon name={note.icon} size={15} /></span>
                    <span className="nc0918i-note-body">
                      <strong>{t(note.title)}</strong>
                      <span>{t(note.desc)}</span>
                    </span>
                  </div>
                ))}
              </aside>
            </div>
          </div>
        </div>
      </div>

      {/* ============ MOBILE ============ */}
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, padding: "12px 18px" }}>
          <a aria-label={t({ en: "Back", zh: "返回" })} href="/app/contacts" style={{ color: "var(--text-2)", display: "inline-flex" }}>
            <Icon name="chevL" size={20} />
          </a>
          <div style={{ color: "var(--ink)", fontSize: 16, fontWeight: 600 }}>{t({ en: "Card review", zh: "名片复核" })}</div>
        </div>

        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 40px" }}>
          <BusinessCardCaptureWorkspace
            availability={businessCardAvailability}
          />

          {businessCardAvailability.available ? <BusinessCardBatchEntry /> : null}

          <hr className="nc-divider" style={{ margin: "20px 0 14px" }} />
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="eyebrow">{t({ en: "Other sources", zh: "其他来源" })}</div>
            <Icon name="chevR" size={18} color="var(--text-4)" />
          </div>
          <div className="nc-m-sources">
            {SOURCES.filter((source) => source.key !== "scan").map((source) => (
              <div
                aria-disabled="true"
                className="card"
                key={source.key}
                title={t({
                  en: "This source is not connected in the current environment.",
                  zh: "当前环境尚未连接这个来源。",
                })}
              >
                <span className={`nc-src-tile ${source.tile}`}><Icon name={source.icon} size={17} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--ink)", display: "block", fontSize: 14, fontWeight: 600 }}>{t(source.title)}</span>
                  <span className="nc-source-desc">{t(source.desc)}</span>
                  <span className="nc-source-desc">{t({ en: "Not connected", zh: "未连接" })}</span>
                </span>
                <Icon name="chevR" size={18} color="var(--text-4)" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

const LOCAL_STYLE = `
[data-orbit-real-page] .nc-imp-grid { display: grid; grid-template-columns: minmax(0,2.5fr) minmax(260px,1fr); gap: 24px; align-items: start; }
/* With the 212px sidebar the two-column hub starves the source column on
   tablet-width desktops; stack it before titles get squeezed. */
@media (max-width: 1024px) { [data-orbit-real-page] .nc-imp-grid { grid-template-columns: 1fr; } }
[data-orbit-real-page] .nc-imp-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }

[data-orbit-real-page] .nc-source-card { display: grid; grid-template-columns: 42px 1fr auto; gap: 13px; padding: 13px 14px; align-items: center; width: 100%; text-align: left; cursor: pointer; font-family: var(--ff); color: inherit; }
[data-orbit-real-page] .nc-source-card + .nc-source-card { margin-top: 10px; }
[data-orbit-real-page] .nc-source-card.is-selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-softer); }
[data-orbit-real-page] .nc-source-card:disabled { cursor:not-allowed; opacity:.62; }
[data-orbit-real-page] .nc-src-tile { width: 42px; height: 42px; border-radius: var(--r-sm); display: grid; place-items: center; flex-shrink: 0; }
[data-orbit-real-page] .nc-source-body { min-width: 0; text-align: left; }
/* Badges wrap onto their own line instead of squeezing the title; the title
   itself never breaks between characters, it truncates. */
[data-orbit-real-page] .nc-source-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; min-width: 0; }
[data-orbit-real-page] .nc-source-title { font-size: 15px; min-width: 0; max-width: 100%; white-space: nowrap; word-break: keep-all; overflow: hidden; text-overflow: ellipsis; }
[data-orbit-real-page] .nc-tl-scan { background: var(--accent-soft); color: var(--accent); }
[data-orbit-real-page] .nc-tl-qr { background: var(--sky-soft); color: var(--sky); }
[data-orbit-real-page] .nc-tl-event { background: var(--amber-soft); color: var(--amber); }
[data-orbit-real-page] .nc-tl-contact { background: var(--surface-3); color: var(--text-2); }
[data-orbit-real-page] .nc-tl-referral { background: var(--rose-soft); color: var(--rose); }
[data-orbit-real-page] .nc-source-desc { display: block; font-size: 12.5px; color: var(--text-3); margin-top: 3px; }
[data-orbit-real-page] .nc-source-hint { display: block; margin-top: 8px; }

/* Orbit_0918 批次 3c：导入中心 */
[data-orbit-real-page=contacts] .nc0918i-panel { background:#FFFFFF; border:1px solid #E8E9F6; border-radius:18px; padding:26px; display:flex; flex-direction:column; gap:14px; min-width:0; }
[data-orbit-real-page=contacts] .nc0918i-title { margin:0; font-family:'Noto Serif SC','Songti SC','SimSun',serif; font-weight:900; font-size:26px; line-height:1.15; letter-spacing:-0.02em; color:#0E1225; }
[data-orbit-real-page=contacts] .nc0918i-h2 { margin:0; font-family:'Noto Serif SC','Songti SC','SimSun',serif; font-weight:900; font-size:22px; letter-spacing:-0.02em; color:#0E1225; }
[data-orbit-real-page=contacts] .nc0918i-sub { margin-top:6px; font-size:14px; color:#6B6F99; }
[data-orbit-real-page=contacts] .nc0918i-desc { margin:6px 0 0; font-size:14px; color:#6B6F99; }
[data-orbit-real-page=contacts] .nc0918i-methods { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr)); gap:14px; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-card { display:flex; flex-direction:column; align-items:center; gap:10px; padding:24px 16px 18px; text-align:center; border:1.5px solid #E8E9F6; border-radius:16px; background:#FFFFFF; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-card + .nc-source-card { margin-top:0; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-card.is-selected { border-color:#4B4FC7; box-shadow:0 0 0 3px #ECEEFB; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-src-tile { width:52px; height:52px; border-radius:14px; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-title-row { justify-content:center; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-title { font-size:16px; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-desc { font-size:13px; line-height:1.6; margin-top:0; }
[data-orbit-real-page=contacts] .nc0918i-methods .nc-source-hint { margin-top:4px; }
[data-orbit-real-page=contacts] .nc0918i-note { display:flex; gap:12px; padding:14px; border:1px solid #E8E9F6; border-radius:12px; }
[data-orbit-real-page=contacts] .nc0918i-note-icon { width:36px; height:36px; border-radius:10px; background:#ECEEFB; color:#4B4FC7; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
[data-orbit-real-page=contacts] .nc0918i-note-body { display:flex; flex-direction:column; gap:4px; min-width:0; }
[data-orbit-real-page=contacts] .nc0918i-note-body strong { font-size:14px; color:#0E1225; }
[data-orbit-real-page=contacts] .nc0918i-note-body span { font-size:13px; color:#6B6F99; line-height:1.6; }

[data-orbit-real-page] .nc-trust { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: var(--r-pill); font-size: 11.5px; font-weight: 600; }
[data-orbit-real-page] .nc-trust .nc-trust-dot { width: 6px; height: 6px; border-radius: 50%; }
[data-orbit-real-page] .nc-trust-high { background: var(--live-soft); color: var(--live-text); } [data-orbit-real-page] .nc-trust-high .nc-trust-dot { background: var(--live); }
[data-orbit-real-page] .nc-trust-med { background: var(--amber-soft); color: var(--amber-text); } [data-orbit-real-page] .nc-trust-med .nc-trust-dot { background: var(--amber); }
[data-orbit-real-page] .nc-trust-low { background: var(--surface-3); color: var(--text-3); } [data-orbit-real-page] .nc-trust-low .nc-trust-dot { background: var(--text-3); }

[data-orbit-real-page] .nc-review-panel { padding: 18px; }
[data-orbit-real-page] .nc-rp-top { display: grid; grid-template-columns: 132px 1fr; gap: 16px; align-items: start; }

[data-orbit-real-page] .nc-scanned-card { aspect-ratio: 3.3 / 2; padding: 12px 13px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--surface); }
[data-orbit-real-page] .nc-scanned-card::after { content: ""; position: absolute; right: -20px; top: -20px; width: 70px; height: 70px; border-radius: 50%; background: radial-gradient(circle, var(--accent-softer), transparent 70%); }
[data-orbit-real-page] .nc-scanned-card .sc-name { font-family: var(--ff-display); font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.1; }
[data-orbit-real-page] .nc-scanned-card .sc-role { font-size: 9.5px; color: var(--text-2); margin-top: 2px; }
[data-orbit-real-page] .nc-scanned-card .sc-lines { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page] .nc-scanned-card .sc-lines i { display: block; height: 4px; border-radius: 2px; background: var(--border-2); }
[data-orbit-real-page] .nc-scanned-card .sc-lines i:nth-child(1) { width: 78%; }
[data-orbit-real-page] .nc-scanned-card .sc-lines i:nth-child(2) { width: 60%; }
[data-orbit-real-page] .nc-scanned-card .sc-org { font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 700; }

[data-orbit-real-page] .nc-status-pill { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border-radius: var(--r-pill); font-size: 12.5px; font-weight: 600; }
[data-orbit-real-page] .nc-status-pill .nc-status-dot { width: 7px; height: 7px; border-radius: 50%; }
[data-orbit-real-page] .nc-status-pending { background: var(--amber-soft); color: var(--amber-text); } [data-orbit-real-page] .nc-status-pending .nc-status-dot { background: var(--amber); }

[data-orbit-real-page] .nc-rev { display: grid; grid-template-columns: 92px 1fr auto; align-items: center; gap: 14px; padding: 14px 2px; border-bottom: 1px solid var(--hairline); }
[data-orbit-real-page] .nc-rev:last-of-type { border-bottom: 0; }
[data-orbit-real-page] .nc-rev-k { font-size: 12.5px; color: var(--text-3); font-weight: 500; }
[data-orbit-real-page] .nc-rev-v { display: flex; align-items: center; gap: 9px; min-width: 0; }
[data-orbit-real-page] .nc-rev-v .nc-cdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
[data-orbit-real-page] .nc-rev-input { flex: 1; min-width: 0; background: transparent; border: 0; border-bottom: 1px solid transparent; color: var(--text); font: inherit; font-size: 15px; padding: 4px 2px; border-radius: 0; height: auto; }
[data-orbit-real-page] .nc-rev-input:hover { border-bottom-color: var(--border-2); }
[data-orbit-real-page] .nc-rev-input:focus { outline: none; border-bottom-color: var(--accent); box-shadow: none; }
[data-orbit-real-page] .nc-rev-meta { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
[data-orbit-real-page] .nc-rev-state { font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; background: none; border: 0; cursor: pointer; padding: 0; min-height: 0; }
[data-orbit-real-page] .nc-rev-state.ok { color: var(--text-3); }
[data-orbit-real-page] .nc-rev-state.todo { color: var(--amber-text); }

[data-orbit-real-page] .nc-provenance { font-size: 11.5px; color: var(--text-3); margin-top: 6px; }
[data-orbit-real-page] .nc-confirm-bar { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--hairline); }
[data-orbit-real-page] .nc-confirm-q { font-family: var(--ff-display); font-size: 16px; color: var(--ink); margin: 10px 0 12px; }

[data-orbit-real-page] .nc-note { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-md); background: var(--accent-softer); color: var(--text-2); font-size: 12.5px; line-height: 1.5; }
[data-orbit-real-page] .nc-note-live { background: var(--live-soft); }
[data-orbit-real-page] .nc-field-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-2); margin: 0 0 6px; }
[data-orbit-real-page] .nc-divider { height: 1px; background: var(--hairline); border: 0; }

[data-orbit-real-page] .nc-m-scanned { display: grid; grid-template-columns: 108px 1fr; gap: 12px; align-items: center; margin-bottom: 14px; }
[data-orbit-real-page] .nc-m-review .nc-rev { padding: 10px 2px; }
[data-orbit-real-page] .nc-m-sources > div { color: inherit; display: grid; font: inherit; grid-template-columns: 34px 1fr auto; gap: 11px; align-items: center; opacity: .66; padding: 11px 12px; text-align: left; width: 100%; }
[data-orbit-real-page] .nc-m-sources > div + div { margin-top: 8px; }
[data-orbit-real-page] .nc-m-sources .nc-src-tile { width: 34px; height: 34px; }
`;
