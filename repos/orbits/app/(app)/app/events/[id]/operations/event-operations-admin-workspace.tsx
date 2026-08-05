"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventOperationsCheckIn,
  EventOperationsConfiguration,
  EventOperationsGeneration,
  EventOperationsTable,
} from "../../../../../../features/events/event-operations/contract";
import type { EventOperationsAdminWorkspace } from "../../../../../../features/events/event-operations/service";
import { PublicTopNav } from "../../../orbit-public-shell";
import { Icon } from "../../../orbit-reference-primitives";

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

interface ConfigurationForm {
  checkInOpensAt: string;
  eventEndsAt: string;
  eventStartsAt: string;
  maxAttemptsPerTask: string;
  profileEditDeadlineAt: string;
  recommendationCount: string;
  registrationCutoffAt: string;
  resultsAvailableAt: string;
  roundOneStartsAt: string;
  roundTwoStartsAt: string;
  shardSize: string;
  tableSize: string;
}

const dateFields = [
  "eventStartsAt",
  "eventEndsAt",
  "profileEditDeadlineAt",
  "registrationCutoffAt",
  "checkInOpensAt",
  "resultsAvailableAt",
  "roundOneStartsAt",
  "roundTwoStartsAt",
] as const;

const canonicalScheduleFields = ["eventStartsAt", "eventEndsAt"] as const;

const numberFields = [
  "recommendationCount",
  "tableSize",
  "shardSize",
  "maxAttemptsPerTask",
] as const;

function localDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formFor(
  configuration: EventOperationsConfiguration | null,
  event: { endsAt: string; startsAt: string },
): ConfigurationForm {
  return {
    checkInOpensAt: configuration ? localDateTime(configuration.checkInOpensAt) : "",
    eventEndsAt: localDateTime(configuration?.eventEndsAt ?? event.endsAt),
    eventStartsAt: localDateTime(configuration?.eventStartsAt ?? event.startsAt),
    maxAttemptsPerTask: configuration ? String(configuration.maxAttemptsPerTask) : "",
    profileEditDeadlineAt: configuration ? localDateTime(configuration.profileEditDeadlineAt) : "",
    recommendationCount: configuration ? String(configuration.recommendationCount) : "",
    registrationCutoffAt: configuration ? localDateTime(configuration.registrationCutoffAt) : "",
    resultsAvailableAt: configuration ? localDateTime(configuration.resultsAvailableAt) : "",
    roundOneStartsAt: configuration ? localDateTime(configuration.roundOneStartsAt) : "",
    roundTwoStartsAt: configuration ? localDateTime(configuration.roundTwoStartsAt) : "",
    shardSize: configuration ? String(configuration.shardSize) : "",
    tableSize: configuration ? String(configuration.tableSize) : "",
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || !envelope.data) {
    throw new Error(envelope?.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return envelope.data;
}

function generationActionLabel(generation: EventOperationsGeneration): string {
  if (generation.status === "failed") return "Retry failed shards";
  if (generation.status === "completed") return "Publish atomically";
  if (generation.status === "published") return "Published";
  return "Worker processing…";
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(timestamp)
    : value;
}

function PublishedRoundPreview({
  participantNames,
  tables,
  title,
}: {
  participantNames: ReadonlyMap<string, string>;
  tables: readonly EventOperationsTable[];
  title: string;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3 style={{ fontSize: 16, margin: 0 }}>{title}</h3>
      {tables.length === 0 ? <div style={{ color: "var(--text-3)" }}>No published tables.</div> : null}
      {tables.map((table) => (
        <article key={table.tableNumber} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <div style={{ alignItems: "start", display: "flex", gap: 10, justifyContent: "space-between" }}>
            <div><strong>Table {table.tableNumber} · {table.theme}</strong><div style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>{table.rationale}</div></div>
            <span className="badge">{table.members.length} seats</span>
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {table.members.map((member) => (
              <div key={member.participantId} style={{ display: "flex", fontSize: 13, gap: 8, justifyContent: "space-between" }}>
                <span>{participantNames.get(member.participantId) ?? member.participantId}</span>
                <span className="mono" style={{ color: "var(--text-3)" }}>{member.seat}</span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 10 }}>
            <div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>TABLE ICEBREAKERS</div>
            <ol style={{ color: "var(--text-2)", fontSize: 12, lineHeight: 1.55, margin: "7px 0 0", paddingLeft: 18 }}>
              {table.icebreakers.map((icebreaker) => <li key={icebreaker}>{icebreaker}</li>)}
            </ol>
          </div>
        </article>
      ))}
    </div>
  );
}

export function EventOperationsAdminWorkspace({
  canManageRoles = false,
  event,
}: {
  canManageRoles?: boolean;
  event: { endsAt: string; id: string; startsAt: string; title: string };
}) {
  const baseUrl = `/api/events/${encodeURIComponent(event.id)}/operations/admin`;
  const [workspace, setWorkspace] = useState<EventOperationsAdminWorkspace | null>(null);
  const [form, setForm] = useState<ConfigurationForm>(() => formFor(null, event));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await requestJson<EventOperationsAdminWorkspace>(baseUrl);
      setWorkspace(next);
      if (showLoading) setForm(formFor(next.configuration, event));
      setError(null);
    } catch (cause) {
      setWorkspace(null);
      setError(cause instanceof Error ? cause.message : "Could not load event operations.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [baseUrl, event]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hasActiveGeneration = workspace?.generations.some(
    ({ generation }) =>
      generation.status === "queued" || generation.status === "running",
  ) ?? false;

  useEffect(() => {
    if (!hasActiveGeneration) return;
    const timer = window.setInterval(() => {
      void load(false);
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [hasActiveGeneration, load]);

  async function saveConfiguration() {
    setBusy("configuration");
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, string | number> = {};
      for (const field of dateFields) {
        if (!form[field]) throw new Error(`${field} is required.`);
        payload[field] = field === "eventStartsAt"
          ? event.startsAt
          : field === "eventEndsAt"
            ? event.endsAt
            : new Date(form[field]).toISOString();
      }
      for (const field of numberFields) {
        const value = Number(form[field]);
        if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
        payload[field] = value;
      }
      await requestJson<EventOperationsConfiguration>(baseUrl, {
        body: JSON.stringify(payload),
        method: "PUT",
      });
      setNotice("Configuration saved from explicit organizer inputs.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save configuration.");
    } finally {
      setBusy(null);
    }
  }

  async function startGeneration() {
    setBusy("start");
    setError(null);
    setNotice(null);
    try {
      const generation = await requestJson<EventOperationsGeneration>(`${baseUrl}/generations`, {
        body: JSON.stringify({}),
        method: "POST",
      });
      setNotice(`Captured immutable registration snapshot ${generation.snapshot.hash}; the durable worker has been queued.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start generation.");
    } finally {
      setBusy(null);
    }
  }

  async function generationAction(generation: EventOperationsGeneration) {
    if (generation.status === "published") return;
    const action = generation.status === "failed"
      ? "retry"
      : generation.status === "completed"
        ? "publish"
        : null;
    if (!action) return;
    setBusy(`${generation.generationId}:${action}`);
    setError(null);
    setNotice(null);
    try {
      await requestJson(
        `${baseUrl}/generations/${encodeURIComponent(generation.generationId)}/${action}`,
        {
          method: "POST",
        },
      );
      setNotice(
        action === "publish"
          ? "The complete generation was published with one atomic pointer update."
          : action === "retry"
            ? "Only failed shards were reset; completed shard outputs were retained."
            : "The durable worker will reclaim only retryable failed shards.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} generation.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function markParticipantArrived(participantId: string) {
    setBusy(`checkin:${participantId}`);
    setError(null);
    setNotice(null);
    try {
      const checkIn = await requestJson<EventOperationsCheckIn>(`${baseUrl}/check-ins`, {
        body: JSON.stringify({ participantId }),
        method: "POST",
      });
      setNotice(`Arrival recorded at ${formatTimestamp(checkIn.checkedInAt)}. Repeating this action preserves the original time.`);
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark this participant as arrived.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCheckInLink() {
    const path = `/app/party/checkin?eventId=${encodeURIComponent(event.id)}`;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setNotice("Check-in link copied. It can be displayed on the venue screen or sent to registered attendees.");
      setError(null);
    } catch {
      setNotice("Select and copy the visible check-in link manually; no QR code was fabricated.");
    }
  }

  const checkInsByParticipant = useMemo(
    () => new Map(workspace?.checkIns.map((record) => [record.participantId, record]) ?? []),
    [workspace],
  );
  const participantNames = useMemo(
    () => new Map(workspace?.participants.map((participant) => [participant.participantId, participant.displayName]) ?? []),
    [workspace],
  );
  const checkInHref = `/app/party/checkin?eventId=${encodeURIComponent(event.id)}`;
  const operationsCheckInHref = `/app/events/${encodeURIComponent(event.id)}/operations/check-in`;
  const configuration = workspace?.configuration ?? null;
  const checkInOpen = configuration
    ? currentTimeMs >= Date.parse(configuration.checkInOpensAt) &&
      currentTimeMs <= Date.parse(configuration.eventEndsAt)
    : false;
  const timeline = configuration
    ? [
        { at: configuration.profileEditDeadlineAt, label: "Profile edit deadline", state: currentTimeMs < Date.parse(configuration.profileEditDeadlineAt) ? "open" : "closed" },
        { at: configuration.registrationCutoffAt, label: "Registration cutoff", state: currentTimeMs < Date.parse(configuration.registrationCutoffAt) ? "open" : "closed" },
        { at: configuration.checkInOpensAt, label: "Check-in opens", state: checkInOpen ? "open now" : currentTimeMs < Date.parse(configuration.checkInOpensAt) ? "upcoming" : "closed" },
        { at: configuration.resultsAvailableAt, label: "Results available", state: currentTimeMs >= Date.parse(configuration.resultsAvailableAt) ? "available" : "locked" },
        { at: configuration.eventStartsAt, label: "Event starts", state: currentTimeMs < Date.parse(configuration.eventStartsAt) ? "upcoming" : currentTimeMs <= Date.parse(configuration.eventEndsAt) ? "live" : "ended" },
        { at: configuration.roundOneStartsAt, label: "Round one starts", state: currentTimeMs < Date.parse(configuration.roundOneStartsAt) ? "upcoming" : "started" },
        { at: configuration.roundTwoStartsAt, label: "Round two starts", state: currentTimeMs < Date.parse(configuration.roundTwoStartsAt) ? "upcoming" : "started" },
        { at: configuration.eventEndsAt, label: "Event ends", state: currentTimeMs <= Date.parse(configuration.eventEndsAt) ? "upcoming" : "ended" },
      ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    : [];

  return (
    <div data-orbit-real-page="event-operations-admin" style={{ minHeight: "100dvh" }}>
      <PublicTopNav active="events" />
      <main style={{ margin: "0 auto", maxWidth: 1180, padding: "28px clamp(16px,4vw,42px) 80px" }}>
        <a href={`/app/events/${encodeURIComponent(event.id)}`} style={{ alignItems: "center", color: "var(--text-2)", display: "inline-flex", gap: 6, textDecoration: "none" }}>
          <Icon name="chevL" size={16} /> Back to event
        </a>
        <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", marginTop: 18 }}>
          <div>
            <div className="eyebrow">ORGANIZER · EVENT OPERATIONS</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>{event.title}</h1>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0" }}>Configure time gates, inspect real registrations, run strict AI shards, and publish complete results.</p>
          </div>
          {workspace ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <a className="btn btn-ghost" href="/app/events/center">
                <Icon name="grid" size={16} />运营活动中心
              </a>
              <a className="btn btn-ghost" href={operationsCheckInHref}>
                <Icon name="check" size={16} />打开签到台
              </a>
              <a className="btn btn-ghost" href={`/app/events/${encodeURIComponent(event.id)}/analytics`}>
                <Icon name="target" size={16} />查看活动分析
              </a>
              {canManageRoles ? (
                <a className="btn btn-ghost" data-event-roles-entry href={`/app/events/${encodeURIComponent(event.id)}/operations/roles`}>
                  <Icon name="users" size={16} />管理角色
                </a>
              ) : null}
              <a className="btn btn-ghost" href={`${baseUrl}/export`}>
                <Icon name="download" size={16} />Export CSV
              </a>
            </div>
          ) : null}
        </div>

        {error ? <div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}>{error}</div> : null}
        {notice ? <div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}>{notice}</div> : null}
        {loading ? <div className="card" style={{ marginTop: 18, padding: 18 }}>Loading persisted operations state…</div> : null}

        <section className="card" style={{ marginTop: 18, padding: 20 }}>
          <div className="eyebrow">TIME GATES & SHARD POLICY</div>
          <h2 className="h-title" style={{ margin: "8px 0 0" }}>Operations configuration</h2>
          <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>Event start/end are locked to the canonical event schedule. Every other rule requires an explicit organizer value.</p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", marginTop: 18 }}>
            {dateFields.map((field) => (
              <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
                <span className="mono">{field}</span>
                <input
                  className="field"
                  onChange={(input) => setForm((value) => ({ ...value, [field]: input.target.value }))}
                  readOnly={canonicalScheduleFields.includes(field as (typeof canonicalScheduleFields)[number])}
                  type="datetime-local"
                  value={form[field]}
                />
              </label>
            ))}
            {numberFields.map((field) => (
              <label key={field} style={{ display: "grid", gap: 6, fontSize: 12 }}>
                <span className="mono">{field}</span>
                <input className="field" min={1} onChange={(input) => setForm((value) => ({ ...value, [field]: input.target.value }))} type="number" value={form[field]} />
              </label>
            ))}
          </div>
          <button className="btn btn-primary" disabled={busy === "configuration"} onClick={saveConfiguration} style={{ marginTop: 18 }} type="button">
            <Icon color="var(--on-dark)" name="check" size={16} />{busy === "configuration" ? "Saving…" : "Save configuration"}
          </button>
          {timeline.length > 0 ? (
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 18 }}>
              <div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>CONFIGURED TIMELINE · LIVE STATUS</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginTop: 10 }}>
                {timeline.map((gate) => (
                  <div key={gate.label} style={{ alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, display: "flex", gap: 10, justifyContent: "space-between", padding: 11 }}>
                    <div><strong style={{ fontSize: 12 }}>{gate.label}</strong><div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{formatTimestamp(gate.at)}</div></div>
                    <span className={gate.state === "open" || gate.state === "open now" || gate.state === "available" || gate.state === "live" ? "badge badge-live" : "badge"}>{gate.state}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {workspace ? (
          <>
            <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 18 }}>
              {[
                ["Registered", workspace.metrics.participantCount],
                ["Checked in", workspace.metrics.checkedIn],
                ["Card requests", workspace.metrics.contactRequests],
                ["Accepted", workspace.metrics.acceptedContactRequests],
              ].map(([label, value]) => <div className="card" key={label} style={{ padding: 18 }}><div className="h-title">{value}</div><div className="mono" style={{ color: "var(--text-3)", marginTop: 6 }}>{label}</div></div>)}
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">VENUE CHECK-IN ENTRY</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>Display or share the attendee check-in link</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>This is the real registered-attendee route. No QR image is generated without a verified local QR encoder; copy or project this link instead.</p>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <a className="btn btn-ghost" href={checkInHref} rel="noreferrer" target="_blank"><Icon name="arrowUR" size={16} />Open check-in page</a>
                <button className="btn btn-primary" onClick={copyCheckInLink} type="button"><Icon color="var(--on-dark)" name="copy" size={16} />Copy link</button>
                <code style={{ background: "var(--surface-2)", borderRadius: 8, flex: "1 1 360px", overflowWrap: "anywhere", padding: "10px 12px" }}>{checkInHref}</code>
              </div>
              <div style={{ color: checkInOpen ? "var(--accent)" : "var(--text-3)", fontSize: 12, marginTop: 10 }}>Check-in window: {checkInOpen ? "open now" : "closed or not yet open"}</div>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                <div><div className="eyebrow">STRICT AI PIPELINE</div><h2 className="h-title" style={{ margin: "8px 0 0" }}>Generations</h2></div>
                <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" disabled={busy === "start"} onClick={startGeneration} type="button"><Icon color="var(--on-dark)" name="sparkle" size={16} />Capture snapshot</button>
                </div>
              </div>
              <p style={{ color: "var(--text-3)", fontSize: 13 }}>A generation is never visible to attendees until every task completes and you publish it. Invalid/missing/timeout AI output stays failed.</p>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {workspace.generations.length === 0 ? <div>No generation has been started.</div> : null}
                {workspace.generations.map(({ generation, progress }) => (
                  <article key={generation.generationId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                    <div style={{ alignItems: "start", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                      <div><strong>{generation.generationId}</strong><div className="mono" style={{ color: "var(--text-3)", fontSize: 11, marginTop: 5 }}>snapshot {generation.snapshot.hash} · {generation.snapshot.participants.length} participants</div></div>
                      <span className={generation.status === "failed" ? "badge badge-ended" : generation.status === "published" ? "badge badge-live" : "badge"}>{generation.status}</span>
                    </div>
                    <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 12 }}>{progress.completedTasks}/{progress.totalTasks} complete · {progress.failedTasks} failed · {progress.percent}%</div>
                    {generation.errorMessage ? <div style={{ color: "var(--rose)", fontSize: 12, marginTop: 8 }}>{generation.errorCode}: {generation.errorMessage}</div> : null}
                    <button className="btn btn-ghost btn-sm" disabled={generation.status === "published" || generation.status === "queued" || generation.status === "running" || busy?.startsWith(generation.generationId)} onClick={() => generationAction(generation)} style={{ marginTop: 12 }} type="button">{generationActionLabel(generation)}</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">PUBLISHED SEATING PREVIEW</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>Round one and round two tables</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>This preview reads only the atomically published result: real table numbers, seats, topics, table rationale, and table-level icebreakers.</p>
              {workspace.publishedResult ? (
                <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", marginTop: 16 }}>
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundOne} title="Round one · assigned tables" />
                  <PublishedRoundPreview participantNames={participantNames} tables={workspace.publishedResult.grouping.roundTwo} title="Round two · topic tables" />
                </div>
              ) : (
                <div style={{ border: "1px dashed var(--border)", borderRadius: 12, color: "var(--text-3)", marginTop: 14, padding: 16 }}>No published seating result yet. Completed generations remain invisible here until the organizer publishes atomically.</div>
              )}
            </section>

            <section className="card" style={{ marginTop: 18, overflowX: "auto", padding: 20 }}>
              <div className="eyebrow">REAL REGISTRATION DIRECTORY</div>
              <h2 className="h-title" style={{ margin: "8px 0 4px" }}>Participants and arrival state</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 14px" }}>{workspace.participants.length - workspace.checkIns.length} not arrived · mark each person individually through the organizer-only API.</p>
              <table style={{ borderCollapse: "collapse", minWidth: 820, width: "100%" }}>
                <thead><tr>{["Participant", "Company / role", "Industry", "Profile", "Late", "Check-in"].map((label) => <th key={label} style={{ borderBottom: "1px solid var(--border)", padding: 10, textAlign: "left" }}>{label}</th>)}</tr></thead>
                <tbody>{workspace.participants.map((participant) => {
                  const checkIn = checkInsByParticipant.get(participant.participantId);
                  return <tr key={participant.participantId}><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}><strong>{participant.displayName}</strong><div className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>{participant.participantId}</div></td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{[participant.role, participant.company].filter(Boolean).join(" · ") || "—"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.industry ?? "—"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.profileCompleteness}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{participant.lateRegistration ? "yes" : "no"}</td><td style={{ borderBottom: "1px solid var(--border)", padding: 10 }}>{checkIn ? <div><span className="badge badge-live">checked in</span><div style={{ color: "var(--text-3)", fontSize: 10, marginTop: 4 }}>{formatTimestamp(checkIn.checkedInAt)}</div></div> : <button className="btn btn-ghost btn-sm" disabled={!checkInOpen || busy !== null} onClick={() => markParticipantArrived(participant.participantId)} type="button">{busy === `checkin:${participant.participantId}` ? "Recording…" : checkInOpen ? "Mark arrived" : "Check-in closed"}</button>}</td></tr>;
                })}</tbody>
              </table>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">CONSENT AUDIT</div><h2 className="h-title" style={{ margin: "8px 0 14px" }}>Business-card requests</h2>
              {workspace.contactRequests.length === 0 ? <div>No contact request has been made.</div> : workspace.contactRequests.map((request) => <div key={request.requestId} style={{ borderTop: "1px solid var(--border)", display: "grid", gap: 5, padding: "12px 0" }}><strong>{request.requesterParticipantId} → {request.targetParticipantId}</strong><span>{request.status}</span></div>)}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
