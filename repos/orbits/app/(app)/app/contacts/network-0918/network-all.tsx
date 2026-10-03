/**
 * 「所有人脉」（Network v2 第 257–302 行）。数据 = OrbitContactsViewModel.connections。
 * W0005 示例模式：每行名字旁带「示例」角标，点行在本页打开示例详情（`useNetworkDemoDetail`）。
 */
"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DemoTag, useDemoMode } from "../../_demo/demo-mode-core";
import type { OrbitContactView, OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { NetworkDetailModal, useNetworkDemoDetail } from "./network-detail-modal";
import { NetworkFollowModal } from "./network-follow-modal";
import { NETWORK_SOURCES, SOURCE_ICON, SOURCE_LABEL, TIER_CHIP, TIER_LABEL, TIER_STYLE, matchesQuery, sourceCounts, tierFromStrength, toPerson, type NetworkSource, type NetworkTierGroup } from "./network-model";
import { NetworkAvatar, NetworkChip, NetworkShell } from "./network-shell";

/** 详情弹窗数据只能来自详情路由（contactDetailPageViewModel），不能用列表 VM 的合成值。 */
export interface NetworkOpenDetail { contact: OrbitContactView; extra?: ReactNode; closeHref: string; /** W0051：「和你目标的关系」面板（服务端读好的洞察）。 */ insight?: ReactNode }

export function NetworkAll({ viewModel, initialSource = "all", openDetail }: { viewModel: OrbitContactsViewModel; initialSource?: NetworkSource | "all"; openDetail?: NetworkOpenDetail }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<NetworkSource | "all">(initialSource);
  const [follow, setFollow] = useState(false);
  const openFollow = useCallback(() => setFollow(true), []);
  const closeFollow = useCallback(() => setFollow(false), []);
  // 保存成功后整页重载：让服务端重新读详情与列表，不做本地假合并。
  const reload = useCallback(() => window.location.reload(), []);
  const demo = useDemoMode();
  const demoDetail = useNetworkDemoDetail("/app/contacts");
  const modal = openDetail ? (
    follow
      ? <NetworkFollowModal contact={openDetail.contact} onClose={closeFollow} onSaved={reload} />
      : <NetworkDetailModal contact={openDetail.contact} closeHref={openDetail.closeHref} onFollow={openFollow} extra={openDetail.extra} insight={openDetail.insight} />
  ) : demoDetail.modal;
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  // W0055：「关系档位」列读自动推出的档位（W0047），不再显示旧手动阶段。
  const tiers = useMemo(() => new Map<string, NetworkTierGroup | null>(viewModel.connections.map((contact) => [contact.id, tierFromStrength(contact.strength)])), [viewModel.connections]);
  const counts = useMemo(() => sourceCounts(people), [people]);
  const filtered = people.filter((p) => matchesQuery(p, query) && (source === "all" || p.source === source));

  return (
    <NetworkShell screen="all" modal={modal}>
      <div className="nw-card">
        <div className="nw-card-head">
          <h2 className="nw-h2">{t({ en: "All contacts", zh: "所有人脉" })}</h2>
          <span className="nw-card-hint">{t({ en: `${people.length} contacts — manage all of your relationships.`, zh: `共 ${people.length} 位联系人，管理你所有的人脉资源。` })}</span>
        </div>
        {/* W0055：只留能改变列表的筛选（搜索框 + 下面的来源卡片）；原来四个只显示文字、点不动的筛选框已删除。 */}
        <div className="nw-filters">
          <input className="nw-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t({ en: "Search name, company, title or keyword…", zh: "搜索姓名、公司、职位或关键词…" })} />
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
            <span className="nw-check"></span><span></span><span>{t({ en: "Name", zh: "姓名" })}</span><span>{t({ en: "Company & title", zh: "公司与职位" })}</span><span>{t({ en: "Source", zh: "来源" })}</span><span>{t({ en: "Tier", zh: "关系档位" })}</span><span>{t({ en: "Last contact", zh: "最近互动" })}</span><span>{t({ en: "Next step / notes", zh: "下一步 / 备注" })}</span><span></span>
          </div>
          {filtered.map((p) => (
            <a key={p.id} className="btn nw-row" href={p.href} onClick={(event) => demoDetail.openFromHref(event, p.href)}>
              <span className="nw-check"></span>
              <NetworkAvatar initial={p.initial} />
              <strong className="nw-row-name">{p.name}{demo ? <DemoTag /> : null}</strong>
              <span className="nw-row-org"><span className="nw-row-org-1">{p.org}</span><span className="nw-row-org-2">{p.title}</span></span>
              <span><NetworkChip bg="#ECEEFB" fg="#2E3270">{t(SOURCE_LABEL[p.source])}</NetworkChip></span>
              {(() => {
                const tier = tiers.get(p.id) ?? null;
                return <span data-network-tier={tier ?? "unscored"}>{tier
                  ? <NetworkChip bg={TIER_CHIP[tier].bg} fg={TIER_CHIP[tier].fg}><span className="nw-tier-dot" aria-hidden="true" style={{ background: TIER_STYLE[tier].fg }}></span>{t(TIER_LABEL[tier])}</NetworkChip>
                  : <NetworkChip bg="#F7F7FD" fg="#6B6F99">{t({ zh: "未评估", en: "Not scored" })}</NetworkChip>}</span>;
              })()}
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
