/**
 * 签到屏（Orbit_0918 运营台 checkin 屏，设计 253–298 行；`/operations/check-in`）：消费 `useCheckInRoster(event.id)`。
 * 卡片：未签到（总数 − 已签到）/ 已签到 / 说明卡（「签到失败」无持久态 → 省略，审阅修订 11）；
 * 表格：设计五列 → 三列（姓名 / 状态 / 操作；「公司 / 职位」「票种 / 分组」无来源）；行 = roster items；
 * 「标记到场」→ `markArrived(item)`；已签到禁用；`pendingParticipantIds` 中 → 禁用 +「处理中…」；
 * 全局 `error` → 表头上方错误条 + 「重试」= `loadRoster()`；`notice`（含 409 时间窗口文案）→ 提示条原样。
 * 「刷新名单」（设计无；旧名单的手动刷新保留）= `loadRoster()`，置于筛选段旁，样式取设计 232 行 ghost 按钮。
 * 搜索框 placeholder 改「搜索姓名或参会者编号…」：设计文案承诺公司 / 职位，签到名单无此来源（偏差）。
 * 右栏「最新签到」= `checkedInAt` 倒序前 5（`org` 无来源 → 省略第二行）；「查看全部 →」= 切筛选到「已签到」。
 */
"use client";

import { useState } from "react";

import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  CHECKIN_BUTTON_TONE,
  CHECKIN_FILTER_TONE,
  CHECKIN_FILTERS,
  CHECKIN_STATUS_CHIP,
  checkInClock,
  checkinCounts,
  filterRoster,
  latestCheckIns,
  peopleAvatarBg,
  type CheckinFilter,
} from "./ops-model";
import { useCheckInRoster } from "./use-check-in-roster";

export function OpsCheckin({ event }: { event: EventOperationsPageEvent }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CheckinFilter>("pending");
  const { error, loadRoster, loading, markArrived, notice, pendingParticipantIds, roster } = useCheckInRoster(event.id);
  const items = roster?.participants ?? [];
  const counts = checkinCounts(items);
  const visible = filterRoster(items, filter, query);
  const latest = latestCheckIns(items);

  return (
    <div className="op-screen" data-ops-screen="checkin">
      <div className="op-cstats">
        {roster ? (
          <>
            <div className="op-cstat"><span className="op-cstat-ico">◷</span><span className="op-stat-copy"><span className="op-stat-label">未签到</span><strong className="op-cstat-n" data-ops-stat="pending">{counts.pending}</strong></span></div>
            <div className="op-cstat"><span className="op-cstat-ico op-cstat-ico-green">✓</span><span className="op-stat-copy"><span className="op-stat-label">已签到</span><strong className="op-cstat-n" data-ops-stat="checked">{counts.checked}</strong></span></div>
          </>
        ) : null}
        <div className="op-cnote"><span className="op-cnote-ico">ⓘ</span><span className="op-cnote-copy"><strong className="op-cnote-title">此页面仅显示签到所需信息</strong><span className="op-cnote-sub">重复签到将自动拦截</span></span></div>
      </div>

      <div className="op-cgrid">
        <section className="op-ctable">
          <div className="op-cbar">
            <span className="op-csearch">
              <span className="op-search-icon">⌕</span>
              <input
                aria-label="按姓名搜索参会者"
                className="op-search-input"
                onChange={(input) => setQuery(input.target.value)}
                placeholder="搜索姓名或参会者编号…"
                value={query}
              />
            </span>
            <span className="op-cbar-tools">
            <span aria-label="签到状态筛选" className="op-cfilters" role="group">
              {CHECKIN_FILTERS.map((item) => {
                const on = item.key === filter;
                const tone = on ? CHECKIN_FILTER_TONE.on : CHECKIN_FILTER_TONE.off;
                return (
                  <button
                    aria-pressed={on}
                    className="btn op-cfilter"
                    data-ops-filter={item.key}
                    key={item.key}
                    onClick={() => setFilter(item.key)}
                    style={{ background: tone.bg, color: tone.color, fontWeight: tone.weight }}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </span>
            <button className="btn op-crefresh" data-ops-refresh disabled={loading} onClick={() => void loadRoster()} type="button">刷新名单</button>
            </span>
          </div>

          {/* 空壳会在 flex 列里占一个 gap（像素比对表头下移 16px），故只在有提示时渲染 */}
          {notice ? <div aria-live="polite" className="op-notice" role="status">{notice}</div> : null}
          {error ? (
            <div className="op-alert op-alert-row" role="alert">
              <strong>{error}</strong>
              <button className="btn op-btn-sm op-ghost" onClick={() => void loadRoster()} type="button">重试</button>
            </div>
          ) : null}
          {loading && !roster ? <div aria-label="正在加载签到名单" className="op-empty">正在加载签到名单…</div> : null}

          <div className="op-chead">
            <span>姓名</span><span>状态</span><span className="op-chead-center">操作</span>
          </div>
          {roster && visible.length === 0 ? <p className="op-empty" role="status">没有匹配的参会者。换一个姓名试试，或清空筛选。</p> : null}
          {visible.map((participant, index) => {
            const busy = pendingParticipantIds.has(participant.participantId);
            const chip = participant.checkedIn ? CHECKIN_STATUS_CHIP.done : CHECKIN_STATUS_CHIP.pending;
            const tone = participant.checkedIn ? CHECKIN_BUTTON_TONE.done : CHECKIN_BUTTON_TONE.arrive;
            return (
              <div aria-busy={busy} className="op-crow" data-ops-row={participant.participantId} key={participant.participantId}>
                <span className="op-cperson">
                  <span aria-hidden="true" className="op-cava" data-ops-avatar style={{ background: peopleAvatarBg(index) }}>{participant.displayName.slice(0, 1)}</span>
                  <strong className="op-cname" title={participant.participantId}>{participant.displayName}</strong>
                </span>
                <span className="op-cchip" data-ops-chip={participant.participantId} style={{ background: chip.bg, color: chip.color }}>● {chip.label}</span>
                <button
                  aria-label={participant.checkedIn ? `${participant.displayName} 已签到` : `将 ${participant.displayName} 标记为已签到`}
                  className="btn op-cact"
                  data-ops-arrive={participant.participantId}
                  disabled={participant.checkedIn || busy}
                  onClick={() => void markArrived(participant)}
                  style={{ background: tone.bg, borderColor: tone.border, color: tone.color, cursor: busy ? "default" : tone.cursor }}
                  type="button"
                >
                  {participant.checkedIn ? "已签到" : busy ? "处理中…" : "标记到场"}
                </button>
              </div>
            );
          })}
        </section>

        <section className="op-clatest">
          <span className="op-clatest-head">
            <strong className="op-clatest-title">最新签到</strong>
            <button className="btn op-clatest-all" onClick={() => setFilter("done")} type="button">查看全部 →</button>
          </span>
          {roster && latest.length === 0 ? <span className="op-empty">尚无签到记录。</span> : null}
          {latest.map((participant) => (
            <span className="op-litem" data-ops-latest={participant.participantId} key={participant.participantId}>
              <span className="op-lava">{participant.displayName.slice(0, 1)}</span>
              <span className="op-lcopy"><strong className="op-lname">{participant.displayName}</strong></span>
              <span className="op-ltime">{checkInClock(participant.checkedInAt)}</span>
            </span>
          ))}
        </section>
      </div>
    </div>
  );
}
