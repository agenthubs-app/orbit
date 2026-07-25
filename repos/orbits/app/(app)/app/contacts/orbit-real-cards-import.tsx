"use client";

import { useState } from "react";

import { AccountTopNav } from "../orbit-account-shell";
import { CrmSidebar as SharedCrmSidebar } from "./orbit-crm-sidebar";
import { OrbitCardsInteractions } from "./orbit-cards-interactions";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
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
      { href: "/app/contacts/graph", icon: "users", label: { en: "Network graph", zh: "人脉图谱" } },
      { href: "/app/contacts/intros", icon: "share", label: { en: "Introductions", zh: "引荐记录" } },
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
  onSelect,
  t,
}: {
  source: (typeof SOURCES)[number];
  selected: boolean;
  onSelect: () => void;
  t: Translate;
}) {
  return (
    <button
      className={`card card-hover nc-source-card${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`nc-src-tile ${source.tile}`}><Icon name={source.icon} size={20} /></span>
      <span style={{ minWidth: 0, textAlign: "left" }}>
        <span style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <span className="h-section" style={{ fontSize: 15 }}>{t(source.title)}</span>
          {source.badge ? <span className="nc-src nc-src-scan">{t(source.badge)}</span> : null}
        </span>
        <span className="nc-source-desc">{t(source.desc)}</span>
        <span className="nc-source-hint">
          <span className={`nc-trust nc-trust-${source.trust}`}><span className="nc-trust-dot" />{t(source.trustLabel)}</span>
        </span>
      </span>
      <Icon name="chevR" size={20} color={selected ? "var(--accent)" : "var(--text-4)"} />
    </button>
  );
}

export function OrbitRealCardsImport() {
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
              <h1 className="h-display" style={{ margin: "0" }}>{t({ en: "Import hub", zh: "导入中心" })}</h1>
              <div style={{ color: "var(--text-3)", fontSize: 14, marginTop: 6 }}>
                {t({ en: "Pick a source, or review the scanned card draft", zh: "选择来源，或复核右侧名片扫描草稿" })}
              </div>
            </div>

            <div className="nc-imp-grid">
              {/* LEFT · source entries */}
              <section>
                <div className="nc-imp-h">
                  <div>
                    <div className="eyebrow">{t({ en: "Add contacts", zh: "来源入口" })}</div>
                    <div className="h-section" style={{ marginTop: 4 }}>{t({ en: "Where from?", zh: "从哪里导入？" })}</div>
                  </div>
                </div>

                {SOURCES.map((source) => (
                  <SourceCard
                    key={source.key}
                    onSelect={() => setSelectedSource(source.key)}
                    selected={selectedSource === source.key}
                    source={source}
                    t={t}
                  />
                ))}

                <div className="nc-note" style={{ marginTop: 16 }}>
                  <Icon name="lock" size={16} color="var(--accent)" />
                  <span>{t({
                    en: "Every source creates a draft first; nothing is written to your contacts until you confirm.",
                    zh: "所有来源先生成待确认 contact draft，确认前不写入联系人库。",
                  })}</span>
                </div>
              </section>

              {/* RIGHT · real business-card capture and confirmation flow */}
              <BusinessCardCaptureWorkspace />
            </div>
          </div>
        </div>
      </div>

      {/* ============ MOBILE ============ */}
      <div className="orbit-mobile-only" style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, padding: "12px 18px" }}>
          <a aria-label={t({ en: "Back", zh: "返回" })} href="/app/contacts/new" style={{ color: "var(--text-2)", display: "inline-flex" }}>
            <Icon name="chevL" size={20} />
          </a>
          <div style={{ color: "var(--ink)", fontSize: 16, fontWeight: 600 }}>{t({ en: "Card review", zh: "名片复核" })}</div>
        </div>

        <div className="scroll" data-appscroll style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 40px" }}>
          <BusinessCardCaptureWorkspace />

          <hr className="nc-divider" style={{ margin: "20px 0 14px" }} />
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="eyebrow">{t({ en: "Other sources", zh: "其他来源" })}</div>
            <Icon name="chevR" size={18} color="var(--text-4)" />
          </div>
          <div className="nc-m-sources">
            {SOURCES.filter((source) => source.key !== "scan").map((source) => (
              <a className="card card-hover" href="/app/contacts/new" key={source.key}>
                <span className={`nc-src-tile ${source.tile}`}><Icon name={source.icon} size={17} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--ink)", display: "block", fontSize: 14, fontWeight: 600 }}>{t(source.title)}</span>
                  <span className="nc-source-desc">{t(source.desc)}</span>
                </span>
                <Icon name="chevR" size={18} color="var(--text-4)" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

const LOCAL_STYLE = `
[data-orbit-real-page] .nc-imp-grid { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 24px; align-items: start; }
[data-orbit-real-page] .nc-imp-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }

[data-orbit-real-page] .nc-source-card { display: grid; grid-template-columns: 42px 1fr auto; gap: 13px; padding: 13px 14px; align-items: center; width: 100%; text-align: left; cursor: pointer; font-family: var(--ff); color: inherit; }
[data-orbit-real-page] .nc-source-card + .nc-source-card { margin-top: 10px; }
[data-orbit-real-page] .nc-source-card.is-selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-softer); }
[data-orbit-real-page] .nc-src-tile { width: 42px; height: 42px; border-radius: var(--r-sm); display: grid; place-items: center; flex-shrink: 0; }
[data-orbit-real-page] .nc-tl-scan { background: var(--accent-soft); color: var(--accent); }
[data-orbit-real-page] .nc-tl-qr { background: var(--sky-soft); color: var(--sky); }
[data-orbit-real-page] .nc-tl-event { background: var(--amber-soft); color: var(--amber); }
[data-orbit-real-page] .nc-tl-contact { background: var(--surface-3); color: var(--text-2); }
[data-orbit-real-page] .nc-tl-referral { background: var(--rose-soft); color: var(--rose); }
[data-orbit-real-page] .nc-source-desc { display: block; font-size: 12.5px; color: var(--text-3); margin-top: 3px; }
[data-orbit-real-page] .nc-source-hint { display: block; margin-top: 8px; }

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
[data-orbit-real-page] .nc-m-sources a { display: grid; grid-template-columns: 34px 1fr auto; gap: 11px; align-items: center; padding: 11px 12px; text-decoration: none; color: inherit; }
[data-orbit-real-page] .nc-m-sources a + a { margin-top: 8px; }
[data-orbit-real-page] .nc-m-sources .nc-src-tile { width: 34px; height: 34px; }
`;
