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

export function OrbitPostEventCenter({ acceptedContacts, eventId }: { acceptedContacts: number; eventId: string }) {
  const { t } = useOrbitLanguage();
  const [encounters, setEncounters] = useState(0);
  const [completedMeetings, setCompletedMeetings] = useState(0);
  const [aiState, setAiState] = useState<"checking" | "unconfigured" | "queued" | "running" | "failed" | "ready">("checking");
  const [artifact, setArtifact] = useState<ReadyArtifact | null>(null);
  function applyArtifactResponse(body: any, ok: boolean): void {
    const state = body?.data?.status;
    const readyArtifact = body?.data?.artifact;
    if (ok && state === "ready" && readyArtifact && typeof readyArtifact.summary === "string") {
      setArtifact(readyArtifact as ReadyArtifact);
      setAiState("ready");
    } else if (state === "queued" || state === "running" || state === "failed" || state === "unconfigured") {
      setArtifact(null);
      setAiState(state);
    } else {
      setArtifact(null);
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
      setAiState("failed");
    }
  }
  useEffect(() => {
    void Promise.all([
      fetch(`/api/encounters?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/appointments", { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/events/${encodeURIComponent(eventId)}/post-event/artifact`, { cache: "no-store" }).then(async (response) => ({ body: await response.json(), ok: response.ok })),
    ]).then(([encounterBody, appointmentBody, review]) => {
      setEncounters(Array.isArray(encounterBody?.data) ? encounterBody.data.length : 0);
      setCompletedMeetings(Array.isArray(appointmentBody?.data) ? appointmentBody.data.filter((value: { eventId?: string; status?: string }) => value.eventId === eventId && value.status === "completed").length : 0);
      applyArtifactResponse(review.body, review.ok);
    }).catch(() => setAiState("failed"));
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
  const evidenceDone = Number(acceptedContacts > 0) + Number(encounters > 0) + Number(completedMeetings > 0);
  return <section className="card-flat" data-post-event-center style={{ display: "grid", gap: 12, padding: 14 }}>
    <div><span className="eyebrow">POST-EVENT</span><h4 style={{ margin: "4px 0 0" }}>{t({ en: "Post-event center", zh: "会后中心" })}</h4></div>
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}><div className="card-flat" style={{ padding: 10 }}><strong>{acceptedContacts}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "accepted contacts", zh: "已交换名片" })}</div></div><div className="card-flat" style={{ padding: 10 }}><strong>{encounters}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "encounters", zh: "真实交流记录" })}</div></div><div className="card-flat" style={{ padding: 10 }}><strong>{completedMeetings}</strong><div style={{ color: "var(--text-3)", fontSize: 11 }}>{t({ en: "completed meetings", zh: "已完成约谈" })}</div></div></div>
    <div><strong>{t({ en: `Evidence progress ${evidenceDone}/3`, zh: `证据完成度 ${evidenceDone}/3` })}</strong><div aria-label={t({ en: "Evidence progress", zh: "证据完成度" })} style={{ background: "var(--surface-2)", borderRadius: 999, height: 7, marginTop: 6, overflow: "hidden" }}><div style={{ background: "var(--accent)", height: "100%", width: `${evidenceDone / 3 * 100}%` }} /></div></div>
    <div className="card-flat" data-post-event-ai-state={aiState} style={{ padding: 11 }}><strong>{t({ en: "AI review", zh: "AI 会后复盘" })}</strong><p style={{ color: "var(--text-2)", fontSize: 12, margin: "5px 0 0" }}>{aiState === "unconfigured" ? t({ en: "No attendee artifact request is configured, or the AI provider is unavailable. No generated prose is shown.", zh: "尚未配置参会者 AI 产物请求，或 AI 服务不可用；不展示生成文案。" }) : aiState === "queued" ? t({ en: "Real AI artifact is queued. Evidence remains available while you wait.", zh: "真实 AI 产物正在排队；等待期间仍可查看证据。" }) : aiState === "running" ? t({ en: "Real AI generation is running. No draft is exposed before it is stored and ready.", zh: "真实 AI 正在生成；产物存储并 ready 前不展示草稿。" }) : aiState === "ready" ? t({ en: "A provider-generated artifact is ready from your permitted evidence.", zh: "基于你有权访问的证据，真实 AI 产物已就绪。" }) : aiState === "checking" ? t({ en: "Checking AI artifact state…", zh: "正在检查 AI 产物状态…" }) : t({ en: "AI generation failed or needs explicit encounter evidence. No fallback prose is shown.", zh: "AI 生成失败或缺少明确交流证据；不展示备用文案。" })}</p>{aiState === "unconfigured" || aiState === "failed" ? <button className="btn btn-ghost btn-sm" disabled={encounters === 0} onClick={() => void requestArtifact()} style={{ marginTop: 8 }} type="button">{encounters === 0 ? t({ en: "Record an encounter first", zh: "请先记录真实交流" }) : t({ en: aiState === "failed" ? "Retry AI review" : "Request AI review", zh: aiState === "failed" ? "重试 AI 复盘" : "请求 AI 复盘" })}</button> : null}{aiState === "ready" && artifact ? <div data-post-event-ai-artifact style={{ display: "grid", gap: 8, marginTop: 10 }}><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{artifact.summary}</p>{artifact.messageDraft ? <div className="card-flat" style={{ padding: 10 }}><strong style={{ fontSize: 12 }}>{t({ en: "Message draft", zh: "消息草稿" })}</strong><p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{artifact.messageDraft}</p></div> : null}<small style={{ color: "var(--text-3)" }}>{artifact.provider} · {artifact.model} · {new Date(artifact.generatedAt).toLocaleString()}</small></div> : null}</div>
  </section>;
}
