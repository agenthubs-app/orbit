/**
 * 活动中心（Orbit_0918 运营台 hub 屏）：消费 `useEventCenter`，按设计 47–89 行渲染活动卡。
 * 审阅修订 4：`/api/events/center` 无描述 → 描述省略；封面 = EventCover 标题渐变；三计数每卡
 * `GET /api/events/{id}/analytics/aggregate`（非 2xx → 「—」）；角色 / 生命周期门禁与 `data-event-center-*`
 * 标记原样保留（tests/pages/app-ops-hub.test.tsx，自 event-role-management-workspace.test.tsx 迁入）；次级动作收进「···」；
 * 创建入口不在本屏（审阅修订 4）；「当前身份」= 页头去重角色 + 每卡角色 chip。
 */
"use client";

import { useEffect, useMemo, useState } from "react";

import type { EventAnalyticsOrganizerAggregate } from "../../../../../features/events/event-analytics/contract";
import { gradientFromString } from "../../orbit-reference-primitives";
import { EventCover } from "../orbit-event-cover";
import {
  BOOTSTRAP_LIMITED_COPY,
  eventTitle,
  HUB_CTA_TONE,
  hubCounts,
  hubCta,
  hubDateTime,
  hubSecondaryActions,
  hubStatusChip,
  hubTabMatches,
  identityLabel,
  lifecycleRestrictionCopy,
  matchesHubQuery,
  MIGRATION_PENDING_COPY,
  onsiteOperationsAvailable,
  ROLE_LABEL,
  type HubTab,
} from "./ops-model";
import { OPS_STYLES, OpsHubHead } from "./ops-shell";
import { useEventCenter, type EventCenterItem } from "./use-event-center";

interface Envelope<T> {
  data?: T;
  success?: boolean;
}

type AggregateMap = Readonly<Record<string, EventAnalyticsOrganizerAggregate | null>>;

/** 每卡一次 aggregate 读取；任何非 2xx / 解析失败 → null（渲染为「—」）。迁移待确认的活动不请求。 */
function useHubAggregates(events: readonly EventCenterItem[]): AggregateMap {
  const [aggregates, setAggregates] = useState<AggregateMap>({});
  const ids = useMemo(
    () => events.filter((event) => !event.migrationPending).map((event) => event.eventId),
    [events],
  );
  useEffect(() => {
    if (ids.length === 0) return;
    let active = true;
    void Promise.all(
      ids.map(async (eventId) => {
        try {
          const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/analytics/aggregate`, { cache: "no-store" });
          if (!response.ok) return [eventId, null] as const;
          const body = (await response.json().catch(() => null)) as Envelope<EventAnalyticsOrganizerAggregate> | null;
          return [eventId, body?.success === true && body.data ? body.data : null] as const;
        } catch {
          return [eventId, null] as const;
        }
      }),
    ).then((entries) => {
      if (active) setAggregates(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [ids]);
  return aggregates;
}

function HubCard({ event, aggregate, now }: { event: EventCenterItem; aggregate: EventAnalyticsOrganizerAggregate | null | undefined; now: number }) {
  const chip = hubStatusChip(event, now);
  const title = eventTitle(event);
  const when = hubDateTime(event);
  const counts = hubCounts(aggregate);
  const cta = hubCta(event, now);
  const secondary = hubSecondaryActions(event, now);
  const onsite = onsiteOperationsAvailable(event);
  const roleLabel = event.owner ? ROLE_LABEL.owner : ROLE_LABEL[event.role];

  return (
    <article className="op-card" data-event-center-card={event.eventId}>
      <EventCover className="op-cover" g={gradientFromString(event.eventId)} monogram={null}>
        <span className="op-cover-text">{title}</span>
      </EventCover>

      <div className="op-card-body">
        <div className="op-card-title-row">
          <h2 className="op-card-title">{title}</h2>
          <span className="op-chip" data-event-center-status={chip.kind} style={{ background: chip.chipBg, color: chip.chipColor }}>{chip.label}</span>
          {event.migrationPending ? null : (
            <span className="op-chip" data-event-center-role={event.owner ? "owner" : event.role} style={{ background: "#F1F1FA", color: "#6B6F99" }}>{roleLabel}</span>
          )}
        </div>
        {event.migrationPending ? (
          <span className="op-card-desc" data-event-center-migration-pending={event.eventId}>{MIGRATION_PENDING_COPY}</span>
        ) : (
          <>
            {when ? <span className="op-card-meta">▦ {when.date}　{when.time}</span> : <span className="op-card-meta">▦ 时间待配置</span>}
            <span className="op-card-meta">◎ {event.venue ?? "地点待配置"}</span>
            {!onsite ? (
              <span className="op-card-desc" data-event-center-lifecycle-restricted={event.eventId}>{lifecycleRestrictionCopy(event)}</span>
            ) : null}
            {onsite && event.role === "operations" ? (
              <span className="op-card-desc" data-event-center-bootstrap-limited={event.eventId}>{BOOTSTRAP_LIMITED_COPY}</span>
            ) : null}
          </>
        )}
      </div>

      <span className="op-count"><span className="op-count-label">已报名</span><strong className="op-count-n" data-event-center-count="signup">{counts.signup}</strong></span>
      <span className="op-count"><span className="op-count-label">匹配结果</span><strong className="op-count-n" data-event-center-count="match">{counts.match}</strong></span>
      <span className="op-count"><span className="op-count-label">签到</span><strong className="op-count-n" data-event-center-count="checkin">{counts.checkin}</strong></span>

      <span className="op-card-actions">
        {cta ? (
          <a
            className="btn op-cta"
            data-event-center-cta={cta.key}
            href={cta.href}
            style={{ background: HUB_CTA_TONE[cta.tone].btnBg, color: HUB_CTA_TONE[cta.tone].btnColor, borderColor: HUB_CTA_TONE[cta.tone].btnBorder }}
            {...(cta.marker ? { [cta.marker]: event.eventId } : {})}
          >
            {cta.label}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="btn op-cta"
            data-event-center-cta="unavailable"
            style={{ background: HUB_CTA_TONE.ghost.btnBg, color: HUB_CTA_TONE.ghost.btnColor, borderColor: HUB_CTA_TONE.ghost.btnBorder }}
          >
            迁移待确认
          </span>
        )}
        {secondary.length ? (
          <details className="op-more">
            <summary aria-label="更多操作" className="op-more-summary">···</summary>
            <div className="op-menu" role="menu">
              {secondary.map((action) => (
                <a
                  className="op-menu-item"
                  href={action.href}
                  key={action.key}
                  role="menuitem"
                  {...(action.marker ? { [action.marker]: event.eventId } : {})}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </details>
        ) : null}
      </span>
    </article>
  );
}

export function OpsHub() {
  const { events, error, loading, load } = useEventCenter();
  const aggregates = useHubAggregates(events);
  const [tab, setTab] = useState<HubTab>("all");
  const [query, setQuery] = useState("");
  // 只在客户端取时间：SSR 时列表尚未加载，没有依赖 now 的输出。
  const now = Date.now();

  const visible = events.filter((event) => hubTabMatches(event, tab, now) && matchesHubQuery(event, query));

  return (
    <main className="op-main" data-ops-view="hub">
      <style>{OPS_STYLES}</style>
      <div className="op-hub">
        <OpsHubHead activeTab={tab} onQuery={setQuery} onTab={setTab} query={query} roleLabel={identityLabel(events)} />

        {error ? (
          <div className="op-note op-note-error" role="alert">
            <span>{error}</span>
            <button className="btn op-btn-ghost" disabled={loading} onClick={() => void load()} type="button">{loading ? "正在刷新…" : "重试"}</button>
          </div>
        ) : null}
        {loading && !error ? <div className="op-note" role="status">正在读取你可访问的活动…</div> : null}

        {!loading && !error && events.length === 0 ? (
          <section className="op-note" data-event-center-empty>
            <span className="op-note-copy">
              <h2 className="op-note-title">还没有可运营的活动</h2>
              <span>当你成为某个活动的 Event Core 负责人，或被该活动负责人授予有效角色后，活动会出现在这里。</span>
            </span>
          </section>
        ) : null}

        {!loading && !error && events.length > 0 && visible.length === 0 ? (
          <div className="op-note" data-event-center-filtered-empty role="status">没有符合当前筛选的活动。</div>
        ) : null}

        {visible.map((event) => (
          <HubCard aggregate={aggregates[event.eventId]} event={event} key={event.eventId} now={now} />
        ))}
      </div>
    </main>
  );
}
