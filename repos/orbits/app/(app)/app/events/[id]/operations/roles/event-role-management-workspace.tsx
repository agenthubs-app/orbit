"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PublicTopNav } from "../../../../orbit-public-shell";
import { Icon } from "../../../../orbit-reference-primitives";

type DelegatedRole =
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";
type PrincipalRole = "owner" | DelegatedRole;

interface EventView {
  endsAt: string | null;
  eventId: string;
  lifecycleState: string;
  migrationPending: boolean;
  owner: boolean;
  revision: number;
  role: PrincipalRole;
  startsAt: string | null;
  title: string | null;
  venue: string | null;
}

interface RoleMember {
  assignedAt: string | null;
  assignedByActorId: string | null;
  eventId: string;
  reason: string | null;
  revision: number;
  role: PrincipalRole;
  state: "active";
  subjectActorId: string;
}

interface RoleMembersPayload {
  event: EventView;
  members: readonly RoleMember[];
}

interface AssignmentView {
  eventId: string;
  owner: boolean;
  revision: number;
  role: DelegatedRole | null;
  state: "active" | "revoked" | null;
  subjectActorId: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
const ROLE_OPTIONS: readonly {
  description: string;
  label: string;
  value: DelegatedRole;
}[] = [
  { description: "配置运营、受保护参会信息、现场流程与发布。", label: "运营", value: "operations" },
  { description: "仅受限签到名单与签到写入。", label: "签到", value: "check_in" },
  { description: "报名审阅与准入决定。", label: "审核", value: "reviewer" },
  { description: "仅活动汇总分析，不含个人名单。", label: "只读分析", value: "read_only_analyst" },
];

const roleLabel: Record<PrincipalRole, string> = {
  check_in: "签到",
  operations: "运营",
  owner: "活动负责人",
  read_only_analyst: "只读分析",
  reviewer: "审核",
};

function validReason(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 1_000 ? trimmed : null;
}

function roleFromValue(value: string): DelegatedRole {
  return ROLE_OPTIONS.some((option) => option.value === value)
    ? (value as DelegatedRole)
    : "operations";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new RequestError(
      envelope?.error?.message ?? "角色请求失败。",
      response.status,
    );
  }
  return envelope.data;
}

function RoleBadge({ role }: { role: PrincipalRole }) {
  return <span className={role === "owner" ? "badge badge-live" : "badge"}>{roleLabel[role]}</span>;
}

export function EventRoleManagementWorkspace({ eventId }: { eventId: string }) {
  const baseUrl = `/api/events/${encodeURIComponent(eventId)}/access`;
  const [snapshot, setSnapshot] = useState<RoleMembersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSubjectActorId, setNewSubjectActorId] = useState("");
  const [newRole, setNewRole] = useState<DelegatedRole>("operations");
  const [newReason, setNewReason] = useState("");
  const [memberEdits, setMemberEdits] = useState<Record<string, { reason: string; role: DelegatedRole }>>({});
  // Registered participants of this event double as the candidate pool, so the
  // owner can pick a person by name instead of hunting down a raw actor id.
  // Loading this is best-effort: without the sensitive-read capability the
  // manual actor-id input still works on its own.
  const [participantOptions, setParticipantOptions] = useState<
    readonly { actorId: string; label: string }[] | null
  >(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/operations/admin`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          data?: { participants?: readonly { actorId?: string; company?: string | null; displayName?: string }[] };
        } | null;
        const participants = body?.data?.participants ?? [];
        const seen = new Set<string>();
        const options = participants
          .filter((participant): participant is { actorId: string; company?: string | null; displayName?: string } =>
            typeof participant.actorId === "string" && participant.actorId.trim().length > 0)
          .filter((participant) => {
            if (seen.has(participant.actorId)) return false;
            seen.add(participant.actorId);
            return true;
          })
          .map((participant) => ({
            actorId: participant.actorId,
            label: [participant.displayName, participant.company].filter(Boolean).join(" · ") || participant.actorId,
          }))
          .sort((left, right) => left.label.localeCompare(right.label));
        if (active && options.length) setParticipantOptions(options);
      } catch {
        // Best-effort enrichment only; manual input remains available.
      }
    })();
    return () => { active = false; };
  }, [eventId]);

  const participantLabelByActorId = useMemo(
    () => new Map((participantOptions ?? []).map((option) => [option.actorId, option.label])),
    [participantOptions],
  );

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const next = await requestJson<RoleMembersPayload>(`${baseUrl}/roles`);
      setSnapshot(next);
      setMemberEdits((current) => {
        const nextEdits: Record<string, { reason: string; role: DelegatedRole }> = {};
        for (const member of next.members) {
          if (member.role === "owner") continue;
          nextEdits[member.subjectActorId] = current[member.subjectActorId] ?? {
            reason: "",
            role: member.role,
          };
        }
        return nextEdits;
      });
      setError(null);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "无法读取当前活动角色。");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const delegatedMembers = useMemo(
    () => snapshot?.members.filter((member) => member.role !== "owner") ?? [],
    [snapshot],
  );

  async function currentAssignment(subjectActorId: string): Promise<AssignmentView> {
    return requestJson<AssignmentView>(
      `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}`,
    );
  }

  async function grantOrChange(input: {
    reason: string;
    role: DelegatedRole;
    subjectActorId: string;
  }) {
    const subjectActorId = input.subjectActorId.trim();
    const reason = validReason(input.reason);
    if (!ACTOR_ID.test(subjectActorId)) {
      setError("请输入准确的账号 ID；此处不提供全库模糊搜索。");
      return;
    }
    if (!reason) {
      setError("请填写 1–1000 个字符的授权或变更原因。");
      return;
    }
    setBusy(`grant:${subjectActorId}`);
    setError(null);
    setNotice(null);
    try {
      // Do not infer revision from the visible active roster: a revoked subject
      // is absent there but retains its durable assignment head revision.
      const current = await currentAssignment(subjectActorId);
      if (current.owner) {
        throw new Error("活动负责人来自 Event Core，不能被授予委派角色。");
      }
      const after = await requestJson<AssignmentView>(
        `${baseUrl}/assignments/${encodeURIComponent(subjectActorId)}`,
        {
          body: JSON.stringify({
            expectedRevision: current.revision,
            reason,
            role: input.role,
          }),
          method: "PUT",
        },
      );
      setNotice(
        current.state === "revoked"
          ? `已按最新版本重新授予 ${roleLabel[input.role]}（版本 ${after.revision}）。`
          : current.state === "active"
            ? `已按最新版本更新为${roleLabel[input.role]}（版本 ${after.revision}）。`
            : `已授予${roleLabel[input.role]}（版本 ${after.revision}）。`,
      );
      setNewSubjectActorId("");
      setNewReason("");
      await load(false);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 409) {
        await load(false);
        setError("角色刚被其他管理员更新；已刷新当前版本，请确认后重试。");
      } else {
        setError(cause instanceof Error ? cause.message : "无法保存活动角色。");
      }
    } finally {
      setBusy(null);
    }
  }

  async function revoke(member: RoleMember) {
    const edit = memberEdits[member.subjectActorId];
    const reason = validReason(edit?.reason ?? "");
    if (!reason) {
      setError("撤销前请填写原因，以保留可审计记录。");
      return;
    }
    setBusy(`revoke:${member.subjectActorId}`);
    setError(null);
    setNotice(null);
    try {
      const current = await currentAssignment(member.subjectActorId);
      if (current.state !== "active") {
        await load(false);
        throw new Error("该角色已变化；已刷新当前角色表。");
      }
      const after = await requestJson<AssignmentView>(
        `${baseUrl}/assignments/${encodeURIComponent(member.subjectActorId)}`,
        {
          body: JSON.stringify({ expectedRevision: current.revision, reason }),
          method: "DELETE",
        },
      );
      setNotice(`已撤销 ${member.subjectActorId} 的${roleLabel[member.role]}角色（版本 ${after.revision}）。`);
      await load(false);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status === 409) {
        await load(false);
        setError("角色刚被其他管理员更新；已刷新当前版本，请确认后重试。");
      } else {
        setError(cause instanceof Error ? cause.message : "无法撤销活动角色。");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-orbit-real-page="event-role-management" style={{ minHeight: "100dvh" }}>
      <PublicTopNav active="events" />
      <main style={{ margin: "0 auto", maxWidth: 1100, padding: "28px clamp(16px,4vw,42px) 80px" }}>
        <a href={`/app/events/${encodeURIComponent(eventId)}/operations`} style={{ alignItems: "center", color: "var(--text-2)", display: "inline-flex", gap: 6, textDecoration: "none" }}>
          <Icon name="chevL" size={16} />返回运营台
        </a>
        <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", marginTop: 18 }}>
          <div>
            <div className="eyebrow">EVENT-SCOPED ACCESS</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>{snapshot?.event.title ?? "活动角色管理"}</h1>
            <p style={{ color: "var(--text-2)", lineHeight: 1.6, margin: "8px 0 0", maxWidth: 720 }}>
              负责人来自 Event Core；所有委派角色仅对当前活动生效。每次变更都会先读取最新版本，避免覆盖并发更新。
            </p>
          </div>
          <button className="btn btn-ghost" disabled={loading || busy !== null} onClick={() => void load()} type="button">
            <Icon name="refresh" size={16} />刷新角色
          </button>
        </div>

        {error ? <div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}>{error}</div> : null}
        {notice ? <div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}>{notice}</div> : null}
        {loading ? <div className="card" role="status" style={{ marginTop: 18, padding: 18 }}>正在读取当前角色…</div> : null}

        {!loading && snapshot ? (
          <>
            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">GRANT EVENT ROLE</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>授予活动范围角色</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>
                {participantOptions
                  ? <>可直接从本活动的已报名参会者中选择授权对象；活动之外的人员仍可粘贴准确的 <strong>账号 ID</strong>。</>
                  : <>当前授权边界只保存账号 ID，未接入经过授权的姓名或邮箱目录。请粘贴准确的 <strong>账号 ID</strong>；不会做模糊全库搜索。</>}
              </p>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", marginTop: 16 }}>
                {participantOptions ? (
                  <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                    <span className="mono">从参会者选择</span>
                    <select
                      className="field"
                      data-event-role-participant-picker
                      onChange={(input) => { if (input.target.value) setNewSubjectActorId(input.target.value); }}
                      value={participantLabelByActorId.has(newSubjectActorId) ? newSubjectActorId : ""}
                    >
                      <option value="">——手动输入账号 ID——</option>
                      {participantOptions.map((option) => (
                        <option key={option.actorId} value={option.actorId}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <span className="mono">账号 ID（精确值）</span>
                  <input className="field" data-event-role-subject="new" onChange={(input) => setNewSubjectActorId(input.target.value)} placeholder="actor:operations-01" value={newSubjectActorId} />
                  {participantLabelByActorId.has(newSubjectActorId) ? (
                    <span style={{ color: "var(--accent)", fontSize: 12 }}>参会者：{participantLabelByActorId.get(newSubjectActorId)}</span>
                  ) : null}
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <span className="mono">活动角色</span>
                  <select className="field" data-event-role-select="new" onChange={(input) => setNewRole(roleFromValue(input.target.value))} value={newRole}>
                    {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
                  <span className="mono">授权原因</span>
                  <input className="field" data-event-role-reason="new" onChange={(input) => setNewReason(input.target.value)} placeholder="例如：负责现场签到和嘉宾接待" value={newReason} />
                </label>
              </div>
              <div style={{ color: "var(--text-3)", display: "grid", fontSize: 12, gap: 4, lineHeight: 1.5, marginTop: 12 }}>
                {ROLE_OPTIONS.map((option) => <div key={option.value}><strong>{option.label}</strong> · {option.description}</div>)}
              </div>
              <button className="btn btn-primary" data-event-role-action="grant" disabled={busy !== null} onClick={() => void grantOrChange({ reason: newReason, role: newRole, subjectActorId: newSubjectActorId })} style={{ marginTop: 16 }} type="button">
                <Icon color="var(--on-dark)" name="plus" size={16} />{busy?.startsWith("grant:") ? "正在保存…" : "授予角色"}
              </button>
            </section>

            <section className="card" style={{ marginTop: 18, padding: 20 }}>
              <div className="eyebrow">CURRENT EVENT ROLES</div>
              <h2 className="h-title" style={{ margin: "8px 0 0" }}>当前活动角色</h2>
              <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6 }}>
                负责人不可改为委派角色。撤销后，账号不再出现在该活动的有效角色列表中；重新授予会读取其保留的版本号。
              </p>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {snapshot.members.map((member) => {
                  const edit = member.role === "owner"
                    ? null
                    : memberEdits[member.subjectActorId] ?? { reason: "", role: member.role };
                  return (
                    <article data-event-role-member={member.subjectActorId} key={member.subjectActorId} style={{ border: "1px solid var(--border)", borderRadius: 12, display: "grid", gap: 12, padding: 15 }}>
                      <div style={{ alignItems: "start", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
                        <div>
                          {participantLabelByActorId.has(member.subjectActorId) ? (
                            <strong style={{ display: "block" }}>{participantLabelByActorId.get(member.subjectActorId)}</strong>
                          ) : null}
                          <div className="mono" style={{ color: "var(--text-3)", fontSize: 10, marginTop: participantLabelByActorId.has(member.subjectActorId) ? 4 : 0 }}>账号 ID</div>
                          <strong style={{ fontSize: participantLabelByActorId.has(member.subjectActorId) ? 12 : undefined, fontWeight: participantLabelByActorId.has(member.subjectActorId) ? 500 : undefined, overflowWrap: "anywhere" }}>{member.subjectActorId}</strong>
                          <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 5 }}>当前版本 {member.revision}{member.assignedAt ? ` · 最近授权 ${new Date(member.assignedAt).toLocaleString()}` : " · 来自 Event Core"}</div>
                        </div>
                        <RoleBadge role={member.role} />
                      </div>
                      {member.role === "owner" ? <div style={{ color: "var(--text-2)", fontSize: 13 }}>负责人由 Event Core organizer 派生，不能在此撤销或变更。</div> : (
                        <>
                          <div style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5 }}>上次操作：{member.reason ?? "—"}</div>
                          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                            <select className="field" data-event-role-select={member.subjectActorId} onChange={(input) => setMemberEdits((current) => {
                              const currentEdit = current[member.subjectActorId] ?? { reason: "", role: roleFromValue(member.role) };
                              return {
                                ...current,
                                [member.subjectActorId]: {
                                  ...currentEdit,
                                  role: roleFromValue(input.target.value),
                                },
                              };
                            })} value={edit!.role}>
                              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <input className="field" data-event-role-reason={member.subjectActorId} onChange={(input) => setMemberEdits((current) => {
                              const currentEdit = current[member.subjectActorId] ?? { reason: "", role: roleFromValue(member.role) };
                              return {
                                ...current,
                                [member.subjectActorId]: {
                                  ...currentEdit,
                                  reason: input.target.value,
                                },
                              };
                            })} placeholder="填写变更或撤销原因" value={edit!.reason} />
                            <button className="btn btn-ghost btn-sm" data-event-role-action={`change:${member.subjectActorId}`} disabled={busy !== null} onClick={() => void grantOrChange({ reason: edit!.reason, role: edit!.role, subjectActorId: member.subjectActorId })} type="button">更新角色</button>
                            <button className="btn btn-ghost btn-sm" data-event-role-action={`revoke:${member.subjectActorId}`} disabled={busy !== null} onClick={() => void revoke(member)} type="button">撤销</button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
                {delegatedMembers.length === 0 ? <div style={{ color: "var(--text-3)", fontSize: 13 }}>除 Event Core 负责人外，尚无有效委派角色。</div> : null}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
