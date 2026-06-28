"use client";

import { useState } from "react";

import type { OrbitPlatformViewModel } from "../orbit-admin-platform-route-view-model";
import { Cover, Icon } from "../orbit-reference-primitives";

function navigateTo(path: string) {
  window.location.href = path;
}

function PlatformStat({ s }: { s: OrbitPlatformViewModel["platformStats"][number] }) {
  return (
    <div className="card orbit-platform-stat">
      <div className={`orbit-platform-stat-icon tone-${s.tone}`}><Icon name={s.icon} size={18} /></div>
      <div className="orbit-platform-stat-value">{s.value}</div>
      <div className="orbit-platform-stat-label">{s.label}</div>
      <div className="orbit-platform-stat-note">{s.note}</div>
    </div>
  );
}

export function OrbitRealPlatform({ viewModel }: { viewModel: OrbitPlatformViewModel }) {
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState(viewModel.reviewQueue);
  const [selId, setSelId] = useState(viewModel.reviewQueue[0]?.id ?? "");
  const [toast, setToast] = useState("");
  const [view, setView] = useState("overview");
  const sel = queue.find((record) => record.id === selId) || queue[0] || null;
  const nav: Array<[string, string, string, number | null]> = [["overview", "grid", "平台总览", null], ["review", "checkCircle", "活动审核", queue.length], ["accounts", "building", "账号管理", null]];
  const accounts = viewModel.orgAccounts.filter((account) => !query.trim() || account.name.includes(query) || account.owner.includes(query));

  function decide(id: string, ok: boolean) {
    setQueue((current) => {
      const next = current.filter((record) => record.id !== id);
      if (next.length && !next.find((record) => record.id === selId)) setSelId(next[0].id);
      return next;
    });
    setToast(ok ? "已批准并通知主办方" : "已驳回并发送说明");
    window.setTimeout(() => setToast(""), 1800);
  }

  return (
    <div className="orbit-platform-page" data-orbit-real-page>
      <aside className="orbit-platform-sidebar">
        <div className="orbit-platform-brand"><span className="orbit-platform-logo" /><div><div className="orbit-platform-brand-name">Orbit</div><div className="orbit-platform-brand-sub">产品平台后台</div></div></div>
        <nav className="orbit-platform-nav">{nav.map(([key, icon, label, count]) => <button className={`orbit-platform-nav-item${view === key ? " is-active" : ""}`} key={key} onClick={() => setView(key)} type="button"><Icon name={icon} size={18} /><span>{label}</span>{count != null ? <span className="orbit-platform-count">{count}</span> : null}</button>)}</nav>
        <div className="orbit-platform-footer"><span className="avatar g-slate" style={{ fontSize: 13, height: 32, width: 32 }}>A</span><div><div className="orbit-platform-footer-title">Admin</div><div className="orbit-platform-footer-sub">平台管理员</div></div></div>
        <button className="orbit-host-exit" onClick={() => navigateTo("/app")} style={{ color: "#8f8cb4", marginTop: 10 }} type="button"><Icon name="logout" size={16} />退出</button>
      </aside>

      {view === "review" ? (
        <div className="orbit-platform-main">
          {toast ? <div className="orbit-platform-error" style={{ background: "var(--live-soft)", color: "var(--live)" }}>{toast}</div> : null}
          {queue.length === 0 ? (
            <div className="orbit-platform-empty-detail"><div className="orbit-platform-lock"><Icon name="checkCircle" size={22} /></div><h2>审核队列已清空</h2><p>当前没有待审核的活动。</p></div>
          ) : (
            <div className="orbit-platform-review">
              <div className="orbit-platform-review-list">
                <div className="orbit-platform-review-title"><h1 className="h-display">活动审核</h1><p>{queue.length} 个待审核活动</p></div>
                <div className="orbit-platform-review-items">{queue.map((record) => <button className={`orbit-platform-review-item${sel && sel.id === record.id ? " is-active" : ""}`} key={record.id} onClick={() => setSelId(record.id)} type="button"><Cover g={record.g} monogram={{ text: record.letter, size: 18 }} style={{ borderRadius: 11, flexShrink: 0, height: 46, width: 46 }} /><span><strong>{record.name}</strong><small>{record.org} · {record.submitted}</small><em>待审核</em></span></button>)}</div>
              </div>
              <div className="orbit-platform-review-detail">
                {sel ? (
                  <>
                    <Cover className="orbit-platform-hero" g={sel.g} style={{ position: "relative" }}><div><span>{sel.org}</span><h2>{sel.name}</h2></div></Cover>
                    <div className="orbit-platform-facts">{sel.facts.map(([label, value]) => <div className="card-flat" key={label}><Icon name="grid" size={17} /><strong>{value}</strong><span>{label}</span></div>)}</div>
                    <div className="h-section" style={{ fontSize: 16 }}>活动说明</div>
                    <p className="orbit-platform-description">{sel.desc}</p>
                    <div className="orbit-platform-flag-list">{sel.flags.map((flag) => <span className="chip orbit-platform-risk" key={flag}>{flag}</span>)}</div>
                    <div className="card orbit-platform-reject" style={{ marginTop: 18 }}><div className="orbit-platform-reject-head"><Icon color="var(--rose)" name="x" size={16} /><strong>驳回理由</strong><span>（驳回时发送给主办方）</span></div><textarea className="field" placeholder="说明需要补充或修改的内容…" /></div>
                    <div className="orbit-platform-actions"><button className="btn btn-ghost orbit-platform-danger" onClick={() => decide(sel.id, false)} style={{ border: "none", color: "#fff" }} type="button"><Icon color="#fff" name="x" size={16} />驳回</button><button className="btn btn-primary" onClick={() => decide(sel.id, true)} type="button"><Icon color="#fff" name="check" size={16} />批准并发布</button></div>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="orbit-platform-main"><div className="orbit-platform-scroll" data-appscroll><div className="orbit-platform-content">
          {view === "overview" ? (
            <>
              <div className="orbit-platform-header"><h1 className="h-display">平台总览</h1><p>整个平台的主办方、活动与用户健康度</p></div>
              <div className="orbit-platform-stats">{viewModel.platformStats.map((stat) => <PlatformStat key={stat.label} s={stat} />)}</div>
              <div className="orbit-platform-overview-grid">
                <div className="card orbit-platform-panel"><div className="orbit-platform-panel-head"><h2 className="h-section">待审核活动</h2><button className="btn btn-ghost btn-sm" onClick={() => setView("review")} type="button">全部<Icon name="chevR" size={14} /></button></div><div className="orbit-platform-mini-list">{viewModel.reviewQueue.map((record) => <button className="orbit-platform-mini-row" key={record.id} onClick={() => { setView("review"); setSelId(record.id); }} type="button"><Cover g={record.g} monogram={{ text: record.letter, size: 16 }} style={{ borderRadius: 10, flexShrink: 0, height: 40, width: 40 }} /><div className="orbit-platform-mini-copy"><span>{record.name}</span><small>{record.org} · {record.submitted}</small></div><span className="badge badge-soon" style={{ height: 22 }}>待审</span></button>)}</div></div>
                <div className="card orbit-platform-panel"><div className="orbit-platform-panel-head"><h2 className="h-section">主办方账号</h2><button className="btn btn-ghost btn-sm" onClick={() => setView("accounts")} type="button">全部<Icon name="chevR" size={14} /></button></div><div className="orbit-platform-mini-list">{viewModel.orgAccounts.slice(0, 4).map((account) => <div className="orbit-platform-organizer-mini" key={account.name}><span className={`avatar ${account.g}`} style={{ fontSize: 16, height: 40, width: 40 }}>{account.letter}</span><span><strong>{account.name}</strong><small>{account.events} 场活动 · {account.owner}</small></span>{account.status === "已认证" ? <span className="badge badge-live" style={{ height: 22 }}>已认证</span> : <span className="badge badge-soon" style={{ height: 22 }}>待审</span>}</div>)}</div></div>
              </div>
            </>
          ) : (
            <>
              <div className="orbit-platform-header"><div className="orbit-platform-header-row"><div><h1 className="h-display">账号管理</h1><p>{viewModel.orgAccounts.length} 个主办方账号</p></div><div className="orbit-platform-search"><Icon color="var(--text-3)" name="search" size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索主办方 / 邮箱" value={query} /></div></div></div>
              <div className="card orbit-platform-table"><div className="orbit-platform-table-head"><span>主办方</span><span>负责人</span><span>活动</span><span>状态</span><span>操作</span></div>{accounts.map((account) => <div className="orbit-platform-table-row" key={account.name}><div className="orbit-platform-account-cell"><span className={`avatar ${account.g}`} style={{ flexShrink: 0, fontSize: 15, height: 38, width: 38 }}>{account.letter}</span><span><strong>{account.name}</strong></span></div><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.owner}</span><span>{account.events} 场</span><span>{account.status === "已认证" ? <span className="badge badge-live" style={{ height: 22 }}>已认证</span> : <span className="badge badge-soon" style={{ height: 22 }}>待审</span>}</span><span><button className="btn btn-ghost btn-sm" type="button"><Icon name="more" size={16} /></button></span></div>)}</div>
            </>
          )}
        </div></div></div>
      )}
    </div>
  );
}
