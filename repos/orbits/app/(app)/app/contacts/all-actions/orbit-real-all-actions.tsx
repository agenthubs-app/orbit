/**
 * All actions（操作账本）主界面（server component）。
 *
 * 每一次写操作都记录在这里，可追溯、可撤销。筛选走真实 URL（?status=）。
 */
import type { AgentLedgerEntry } from "../../../../../features/agent/ledger/contract";
import type { AppAllActionsRouteViewModel } from "./compose-app-all-actions-from-agent-ledger/all-actions-route-view-model";
import { OrbitAllActionsControls } from "./orbit-all-actions-controls";
import { OrbitCopyDraftButton } from "./orbit-copy-draft-button";
import { OrbitEditDraftButton } from "./orbit-edit-draft-button";

/**
 * UI-audit fix C3. `entry.riskLevel` is an internal enum ("write", "read", …)
 * and was rendered verbatim as "风险：write" — an English machine token inside
 * a Chinese sentence, in the one screen whose whole purpose is telling a user
 * what an agent did on their behalf. Unmapped values still fall through to the
 * raw string rather than being hidden, so a new risk level is visible (and
 * obviously untranslated) instead of silently disappearing.
 */
const RISK_LABELS: Record<string, string> = {
  read: "只读",
  draft: "草稿",
  external: "外部写入",
  send: "对外发送",
  write: "写入",
};

const STATUS_LABELS: Record<AgentLedgerEntry["status"], string> = {
  approved: "已确认",
  awaiting_confirmation: "等待确认",
  canceled: "已取消",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  rejected: "已忽略",
  undone: "已撤销",
};

function textFromPayload(
  payload: Readonly<Record<string, unknown>> | undefined,
  field: string,
): string | null {
  const value = payload?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function entryHref(input: {
  activeFilter: AppAllActionsRouteViewModel["activeFilter"];
  entryId?: string;
}): string {
  const params = new URLSearchParams();
  if (input.activeFilter !== "all") params.set("status", input.activeFilter);
  if (input.entryId) params.set("entry", input.entryId);
  const query = params.toString();
  return `/app/contacts/all-actions${query ? `?${query}` : ""}`;
}

function EntryRow({
  activeFilter,
  entry,
  expanded,
}: {
  activeFilter: AppAllActionsRouteViewModel["activeFilter"];
  entry: AgentLedgerEntry;
  expanded: boolean;
}) {
  const sourceLabels = entry.sourceRefs.map((ref) => ref.label).join("、");
  const updatedLabel = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(entry.updatedAt));

  return (
    <li
      className={`orbit-all-actions-entry${expanded ? " is-expanded" : ""}`}
      data-orbit-all-actions-entry={entry.entryId}
      data-orbit-all-actions-entry-expanded={expanded ? "true" : "false"}
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 0",
      }}
    >
      <div className="orbit-all-actions-entry-title" style={{ flex: 1, minWidth: 0 }}>
        <a
          aria-expanded={expanded}
          className="orbit-all-actions-entry-title-text"
          href={entryHref({
            activeFilter,
            entryId: expanded ? undefined : entry.entryId,
          })}
          style={{
            color: "var(--text)",
            display: "inline-block",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {entry.title}
        </a>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 3 }}>
          来源：{sourceLabels}
        </div>
        <div style={{ color: "var(--text-4)", fontSize: 12, marginTop: 3 }}>
          {entry.workflowKey ? `工作流：${entry.workflowKey} · ` : ""}
          {entry.runId ? `Run：${entry.runId} · ` : ""}
          风险：{RISK_LABELS[entry.riskLevel ?? "write"] ?? entry.riskLevel} · 更新：{updatedLabel}
        </div>
      </div>
      <div className="orbit-all-actions-entry-controls">
        <OrbitAllActionsControls
          canCancel={entry.status === "approved"}
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
      {expanded ? (
        <div
          className="orbit-all-actions-entry-detail"
          data-orbit-all-actions-audit-detail
        >
          {entry.preview ? (
            <section>
              <h3>内容预览</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{entry.preview}</p>
            </section>
          ) : null}
          <section>
            <h3>为什么出现</h3>
            <p>{entry.whyNow}</p>
          </section>
          <section>
            <h3>实际操作</h3>
            <ul>
              {entry.operations.map((operation) => {
                const draftText =
                  operation.operationType === "save_message_draft"
                    ? operation.draftPreview ??
                      textFromPayload(operation.payload, "draftText") ??
                      operation.preview ??
                      null
                    : null;
                return (
                  <li key={operation.operationId}>
                    <strong>{operation.title}</strong>
                    <span>
                      {operation.effectSummary} · 状态：
                      {operation.status === "succeeded"
                        ? "成功"
                        : operation.status === "failed"
                          ? "失败"
                          : operation.status === "skipped"
                            ? "已跳过"
                            : operation.status === "undone"
                              ? "已撤销"
                              : "待处理"}
                    </span>
                    {operation.preview ? (
                      <span style={{ whiteSpace: "pre-wrap" }}>
                        {operation.preview}
                      </span>
                    ) : null}
                    <code>
                      Operation：{operation.operationId}
                      {"\n"}Executor：{operation.executorKey ?? "—"}
                      {"\n"}Idempotency：{operation.idempotencyKey}
                    </code>
                    {draftText ? (
                      <span
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        <OrbitCopyDraftButton text={draftText} />
                        <OrbitEditDraftButton
                          body={draftText}
                          organization={entry.organization}
                          recipient={entry.contactName}
                          subject={entry.title}
                        />
                        <small>只复制或继续编辑，不会自动发送。</small>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
          <section>
            <h3>证据与追踪</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {entry.evidenceChips.map((chip) => (
                <span className="chip" key={chip.evidenceId}>
                  {chip.label} · {chip.evidenceId}
                </span>
              ))}
            </div>
            <code>
              Action：{entry.entryId}
              {"\n"}Run：{entry.runId ?? "—"}
              {"\n"}Payload hash：{entry.immutablePayloadHash ?? "—"}
            </code>
          </section>
        </div>
      ) : null}
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
        <div className="eyebrow">操作账本</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>账本暂时读不出来</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>{viewModel.failureMessage}</p>
      </div>
    );
  }

  if (viewModel.state === "empty") {
    return (
      <div data-orbit-route="app-all-actions-route-empty">
        <div className="eyebrow">人脉</div>
        <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>操作账本</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, margin: 0 }}>
          账本还没有任何操作记录。Orbit 执行的每一次写操作都会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div data-orbit-all-actions>
      <div className="eyebrow">人脉</div>
      <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>操作账本</h1>
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
            <EntryRow
              activeFilter={viewModel.activeFilter}
              entry={entry}
              expanded={viewModel.selectedEntryId === entry.entryId}
              key={entry.entryId}
            />
          ))}
        </ul>
      )}
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
          flex-wrap: wrap;
          gap: 12px;
        }
        .orbit-all-actions-entry-detail {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          box-sizing: border-box;
          display: grid;
          flex-basis: 100%;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr);
          min-width: 0;
          padding: 16px;
          width: 100%;
        }
        .orbit-all-actions-entry-detail h3 {
          font-size: 13px;
          margin: 0 0 6px;
        }
        .orbit-all-actions-entry-detail p {
          color: var(--text-2);
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
        }
        .orbit-all-actions-entry-detail ul {
          display: grid;
          gap: 12px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .orbit-all-actions-entry-detail li {
          border-top: 1px solid var(--border);
          display: grid;
          gap: 4px;
          padding-top: 10px;
        }
        .orbit-all-actions-entry-detail li:first-child {
          border-top: 0;
          padding-top: 0;
        }
        .orbit-all-actions-entry-detail span,
        .orbit-all-actions-entry-detail small {
          color: var(--text-3);
          font-size: 12px;
          line-height: 1.5;
        }
        .orbit-all-actions-entry-detail code {
          color: var(--text-4);
          display: block;
          font-size: 10px;
          margin-top: 6px;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }
        .orbit-all-actions-entry-detail .chip {
          max-width: 100%;
          overflow-wrap: anywhere;
          white-space: normal;
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
          .orbit-all-actions-entry-detail {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
