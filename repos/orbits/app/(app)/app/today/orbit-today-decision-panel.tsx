/**
 * Today 决策详情面板（server component）。
 *
 * 回答设计稿的三个问题：为什么现在出现 / 建议基于什么信息 / 确认后将会发生什么。
 * 只有 awaiting_confirmation 与 deferred 的条目才渲染写入口。
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

export function OrbitTodayDecisionPanel({
  entry,
}: {
  entry: AgentLedgerEntry | null;
}) {
  if (!entry) {
    return (
      <aside className="card" data-orbit-today-panel="empty" style={{ padding: 22 }}>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          选择左侧任一条目查看决策详情。
        </p>
      </aside>
    );
  }

  const editable =
    entry.status === "awaiting_confirmation" || entry.status === "deferred";

  return (
    <aside className="card" data-orbit-today-panel={entry.entryId} style={{ display: "flex", flexDirection: "column", gap: 18, padding: 22 }}>
      <div>
        <div className="eyebrow">决策详情</div>
        <h2 style={{ fontSize: 20, margin: "8px 0 0" }}>{entry.title}</h2>
      </div>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 6px" }}>
          为什么现在出现?
        </h3>
        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          {entry.whyNow}
        </p>
      </section>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }}>
          建议基于什么信息?
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.evidenceChips.map((chip) => (
            <span className="chip" key={chip.evidenceId} style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
              <Icon name={EVIDENCE_ICONS[chip.kind] ?? "doc"} size={13} />
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 8px" }}>
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
          borderRadius: 12,
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
    </aside>
  );
}
