"use client";

import { useState } from "react";

/**
 * 权限与通知设置区。
 *
 * 目前只有界面与本地交互：agent autonomy settings contract 还没有安静时段字段，
 * 接线属于后续计划，所以这里明确告诉用户改动尚未保存。
 */
function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        display: "flex",
        gap: 12,
        padding: "14px 0",
      }}
    >
      <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>{label}</span>
      {/* globals.css 给裸 input 设了 width:100% + min-height，checkbox 必须显式覆盖。 */}
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ flexShrink: 0, height: 16, minHeight: 0, padding: 0, width: 16 }}
        type="checkbox"
      />
    </label>
  );
}

export function OrbitAllActionsSettings() {
  const [autoNotes, setAutoNotes] = useState(true);
  const [postEventReminders, setPostEventReminders] = useState(true);

  return (
    <section data-orbit-all-actions-settings style={{ marginTop: 36 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        权限与通知
      </div>
      <p style={{ color: "var(--text-3)", fontSize: 12.5, margin: "0 0 8px" }}>
        改动尚未保存 —— 设置的持久化会随 agent settings 一起接入。
      </p>

      <ToggleRow
        checked={autoNotes}
        label="自动准备会面笔记"
        onChange={setAutoNotes}
      />
      <ToggleRow
        checked={postEventReminders}
        label="活动后推送跟进提醒"
        onChange={setPostEventReminders}
      />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          padding: "14px 0",
        }}
      >
        <span style={{ color: "var(--text)", flex: 1, fontSize: 14 }}>安静时段</span>
        <span className="mono" style={{ color: "var(--text-2)", fontSize: 13 }}>
          22:00 – 08:00
        </span>
      </div>
    </section>
  );
}
