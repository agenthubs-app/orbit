"use client";

import { useCallback, useEffect, useState } from "react";

import { PublicTopNav } from "../../orbit-public-shell";
import { Icon } from "../../orbit-reference-primitives";

type EventRole =
  | "owner"
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";

interface EventCenterItem {
  endsAt: string | null;
  eventId: string;
  lifecycleState: string;
  migrationPending: boolean;
  owner: boolean;
  revision: number;
  role: EventRole;
  startsAt: string | null;
  title: string | null;
  venue: string | null;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

const roleCopy: Record<EventRole, { detail: string; label: string }> = {
  owner: {
    detail: "拥有活动配置、现场运营与角色管理的最终责任。",
    label: "活动负责人",
  },
  operations: {
    detail: "可配置运营、查看受保护参会信息并运行现场流程。",
    label: "运营",
  },
  check_in: {
    detail: "仅可打开受限签到名单并记录签到。",
    label: "签到",
  },
  reviewer: {
    detail: "可审阅报名与做出准入决定。",
    label: "审核",
  },
  read_only_analyst: {
    detail: "仅可查看汇总运营分析，不包含个人名单。",
    label: "只读分析",
  },
};

function formatDate(value: string | null): string {
  if (!value) return "时间待配置";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

function lifecycleLabel(value: string): string {
  const labels: Record<string, string> = {
    archived: "已归档",
    cancelled: "已取消",
    draft: "草稿",
    legacy_active: "运营中",
    legacy_archived: "已归档",
    published: "已发布",
  };
  return labels[value] ?? "状态待确认";
}

function eventTitle(item: EventCenterItem): string {
  if (item.migrationPending) return "活动资料待迁移";
  return item.title?.trim() || "未命名活动";
}

function canOpenOperations(item: EventCenterItem): boolean {
  return item.owner || item.role === "operations";
}

function canOpenCheckIn(item: EventCenterItem): boolean {
  return (
    item.owner || item.role === "operations" || item.role === "check_in"
  );
}

function canOpenAnalytics(item: EventCenterItem): boolean {
  return (
    item.owner ||
    item.role === "operations" ||
    item.role === "read_only_analyst"
  );
}

function canReviewAdmission(item: EventCenterItem): boolean {
  return item.owner || item.role === "reviewer";
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new Error(envelope?.error?.message ?? "无法加载运营活动中心。");
  }
  return envelope.data;
}

export function EventCenterWorkspace() {
  const [events, setEvents] = useState<readonly EventCenterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<readonly EventCenterItem[]>("/api/events/center");
      setEvents(next);
      setError(null);
    } catch (cause) {
      setEvents([]);
      setError(cause instanceof Error ? cause.message : "无法加载运营活动中心。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-orbit-real-page="event-operations-center" style={{ minHeight: "100dvh" }}>
      <PublicTopNav active="events" />
      <main style={{ margin: "0 auto", maxWidth: 1180, padding: "28px clamp(16px,4vw,42px) 80px" }}>
        <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between" }}>
          <div>
            <div className="eyebrow">EVENT OPERATIONS CENTER</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>运营活动中心</h1>
            <p style={{ color: "var(--text-2)", lineHeight: 1.6, margin: "8px 0 0", maxWidth: 720 }}>
              这里只显示你作为活动负责人，或拥有当前有效活动角色的活动。权限按活动隔离，不存在工作区级运营角色。
            </p>
          </div>
          <button className="btn btn-ghost" disabled={loading} onClick={() => void load()} type="button">
            <Icon name="refresh" size={16} />{loading ? "正在刷新…" : "刷新列表"}
          </button>
        </div>

        {error ? <div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 20, padding: 16 }}>{error}</div> : null}
        {loading ? <div className="card" role="status" style={{ marginTop: 20, padding: 18 }}>正在读取你可访问的活动…</div> : null}

        {!loading && !error && events.length === 0 ? (
          <section className="card" style={{ marginTop: 20, padding: 26 }}>
            <div className="eyebrow">NO ACTIVE EVENT ACCESS</div>
            <h2 className="h-title" style={{ margin: "8px 0 0" }}>还没有可运营的活动</h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.6, marginBottom: 0 }}>
              当你成为某个活动的 Event Core 负责人，或被该活动负责人授予有效角色后，活动会出现在这里。
            </p>
          </section>
        ) : null}

        <section aria-label="可访问活动" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", marginTop: 20 }}>
          {events.map((event) => {
            const role = roleCopy[event.role];
            const operationsHref = `/app/events/${encodeURIComponent(event.eventId)}/operations`;
            const rolesHref = `${operationsHref}/roles`;
            const checkInHref = `${operationsHref}/check-in`;
            const admissionHref = `${operationsHref}/admission`;
            const analyticsHref = `/app/events/${encodeURIComponent(event.eventId)}/analytics`;
            return (
              <article className="card" data-event-center-card={event.eventId} key={event.eventId} style={{ display: "grid", gap: 16, padding: 20 }}>
                <div style={{ alignItems: "start", display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{event.migrationPending ? "主数据待迁移" : lifecycleLabel(event.lifecycleState)}</div>
                    <h2 className="h-title" style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}>{eventTitle(event)}</h2>
                  </div>
                  <span className={!event.migrationPending && event.owner ? "badge badge-live" : "badge"}>
                    {event.migrationPending ? "迁移待确认" : role.label}
                  </span>
                </div>
                {event.migrationPending ? (
                  <div data-event-center-migration-pending={event.eventId} style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, paddingTop: 14 }}>
                    该活动尚未完成 Event Core 主数据迁移。为避免从旧活动域读取或授权，运营、签到、分析与角色管理暂不可用。
                  </div>
                ) : (
                  <>
                    <div style={{ color: "var(--text-2)", display: "grid", fontSize: 13, gap: 6, lineHeight: 1.5 }}>
                      <div>{event.venue ?? "地点待配置"}</div>
                      <div>{formatDate(event.startsAt)} — {formatDate(event.endsAt)}</div>
                      <div>{role.detail}</div>
                    </div>
                    <div style={{ alignItems: "center", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 14 }}>
                      <a className="btn btn-ghost btn-sm" href={`/app/events/${encodeURIComponent(event.eventId)}`}>查看活动</a>
                      {canOpenOperations(event) ? <a className="btn btn-primary btn-sm" href={operationsHref}>打开运营台</a> : null}
                      {canOpenCheckIn(event) ? <a className="btn btn-ghost btn-sm" href={checkInHref}>签到台</a> : null}
                      {canReviewAdmission(event) ? <a className="btn btn-ghost btn-sm" data-event-center-admission={event.eventId} href={admissionHref}>报名审核</a> : null}
                      {canOpenAnalytics(event) ? <a className="btn btn-ghost btn-sm" data-event-center-analytics={event.eventId} href={analyticsHref}>查看活动分析</a> : null}
                      {event.owner ? <a className="btn btn-ghost btn-sm" data-event-center-manage-roles={event.eventId} href={rolesHref}>管理角色</a> : null}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
