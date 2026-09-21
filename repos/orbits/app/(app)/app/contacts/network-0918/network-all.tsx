/** 「所有人脉」（Network v2 第 257–302 行）。数据 = OrbitContactsViewModel.connections。 */
"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { OrbitContactView, OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { NetworkDetailModal } from "./network-detail-modal";
import { NetworkFollowModal } from "./network-follow-modal";
import { NETWORK_SOURCES, SOURCE_ICON, SOURCE_LABEL, STAGE_CHIP, STAGE_LABEL, matchesQuery, sourceCounts, toPerson, type NetworkSource } from "./network-model";
import { NetworkAvatar, NetworkChip, NetworkShell } from "./network-shell";

/** 详情弹窗数据只能来自详情路由（contactDetailPageViewModel），不能用列表 VM 的合成值。 */
export interface NetworkOpenDetail { contact: OrbitContactView; extra?: ReactNode; closeHref: string }

export function NetworkAll({ viewModel, initialSource = "all", openDetail }: { viewModel: OrbitContactsViewModel; initialSource?: NetworkSource | "all"; openDetail?: NetworkOpenDetail }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<NetworkSource | "all">(initialSource);
  const [follow, setFollow] = useState(false);
  const openFollow = useCallback(() => setFollow(true), []);
  const closeFollow = useCallback(() => setFollow(false), []);
  // 保存成功后整页重载：让服务端重新读详情与列表，不做本地假合并。
  const reload = useCallback(() => window.location.reload(), []);
  const modal = openDetail ? (
    follow
      ? <NetworkFollowModal contact={openDetail.contact} onClose={closeFollow} onSaved={reload} />
      : <NetworkDetailModal contact={openDetail.contact} closeHref={openDetail.closeHref} onFollow={openFollow} extra={openDetail.extra} />
  ) : null;
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  const counts = useMemo(() => sourceCounts(people), [people]);
  const filtered = people.filter((p) => matchesQuery(p, query) && (source === "all" || p.source === source));
  const sourceFilterLabel = source === "all" ? t({ en: "All sources", zh: "全部来源" }) : t(SOURCE_LABEL[source]);

  return (
    <NetworkShell screen="all" total={people.length} modal={modal}>
      <div className="nw-card">
        <div className="nw-card-head">
          <h2 className="nw-h2">{t({ en: "All contacts", zh: "所有人脉" })}</h2>
          <span className="nw-card-hint">{t({ en: `${people.length} contacts — manage all of your relationships.`, zh: `共 ${people.length} 位联系人，管理你所有的人脉资源。` })}</span>
        </div>
        <div className="nw-filters">
          <input className="nw-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t({ en: "Search name, company, title or keyword…", zh: "搜索姓名、公司、职位或关键词…" })} />
          <label className="nw-filter-label">{t({ en: "Source", zh: "来源" })}<span className="nw-filter-box">{sourceFilterLabel} <span className="nw-filter-caret">⌄</span></span></label>
          <label className="nw-filter-label">{t({ en: "Status", zh: "关系状态" })}<span className="nw-filter-box">{t({ en: "All statuses", zh: "全部状态" })} <span className="nw-filter-caret">⌄</span></span></label>
          <label className="nw-filter-label">{t({ en: "Industry", zh: "行业" })}<span className="nw-filter-box">{t({ en: "All industries", zh: "全部行业" })} <span className="nw-filter-caret">⌄</span></span></label>
          <label className="nw-filter-label">{t({ en: "Sort", zh: "排序" })}<span className="nw-filter-box">{t({ en: "Recent activity", zh: "最近互动" })} <span className="nw-filter-caret">⌄</span></span></label>
        </div>
        <div className="nw-source-grid">
          {NETWORK_SOURCES.map((key) => {
            const on = source === key;
            return (
              <button key={key} type="button" className="btn nw-source-card" onClick={() => setSource(key)} style={{ background: on ? "#ECEEFB" : "#FFFFFF", borderColor: on ? "#B9BCEB" : "#E8E9F6" }}>
                <span className="nw-source-icon">{SOURCE_ICON[key]}</span>
                <span className="nw-source-copy"><span className="nw-source-label">{t(SOURCE_LABEL[key])}</span><strong className="nw-source-n">{counts[key]}</strong></span>
              </button>
            );
          })}
        </div>
        <div className="nw-table">
          <div className="nw-thead">
            <span className="nw-check"></span><span></span><span>{t({ en: "Name", zh: "姓名" })}</span><span>{t({ en: "Company & title", zh: "公司与职位" })}</span><span>{t({ en: "Source", zh: "来源" })}</span><span>{t({ en: "Status", zh: "关系状态" })}</span><span>{t({ en: "Last contact", zh: "最近互动" })}</span><span>{t({ en: "Next step / notes", zh: "下一步 / 备注" })}</span><span></span>
          </div>
          {filtered.map((p) => (
            <a key={p.id} className="btn nw-row" href={p.href}>
              <span className="nw-check"></span>
              <NetworkAvatar initial={p.initial} />
              <strong className="nw-row-name">{p.name}</strong>
              <span className="nw-row-org"><span className="nw-row-org-1">{p.org}</span><span className="nw-row-org-2">{p.title}</span></span>
              <span><NetworkChip bg="#ECEEFB" fg="#2E3270">{t(SOURCE_LABEL[p.source])}</NetworkChip></span>
              <span><NetworkChip bg={STAGE_CHIP[p.stage].bg} fg={STAGE_CHIP[p.stage].fg}>{p.pendingInit ? t({ en: "Status not set", zh: "待设置关系" }) : t(STAGE_LABEL[p.stage])}</NetworkChip></span>
              <span className="nw-row-last">{p.last}</span>
              <span className="nw-row-next">{p.next}</span>
              <span className="nw-row-arrow">›</span>
            </a>
          ))}
          {filtered.length === 0 ? (
            <div className="nw-empty">{t({ en: "No matching contacts", zh: "没有匹配的联系人" })}</div>
          ) : null}
        </div>
      </div>
    </NetworkShell>
  );
}
