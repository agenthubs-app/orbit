/**
 * 「关系管线」（Network v2 第 173–256 行）。数据 = OrbitContactsViewModel.connections + ContactsAnalysisView。
 * 设计稿的「↗ +25%」与 AI 建议 mock 文案无真实来源，不渲染；建议 = analysis.opportunities.actions 分页（每页 3 条）。
 * W0043：真实数据的判断句为空串（后端 reason 不可信），描述行改显示联系人姓名；到期标签为空时不渲染。
 */
"use client";

import { useMemo, useState } from "react";

import { DemoTag, useDemoMode } from "../../_demo/demo-mode-core";
import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { NETWORK_STAGES, SOURCE_LABEL, STAGE_LABEL, STAGE_STYLE, matchesQuery, stageCounts, toPerson } from "./network-model";
import { useNetworkDemoDetail } from "./network-detail-modal";
import { NetworkChip, NetworkShell } from "./network-shell";

const SUGGEST_PAGE = 3;

export function NetworkPipeline({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  const counts = useMemo(() => stageCounts(people), [people]);
  const columns = NETWORK_STAGES.map((stage) => ({ stage, ...STAGE_STYLE[stage], label: t(STAGE_LABEL[stage]), n: counts[stage], people: people.filter((p) => p.stage === stage && matchesQuery(p, query)) }));
  const pstats = [
    { icon: "◎", n: people.length, label: t({ en: "All contacts", zh: "总联系人" }), bg: "#ECEEFB" },
    ...NETWORK_STAGES.map((stage) => ({ icon: STAGE_STYLE[stage].icon, n: counts[stage], label: t(STAGE_LABEL[stage]), bg: "#F7F7FD" })),
  ];
  const newContacts = analysis.state === "ready" ? String(analysis.metrics.newContacts) : "—";
  // W0043 review：按区块状态渲染——ready／empty 带数据（empty 显示真实空态），pending 显示生成中，unavailable 与整页 error 显示不可用。
  const opportunityState = analysis.state === "ready" ? analysis.opportunities.state : analysis.state;
  const actions = analysis.state === "ready" && "data" in analysis.opportunities ? analysis.opportunities.data.actions : [];
  const pages = Math.max(1, Math.ceil(actions.length / SUGGEST_PAGE));
  // 页码夹取：analysis 重新加载后 actions 变少时 page 可能越界，取模回到有效页。
  const safePage = pages ? page % pages : 0;
  const suggestions = actions.slice(safePage * SUGGEST_PAGE, safePage * SUGGEST_PAGE + SUGGEST_PAGE);
  const dash = "—";
  // W0005 示例模式：卡片名字带「示例」角标，点联系人（含建议里的联系人）在本页弹示例详情。
  const demo = useDemoMode();
  const demoDetail = useNetworkDemoDetail("/app/contacts/pipeline");
  const openDemo = demoDetail.openFromHref;

  return (
    <NetworkShell screen="pipeline" modal={demoDetail.modal}>
      <div className="nw-pipe">
        <div className="nw-pipe-grid">
          <div className="nw-pipe-card">
            <div className="nw-pipe-head">
              <h2 className="nw-h2">{t({ en: "Pipeline overview", zh: "关系管线总览" })}</h2>
              <span className="nw-pipe-new">{t({ en: `${newContacts} new recently`, zh: `最近新增 ${newContacts} 位` })}</span>
            </div>
            <div className="nw-pstat-grid">
              {pstats.map((ps) => (
                <div key={ps.label} className="nw-pstat" style={{ background: ps.bg }}>
                  <span className="nw-pstat-icon">{ps.icon}</span>
                  <strong className="nw-pstat-n">{ps.n}</strong>
                  <span className="nw-pstat-label">{ps.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="nw-ai-card" data-network-section="suggestions">
            <div className="nw-ai-head">
              <div className="nw-ai-title">
                <span className="nw-ai-star">✦</span>
                <div className="nw-card-head">
                  <h2 className="nw-h2">{t({ en: "AI network suggestions", zh: "AI 人脉建议" })}</h2>
                  <span className="nw-ai-desc">{demo
                    ? t({ en: "Demo persona's network analysis: actions recommended from their pipeline and interactions.", zh: "示例人物的人脉分析：根据示例人物的关系管线和互动记录推荐的行动。" })
                    : t({ en: "Actions recommended from your pipeline, interactions and industry signals.", zh: "基于你的关系管线、互动记录和行业动态，为你推荐以下行动。" })}</span>
                </div>
              </div>
              <button type="button" className="btn nw-shuffle" disabled={actions.length === 0} onClick={() => setPage((safePage + 1) % pages)}>{t({ en: "Shuffle ⟳", zh: "换一批 ⟳" })}</button>
            </div>
            {suggestions.length > 0 ? (
              <div className="nw-suggest-list">
                {suggestions.map((sg) => (
                  <a key={sg.id} className="btn nw-suggest" href={sg.primary.href} onClick={(event) => openDemo(event, sg.primary.href)}>
                    <span className="nw-suggest-icon">➶</span>
                    <span className="nw-suggest-copy"><strong className="nw-suggest-title">{demo && sg.contactName ? <>{sg.contactName}<DemoTag /> · </> : null}{sg.title}</strong>{(sg.judgment || (!demo && sg.contactName)) ? <span className="nw-suggest-desc">{sg.judgment || sg.contactName}</span> : null}</span>
                    {sg.dueLabel ? <span className="nw-suggest-tag" style={{ background: "#ECEEFB", color: "#2E3270" }}>{sg.dueLabel}</span> : null}
                    <span className="nw-suggest-arrow">›</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="nw-empty">{opportunityState === "pending"
                ? t({ en: "Analysis in progress", zh: "分析生成中" })
                : opportunityState === "unavailable" || opportunityState === "error"
                ? t({ en: "Source temporarily unavailable", zh: "来源暂时不可用" })
                : t({ en: "No suggestions yet", zh: "暂无建议" })}</div>
            )}
          </div>
        </div>

        <div className="nw-pipe-filters">
          <span className="nw-pipe-filter">{t({ en: "Stage", zh: "阶段" })} <strong className="nw-pipe-filter-v">{t({ en: "All stages", zh: "全部阶段" })}</strong> <span className="nw-pipe-filter-caret">⌄</span></span>
          <span className="nw-pipe-filter">{t({ en: "Source", zh: "来源" })} <strong className="nw-pipe-filter-v">{t({ en: "All sources", zh: "全部来源" })}</strong> <span className="nw-pipe-filter-caret">⌄</span></span>
          <span className="nw-pipe-filter">{t({ en: "Reminders", zh: "提醒" })} <strong className="nw-pipe-filter-v">{t({ en: "All reminders", zh: "全部提醒" })}</strong> <span className="nw-pipe-filter-caret">⌄</span></span>
          <span className="nw-pipe-filter">{t({ en: "Sort", zh: "排序" })} <strong className="nw-pipe-filter-v">{t({ en: "Recent activity", zh: "最近互动" })}</strong> <span className="nw-pipe-filter-caret">⌄</span></span>
          <input className="nw-pipe-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t({ en: "Search name, company or title…", zh: "搜索联系人姓名、公司或职位…" })} />
        </div>

        <div className="nw-kanban">
          {columns.map((col) => (
            <div key={col.stage} className="nw-kanban-col" style={{ background: col.bg }}>
              <div className="nw-kanban-head">
                <div className="nw-kanban-title">
                  <span className="nw-kanban-icon" style={{ color: col.fg }}>{col.icon}</span>
                  <strong className="nw-kanban-label">{col.label}</strong>
                  <strong className="nw-kanban-n" style={{ color: col.fg }}>{col.n}</strong>
                </div>
                <span className="nw-kanban-desc">{t(col.desc)}</span>
              </div>
              {col.people.map((p) => (
                <div key={p.id} className="nw-kanban-card">
                  <div className="nw-kanban-top">
                    <a className="btn nw-kanban-avatar" href={p.href} onClick={(event) => openDemo(event, p.href)}>{p.initial}</a>
                    <a className="btn nw-kanban-who" href={p.href} onClick={(event) => openDemo(event, p.href)}>
                      <strong className="nw-kanban-name">{p.name}{demo ? <DemoTag /> : null}</strong>
                      <span className="nw-kanban-org">{p.orgTitle}</span>
                      <span className="nw-kanban-source">{t(SOURCE_LABEL[p.source])}</span>
                      {p.pendingInit ? <NetworkChip bg="#F0F1F8" fg="#3B3F7A">{t({ en: "Status not set", zh: "待设置关系" })}</NetworkChip> : null}
                    </a>
                    <a className="btn nw-kanban-more" href={p.href} onClick={(event) => openDemo(event, p.href)} title={t({ en: "Log a follow-up", zh: "记录跟进" })}>···</a>
                  </div>
                  <div className="nw-kanban-foot">
                    <span>{t({ en: "Last contact", zh: "上次互动" })} <span className="nw-kanban-v">{p.last || dash}</span></span>
                    <span className="nw-kanban-next">{t({ en: "Next step", zh: "下一步" })} <span className="nw-kanban-v">{p.next || dash}</span></span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </NetworkShell>
  );
}
