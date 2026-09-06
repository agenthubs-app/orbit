"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventExperienceConfiguration,
  EventExperienceQuestion,
  EventExperienceQuestionTrack,
  EventExperienceSnapshot,
  EventExperienceVersion,
} from "../../../../../../../features/events/experience/contract";
import { PublicTopNav } from "../../../../orbit-public-shell";

interface ExperienceEditorProps {
  eventId: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
  success: boolean;
}

const fixedQuestionFields: readonly EventExperienceQuestion["intent"][] = [
  "target_attendees",
  "value_offered",
  "desired_outcome",
  "follow_up_preference",
  "positioning",
];

const defaultPrompts: Record<EventExperienceQuestion["intent"], string> = {
  desired_outcome: "What outcome would make this event worthwhile?",
  follow_up_preference: "How would you prefer to continue a useful conversation?",
  positioning: "How would you like other participants to understand your work?",
  target_attendees: "Who would make this event useful for you?",
  value_offered: "What could you offer people you meet here?",
};

const defaultOptions: Record<EventExperienceQuestion["intent"], readonly string[]> = {
  desired_outcome: ["A pilot", "A useful introduction"],
  follow_up_preference: ["A short follow-up", "A deeper conversation"],
  positioning: ["Founder", "Operator", "Investor or partner"],
  target_attendees: ["Founders", "Operators", "Investors or partners"],
  value_offered: ["Introductions", "Operating experience", "Feedback or expertise"],
};

const profileFieldForIntent: Record<EventExperienceQuestion["intent"], EventExperienceQuestion["participantProfileField"]> = {
  desired_outcome: "desiredOutcome",
  follow_up_preference: "followUpPreference",
  positioning: "positioning",
  target_attendees: "targetAttendees",
  value_offered: "valueOffered",
};

function initialQuestion(intent: EventExperienceQuestion["intent"], required: boolean): EventExperienceQuestion {
  return {
    id: intent,
    intent,
    options: [...defaultOptions[intent]],
    participantProfileField: profileFieldForIntent[intent],
    prompt: defaultPrompts[intent],
    required,
  };
}

function initialConfiguration(): EventExperienceConfiguration {
  return {
    accentColor: null,
    coverAssetId: null,
    introduction: null,
    questionSet: {
      questions: [
        initialQuestion("target_attendees", true),
        initialQuestion("value_offered", true),
      ],
      track: "v1",
    },
    templateId: "default",
  };
}

function formatDate(value: string | null): string {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : value;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || envelope.success !== true || envelope.data === undefined) {
    const error = new Error(envelope.error?.message ?? `请求失败（${response.status}）`);
    (error as Error & { code?: string }).code = envelope.error?.code;
    throw error;
  }
  return envelope.data;
}

function initialFromSnapshot(snapshot: EventExperienceSnapshot | null): EventExperienceConfiguration {
  return snapshot?.draft?.configuration ?? snapshot?.published?.configuration ?? initialConfiguration();
}

function questionSetForTrack(
  track: EventExperienceQuestionTrack,
  questions: readonly EventExperienceQuestion[],
): readonly EventExperienceQuestion[] {
  if (track === "v1") {
    return [
      questions.find((question) => question.intent === "target_attendees") ?? initialQuestion("target_attendees", true),
      questions.find((question) => question.intent === "value_offered") ?? initialQuestion("value_offered", true),
    ].map((question) => ({ ...question, required: true }));
  }
  return questions.map((question) => ({ ...question, required: false }));
}

export function EventExperienceEditor({ eventId }: ExperienceEditorProps) {
  const baseUrl = `/api/events/${encodeURIComponent(eventId)}/experience`;
  const [snapshot, setSnapshot] = useState<EventExperienceSnapshot | null>(null);
  const [configuration, setConfiguration] = useState<EventExperienceConfiguration>(initialConfiguration);
  const [preview, setPreview] = useState<EventExperienceVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<EventExperienceSnapshot>(baseUrl);
      setSnapshot(next);
      setConfiguration(initialFromSnapshot(next));
      setError(null);
    } catch (cause) {
      const code = cause instanceof Error ? (cause as Error & { code?: string }).code : undefined;
      if (code === "NOT_FOUND") {
        setSnapshot(null);
        setConfiguration(initialConfiguration());
        setError(null);
      } else {
        setError(cause instanceof Error ? cause.message : "无法读取活动体验配置。");
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const revision = snapshot?.head.revision ?? 0;
  const frozen = Boolean(snapshot?.head.frozenAt && Date.parse(snapshot.head.frozenAt) <= Date.now());
  const published = snapshot?.published;
  const questionCountLabel = useMemo(
    () => `${configuration.questionSet.questions.length} / 4 题`,
    [configuration.questionSet.questions.length],
  );

  function updateTrack(track: EventExperienceQuestionTrack) {
    setConfiguration((current) => ({
      ...current,
      questionSet: {
        questions: questionSetForTrack(track, current.questionSet.questions),
        track,
      },
    }));
    setPreview(null);
  }

  function updateQuestion(index: number, patch: Partial<EventExperienceQuestion>) {
    setConfiguration((current) => ({
      ...current,
      questionSet: {
        ...current.questionSet,
        questions: current.questionSet.questions.map((question, questionIndex) =>
          questionIndex === index ? { ...question, ...patch } : question,
        ),
      },
    }));
    setPreview(null);
  }

  function addQuestion() {
    if (configuration.questionSet.track !== "v2" || configuration.questionSet.questions.length >= 4) return;
    const used = new Set(configuration.questionSet.questions.map((question) => question.intent));
    const intent = fixedQuestionFields.find((candidate) => !used.has(candidate));
    if (!intent) return;
    setConfiguration((current) => ({
      ...current,
      questionSet: {
        ...current.questionSet,
        questions: [...current.questionSet.questions, initialQuestion(intent, false)],
      },
    }));
  }

  function removeQuestion(index: number) {
    if (configuration.questionSet.track !== "v2") return;
    setConfiguration((current) => ({
      ...current,
      questionSet: {
        ...current.questionSet,
        questions: current.questionSet.questions.filter((_, questionIndex) => questionIndex !== index),
      },
    }));
  }

  async function saveDraft() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<EventExperienceSnapshot>(baseUrl, {
        body: JSON.stringify({
          configuration,
          expectedRevision: snapshot ? revision : null,
        }),
        method: "PUT",
      });
      setSnapshot(next);
      setConfiguration(initialFromSnapshot(next));
      setNotice("草稿已保存；发布前不会影响报名者看到的题目。");
    } catch (cause) {
      const code = cause instanceof Error ? (cause as Error & { code?: string }).code : undefined;
      setError(
        code === "CONFLICT"
          ? "保存冲突或活动已冻结。请重新读取最新版本后再操作。"
          : cause instanceof Error
            ? cause.message
            : "草稿保存失败。",
      );
      if (code === "CONFLICT") void load();
    } finally {
      setBusy(null);
    }
  }

  async function previewDraft() {
    setBusy("preview");
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<{ version: EventExperienceVersion }>(`${baseUrl}/preview`, {
        body: JSON.stringify({ configuration }),
        method: "POST",
      });
      setPreview(result.version);
      setNotice("预览已生成：仅在内存中校验，不会写入报名或参会者数据。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "预览失败。");
    } finally {
      setBusy(null);
    }
  }

  async function publishDraft() {
    setBusy("publish");
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<EventExperienceSnapshot>(`${baseUrl}/publish`, {
        body: JSON.stringify({ expectedRevision: revision }),
        method: "POST",
      });
      setSnapshot(next);
      setConfiguration(initialFromSnapshot(next));
      setNotice("已发布。报名表会固定使用这个题集版本，直到下一次合法发布。");
    } catch (cause) {
      const code = cause instanceof Error ? (cause as Error & { code?: string }).code : undefined;
      setError(
        code === "CONFLICT"
          ? "发布冲突、缺少草稿，或活动已冻结。请重新读取后再操作。"
          : cause instanceof Error
            ? cause.message
            : "发布失败。",
      );
      if (code === "CONFLICT") void load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PublicTopNav active="events" />
      <main style={{ margin: "0 auto", maxWidth: 980, padding: "28px clamp(16px,4vw,42px) 80px" }}>
        <a href={`/app/events/${encodeURIComponent(eventId)}/operations`} style={{ color: "var(--text-2)", textDecoration: "none" }}>
          ← 返回活动运营台
        </a>
        <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", marginTop: 18 }}>
          <div>
            <div className="eyebrow">ORGANIZER · EVENT EXPERIENCE</div>
            <h1 className="h-display" style={{ margin: "8px 0 0" }}>报名体验配置</h1>
            <p style={{ color: "var(--text-2)", margin: "8px 0 0" }}>只调整有限展示字段与题目；发布后题集不可原地修改。</p>
          </div>
          <div className="card" style={{ color: "var(--text-2)", fontSize: 12, padding: 12 }}>
            <div>草稿 revision：<span className="mono">{revision}</span></div>
            <div>已发布版本：<span className="mono">{published?.version ?? "—"}</span></div>
            <div>画像编辑截止：{formatDate(snapshot?.head.frozenAt ?? null)}</div>
          </div>
        </div>
        {error ? <div className="card" role="alert" style={{ borderColor: "var(--rose)", color: "var(--rose)", marginTop: 18, padding: 14 }}>{error}</div> : null}
        {notice ? <div className="card" role="status" style={{ color: "var(--accent)", marginTop: 18, padding: 14 }}>{notice}</div> : null}
        {loading ? <div className="card" style={{ marginTop: 18, padding: 18 }}>正在读取活动体验…</div> : null}

        <section className="card" style={{ marginTop: 18, padding: 20 }}>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(220px,1fr) minmax(220px,1fr)" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span>活动简介（最多 1000 字）</span>
              <textarea className="field" maxLength={1000} onChange={(event) => setConfiguration((current) => ({ ...current, introduction: event.target.value || null }))} placeholder="告诉参与者这场活动适合谁，以及会发生什么。" rows={4} value={configuration.introduction ?? ""} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span>强调色（#RRGGBB）</span>
              <input className="field" maxLength={7} onChange={(event) => setConfiguration((current) => ({ ...current, accentColor: event.target.value || null }))} placeholder="#6E56CF" value={configuration.accentColor ?? ""} />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span>题集轨道</span>
              <select className="field" onChange={(event) => updateTrack(event.target.value as EventExperienceQuestionTrack)} value={configuration.questionSet.track}>
                <option value="v1">V1 · 两题必答兼容</option>
                <option value="v2">V2 · 0–4 题可选</option>
              </select>
            </label>
          </div>
          <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.6, margin: "12px 0 0" }}>活动封面继续由活动本身的可信内容提供；本配置暂不接受 cover assetId 或外部 URL。</p>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <div><div className="eyebrow">FIXED PROFILE MAPPING</div><h2 className="h-title" style={{ margin: "7px 0 0" }}>报名问题 · {questionCountLabel}</h2></div>
            {configuration.questionSet.track === "v2" ? <button className="btn btn-ghost btn-sm" disabled={configuration.questionSet.questions.length >= 4} onClick={addQuestion} type="button">+ 添加固定维度</button> : null}
          </div>
          <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.6 }}>每道题只能写入 Orbit 已有的 participant profile 字段；V1 始终保留「想认识谁 / 能提供什么」两题。</p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {configuration.questionSet.questions.map((question, index) => (
              <article key={question.intent} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
                  <strong>{question.intent}</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className="badge">{question.required ? "必答" : "可选"}</span>
                    {configuration.questionSet.track === "v2" ? <button className="btn btn-ghost btn-sm" onClick={() => removeQuestion(index)} type="button">移除</button> : null}
                  </div>
                </div>
                <label style={{ display: "grid", gap: 6, fontSize: 13, marginTop: 12 }}>
                  <span>题目</span>
                  <input className="field" onChange={(event) => updateQuestion(index, { prompt: event.target.value })} value={question.prompt} />
                </label>
                <label style={{ display: "grid", gap: 6, fontSize: 13, marginTop: 10 }}>
                  <span>选项（用逗号分隔，2–5 项）</span>
                  <input className="field" onChange={(event) => updateQuestion(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} value={question.options.join(", ")} />
                </label>
              </article>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
            <button className="btn btn-primary" disabled={busy !== null} onClick={saveDraft} type="button">{busy === "save" ? "保存中…" : "保存草稿"}</button>
            <button className="btn btn-ghost" disabled={busy !== null} onClick={previewDraft} type="button">{busy === "preview" ? "预览中…" : "预览（零写入）"}</button>
            <button className="btn btn-ghost" disabled={busy !== null || !snapshot?.draft} onClick={publishDraft} type="button">{busy === "publish" ? "发布中…" : "发布题集"}</button>
          </div>
          {frozen ? <div style={{ color: "var(--amber)", fontSize: 12, marginTop: 12 }}>已到画像编辑截止时间；仍可调整展示字段并保存/发布，但题集轨道、题目和选项必须与当前已发布版本一致。</div> : null}
          {preview ? <div className="card-flat" style={{ borderLeft: `4px solid ${preview.configuration.accentColor ?? "var(--border)"}`, marginTop: 14, padding: 12 }}><div className="eyebrow">EPHEMERAL PREVIEW</div><div style={{ fontSize: 12, marginTop: 5 }}>hash <span className="mono">{preview.hash}</span> · 不会写入数据库</div><div style={{ marginTop: 12 }}>{preview.configuration.introduction ?? "暂无活动简介"}</div><div className="mono" style={{ color: "var(--text-3)", fontSize: 11, marginTop: 6 }}>accent {preview.configuration.accentColor ?? "未设置"}</div></div> : null}
        </section>
      </main>
    </>
  );
}
