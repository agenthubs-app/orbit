"use client";

import { PublicTopNav } from "../../../../orbit-public-shell";
import { Icon } from "../../../../orbit-reference-primitives";
import {
  ROLE_OPTIONS,
  roleFromValue,
  roleLabel,
  useRoleManagement,
  type PrincipalRole,
} from "../../../ops-0918/use-role-management";

function RoleBadge({ role }: { role: PrincipalRole }) {
  return <span className={role === "owner" ? "badge badge-live" : "badge"}>{roleLabel[role]}</span>;
}

export function EventRoleManagementWorkspace({ eventId }: { eventId: string }) {
  const {
    busy,
    delegatedMembers,
    error,
    grantOrChange,
    load,
    loading,
    memberEdits,
    newReason,
    newRole,
    newSubjectActorId,
    notice,
    participantLabelByActorId,
    participantOptions,
    revoke,
    setMemberEdits,
    setNewReason,
    setNewRole,
    setNewSubjectActorId,
    snapshot,
  } = useRoleManagement(eventId);

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
