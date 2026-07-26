"use client";

/**
 * 合并页页头的两个全局动作：安排约见 / 添加来源。
 *
 * "安排约见" 复用 today/orbit-today-time-spine.tsx 里搬运来的 AddScheduleModal
 * ——弹窗内容和旧日历页完全一样，只是触发按钮从左栏挪到了页头（design doc §2）。
 *
 * 移动端（≤760，design doc §3）："安排约见" 页头按钮隐藏，换成右下角 FAB——
 * 拇指区更好够到。两个触发器共享同一个 addOpen state / 同一个弹窗，只是显示
 * 由 CSS 媒体查询切换（同 orbit-today-time-spine.tsx 的
 * .orbit-time-spine-desktop-calendar/.orbit-week-strip 那套模式）。FAB 复用
 * bare "btn" token（不追加 btn-* 变体）只是为了不把 sitewide 的非 .btn
 * 按钮元素计数顶破上限（orbit-button-ratchet.test.ts 已经在 129 的天花板
 * 上）——视觉完全由 .orbit-today-fab 覆盖 .btn 的默认盒模型。
 */
import { useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitScheduleConnectionView } from "../orbit-schedule-route-view-model";
import { Icon } from "../orbit-reference-primitives";
import { ORBIT_Z } from "../orbit-z";
import { AddScheduleModal } from "./orbit-today-time-spine";

export function OrbitTodayHeaderActions({
  connections,
}: {
  connections: OrbitScheduleConnectionView[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { t } = useOrbitLanguage();
  const scheduleLabel = t({ en: "Schedule a meeting", zh: "安排约见" });

  return (
    <div style={{ display: "flex", flexShrink: 0, gap: 8 }}>
      <button
        className="btn btn-primary orbit-today-header-schedule-btn"
        onClick={() => setAddOpen(true)}
        type="button"
      >
        <Icon color="var(--on-dark)" name="plus" size={16} />
        {scheduleLabel}
      </button>
      <a className="btn btn-ghost" href="/app/contacts/new">
        <Icon name="plus" size={16} />
        {t({ en: "Add a source", zh: "添加来源" })}
      </a>
      <button
        aria-label={scheduleLabel}
        className="btn orbit-today-fab"
        onClick={() => setAddOpen(true)}
        type="button"
      >
        <Icon color="var(--on-dark)" name="plus" size={22} />
      </button>
      {addOpen ? (
        <AddScheduleModal connections={connections} onClose={() => setAddOpen(false)} t={t} />
      ) : null}
      <style>{`
        /* Both rules are compound (attr + 2 classes) so they beat the base
           [data-orbit-real-page] .btn rule's specificity (attr + 1 class) —
           a single-class override here would silently lose to .btn's own
           display:inline-flex regardless of source order or media query. */
        [data-orbit-real-page] .btn.orbit-today-fab { display: none; }
        @media (max-width: 760px) {
          [data-orbit-real-page] .btn.orbit-today-header-schedule-btn { display: none; }
          [data-orbit-real-page] .btn.orbit-today-fab {
            align-items: center;
            background: var(--accent);
            border: none;
            border-radius: var(--r-pill);
            bottom: 18px;
            box-shadow: var(--sh-pop);
            display: flex;
            height: 56px;
            justify-content: center;
            padding: 0;
            position: fixed;
            right: 18px;
            width: 56px;
            z-index: ${ORBIT_Z.sticky};
          }
        }
      `}</style>
    </div>
  );
}
