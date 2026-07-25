/**
 * All actions（操作账本）主界面（server component）。
 *
 * 每一次写操作都记录在这里，可追溯、可撤销。筛选走真实 URL（?status=）。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { AppAllActionsRouteViewModel } from "./compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitAllActionsControls } from "./orbit-all-actions-controls";
import { OrbitAllActionsSettings } from "./orbit-all-actions-settings";

const STATUS_LABELS: Record<AgentLedgerEntry["status"], string> = {
  awaiting_confirmation: "等待确认",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  undone: "已撤销",
};

function EntryRow({ entry }: { entry: AgentLedgerEntry }) {
  const sourceLabels = entry.sourceRefs.map((ref) => ref.label).join("、");

  return (
    <li
      className="orbit-all-actions-entry"
      data-orbit-all-actions-entry={entry.entryId}
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 0",
      }}
    >
      <div className="orbit-all-actions-entry-title" style={{ flex: 1, minWidth: 0 }}>
        <div
          className="orbit-all-actions-entry-title-text"
          style={{ color: "var(--text)", fontSize: 15, fontWeight: 600 }}
        >
          {entry.title}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 3 }}>
          来源：{sourceLabels}
        </div>
      </div>
      <div className="orbit-all-actions-entry-controls">
        <OrbitAllActionsControls
          canRetry={entry.status === "partially_failed" || entry.status === "failed"}
          canUndo={
            entry.undoable &&
            (entry.status === "completed" || entry.status === "partially_failed")
          }
          entryId={entry.entryId}
        />
      </div>
      <span className="chip orbit-all-actions-entry-status" style={{ flexShrink: 0 }}>
        {STATUS_LABELS[entry.status]}
      </span>
    </li>
  );
}

export function OrbitRealAllActions({
  viewModel,
}: {
  viewModel: AppAllActionsRouteViewModel;
}) {
  if (viewModel.state === "failure") {
    return (
      <div data-orbit-route="app-all-actions-route-state">
        <div className="eyebrow">All actions</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>账本暂时读不出来</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>{viewModel.failureMessage}</p>
      </div>
    );
  }

  if (viewModel.state === "empty") {
    return (
      <div data-orbit-route="app-all-actions-route-empty">
        <div className="eyebrow">人脉</div>
        <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>All actions</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          账本还没有任何操作记录。Orbit 执行的每一次写操作都会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div data-orbit-all-actions>
      <div className="eyebrow">人脉</div>
      <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>All actions</h1>
      <p style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 20px" }}>
        每一次写操作都记录在这里，可追溯、可撤销。
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {viewModel.filters.map((filter) => (
          <a
            aria-current={filter.active ? "true" : undefined}
            data-orbit-all-actions-filter={filter.key}
            href={
              filter.key === "all"
                ? "/app/contacts/all-actions"
                : `/app/contacts/all-actions?status=${filter.key}`
            }
            key={filter.key}
            style={{
              background: filter.active ? "var(--text)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
              color: filter.active ? "var(--surface)" : "var(--text-2)",
              fontSize: 13,
              padding: "6px 14px",
              textDecoration: "none",
            }}
          >
            {filter.label} {filter.count}
          </a>
        ))}
      </div>

      {viewModel.entries.length === 0 ? (
        <p
          data-orbit-all-actions-no-match
          style={{ color: "var(--text-3)", fontSize: 14, padding: "28px 0" }}
        >
          该状态下没有记录。
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {viewModel.entries.map((entry) => (
            <EntryRow entry={entry} key={entry.entryId} />
          ))}
        </ul>
      )}
      <OrbitAllActionsSettings />
      {/* Mobile audit P1: rows with two action buttons (重试失败项 + 撤销)
          squeezed the title down to ~1ch and it stacked one character per
          line. Desktop keeps the original single flex row (base rule below
          matches the inline styles it replaces); at <=760px the row becomes
          two lines — title+chip, then actions — via a scoped class instead
          of inline styles so the media query can actually win (an inline
          style on the <li> would out-specificity any external override). */}
      <style>{`
        .orbit-all-actions-entry {
          align-items: center;
          display: flex;
          gap: 12px;
        }
        @media (max-width: 760px) {
          .orbit-all-actions-entry {
            align-items: flex-start;
            display: grid;
            grid-template-areas: "title status" "actions actions";
            grid-template-columns: 1fr auto;
            row-gap: 8px;
          }
          .orbit-all-actions-entry-title {
            grid-area: title;
          }
          .orbit-all-actions-entry-title-text {
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            display: -webkit-box;
            overflow: hidden;
          }
          .orbit-all-actions-entry-status {
            grid-area: status;
            justify-self: end;
          }
          .orbit-all-actions-entry-controls {
            display: flex;
            gap: 8px;
            grid-area: actions;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
