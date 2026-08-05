"use client";

import { useEffect, useState } from "react";
import { useOrbitLanguage } from "../../orbit-language-context";

interface ReadyArtifact {
  generatedAt: string;
  messageDraft: string | null;
  model: string;
  provider: string;
  summary: string;
}

interface ConfirmedFollowupView {
  contactId: string;
  createdAt: string | null;
  dueAt: string | null;
  encounterId: string;
  evidenceIds: readonly string[];
  noteExcerpt: string;
  reminderId: string;
  reminderStatus: "dismissed" | "failed" | "missing" | "pending" | "sent";
  sourceIndex: number;
  sourceKind: "commitment" | "next_step";
  sourceText: string;
  state: "available" | "completed" | "created" | "dismissed" | "partial";
  taskHref: "/app/followups";
  taskId: string;
  taskStatus: "completed" | "dismissed" | "missing" | "open" | "scheduled";
}

type AiArtifactState =
  | "checking"
  | "evidence_required"
  | "failed"
  | "not_available"
  | "not_requested"
  | "provider_unconfigured"
  | "queued"
  | "ready"
  | "running"
  | "service_unavailable";

export function OrbitPostEventCenter({ acceptedContacts, eventId }: { acceptedContacts: number; eventId: string }) {
  const { t } = useOrbitLanguage();
  const [encounters, setEncounters] = useState(0);
  const [completedMeetings, setCompletedMeetings] = useState(0);
  const [aiState, setAiState] = useState<AiArtifactState>("checking");
  const [aiFailureCode, setAiFailureCode] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ReadyArtifact | null>(null);
  const [followups, setFollowups] = useState<readonly ConfirmedFollowupView[]>([]);
  const [followupState, setFollowupState] = useState<"loading" | "ready" | "failed">("loading");
  const [confirmingFollowup, setConfirmingFollowup] = useState<string | null>(null);
  const [followupDueAt, setFollowupDueAt] = useState("");
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [savingFollowup, setSavingFollowup] = useState(false);
  function applyArtifactResponse(body: any, ok: boolean): void {
    const state = body?.data?.status;
    const readyArtifact = body?.data?.artifact;
    const failureCode = typeof body?.data?.failureCode === "string" ? body.data.failureCode : null;
    if (ok && state === "ready" && readyArtifact && typeof readyArtifact.summary === "string") {
      setArtifact(readyArtifact as ReadyArtifact);
      setAiFailureCode(null);
      setAiState("ready");
    } else if (ok && (state === "queued" || state === "running")) {
      setArtifact(null);
      setAiFailureCode(failureCode);
      setAiState(state);
    } else if (ok && state === "unconfigured") {
      setArtifact(null);
      setAiFailureCode(failureCode);
      setAiState(failureCode === "AI_PROVIDER_UNCONFIGURED"
        ? "provider_unconfigured"
        : failureCode === "AI_ARTIFACT_SERVICE_UNAVAILABLE"
          ? "service_unavailable"
          : "not_requested");
    } else if (ok && state === "failed") {
      setArtifact(null);
      setAiFailureCode(failureCode);
      setAiState(failureCode === "EVENT_NOT_ENDED"
        ? "not_available"
        : failureCode === "AI_EVIDENCE_REQUIRED"
          ? "evidence_required"
          : "failed");
    } else {
      setArtifact(null);
      setAiFailureCode(typeof body?.error?.code === "string" ? body.error.code : "AI_ARTIFACT_REQUEST_FAILED");
      setAiState("failed");
    }
  }
  async function requestArtifact(): Promise<void> {
    setAiState("checking");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/artifact`, { method: "POST" });
      applyArtifactResponse(await response.json(), response.ok);
    } catch {
      setArtifact(null);
      setAiFailureCode("NETWORK_ERROR");
      setAiState("failed");
    }
  }
  function followupKey(value: Pick<ConfirmedFollowupView, "encounterId" | "sourceIndex" | "sourceKind">): string {
    return [value.encounterId, value.sourceKind, String(value.sourceIndex)]
      .map((part) => encodeURIComponent(part))
      .join("--");
  }
  async function confirmFollowup(value: ConfirmedFollowupView): Promise<void> {
    setSavingFollowup(true);
    setFollowupError(null);
    try {
      const parsedDueAt = followupDueAt ? new Date(followupDueAt) : null;
      if (parsedDueAt && !Number.isFinite(parsedDueAt.getTime())) throw new Error(t({ en: "Choose a valid due time.", zh: "请选择有效的到期时间。" }));
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/followups`, {
        body: JSON.stringify({
          dueAt: parsedDueAt?.toISOString() ?? null,
          encounterId: value.encounterId,
          sourceIndex: value.sourceIndex,
          sourceKind: value.sourceKind,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? t({ en: "Follow-up creation failed.", zh: "创建跟进失败。" }));
      const saved = body.data as ConfirmedFollowupView;
      setFollowups((current) => current.map((item) => followupKey(item) === followupKey(saved) ? saved : item));
      setConfirmingFollowup(null);
      setFollowupDueAt("");
    } catch (error) {
      setFollowupError(error instanceof Error ? error.message : t({ en: "Follow-up creation failed.", zh: "创建跟进失败。" }));
    } finally {
      setSavingFollowup(false);
    }
  }
  useEffect(() => {
    void Promise.all([
      fetch(`/api/encounters?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/appointments", { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/artifact`, { cache: "no-store" }).then(async (response) => ({ body: await response.json(), ok: response.ok })),
      fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/followups`, { cache: "no-store" }).then(async (response) => ({ body: await response.json(), ok: response.ok })),
    ]).then(([encounterBody, appointmentBody, review, followupResponse]) => {
      setEncounters(Array.isArray(encounterBody?.data)
        ? encounterBody.data.filter((value: { talked?: string }) => value.talked === "yes").length
        : 0);
      setCompletedMeetings(Array.isArray(appointmentBody?.data) ? appointmentBody.data.filter((value: { eventId?: string; status?: string }) => value.eventId === eventId && value.status === "completed").length : 0);
      applyArtifactResponse(review.body, review.ok);
      if (followupResponse.ok && Array.isArray(followupResponse.body?.data)) {
        setFollowups(followupResponse.body.data as ConfirmedFollowupView[]);
        setFollowupState("ready");
      } else {
        setFollowupState("failed");
      }
    }).catch(() => {
      setAiFailureCode("NETWORK_ERROR");
      setAiState("failed");
      setFollowupState("failed");
    });
  }, [eventId]);
  useEffect(() => {
    if (aiState !== "queued" && aiState !== "running") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/artifact`, { cache: "no-store" })
        .then(async (response) => applyArtifactResponse(await response.json(), response.ok))
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [aiState, eventId]);
  const aiCopy = aiState === "not_available"
    ? t({ en: "The AI review becomes available after this event ends. There is nothing to retry yet.", zh: "活动结束后才会开放 AI 会后复盘，目前无需重试。" })
    : aiState === "not_requested"
      ? t({ en: "No AI review has been requested for your current encounter evidence.", zh: "尚未基于你当前的交流证据发起 AI 会后复盘。" })
      : aiState === "provider_unconfigured"
        ? t({ en: "The AI provider is not configured. No fallback or generated prose is shown.", zh: "AI 服务尚未配置；不会展示备用文案或伪生成内容。" })
        : aiState === "service_unavailable"
          ? t({ en: "The AI artifact service is temporarily unavailable. No request was submitted and no fallback is shown.", zh: "AI 产物服务暂时不可用；本次未提交生成请求，也不会展示备用文案。" })
          : aiState === "evidence_required"
            ? t({ en: "Record a confirmed conversation with a note, next step, or commitment before requesting an AI review.", zh: "请先记录一段已确认的真实交流，并填写笔记、下一步或承诺，再发起 AI 复盘。" })
            : aiState === "queued"
              ? t({ en: "The real AI review is queued. Your evidence remains available while you wait.", zh: "真实 AI 复盘正在排队；等待期间交流证据仍可查看。" })
              : aiState === "running"
                ? t({ en: "Real AI generation is running. No draft is exposed before it is stored and ready.", zh: "真实 AI 正在生成；产物存储并就绪前不展示草稿。" })
                : aiState === "ready"
                  ? t({ en: "A provider-generated review is ready from your permitted evidence.", zh: "基于你有权访问的证据，真实 AI 复盘已就绪。" })
                  : aiState === "checking"
                    ? t({ en: "Checking AI review state…", zh: "正在检查 AI 复盘状态…" })
                    : aiFailureCode === "MODEL_REQUEST_FAILED"
                      ? t({ en: "The AI provider rejected or stopped this generation. No fallback was created; retry after the provider issue is resolved.", zh: "AI 服务拒绝或中止了本次生成。系统未创建备用内容；请在服务问题解决后重试。" })
                      : aiFailureCode === "AI_ARTIFACT_POLICY_REJECTED"
                        ? t({ en: "The stored artifact did not pass evidence policy checks and was not shown. No fallback was created.", zh: "已存储产物未通过证据策略校验，因此未展示；系统未创建备用内容。" })
                        : t({ en: "AI generation failed. No fallback or fabricated prose is shown.", zh: "AI 生成失败；不会展示备用或虚构文案。" });
  const evidenceDone = Number(acceptedContacts > 0) + Number(encounters > 0) + Number(completedMeetings > 0);
  return <section className="card-flat" data-post-event-center style={{ display: "grid", gap: 12, padding: 14 }}>
    <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
      <div><span className="eyebrow">POST-EVENT</span><h4 style={{ margin: "4px 0 0" }}>{t({ en: "Post-event center", zh: "会后中心" })}</h4></div>
      <a
        className="btn btn-ghost btn-sm"
        data-post-event-report-link
        href={`/app/events/${encodeURIComponent(eventId)}/analytics`}
      >
        {t({ en: "View full event report", zh: "查看完整活动报告" })}
      </a>
    </div>
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}><div className="card-flat" style={{ padding: 10 }}><strong>{acceptedContacts}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "accepted contacts", zh: "已交换名片" })}</div></div><div className="card-flat" style={{ padding: 10 }}><strong>{encounters}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "encounters", zh: "真实交流记录" })}</div></div><div className="card-flat" style={{ padding: 10 }}><strong>{completedMeetings}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "completed meetings", zh: "已完成约谈" })}</div></div></div>
    <div><strong>{t({ en: `Evidence progress ${evidenceDone}/3`, zh: `证据完成度 ${evidenceDone}/3` })}</strong><div aria-label={t({ en: "Evidence progress", zh: "证据完成度" })} style={{ background: "var(--surface-2)", borderRadius: 999, height: 7, marginTop: 6, overflow: "hidden" }}><div style={{ background: "var(--accent)", height: "100%", width: `${evidenceDone / 3 * 100}%` }} /></div></div>
    <div className="card-flat" data-confirmed-event-followups style={{ display: "grid", gap: 9, padding: 11 }}>
      <div><strong>{t({ en: "Turn meeting evidence into a follow-up", zh: "把会上证据变成跟进" })}</strong><p style={{ color: "var(--text-2)", fontSize: 12, margin: "5px 0 0" }}>{t({ en: "Choose a next step or commitment that you recorded. Orbit creates a private task and an in-app reminder only after you confirm.", zh: "选择你亲自记录的下一步或承诺。只有再次确认后，Orbit 才会创建私有任务和站内提醒。" })}</p></div>
      {followupState === "loading" ? <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>{t({ en: "Loading recorded evidence…", zh: "正在读取已记录证据…" })}</p> : null}
      {followupState === "failed" ? <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{t({ en: "Follow-up evidence is temporarily unavailable. No task was created.", zh: "跟进证据暂时不可用，未创建任何任务。" })}</p> : null}
      {followupState === "ready" && followups.length === 0 ? <p style={{ color: "var(--text-3)", fontSize: 12, margin: 0 }}>{t({ en: "Record an explicit next step or commitment after a real conversation to create a follow-up here.", zh: "请在真实交流记录中填写明确的下一步或承诺，随后可在这里创建跟进。" })}</p> : null}
      {followups.map((followup) => {
        const key = followupKey(followup);
        const confirming = confirmingFollowup === key;
        const terminal = followup.state === "completed" || followup.state === "dismissed";
        const taskStatusLabel = followup.taskStatus === "open" ? t({ en: "open", zh: "进行中" }) : followup.taskStatus === "scheduled" ? t({ en: "scheduled", zh: "已排期" }) : followup.taskStatus === "completed" ? t({ en: "completed", zh: "已完成" }) : followup.taskStatus === "dismissed" ? t({ en: "dismissed", zh: "已忽略" }) : t({ en: "missing", zh: "缺失" });
        const reminderStatusLabel = followup.reminderStatus === "pending" ? t({ en: "pending", zh: "待触发" }) : followup.reminderStatus === "sent" ? t({ en: "sent", zh: "已发送" }) : followup.reminderStatus === "failed" ? t({ en: "failed", zh: "失败" }) : followup.reminderStatus === "dismissed" ? t({ en: "dismissed", zh: "已忽略" }) : t({ en: "missing", zh: "缺失" });
        return <div className="card-flat" data-followup-evidence={key} key={key} style={{ display: "grid", gap: 8, padding: 10 }}>
          <div style={{ alignItems: "start", display: "flex", gap: 10, justifyContent: "space-between" }}>
            <div style={{ minWidth: 0 }}><span className="eyebrow">{followup.sourceKind === "next_step" ? t({ en: "NEXT STEP", zh: "下一步" }) : t({ en: "COMMITMENT", zh: "承诺" })}</span><p style={{ fontSize: 13, fontWeight: 600, margin: "3px 0 0" }}>{followup.sourceText}</p>{followup.noteExcerpt ? <p style={{ color: "var(--text-3)", fontSize: 11, margin: "4px 0 0" }}>{followup.noteExcerpt}</p> : null}</div>
            {followup.state === "created" ? <span className="badge badge-success" data-followup-created>{t({ en: "Created", zh: "已创建" })}</span> : terminal ? <span className="badge" data-followup-terminal={followup.state}>{followup.state === "completed" ? t({ en: "Completed", zh: "已完成" }) : t({ en: "Dismissed", zh: "已忽略" })}</span> : <button className="btn btn-ghost btn-sm" data-followup-review onClick={() => { setConfirmingFollowup(key); setFollowupDueAt(""); setFollowupError(null); }} type="button">{followup.state === "partial" ? t({ en: "Repair task or reminder", zh: "补全任务或提醒" }) : t({ en: "Create follow-up", zh: "创建跟进" })}</button>}
          </div>
          {followup.state !== "available" ? <div data-followup-real-state style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: `Task ${taskStatusLabel} · in-app reminder ${reminderStatusLabel} · ${followup.dueAt ? new Date(followup.dueAt).toLocaleString() : "due time unavailable"}`, zh: `任务${taskStatusLabel} · 站内提醒${reminderStatusLabel} · ${followup.dueAt ? new Date(followup.dueAt).toLocaleString() : "到期时间不可用"}` })}{followup.taskStatus !== "missing" ? <> · <a href={followup.taskHref}>{t({ en: "Open task center", zh: "打开任务中心" })}</a></> : null}</div> : null}
          {confirming ? <div className="card-flat" data-followup-confirmation style={{ background: "var(--surface-2)", display: "grid", gap: 8, padding: 10 }}>
            <strong style={{ fontSize: 12 }}>{t({ en: "Confirm creating a real task and reminder", zh: "确认创建真实任务和提醒" })}</strong>
            <p style={{ color: "var(--text-2)", fontSize: 11, margin: 0 }}>{t({ en: "The source text is re-read from your event encounter on the server. This will not message the other attendee or use an external delivery channel.", zh: "服务端会重新读取你在本活动中的交流证据；不会给对方发消息，也不会调用外部投递渠道。" })}</p>
            <label htmlFor={`followup-due-at-${key}`} style={{ display: "grid", fontSize: 11, gap: 4 }}>{t({ en: "Due time (optional; defaults to 3 days from now)", zh: "到期时间（可选；留空则默认三天后）" })}<input className="field" data-followup-due-at id={`followup-due-at-${key}`} name="followupDueAt" onChange={(event) => setFollowupDueAt(event.target.value)} type="datetime-local" value={followupDueAt} /></label>
            {followupError ? <p role="alert" style={{ color: "var(--danger)", fontSize: 11, margin: 0 }}>{followupError}</p> : null}
            <div style={{ display: "flex", gap: 8 }}><button className="btn btn-primary btn-sm" data-followup-confirm disabled={savingFollowup} onClick={() => void confirmFollowup(followup)} type="button">{savingFollowup ? t({ en: "Creating…", zh: "正在创建…" }) : t({ en: "Confirm task + in-app reminder", zh: "确认创建任务 + 站内提醒" })}</button><button className="btn btn-ghost btn-sm" disabled={savingFollowup} onClick={() => { setConfirmingFollowup(null); setFollowupError(null); }} type="button">{t({ en: "Cancel", zh: "取消" })}</button></div>
          </div> : null}
        </div>;
      })}
    </div>
    <div
      className="card-flat"
      data-post-event-ai-failure-code={aiFailureCode ?? undefined}
      data-post-event-ai-state={aiState}
      style={{ padding: 11 }}
    >
      <strong>{t({ en: "AI review", zh: "AI 会后复盘" })}</strong>
      <p style={{ color: "var(--text-2)", fontSize: 12, margin: "5px 0 0" }}>{aiCopy}</p>
      {aiState === "not_requested" ? <button
        className="btn btn-ghost btn-sm"
        data-post-event-ai-action="request"
        disabled={encounters === 0}
        onClick={() => void requestArtifact()}
        style={{ marginTop: 8 }}
        type="button"
      >
        {encounters === 0 ? t({ en: "Record an encounter first", zh: "请先记录真实交流" }) : t({ en: "Request AI review", zh: "请求 AI 复盘" })}
      </button> : null}
      {aiState === "failed" && aiFailureCode !== "AI_ARTIFACT_POLICY_REJECTED" ? <button
        className="btn btn-ghost btn-sm"
        data-post-event-ai-action="retry"
        disabled={encounters === 0}
        onClick={() => void requestArtifact()}
        style={{ marginTop: 8 }}
        type="button"
      >
        {encounters === 0 ? t({ en: "Record an encounter first", zh: "请先记录真实交流" }) : t({ en: "Retry AI review", zh: "重试 AI 复盘" })}
      </button> : null}
      {aiState === "ready" && artifact ? <div data-post-event-ai-artifact style={{ display: "grid", gap: 8, marginTop: 10 }}><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{artifact.summary}</p>{artifact.messageDraft ? <div className="card-flat" style={{ padding: 10 }}><strong style={{ fontSize: 12 }}>{t({ en: "Message draft", zh: "消息草稿" })}</strong><p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{artifact.messageDraft}</p></div> : null}<div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}><small style={{ color: "var(--text-3)" }}>{artifact.provider} · {artifact.model} · {new Date(artifact.generatedAt).toLocaleString()}</small><button className="btn btn-ghost btn-sm" data-post-event-ai-action="regenerate" onClick={() => void requestArtifact()} type="button">{t({ en: "Regenerate AI review", zh: "重新生成 AI 复盘" })}</button></div></div> : null}
    </div>
  </section>;
}
