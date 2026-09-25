"use client";
import { useEffect, useRef, useState } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";
import { ContactCardAccessRevoked, fetchContactCardView, type ContactCardRouteView } from "../contact-card-view-model";
import type { NetworkOpenDetail } from "./network-all";
import { NetworkDetailModal } from "./network-detail-modal";
import { NetworkFollowModal } from "./network-follow-modal";
import { NetworkAvatar, NetworkChip, NetworkShell } from "./network-shell";
import { NETWORK_SOURCES, SOURCE_ICON, SOURCE_LABEL, STAGE_CHIP, STAGE_LABEL } from "./network-model";

/** Server-filtered cards. Only the explicit Next action reads a second page. */
export function NetworkCards({ view, openDetail }: { view: ContactCardRouteView; openDetail?: NetworkOpenDetail }) {
  const { t } = useOrbitLanguage();
  const [list, setList] = useState(view.list);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [follow, setFollow] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => { pending.current?.abort(); setList(view.list); setBusy(false); setError(""); setAccessRevoked(false); }, [view]);
  async function next() {
    if (busy || !list.nextPath) return;
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setBusy(true); setError("");
    try {
      const result = await fetchContactCardView(list.nextPath, view.params, controller.signal);
      if (!controller.signal.aborted) setList(result);
    } catch (error) {
      if (!controller.signal.aborted && error instanceof ContactCardAccessRevoked) setAccessRevoked(true);
      if (!controller.signal.aborted) setError(t({ zh: "读取失败，请重试或返回第一页。", en: "Could not load. Retry or return to the first page." }));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const modal = openDetail ? follow
    ? <NetworkFollowModal contact={openDetail.contact} onClose={() => setFollow(false)} onSaved={() => window.location.reload()} />
    : <NetworkDetailModal contact={openDetail.contact} closeHref={openDetail.closeHref} onFollow={() => setFollow(true)} extra={openDetail.extra} /> : null;
  if (accessRevoked) return <NetworkShell screen="all"><p role="alert">{t({ zh: "访问权限已变化，请重新加载页面。", en: "Access changed. Reload this page." })}</p><a href="/app/contacts">{t({ zh: "重新加载", en: "Reload" })}</a></NetworkShell>;
  return <NetworkShell screen="all" modal={modal}>
    <div className="nw-card">
      <div className="nw-card-head"><h2 className="nw-h2">{t({ zh: "所有人脉", en: "All contacts" })}</h2>
        <span className="nw-card-hint">{t({ zh: `匹配 ${view.total} 位联系人 · 当前页 ${list.items.length} 位`, en: `${view.total} matching contacts · ${list.items.length} on this page` })}</span></div>
      <form className="nw-filters" action="/app/contacts" method="get">
        <input className="nw-search" name="query" defaultValue={view.query} aria-label={t({ zh: "搜索联系人", en: "Search contacts" })} placeholder={t({ zh: "搜索姓名、公司、职位或关键词…", en: "Search name, company, title or keyword…" })} />
        <select name="sourceGroup" defaultValue={view.source} aria-label={t({ zh: "来源", en: "Source" })}>{NETWORK_SOURCES.map(source => <option key={source} value={source}>{t(SOURCE_LABEL[source])}</option>)}</select>
        <button type="submit" className="btn">{t({ zh: "搜索", en: "Search" })}</button>
      </form>
      <div className="nw-source-grid">{NETWORK_SOURCES.map(source => <a key={source} className="btn nw-source-card" href={`/app/contacts?${new URLSearchParams({ query: view.query, sourceGroup: source })}`} style={{ background: source === view.source ? "#ECEEFB" : "#FFFFFF" }}>
        <span className="nw-source-icon">{SOURCE_ICON[source]}</span><span className="nw-source-copy"><span className="nw-source-label">{t(SOURCE_LABEL[source])}</span><strong className="nw-source-n">{view.counts[source]}</strong></span>
      </a>)}</div>
      <div className="nw-table"><div className="nw-thead"><span></span><span></span><span>{t({ zh: "姓名", en: "Name" })}</span><span>{t({ zh: "公司与职位", en: "Company & title" })}</span><span>{t({ zh: "来源", en: "Source" })}</span><span>{t({ zh: "关系状态", en: "Status" })}</span><span></span><span>{t({ zh: "下一步（预览）", en: "Next step (preview)" })}</span><span></span></div>
        {list.items.map(p => <a key={p.id} className="btn nw-row" href={p.href}><span></span><NetworkAvatar initial={p.initial} /><strong className="nw-row-name">{p.name}</strong>
          <span className="nw-row-org"><span className="nw-row-org-1">{p.org}</span><span className="nw-row-org-2">{p.title}</span></span>
          <span><NetworkChip bg="#ECEEFB" fg="#2E3270">{t(SOURCE_LABEL[p.source])}</NetworkChip></span>
          <span><NetworkChip bg={STAGE_CHIP[p.stage].bg} fg={STAGE_CHIP[p.stage].fg}>{p.pending ? t({ zh: "待设置关系", en: "Status not set" }) : t(STAGE_LABEL[p.stage])}</NetworkChip></span>
          <span></span><span className="nw-row-next">{p.next}</span><span className="nw-row-arrow">›</span></a>)}
        {!list.items.length && <div className="nw-empty">{t({ zh: "没有匹配的联系人", en: "No matching contacts" })}</div>}
      </div>
      <div className="nw-filters"><a href={`/app/contacts?${new URLSearchParams({ query: view.query, sourceGroup: view.source })}`}>{t({ zh: "返回第一页", en: "First page" })}</a>
        {list.nextPath && <button className="btn" type="button" disabled={busy} onClick={() => void next()}>{t({ zh: busy ? "读取中…" : "下一页", en: busy ? "Loading…" : "Next page" })}</button>}
        {error && <span role="alert">{error}</span>}</div>
    </div>
  </NetworkShell>;
}
