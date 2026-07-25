/**
 * Today 决策收件箱主界面（server component）。
 *
 * 左栏是分组列表，选中态走真实 URL（?entry=），不依赖客户端状态。
 * 右栏决策详情由 Task 2 挂入。
 */
import { Icon } from "../orbit-reference-primitives";
import type {
  AgentLedgerEntry,
} from "../../../../features/agent/ledger/contract";
import type {
  AppTodayRouteViewModel,
  TodaySectionKey,
} from "./compose-app-today-from-agent-ledger/today-route-view-model";

const STATUS_LABELS: Record<AgentLedgerEntry["status"], string> = {
  awaiting_confirmation: "等待确认",
  completed: "已完成",
  deferred: "稍后处理",
  executing: "正在执行",
  failed: "失败",
  partially_failed: "部分失败",
  undone: "已撤销",
};

const SECTION_ICONS: Record<TodaySectionKey, string> = {
  decide: "target",
  prepared: "sparkle",
  recent: "checkCircle",
};

function EntryRow({
  entry,
  selected,
}: {
  entry: AgentLedgerEntry;
  selected: boolean;
}) {
  return (
    <a
      aria-current={selected ? "true" : undefined}
      data-orbit-today-entry={entry.entryId}
      href={`/app/today?entry=${encodeURIComponent(entry.entryId)}`}
      style={{
        alignItems: "center",
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        textDecoration: "none",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "var(--text)",
            fontSize: 15,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.title}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4 }}>
          {entry.organization ?? entry.contactName ?? STATUS_LABELS[entry.status]}
        </div>
      </div>
      <span className="chip" style={{ flexShrink: 0 }}>
        {STATUS_LABELS[entry.status]}
      </span>
      <Icon name="chevR" size={16} />
    </a>
  );
}

export function OrbitRealToday({
  onlyKeys,
  suppressStateBoundary,
  viewModel,
}: {
  /** Render only the listed sections (still in canonical decide/prepared/
   *  recent order). Omit to render all of them — used by the merged Today
   *  page to slot "可复核安排" between the decide section and the
   *  collapsed prepared/recent sections (see today/page.tsx). */
  onlyKeys?: readonly TodaySectionKey[];
  /** The merged page renders this component twice (once per onlyKeys
   *  slice); only the first call should show the failure/empty state
   *  boundary, or the message would repeat twice on the page. */
  suppressStateBoundary?: boolean;
  viewModel: AppTodayRouteViewModel;
}) {
  if (viewModel.state === "failure") {
    if (suppressStateBoundary) return null;

    return (
      <div data-orbit-route="app-today-route-state" style={{ padding: 32 }}>
        <div className="eyebrow">Today</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>账本暂时读不出来</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          {viewModel.failureMessage}
        </p>
      </div>
    );
  }

  if (viewModel.state === "empty") {
    if (suppressStateBoundary) return null;

    return (
      <div data-orbit-route="app-today-route-empty" style={{ padding: 32 }}>
        <div className="eyebrow">Today</div>
        <h1 style={{ fontSize: 22, margin: "8px 0 12px" }}>今天没有需要你决定的事</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          Orbit 会在有新的跟进窗口时把决策放到这里。
        </p>
      </div>
    );
  }

  const sections = onlyKeys
    ? viewModel.sections.filter((section) => onlyKeys.includes(section.key))
    : viewModel.sections;

  if (sections.length === 0) return null;

  return (
    <div data-orbit-today-list style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {sections.map((section) => {
        const heading = (
          <>
            <Icon name={SECTION_ICONS[section.key] ?? "list"} size={16} />
            <span className="eyebrow">{section.title}</span>
            <span
              className="mono"
              style={{ color: "var(--text-3)", fontSize: 12 }}
            >
              {section.entries.length}
            </span>
          </>
        );
        const rows = (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {section.entries.map((entry) => (
              <EntryRow
                entry={entry}
                key={entry.entryId}
                selected={viewModel.selectedEntry?.entryId === entry.entryId}
              />
            ))}
          </div>
        );

        // "需要你决定" stays expanded; "ORBIT 已准备"/"最近完成" default to
        // collapsed (content-priority — completed/queued work shouldn't
        // compete with pending decisions for attention). A native
        // disclosure element needs no client state and adds no hand-rolled
        // toggle button for the button-ratchet gate to worry about.
        if (section.key === "decide") {
          return (
            <section data-orbit-today-section={section.key} key={section.key}>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {heading}
              </div>
              {rows}
            </section>
          );
        }

        return (
          <details data-orbit-today-section={section.key} key={section.key}>
            <summary
              style={{
                alignItems: "center",
                cursor: "pointer",
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {heading}
            </summary>
            {rows}
          </details>
        );
      })}
    </div>
  );
}
