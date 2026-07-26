/**
 * Today 决策收件箱主界面（server component）。
 *
 * 左栏是分组列表，选中态走真实 URL（?entry=）——不依赖客户端状态。
 *
 * T2（today-schedule 合并 P2）之前，点一张卡只是把它标记成"当前选中"，详情
 * 渲染在右栏常驻的 `OrbitTodayDecisionPanel` 里。现在改成原位展开的
 * accordion：`DecisionEntryCard` 收起时长得和原来的 `EntryRow`一模一样，
 * 展开时把 `OrbitTodayDecisionPanelBody`（原面板的全部内容——为什么现在出现/
 * 证据 chip/确认后将会/草稿内联编辑/护栏文案）内嵌渲染在卡片里，一次只展开
 * 一张（`?entry=` 驱动，见 today-merged-view-model.ts 的 requestedEntryId）。
 */
import { Icon } from "../orbit-reference-primitives";
import type {
  AgentLedgerEntry,
} from "../../../../features/agent/ledger/contract";
import type {
  AppTodayRouteViewModel,
  TodaySectionKey,
} from "./compose-app-today-from-agent-ledger/today-route-view-model";
import { OrbitTodayDecisionPanelBody } from "./orbit-today-decision-panel";
import { OrbitTodayEscapeToCollapse } from "./orbit-today-escape-to-collapse";
import { OrbitTodayItemOpened } from "./orbit-today-item-opened";

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

const SECTION_ICONS: Record<TodaySectionKey, string> = {
  decide: "target",
  prepared: "sparkle",
  recent: "checkCircle",
};

/**
 * 合并当前保留的查询参数（?date=/?view=，见 page.tsx 的 preserveParams）和
 * 这张卡自己的覆盖值（?entry= 或者删除它），拼出 /app/today 的完整 href。
 * 这是 T1 review 里点出的问题的修复：旧版 EntryRow 硬编码
 * `/app/today?entry=...`，点开一张决策卡会把当前选中的日期/月视图丢掉。
 */
function buildTodayHref(
  preserveParams: Readonly<Record<string, string>>,
  overrides: Readonly<Record<string, string | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(preserveParams)) {
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return `/app/today${query ? `?${query}` : ""}`;
}

/**
 * 一张决策卡：收起态是原来 EntryRow 的样子（标题+机构/联系人/状态文案+状态
 * chip+箭头）；展开态在同一张卡片内追加 `OrbitTodayDecisionPanelBody` 的全部
 * 内容。展开与收起都是纯 URL 导航（点头部整行），不依赖任何客户端 state。
 */
function DecisionEntryCard({
  entry,
  expanded,
  preserveParams,
}: {
  entry: AgentLedgerEntry;
  expanded: boolean;
  preserveParams: Readonly<Record<string, string>>;
}) {
  const href = buildTodayHref(
    preserveParams,
    expanded ? { entry: undefined } : { entry: entry.entryId },
  );

  return (
    <div
      className={`orbit-today-card${expanded ? " is-expanded" : ""}`}
      data-orbit-today-entry={entry.entryId}
      data-orbit-today-entry-expanded={expanded ? "true" : "false"}
    >
      <a
        aria-current={expanded ? "true" : undefined}
        aria-expanded={expanded}
        className="orbit-today-card-head"
        href={href}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="orbit-today-card-title">{entry.title}</div>
          <div className="orbit-today-card-subtitle">
            {entry.organization ?? entry.contactName ?? STATUS_LABELS[entry.status]}
          </div>
        </div>
        <span className="chip" style={{ flexShrink: 0 }}>
          {STATUS_LABELS[entry.status]}
        </span>
        <Icon name={expanded ? "chevD" : "chevR"} size={16} />
      </a>
      {expanded ? (
        <div className="orbit-today-card-body-wrap">
          <div className="orbit-today-card-body">
            <OrbitTodayItemOpened actionId={entry.entryId} />
            <OrbitTodayDecisionPanelBody entry={entry} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OrbitRealToday({
  expandedEntryId,
  onlyKeys,
  preserveParams,
  suppressStateBoundary,
  viewModel,
}: {
  /** The entry currently expanded via `?entry=` — raw request param, not the
   *  route view-model's `selectedEntry` (which defaults to the first decide
   *  entry even with no `?entry=`, a default kept only for the legacy
   *  view-model contract/tests). Accordion expansion must stay literally
   *  absent when the URL has no `?entry=` (design doc §2, T2 requirement). */
  expandedEntryId?: string | null;
  /** Render only the listed sections (still in canonical decide/prepared/
   *  recent order). Omit to render all of them — used by the merged Today
   *  page to slot "可复核安排" between the decide section and the
   *  collapsed prepared/recent sections (see today/page.tsx). */
  onlyKeys?: readonly TodaySectionKey[];
  /** ?date=/?view= from the current request, merged into every entry link
   *  so opening/closing a decision card never drops the selected calendar
   *  day or day|month view. */
  preserveParams?: Readonly<Record<string, string>>;
  /** The merged page renders this component twice (once per onlyKeys
   *  slice); only the first call should show the failure/empty state
   *  boundary, or the message would repeat twice on the page. */
  suppressStateBoundary?: boolean;
  viewModel: AppTodayRouteViewModel;
}) {
  const params = preserveParams ?? {};

  if (viewModel.state === "failure") {
    if (suppressStateBoundary) return null;

    return (
      <div className="card" data-orbit-route="app-today-route-state" style={{ padding: 20 }}>
        <div className="eyebrow">需要你决定</div>
        <h2 style={{ fontSize: 18, margin: "8px 0 8px" }}>决策账本暂时不可用</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          {viewModel.failureMessage}
        </p>
      </div>
    );
  }

  if (viewModel.state === "empty") {
    if (suppressStateBoundary) return null;

    return (
      <div className="card" data-orbit-route="app-today-route-empty" style={{ padding: 20 }}>
        <div className="eyebrow">需要你决定</div>
        <h2 style={{ fontSize: 18, margin: "8px 0 8px" }}>今天没有需要你决定的事</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Orbit 会在有新的跟进窗口时把决策放到这里。
        </p>
      </div>
    );
  }

  const sections = onlyKeys
    ? viewModel.sections.filter((section) => onlyKeys.includes(section.key))
    : viewModel.sections;

  if (sections.length === 0) return null;

  // Esc collapses the open card back to the plain list (design doc §5). It
  // only needs to mount once per page — the "decide" slice is always
  // rendered somewhere on /app/today, so anchoring it there (rather than in
  // every OrbitRealToday call) avoids attaching duplicate listeners.
  const rendersDecideSlice = !onlyKeys || onlyKeys.includes("decide");
  const collapseHref = buildTodayHref(params, { entry: undefined });

  return (
    <div data-orbit-today-list style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <DecisionAccordionStyles />
      {expandedEntryId && rendersDecideSlice ? (
        <OrbitTodayEscapeToCollapse collapseHref={collapseHref} />
      ) : null}
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
              <DecisionEntryCard
                entry={entry}
                expanded={expandedEntryId === entry.entryId}
                key={entry.entryId}
                preserveParams={params}
              />
            ))}
          </div>
        );

        // "需要你决定" stays expanded; "ORBIT 已准备"/"最近完成" default to
        // collapsed (content-priority — completed/queued work shouldn't
        // compete with pending decisions for attention). A native
        // disclosure element needs no client state and adds no hand-rolled
        // toggle button for the button-ratchet gate to worry about. A deep
        // link into a collapsed section (?entry= of a completed/executing
        // entry) still forces the section open, so the expanded card is
        // actually visible.
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

        const sectionHasExpandedEntry = section.entries.some(
          (entry) => entry.entryId === expandedEntryId,
        );

        return (
          <details
            data-orbit-today-section={section.key}
            key={section.key}
            open={sectionHasExpandedEntry || undefined}
          >
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

/**
 * `.orbit-today-card-*` CSS for `DecisionEntryCard`. Motion (design doc §5):
 * expand 200ms ease-out, collapse 140ms, both disabled under
 * prefers-reduced-motion. Every entry/collapse is a real URL navigation
 * (`<a href>`, no client JS/useRouter — see orbit-today-time-spine.tsx for
 * why this codebase avoids useRouter in components that also render via
 * renderToStaticMarkup in tests), so there is no single persistent DOM node
 * whose height a `transition` can animate across the click — the "before"
 * card is torn down and the "after" card is painted fresh. `@starting-style`
 * is the CSS-only way to still get a real animation out of that: it plays
 * whenever a matching element is newly inserted into the DOM, which is
 * exactly what happens to the freshly-expanded card's body on the ?entry=
 * navigation (and, symmetrically, to the freshly-collapsed row on the way
 * back) — no JS, no persistent node required.
 */
function DecisionAccordionStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
[data-orbit-real-page="today"] .orbit-today-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
[data-orbit-real-page="today"] .orbit-today-card.is-expanded { border-color: var(--border-strong); }
[data-orbit-real-page="today"] .orbit-today-card-head { align-items: center; background: transparent; border: 0; color: inherit; display: flex; gap: 12px; padding: 14px 16px; text-decoration: none; width: 100%; }
[data-orbit-real-page="today"] .orbit-today-card.is-expanded .orbit-today-card-head { background: var(--accent-soft); }
[data-orbit-real-page="today"] .orbit-today-card-head:hover { background: var(--surface-2); }
[data-orbit-real-page="today"] .orbit-today-card.is-expanded .orbit-today-card-head:hover { background: var(--accent-soft); }
[data-orbit-real-page="today"] .orbit-today-card-title { color: var(--text); font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="today"] .orbit-today-card-subtitle { color: var(--text-3); font-size: 13px; margin-top: 4px; }
[data-orbit-real-page="today"] .orbit-today-card-head svg:last-child { flex-shrink: 0; transition: transform .14s ease-out; }
[data-orbit-real-page="today"] .orbit-today-card.is-expanded .orbit-today-card-head svg:last-child { transform: rotate(90deg); }
[data-orbit-real-page="today"] .orbit-today-card-body-wrap { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .2s ease-out; }
[data-orbit-real-page="today"] .orbit-today-card-body { border-top: 1px solid var(--border); min-height: 0; overflow: hidden; padding: 16px; }
@starting-style {
  [data-orbit-real-page="today"] .orbit-today-card-body-wrap { grid-template-rows: 0fr; }
}
[data-orbit-real-page="today"] .orbit-today-card:not(.is-expanded) { transition: opacity .14s ease-out; }
@starting-style {
  [data-orbit-real-page="today"] .orbit-today-card:not(.is-expanded) { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [data-orbit-real-page="today"] .orbit-today-card-body-wrap,
  [data-orbit-real-page="today"] .orbit-today-card-head svg:last-child,
  [data-orbit-real-page="today"] .orbit-today-card:not(.is-expanded) { transition: none; }
}
`,
      }}
    />
  );
}
