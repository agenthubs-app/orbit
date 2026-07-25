/**
 * Today 决策详情内容（server component）。
 *
 * 回答设计稿的三个问题：为什么现在出现 / 建议基于什么信息 / 确认后将会发生什么。
 * 只有 awaiting_confirmation 与 deferred 的条目才渲染写入口。
 *
 * T2（today-schedule 合并 P2）之前，这里是右栏常驻的详情面板：一个独立的
 * `<aside className="card">`，entry 为 null 时渲染"选择左侧任一条目"的空态。
 * 现在决策卡改成原位展开的 accordion（见 orbit-real-today.tsx 的
 * `DecisionEntryCard`），不再有常驻面板、也不再有"未选中"的空态——这个组件
 * 只保留*内容本身*（三个问题 + 证据 chip + 护栏文案 + 表单），供展开体内嵌
 * 渲染；外层卡片的边框/圆角/内边距和标题都由 accordion 容器负责，避免和
 * 折叠态已经显示的标题重复。
 */
import { Icon } from "../orbit-reference-primitives";
import type { AgentLedgerEntry } from "../../../../features/agent/ledger/contract";
import { OrbitTodayDecisionForm } from "./orbit-today-decision-form";

const EVIDENCE_ICONS: Record<string, string> = {
  calendar_signal: "calendar",
  chat_summary: "message",
  contact_note: "doc",
  event_material: "doc",
};

export function OrbitTodayDecisionPanelBody({
  entry,
}: {
  entry: AgentLedgerEntry;
}) {
  const editable =
    entry.status === "awaiting_confirmation" || entry.status === "deferred";

  return (
    <div data-orbit-today-panel={entry.entryId} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
          为什么现在出现?
        </h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {entry.whyNow}
        </p>
      </section>

      <section>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
          建议基于什么信息?
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.evidenceChips.map((chip) => (
            <span className="chip" key={chip.evidenceId} style={{ alignItems: "center", display: "inline-flex", gap: 4 }}>
              <Icon name={EVIDENCE_ICONS[chip.kind] ?? "doc"} size={13} />
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>
          确认后将会
        </h3>
        <ul style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          {entry.operations.map((operation) => (
            <li key={operation.operationId}>{operation.title}</li>
          ))}
        </ul>
      </section>

      <p
        style={{
          background: "var(--accent-soft)",
          borderRadius: "var(--r-sm)",
          color: "var(--text-2)",
          fontSize: 13,
          lineHeight: 1.6,
          margin: 0,
          padding: "12px 14px",
        }}
      >
        消息只保存为草稿，不会自动发送。所有写操作可随时在 All actions 中撤销。
      </p>

      {editable ? (
        <OrbitTodayDecisionForm entryId={entry.entryId} operations={entry.operations} />
      ) : null}
    </div>
  );
}
