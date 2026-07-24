"use client";

// 活动报名的自适应画像问答(Typeform 式一屏一题)。
//
// 结构:interview(逐题,下一题由模型基于已答内容生成)→ generating(分阶段
// 生成动画,期间真实调用 persona API)→ persona(面向本次活动的个人画像)。
// 设计依据:一屏一题完成率显著高于长表单;总题数 ≤5;下一题以一句承接语
// 引用上一答;选项胶囊为主(带 A/B/C 键位)、自由输入为辅;生成画面约 3 秒。
//
// 与服务端的分工:题目顺序/字段/敏感词校验全在 adaptive-interview-service;
// 本组件只负责流程状态机与展示。第一题用服务端预生成的 questionSet(零等待),
// 之后每题调 /registration/interview;答案通过既有 /registration 端点持久化。
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AdaptiveInterviewTurn,
  AdaptiveNextQuestion,
  EventPersona,
} from "../../../../../../features/events/registration/adaptive-interview-service";
import type {
  EventParticipantProfileAnswers,
  EventRegistration,
  EventRegistrationQuestionSet,
} from "../../../../../../features/events/registration/contract";
import { Icon } from "../../../orbit-reference-primitives";

type Language = "en" | "zh";

interface RegistrationWorkspaceProps {
  event: {
    id: string;
    title: string;
    venue: string;
  };
  initialRegistration: EventRegistration | null;
  language: Language;
  profile: {
    displayName: string;
    headline: string;
  };
  questionSet: EventRegistrationQuestionSet;
}

type RegistrationEnvelope = {
  data?: EventRegistration;
  error?: { message?: string };
  success: boolean;
};

type Stage = "interview" | "generating" | "persona";

const TOTAL_STEPS = 5;
const GENERATING_MIN_MS = 2700;
const GENERATING_STAGE_MS = 900;
const OPTION_KEYS = ["A", "B", "C", "D"] as const;

function copy(language: Language, value: { en: string; zh: string }): string {
  return language === "en" ? value.en : value.zh;
}

function fieldLabel(
  language: Language,
  field: AdaptiveInterviewTurn["field"],
): string {
  const labels: Record<AdaptiveInterviewTurn["field"], { en: string; zh: string }> = {
    desiredOutcome: { en: "Outcome", zh: "期待结果" },
    followUpPreference: { en: "Follow-up", zh: "后续方式" },
    positioning: { en: "Positioning", zh: "定位" },
    targetAttendees: { en: "Who to meet", zh: "想认识" },
    valueOffered: { en: "What you offer", zh: "能提供" },
  };

  return copy(language, labels[field]);
}

function firstQuestionFrom(
  questionSet: EventRegistrationQuestionSet,
): AdaptiveNextQuestion | null {
  const question = questionSet.questions[0];

  if (!question) {
    return null;
  }

  return {
    acknowledgment: "",
    field: question.participantProfileField,
    options: question.options,
    prompt: question.prompt,
    provenance: {
      fallbackReason: questionSet.provenance.fallbackReason,
      generationMethod:
        questionSet.provenance.generationMethod === "orbit-agent-model-customized"
          ? "orbit-agent-model-adaptive"
          : "deterministic-fallback",
      model: questionSet.provenance.model,
      provider: questionSet.provenance.provider,
    },
  };
}

function answersFrom(
  transcript: readonly AdaptiveInterviewTurn[],
): EventParticipantProfileAnswers {
  return Object.fromEntries(
    transcript.map((turn) => [turn.field, turn.answer]),
  ) as EventParticipantProfileAnswers;
}

function transcriptFromAnswers(
  answers: EventParticipantProfileAnswers,
): AdaptiveInterviewTurn[] {
  return Object.entries(answers)
    .filter(
      (entry): entry is [AdaptiveInterviewTurn["field"], string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    )
    .map(([field, answer]) => ({ answer, field, prompt: field }));
}

export function EventRegistrationWorkspace({
  event,
  initialRegistration,
  language,
  profile,
  questionSet,
}: RegistrationWorkspaceProps) {
  const storedTranscript = transcriptFromAnswers(
    initialRegistration?.status === "rsvped"
      ? initialRegistration.participantProfile.answers
      : {},
  );
  const [stage, setStage] = useState<Stage>(
    storedTranscript.length > 0 ? "generating" : "interview",
  );
  const [registration, setRegistration] = useState(initialRegistration);
  const [transcript, setTranscript] = useState<AdaptiveInterviewTurn[]>(storedTranscript);
  const [question, setQuestion] = useState<AdaptiveNextQuestion | null>(
    () => firstQuestionFrom(questionSet),
  );
  const [questionHistory, setQuestionHistory] = useState<AdaptiveNextQuestion[]>([]);
  const [thinking, setThinking] = useState(false);
  const [freeTextOpen, setFreeTextOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [persona, setPersona] = useState<EventPersona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const generationRunId = useRef(0);

  const status = registration?.status ?? "unregistered";
  const eventHref = `/app/events/${encodeURIComponent(event.id)}?language=${language}`;
  const stepIndex = Math.min(transcript.length, TOTAL_STEPS - 1);

  const fetchNextQuestion = useCallback(
    async (nextTranscript: readonly AdaptiveInterviewTurn[]) => {
      const response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/registration/interview`,
        {
          body: JSON.stringify({ language, transcript: nextTranscript }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { done: boolean; question: AdaptiveNextQuestion | null };
        success?: boolean;
      } | null;

      if (!response.ok || body?.success !== true || !body.data) {
        throw new Error(
          copy(language, {
            en: "Could not load the next question.",
            zh: "下一题加载失败。",
          }),
        );
      }

      return body.data;
    },
    [event.id, language],
  );

  // 生成阶段:持久化答案 + 请求画像,并行推进阶段动画;两者都完成才揭示。
  const runGeneration = useCallback(
    async (finalTranscript: readonly AdaptiveInterviewTurn[]) => {
      const runId = ++generationRunId.current;

      setStage("generating");
      setGeneratingStep(0);
      setError(null);

      const startedAt = Date.now();
      const stageTimer = window.setInterval(() => {
        setGeneratingStep((current) => Math.min(current + 1, 2));
      }, GENERATING_STAGE_MS);

      try {
        const [personaResult] = await Promise.all([
          (async () => {
            const response = await fetch(
              `/api/events/${encodeURIComponent(event.id)}/registration/persona`,
              {
                body: JSON.stringify({ language, transcript: finalTranscript }),
                headers: { "content-type": "application/json" },
                method: "POST",
              },
            );
            const body = (await response.json().catch(() => null)) as {
              data?: { persona: EventPersona };
              success?: boolean;
            } | null;

            if (!response.ok || body?.success !== true || !body.data) {
              throw new Error(
                copy(language, {
                  en: "Persona generation failed.",
                  zh: "画像生成失败。",
                }),
              );
            }

            return body.data.persona;
          })(),
          (async () => {
            const response = await fetch(
              `/api/events/${encodeURIComponent(event.id)}/registration`,
              {
                body: JSON.stringify({ answers: answersFrom(finalTranscript) }),
                headers: { "content-type": "application/json" },
                method: "POST",
              },
            );
            const body = (await response.json().catch(() => null)) as RegistrationEnvelope | null;

            if (response.ok && body?.success === true && body.data) {
              setRegistration(body.data);
            }
          })(),
        ]);

        const elapsed = Date.now() - startedAt;

        if (elapsed < GENERATING_MIN_MS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, GENERATING_MIN_MS - elapsed),
          );
        }

        if (generationRunId.current === runId) {
          setPersona(personaResult);
          setStage("persona");
        }
      } catch (caught) {
        if (generationRunId.current === runId) {
          setError(
            caught instanceof Error
              ? caught.message
              : copy(language, { en: "Something went wrong.", zh: "出错了,请重试。" }),
          );
          setStage("interview");
        }
      } finally {
        window.clearInterval(stageTimer);
      }
    },
    [event.id, language],
  );

  // 已报名用户重访:初始 stage 即为 generating(仅存量答案路径会这样),
  // 挂载后立刻从存量 transcript 重新生成画像。
  useEffect(() => {
    if (stage === "generating" && persona === null && transcript.length > 0) {
      void runGeneration(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitAnswer(answer: string) {
    if (!question || thinking) {
      return;
    }

    const trimmed = answer.trim();

    if (!trimmed) {
      return;
    }

    const turn: AdaptiveInterviewTurn = {
      answer: trimmed.slice(0, 1000),
      field: question.field,
      prompt: question.prompt,
    };
    const nextTranscript = [...transcript, turn];

    setSelectedOption(answer);
    setError(null);
    setThinking(true);

    try {
      const step =
        nextTranscript.length >= TOTAL_STEPS
          ? { done: true, question: null }
          : await fetchNextQuestion(nextTranscript);

      setTranscript(nextTranscript);
      setQuestionHistory((history) => [...history, question]);
      setFreeText("");
      setFreeTextOpen(false);
      setSelectedOption(null);

      if (step.done || !step.question) {
        await runGeneration(nextTranscript);
        return;
      }

      setQuestion(step.question);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : copy(language, { en: "Something went wrong.", zh: "出错了,请重试。" }),
      );
      setSelectedOption(null);
    } finally {
      setThinking(false);
    }
  }

  // Typeform 式键盘选择:A/B/C/D 直接选中对应选项(输入框聚焦时不劫持)。
  useEffect(() => {
    if (stage !== "interview" || thinking || freeTextOpen || !question) {
      return undefined;
    }

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const target = keyEvent.target as HTMLElement | null;

      if (target && /^(input|textarea)$/i.test(target.tagName)) {
        return;
      }

      const index = OPTION_KEYS.indexOf(
        keyEvent.key.toUpperCase() as (typeof OPTION_KEYS)[number],
      );

      if (index >= 0 && index < question.options.length) {
        keyEvent.preventDefault();
        void submitAnswer(question.options[index]);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, thinking, freeTextOpen, question, transcript]);

  function goBack() {
    if (transcript.length === 0 || thinking) {
      return;
    }

    const previousQuestion = questionHistory[questionHistory.length - 1];

    if (!previousQuestion) {
      return;
    }

    setTranscript((current) => current.slice(0, -1));
    setQuestionHistory((history) => history.slice(0, -1));
    setQuestion(previousQuestion);
    setFreeText("");
    setFreeTextOpen(false);
    setError(null);
  }

  function restartInterview() {
    generationRunId.current += 1;
    setStage("interview");
    setTranscript([]);
    setQuestionHistory([]);
    setPersona(null);
    setQuestion(firstQuestionFrom(questionSet));
    setFreeText("");
    setFreeTextOpen(false);
    setError(null);
  }

  async function cancelRegistration() {
    setError(null);
    setPendingCancel(true);

    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/registration/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as RegistrationEnvelope;

      if (!response.ok || body.success !== true || !body.data) {
        throw new Error(
          body.error?.message ??
            copy(language, { en: "Registration could not be cancelled.", zh: "暂时无法取消预约。" }),
        );
      }

      setRegistration(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : copy(language, { en: "Registration could not be cancelled.", zh: "暂时无法取消预约。" }),
      );
    } finally {
      setPendingCancel(false);
    }
  }

  const generatingLines = [
    copy(language, { en: "Reading your answers", zh: "正在解读你的回答" }),
    copy(language, { en: "Aligning with the event", zh: "正在对齐活动语境" }),
    copy(language, { en: "Composing your persona", zh: "正在生成你的活动画像" }),
  ];

  return (
    <main
      data-orbit-registration-profile-guide="register"
      data-registration-status={status}
      data-registration-stage={stage}
      style={{
        background: [
          "radial-gradient(46rem 30rem at 110% -8%, color-mix(in srgb, var(--accent) 13%, transparent), transparent 60%)",
          "radial-gradient(38rem 26rem at -12% 108%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 55%)",
          "radial-gradient(color-mix(in srgb, var(--ink) 5.5%, transparent) 1px, transparent 1px)",
          "var(--bg-sunken)",
        ].join(", "),
        backgroundSize: "auto, auto, 26px 26px, auto",
        minHeight: "100dvh",
        padding: "30px 16px 64px",
      }}
    >
      <style>{`
        @keyframes regFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes regReveal { 0% { opacity: 0; transform: translateY(22px) scale(.97); } 60% { opacity: 1; } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes regPulse { 0%, 100% { opacity: .3; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes regOrbitSpin { to { transform: rotate(360deg); } }
        @keyframes regShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        @keyframes regBreath { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 26%, transparent); } 55% { box-shadow: 0 0 0 12px transparent; } }
        [data-reg-anim="question"] { animation: regFadeUp .38s cubic-bezier(.22,1,.36,1) both; }
        [data-reg-anim="persona"] { animation: regReveal .55s cubic-bezier(.22,1,.36,1) both; }
        .reg-stagger > * { animation: regFadeUp .42s cubic-bezier(.22,1,.36,1) both; }
        .reg-stagger > *:nth-child(1) { animation-delay: .04s; }
        .reg-stagger > *:nth-child(2) { animation-delay: .1s; }
        .reg-stagger > *:nth-child(3) { animation-delay: .16s; }
        .reg-stagger > *:nth-child(4) { animation-delay: .22s; }
        .reg-stagger > *:nth-child(5) { animation-delay: .28s; }
        .reg-chip { transition: transform .16s cubic-bezier(.22,1,.36,1), border-color .16s ease, background .16s ease, box-shadow .16s ease; }
        .reg-chip:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); box-shadow: 0 10px 24px -14px color-mix(in srgb, var(--accent) 45%, transparent); }
        .reg-chip:hover .reg-key { background: var(--accent); border-color: var(--accent); color: var(--on-dark); }
        .reg-chip:active { transform: translateY(0) scale(.99); }
        .reg-ghost-btn { transition: color .15s ease, background .15s ease; border-radius: 9px; padding: 7px 12px; }
        .reg-ghost-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
        @media (prefers-reduced-motion: reduce) {
          [data-reg-anim], .reg-stagger > * { animation: none !important; }
        }
      `}</style>

      <section style={{ margin: "0 auto", maxWidth: 760 }}>
        <a
          className="reg-ghost-btn"
          href={eventHref}
          style={{ alignItems: "center", color: "var(--text-3)", display: "inline-flex", fontSize: 13.5, fontWeight: 600, gap: 6, marginLeft: -12, textDecoration: "none" }}
        >
          <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
          {copy(language, { en: "Back to event", zh: "返回活动页" })}
        </a>

        <header style={{ alignItems: "flex-end", display: "flex", gap: 18, justifyContent: "space-between", margin: "20px 0 24px" }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "inline-flex", fontSize: 11.5, fontWeight: 750, gap: 6, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              <Icon name="sparkle" size={13} />
              {copy(language, { en: "Event persona", zh: "活动个人画像" })}
            </span>
            <h1 style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: "clamp(1.4rem, 3.2vw, 2rem)", fontWeight: 680, lineHeight: 1.22, margin: "8px 0 0", overflowWrap: "anywhere" }}>
              {event.title}
            </h1>
            <p style={{ alignItems: "center", color: "var(--text-3)", display: "flex", flexWrap: "wrap", fontSize: 13, gap: "4px 10px", margin: "7px 0 0" }}>
              <span style={{ alignItems: "center", display: "inline-flex", gap: 4 }}>
                <Icon name="pin" size={12} />
                {event.venue}
              </span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              {profile.displayName}
            </p>
          </div>
          {status === "rsvped" ? (
            <span style={{ alignItems: "center", background: "var(--live-soft, var(--accent-soft))", borderRadius: "var(--r-pill)", color: "var(--live, var(--accent))", display: "inline-flex", flexShrink: 0, fontSize: 12, fontWeight: 700, gap: 6, padding: "6px 13px" }}>
              <span style={{ background: "currentcolor", borderRadius: "var(--r-pill)", height: 6, width: 6 }} />
              {copy(language, { en: "Registered", zh: "已报名" })}
            </span>
          ) : null}
        </header>

        {stage === "interview" && question ? (
          <div
            key={`${question.field}-${transcript.length}`}
            data-reg-anim="question"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "0 1px 2px rgba(18,18,28,.04), 0 24px 60px -32px color-mix(in srgb, var(--accent) 22%, rgba(18,18,28,.28))",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* 顶部进度束 */}
            <div style={{ background: "var(--surface-3)", display: "flex", height: 4 }}>
              <span
                style={{
                  background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, var(--surface)), var(--accent))",
                  borderRadius: "0 99px 99px 0",
                  transition: "width .45s cubic-bezier(.22,1,.36,1)",
                  width: `${((stepIndex + 1) / TOTAL_STEPS) * 100}%`,
                }}
              />
            </div>

            <div style={{ padding: "30px 34px 26px", position: "relative" }}>
              {/* 幽灵序号:填充留白,给页面编辑感 */}
              <span
                aria-hidden="true"
                style={{
                  color: "color-mix(in srgb, var(--accent) 8%, transparent)",
                  fontFamily: "var(--ff-tight)",
                  fontSize: "clamp(5rem, 12vw, 7.5rem)",
                  fontWeight: 800,
                  lineHeight: 1,
                  pointerEvents: "none",
                  position: "absolute",
                  right: 18,
                  top: 2,
                  userSelect: "none",
                }}
              >
                {String(stepIndex + 1).padStart(2, "0")}
              </span>

              <div style={{ alignItems: "center", display: "flex", gap: 10, marginBottom: 20 }}>
                <span className="chip" style={{ background: "var(--accent-soft)", border: 0, color: "var(--accent)", fontSize: 11.5, fontWeight: 700 }}>
                  {fieldLabel(language, question.field)}
                </span>
                <span className="mono" style={{ color: "var(--text-4)", fontSize: 12 }}>
                  {stepIndex + 1} / {TOTAL_STEPS}
                </span>
              </div>

              {question.acknowledgment ? (
                <p
                  style={{
                    alignItems: "flex-start",
                    color: "var(--accent)",
                    display: "flex",
                    fontSize: 14,
                    fontWeight: 600,
                    gap: 7,
                    lineHeight: 1.5,
                    margin: "0 0 10px",
                  }}
                >
                  <Icon name="sparkle" size={14} style={{ flexShrink: 0, marginTop: 3 }} />
                  {question.acknowledgment}
                </p>
              ) : null}

              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: "clamp(1.3rem, 2.8vw, 1.7rem)", fontWeight: 660, lineHeight: 1.38, margin: "0 0 24px", maxWidth: "88%" }}>
                {question.prompt}
              </h2>

              {thinking ? (
                <div aria-live="polite" style={{ minHeight: 150 }}>
                  <div
                    style={{
                      alignItems: "center",
                      background: "linear-gradient(90deg, var(--surface-2) 25%, color-mix(in srgb, var(--accent) 8%, var(--surface-2)) 50%, var(--surface-2) 75%)",
                      backgroundSize: "200% 100%",
                      animation: "regShimmer 1.6s linear infinite",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      color: "var(--text-2)",
                      display: "flex",
                      fontSize: 14,
                      fontWeight: 600,
                      gap: 10,
                      padding: "16px 18px",
                    }}
                  >
                    <span style={{ animation: "regPulse 1.1s ease-in-out infinite", color: "var(--accent)", display: "inline-flex" }}>
                      <Icon name="sparkle" size={16} />
                    </span>
                    {copy(language, { en: "Thinking about what to ask next…", zh: "正在根据你的回答想下一个问题…" })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="reg-stagger" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {question.options.map((option, optionIndex) => (
                      <button
                        key={option}
                        className="reg-chip"
                        data-reg-option
                        onClick={() => void submitAnswer(option)}
                        type="button"
                        style={{
                          alignItems: "center",
                          background: selectedOption === option ? "var(--accent-soft)" : "var(--surface)",
                          border: `1.5px solid ${selectedOption === option ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: 14,
                          color: "var(--ink)",
                          cursor: "pointer",
                          display: "flex",
                          fontFamily: "var(--ff)",
                          fontSize: 15,
                          fontWeight: 600,
                          gap: 13,
                          padding: "13px 16px",
                          textAlign: "left",
                        }}
                      >
                        <span
                          className="reg-key mono"
                          style={{
                            alignItems: "center",
                            background: selectedOption === option ? "var(--accent)" : "var(--surface-2)",
                            border: "1px solid var(--border)",
                            borderRadius: 7,
                            color: selectedOption === option ? "var(--on-dark)" : "var(--text-3)",
                            display: "inline-flex",
                            flexShrink: 0,
                            fontSize: 11.5,
                            fontWeight: 700,
                            height: 24,
                            justifyContent: "center",
                            transition: "background .15s ease, color .15s ease, border-color .15s ease",
                            width: 24,
                          }}
                        >
                          {OPTION_KEYS[optionIndex]}
                        </span>
                        {option}
                      </button>
                    ))}
                  </div>

                  {freeTextOpen ? (
                    <form
                      onSubmit={(formEvent) => {
                        formEvent.preventDefault();
                        void submitAnswer(freeText);
                      }}
                      style={{ display: "flex", gap: 10, marginTop: 14 }}
                    >
                      <input
                        autoFocus
                        className="field"
                        onChange={(changeEvent) => setFreeText(changeEvent.target.value)}
                        placeholder={copy(language, { en: "Write your own answer…", zh: "用自己的话说…" })}
                        value={freeText}
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-primary" disabled={!freeText.trim()} type="submit" style={{ alignItems: "center", display: "inline-flex", gap: 7 }}>
                        {copy(language, { en: "Next", zh: "继续" })}
                        <span className="mono" style={{ background: "rgba(255,255,255,.2)", borderRadius: 5, fontSize: 10.5, padding: "2px 6px" }}>⏎</span>
                      </button>
                    </form>
                  ) : (
                    <button
                      className="reg-ghost-btn"
                      onClick={() => setFreeTextOpen(true)}
                      type="button"
                      style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13.5, fontWeight: 600, gap: 6, marginLeft: -12, marginTop: 14 }}
                    >
                      <Icon name="edit" size={14} />
                      {copy(language, { en: "I'd rather write my own", zh: "选项不合适?用自己的话说" })}
                    </button>
                  )}
                </>
              )}

              {error ? (
                <div className="orbit-alert error" role="alert" style={{ marginTop: 14 }}>
                  {error}
                </div>
              ) : null}
            </div>

            <footer style={{ alignItems: "center", background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))", borderTop: "1px solid var(--border)", display: "flex", gap: 14, justifyContent: "space-between", padding: "13px 22px" }}>
              <button
                className="reg-ghost-btn"
                disabled={transcript.length === 0 || thinking}
                onClick={goBack}
                type="button"
                style={{ alignItems: "center", background: "transparent", border: 0, color: transcript.length === 0 ? "var(--text-4)" : "var(--text-2)", cursor: transcript.length === 0 ? "default" : "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 5 }}
              >
                <Icon name="chevR" size={13} style={{ transform: "rotate(180deg)" }} />
                {copy(language, { en: "Previous", zh: "上一题" })}
              </button>
              {transcript.length > 0 ? (
                <button
                  className="reg-ghost-btn"
                  disabled={thinking}
                  onClick={() => void runGeneration(transcript)}
                  type="button"
                  style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 6 }}
                >
                  <Icon name="sparkle" size={13} />
                  {copy(language, { en: "Skip the rest — generate now", zh: "跳过剩余问题,直接生成画像" })}
                </button>
              ) : (
                <span style={{ color: "var(--text-4)", fontSize: 12.5 }}>
                  {copy(language, { en: "Answers stay scoped to this event.", zh: "回答只用于本次活动,不会改动全局档案。" })}
                </span>
              )}
            </footer>
          </div>
        ) : null}

        {stage === "generating" ? (
          <div
            style={{
              alignItems: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "0 1px 2px rgba(18,18,28,.04), 0 24px 60px -32px color-mix(in srgb, var(--accent) 22%, rgba(18,18,28,.28))",
              display: "flex",
              flexDirection: "column",
              padding: "62px 30px 56px",
            }}
          >
            {/* 品牌契合的"轨道"动画:双环 + 环上运行的星点 */}
            <span aria-hidden="true" style={{ display: "grid", height: 84, placeItems: "center", position: "relative", width: 84 }}>
              <span style={{ border: "1.5px solid color-mix(in srgb, var(--accent) 26%, transparent)", borderRadius: "50%", height: 84, position: "absolute", width: 84 }} />
              <span style={{ border: "1.5px dashed color-mix(in srgb, var(--accent) 18%, transparent)", borderRadius: "50%", height: 56, position: "absolute", width: 56 }} />
              <span style={{ animation: "regOrbitSpin 1.7s linear infinite", height: 84, position: "absolute", width: 84 }}>
                <span style={{ animation: "regBreath 1.7s ease-out infinite", background: "var(--accent)", borderRadius: "50%", height: 10, left: "50%", marginLeft: -5, position: "absolute", top: -5, width: 10 }} />
              </span>
              <span style={{ animation: "regOrbitSpin 2.9s linear infinite reverse", height: 56, position: "absolute", width: 56 }}>
                <span style={{ background: "color-mix(in srgb, var(--accent) 55%, var(--surface))", borderRadius: "50%", height: 7, left: "50%", marginLeft: -3.5, position: "absolute", top: -3.5, width: 7 }} />
              </span>
              <span style={{ animation: "regPulse 1.7s ease-in-out infinite", color: "var(--accent)", display: "inline-flex" }}>
                <Icon name="sparkle" size={20} />
              </span>
            </span>

            <div aria-live="polite" style={{ marginTop: 30, minWidth: "min(320px, 100%)" }}>
              {generatingLines.map((line, index) => (
                <div
                  key={line}
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: 10,
                    margin: "10px 0",
                    opacity: index > generatingStep ? 0.38 : 1,
                    transition: "opacity .3s ease",
                  }}
                >
                  <span
                    style={{
                      alignItems: "center",
                      background: index < generatingStep ? "var(--accent)" : index === generatingStep ? "var(--accent-soft)" : "var(--surface-3)",
                      borderRadius: "50%",
                      color: index < generatingStep ? "var(--on-dark)" : "var(--accent)",
                      display: "inline-flex",
                      flexShrink: 0,
                      height: 22,
                      justifyContent: "center",
                      transition: "background .3s ease",
                      width: 22,
                    }}
                  >
                    {index < generatingStep ? (
                      <Icon name="check" size={12} />
                    ) : index === generatingStep ? (
                      <span style={{ animation: "regPulse 1s ease-in-out infinite", background: "var(--accent)", borderRadius: "50%", height: 7, width: 7 }} />
                    ) : null}
                  </span>
                  <span
                    style={{
                      color: index === generatingStep ? "var(--ink)" : "var(--text-3)",
                      fontSize: index === generatingStep ? 15 : 13.5,
                      fontWeight: index === generatingStep ? 650 : 500,
                      transition: "all .3s ease",
                    }}
                  >
                    {line}
                    {index === generatingStep ? "…" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stage === "persona" && persona ? (
          <div
            data-reg-anim="persona"
            data-reg-persona
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "0 1px 2px rgba(18,18,28,.04), 0 28px 70px -34px color-mix(in srgb, var(--accent) 30%, rgba(18,18,28,.3))",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: [
                  "radial-gradient(30rem 14rem at 92% -30%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)",
                  "radial-gradient(color-mix(in srgb, var(--accent) 9%, transparent) 1px, transparent 1px)",
                  "linear-gradient(150deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface) 70%)",
                ].join(", "),
                backgroundSize: "auto, 20px 20px, auto",
                borderBottom: "1px solid var(--border)",
                padding: "32px 34px 26px",
                position: "relative",
              }}
            >
              <span aria-hidden="true" style={{ color: "color-mix(in srgb, var(--accent) 14%, transparent)", position: "absolute", right: 24, top: 20 }}>
                <Icon name="sparkle" size={44} />
              </span>
              <span style={{ alignItems: "center", color: "var(--accent)", display: "inline-flex", fontSize: 11.5, fontWeight: 750, gap: 6, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                <Icon name="sparkle" size={13} />
                {copy(language, { en: "Your persona for this event", zh: "你的本场活动画像" })}
              </span>
              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-tight)", fontSize: "clamp(1.4rem, 3.2vw, 1.9rem)", fontWeight: 720, lineHeight: 1.3, margin: "12px 0 16px", maxWidth: "86%" }}>
                {persona.tagline}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {persona.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: "color-mix(in srgb, var(--surface) 65%, transparent)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border))",
                      borderRadius: "var(--r-pill)",
                      color: "var(--accent)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      padding: "5px 13px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="reg-stagger" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", padding: "22px 26px" }}>
              {[
                {
                  body: persona.seeking,
                  icon: "users" as const,
                  label: copy(language, { en: "Wants to meet", zh: "想认识" }),
                },
                {
                  body: persona.offering,
                  icon: "wallet" as const,
                  label: copy(language, { en: "Can offer", zh: "能提供" }),
                },
              ].map((section) => (
                <div
                  key={section.label}
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px" }}
                >
                  <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12, fontWeight: 750, gap: 7, letterSpacing: "0.06em", marginBottom: 8, textTransform: "uppercase" }}>
                    <Icon name={section.icon} size={14} />
                    {section.label}
                  </div>
                  <p style={{ color: "var(--text)", fontSize: 14.5, lineHeight: 1.65, margin: 0 }}>{section.body}</p>
                </div>
              ))}

              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 16, gridColumn: "1 / -1", padding: "16px 18px" }}>
                <div style={{ alignItems: "center", color: "var(--accent)", display: "flex", fontSize: 12, fontWeight: 750, gap: 7, letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>
                  <Icon name="message" size={14} />
                  {copy(language, { en: "Conversation openers", zh: "开场话题" })}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {persona.openers.map((opener, openerIndex) => (
                    <div key={opener} style={{ alignItems: "baseline", display: "flex", gap: 10 }}>
                      <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, fontSize: 11.5, fontWeight: 700 }}>
                        {String(openerIndex + 1).padStart(2, "0")}
                      </span>
                      <span style={{ color: "var(--text)", fontSize: 14.5, lineHeight: 1.6 }}>{opener}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ alignItems: "center", display: "flex", gap: 8, gridColumn: "1 / -1" }}>
                <span className="chip" style={{ fontSize: 11.5 }}>
                  {persona.provenance.generationMethod === "orbit-agent-model-adaptive"
                    ? copy(language, { en: "Composed by Orbit AI", zh: "由 Orbit AI 生成" })
                    : copy(language, { en: "Composed from your answers", zh: "由你的回答直接生成" })}
                </span>
                <span style={{ color: "var(--text-4)", fontSize: 12 }}>
                  {copy(language, { en: "Scoped to this event only.", zh: "仅用于本次活动。" })}
                </span>
              </div>
            </div>

            <footer style={{ alignItems: "center", background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", padding: "14px 22px" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="reg-ghost-btn"
                  onClick={restartInterview}
                  type="button"
                  style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 5 }}
                >
                  <Icon name="edit" size={13} />
                  {copy(language, { en: "Redo the interview", zh: "重新回答" })}
                </button>
                {status === "rsvped" ? (
                  <button
                    className="reg-ghost-btn"
                    disabled={pendingCancel}
                    onClick={() => void cancelRegistration()}
                    type="button"
                    style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--danger, #C2410C)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 5 }}
                  >
                    {pendingCancel
                      ? copy(language, { en: "Cancelling…", zh: "取消中…" })
                      : copy(language, { en: "Cancel registration", zh: "取消报名" })}
                  </button>
                ) : null}
              </div>
              <a className="btn btn-primary" href={eventHref} style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
                {copy(language, { en: "Back to event", zh: "返回活动页" })}
                <Icon name="chevR" size={14} />
              </a>
            </footer>
            {error ? (
              <div className="orbit-alert error" role="alert" style={{ margin: "0 22px 16px" }}>
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

        {stage === "interview" && !question ? (
          <div className="orbit-alert notice" style={{ marginTop: 8 }}>
            {copy(language, {
              en: "This event is not open for the persona interview yet.",
              zh: "该活动暂未开放画像问答。",
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
