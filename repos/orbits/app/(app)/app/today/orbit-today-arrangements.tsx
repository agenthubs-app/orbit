/**
 * 可复核安排卡（从 schedule/orbit-real-schedule-page.tsx 抽出，纯搬运）。
 *
 * `ScheduleArrangementCard` 是原样搬运——schedule 页面现在从这里导入它，不再
 * 本地定义，两处渲染保证一致。`OrbitTodayArrangements` 是新增的组合层：给
 * Today 右栏用的区块（区头统计 + 卡片列表 + 选中日期的过滤淡化）。
 *
 * server component：这里没有交互状态，只读 props 渲染，和
 * orbit-real-schedule-page.tsx 里原来的用法一致。
 */
import { Icon } from "../orbit-reference-primitives";
import type { AppScheduleArrangementViewModel } from "../schedule/schedule-route-view-model";

export function ScheduleArrangementCard({
  arrangement,
  dimmed,
}: {
  arrangement: AppScheduleArrangementViewModel;
  /**
   * 拍板规则（design doc §7.2）：选中日期时，带日期属性的卡（这张卡）如果和
   * 选中日期无关，只降低不透明度，不隐藏——「我的决策去哪了」是要避免的体验。
   * 决策卡没有日期属性，不受这条规则影响，见 orbit-today-decision-panel.tsx
   * 和 orbit-real-today.tsx（未使用这个 prop）。
   */
  dimmed?: boolean;
}) {
  return (
    <a
      className="card orbit-schedule-arrangement-card"
      data-orbit-schedule-arrangement={arrangement.target.kind}
      data-orbit-schedule-target-state={arrangement.targetState}
      href={arrangement.href}
      aria-disabled={
        arrangement.targetState === "detail-unavailable" ? true : undefined
      }
      style={{
        color: "inherit",
        display: "grid",
        gap: 12,
        opacity: dimmed ? 0.45 : 1,
        padding: 16,
        textDecoration: "none",
        transition: "opacity .14s",
      }}
    >
      <div
        className="orbit-schedule-card-head"
        style={{ alignItems: "flex-start", display: "flex", gap: 12 }}
      >
        <span
          aria-hidden
          style={{
            alignItems: "center",
            background:
              arrangement.target.kind === "event"
                ? "var(--amber-soft)"
                : "var(--accent-softer)",
            borderRadius: 12,
            color:
              arrangement.target.kind === "event"
                ? "var(--amber)"
                : "var(--accent)",
            display: "inline-flex",
            flexShrink: 0,
            height: 38,
            justifyContent: "center",
            width: 38,
          }}
        >
          <Icon
            name={arrangement.target.kind === "event" ? "calendar" : "user"}
            size={18}
          />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="orbit-schedule-arrangement-title"
            style={{
              color: "var(--ink)",
              fontSize: 15,
              fontWeight: 720,
              lineHeight: 1.3,
            }}
          >
            {arrangement.primaryName}
          </div>
          <div
            className="orbit-schedule-arrangement-subtitle"
            style={{
              color: "var(--text-3)",
              fontSize: 12.5,
              lineHeight: 1.45,
              marginTop: 3,
            }}
          >
            {arrangement.secondaryName}
          </div>
        </div>
        <span
          className="badge badge-soon orbit-schedule-status"
          style={{ flexShrink: 0 }}
        >
          {arrangement.statusLabel}
        </span>
      </div>
      <p
        className="orbit-schedule-arrangement-copy"
        style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.55, margin: 0 }}
      >
        {arrangement.reason}
      </p>
      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "1fr",
        }}
      >
        <span
          className="orbit-schedule-meta-line"
          style={{
            alignItems: "center",
            color: "var(--text-3)",
            display: "inline-flex",
            fontSize: 12.5,
            gap: 6,
          }}
        >
          <Icon name="clock" size={13} />
          {arrangement.timing}
        </span>
        <span
          className="orbit-schedule-meta-line"
          style={{
            alignItems: "center",
            color: "var(--text-3)",
            display: "inline-flex",
            fontSize: 12.5,
            gap: 6,
          }}
        >
          <Icon name="doc" size={13} />
          {arrangement.sourceContext}
        </span>
      </div>
      {arrangement.targetNote ? (
        <p
          className="card-flat orbit-schedule-arrangement-copy"
          data-orbit-schedule-target-note
          style={{
            color: "var(--text-2)",
            fontSize: 12.5,
            lineHeight: 1.55,
            margin: 0,
            padding: 12,
          }}
        >
          {arrangement.targetNote}
        </p>
      ) : null}
      <span
        className="orbit-schedule-arrangement-action"
        style={{
          alignItems: "center",
          color: "var(--accent)",
          display: "inline-flex",
          fontSize: 13,
          fontWeight: 700,
          gap: 5,
        }}
      >
        {arrangement.actionLabel}
        <Icon name="arrowUR" size={14} />
      </span>
    </a>
  );
}

export function OrbitTodayArrangements({
  arrangements,
  dimmedIds,
  evidenceCount,
}: {
  arrangements: readonly AppScheduleArrangementViewModel[];
  /** ids of arrangements unrelated to the selected date — dimmed, not hidden. */
  dimmedIds: ReadonlySet<string>;
  evidenceCount: number;
}) {
  return (
    <section data-orbit-today-arrangements>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Icon name="doc" size={16} />
        <span className="eyebrow">可复核安排</span>
        <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>
          {arrangements.length} 安排 · 证据 {evidenceCount}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {arrangements.map((arrangement) => (
          <ScheduleArrangementCard
            arrangement={arrangement}
            dimmed={dimmedIds.has(arrangement.id)}
            key={arrangement.id}
          />
        ))}
      </div>
    </section>
  );
}
