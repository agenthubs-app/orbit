"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EventExperienceConfiguration,
  EventExperienceQuestion,
  EventExperienceQuestionTrack,
  EventExperienceSnapshot,
  EventExperienceVersion,
} from "../../../../../features/events/experience/contract";

// 原样抽自 [id]/operations/experience/event-experience-editor.tsx（19–82、90–119、
// 122–286 行）：默认题集/配置、requestJson（带 error.code）、快照加载（NOT_FOUND →
// 默认配置）、轨道/题目编辑、保存草稿（PUT + expectedRevision）、预览（零写入 POST）、
// 发布（POST + expectedRevision）、CONFLICT → 重读。

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

/**
 * 报名设置编辑会话（`GET|PUT /experience`、`POST /experience/preview`、`POST /experience/publish`）：
 * - 数据：`snapshot`、`configuration`/`setConfiguration`（草稿表单）、`preview`、
 *   `revision`、`frozen`、`published`、`questionCountLabel`
 * - 状态：`loading`、`busy`（"save" | "preview" | "publish" | null）、`error`、`notice`
 * - 动作：`load`、`updateTrack`、`updateQuestion`、`addQuestion`、`removeQuestion`、
 *   `saveDraft`、`previewDraft`、`publishDraft`
 */
export interface ExperienceEditorSession {
  addQuestion: () => void;
  busy: string | null;
  configuration: EventExperienceConfiguration;
  error: string | null;
  frozen: boolean;
  load: () => Promise<void>;
  loading: boolean;
  notice: string | null;
  preview: EventExperienceVersion | null;
  previewDraft: () => Promise<void>;
  publishDraft: () => Promise<void>;
  published: EventExperienceVersion | null | undefined;
  questionCountLabel: string;
  removeQuestion: (index: number) => void;
  revision: number;
  saveDraft: () => Promise<void>;
  setConfiguration: React.Dispatch<React.SetStateAction<EventExperienceConfiguration>>;
  snapshot: EventExperienceSnapshot | null;
  updateQuestion: (index: number, patch: Partial<EventExperienceQuestion>) => void;
  updateTrack: (track: EventExperienceQuestionTrack) => void;
}

export function useExperienceEditor(eventId: string): ExperienceEditorSession {
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

  return {
    addQuestion,
    busy,
    configuration,
    error,
    frozen,
    load,
    loading,
    notice,
    preview,
    previewDraft,
    publishDraft,
    published,
    questionCountLabel,
    removeQuestion,
    revision,
    saveDraft,
    setConfiguration,
    snapshot,
    updateQuestion,
    updateTrack,
  };
}
