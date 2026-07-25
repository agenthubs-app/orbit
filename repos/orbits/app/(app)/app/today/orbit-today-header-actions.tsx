"use client";

/**
 * 合并页页头的两个全局动作：安排约见 / 添加来源。
 *
 * "安排约见" 复用 today/orbit-today-time-spine.tsx 里搬运来的 AddScheduleModal
 * ——弹窗内容和旧日历页完全一样，只是触发按钮从左栏挪到了页头（design doc §2）。
 */
import { useState } from "react";

import { useOrbitLanguage } from "../orbit-language-context";
import type { OrbitScheduleConnectionView } from "../orbit-schedule-route-view-model";
import { Icon } from "../orbit-reference-primitives";
import { AddScheduleModal } from "./orbit-today-time-spine";

export function OrbitTodayHeaderActions({
  connections,
}: {
  connections: OrbitScheduleConnectionView[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { t } = useOrbitLanguage();

  return (
    <div style={{ display: "flex", flexShrink: 0, gap: 8 }}>
      <button className="btn btn-primary" onClick={() => setAddOpen(true)} type="button">
        <Icon color="var(--on-dark)" name="plus" size={16} />
        {t({ en: "Schedule a meeting", zh: "安排约见" })}
      </button>
      <a className="btn btn-ghost" href="/app/contacts/new">
        <Icon name="plus" size={16} />
        {t({ en: "Add a source", zh: "添加来源" })}
      </a>
      {addOpen ? (
        <AddScheduleModal connections={connections} onClose={() => setAddOpen(false)} t={t} />
      ) : null}
    </div>
  );
}
