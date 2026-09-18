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
//
// 表单统一豁免(审计 P1-6 / T7):本文件字段多、结构复杂(逐题动态渲染,
// 非常规 label+input 布局),不强迁 orbit-reference-primitives 的 FormField
// 原语;仅将错误态标记对齐到标准组合(aria-invalid + role="alert")。
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type AdaptiveInterviewTurn,
  type AdaptiveNextQuestion,
  type EventPersona,
} from "../../../../../../features/events/registration/adaptive-interview-service";
import type {
  EventParticipantProfileAnswers,
  EventRegistration,
  EventRegistrationEligibility,
} from "../../../../../../features/events/registration/contract";
import type { EventAdmissionApplication } from "../../../../../../features/events/admission/contract";
import {
  EVENT_PROFILE_CORE_FIELDS,
  type EventInterviewResponseSubmission,
  type SignedAdaptiveInterviewQuestion,
  type SignedAdaptiveInterviewStep,
} from "../../../../../../features/events/registration/interview-response-contract";
import { Icon } from "../../../orbit-reference-primitives";
import { ORBIT_Z } from "../../../orbit-z";
import {
  quickSignupStorageKey,
  readQuickSignupAnswers,
} from "../orbit-event-quick-signup";
import { EventAdmissionStatusCard } from "./event-admission-status-card";
import {
  answersFromTranscript as answersFrom,
  isStatusCardApplication,
  matchesAdmissionApplicationReceipt,
  registrationCopy as copy,
  registrationFieldLabel as fieldLabel,
  transcriptFromAnswers,
} from "./registration-workspace-model";
import { registrationQuestionnaireProgress } from "../../../../../../features/mobile/registration-questionnaire-progress";
import { registrationBlockingReasonCopy } from "../../../../../../features/events/registration/blocking-reason-copy";
import { RegistrationPortraitWorkspace } from "./registration-portrait-workspace";

type Language = "en" | "zh";

interface RegistrationWorkspaceProps {
  actorId?: string;
  initialEligibility?: EventRegistrationEligibility;
  admissionControlled: boolean;
  event: {
    id: string;
    title: string;
    venue: string;
  };
  initialRegistration: EventRegistration | null;
  initialAdmissionApplication: EventAdmissionApplication | null;
  initialSignedQuestion: SignedAdaptiveInterviewQuestion | null;
  language: Language;
  /** Positioning derived from the universal profile ("role @ organization").
   *  It gives the AI context but does not count toward the two required
   *  event-registration answers. */
  prefilledPositioning?: string | null;
  profile: {
    displayName: string;
  };
}

type RegistrationEnvelope = {
  data?: EventRegistration;
  error?: { message?: string };
  success: boolean;
};

type AdmissionEnvelope = {
  data?: unknown;
  error?: { message?: string };
  success: boolean;
};

type Stage =
  | "cancelled"
  | "generating"
  | "interview"
  | "pending_review"
  | "persona"
  | "rejected"
  | "registered"
  | "waitlisted"
  | "withdrawn";

const TOTAL_REQUIRED_QUESTIONS = EVENT_PROFILE_CORE_FIELDS.length;
const GENERATING_MIN_MS = 2700;
const GENERATING_STAGE_MS = 900;
const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export function EventRegistrationWorkspace({
  actorId,
  initialEligibility,
  admissionControlled,
  event,
  initialAdmissionApplication,
  initialRegistration,
  initialSignedQuestion,
  language,
  prefilledPositioning = null,
  profile,
}: RegistrationWorkspaceProps) {
  const storedTranscript = transcriptFromAnswers(
    initialAdmissionApplication?.profilePayload.answers ??
      initialRegistration?.participantProfile.answers ??
      {},
  );
  const [stage, setStage] = useState<Stage>(
    initialAdmissionApplication?.status === "admitted"
      ? "registered"
      : initialAdmissionApplication?.status ??
        (initialRegistration?.status === "rsvped"
          ? "registered"
          : initialRegistration?.status === "cancelled"
            ? "cancelled"
            : "interview"),
  );
  const [admissionApplication, setAdmissionApplication] = useState(
    initialAdmissionApplication,
  );
  const [registration, setRegistration] = useState(initialRegistration);
  const [eligibility, setEligibility] = useState(initialEligibility);
  // 全局画像预填只为 AI 提供本人的语境，不计入报名进度；报名固定只问
  // 「想认识谁 / 能提供什么」两题。准入审核活动仍要求报名回答走签名问答，
  // 因此不会把未经签名的定位写入审核申请。
  const positioningSeeded =
    Boolean(prefilledPositioning?.trim()) &&
    storedTranscript.length === 0 &&
    !admissionControlled;
  const seededTranscript: AdaptiveInterviewTurn[] = positioningSeeded
    ? [
        {
          answer: prefilledPositioning!.trim(),
          field: "positioning",
          prompt: copy(language, {
            en: "Your positioning (brought in from your universal profile)",
            zh: "你的定位（来自通用画像）",
          }),
        },
      ]
    : storedTranscript;
  // 预填后，服务端按空 transcript 生成的第一题若恰是定位题则弃用，改为
  // 按已种入的 transcript 现场取下一题。
  const initialQuestionUsable =
    initialSignedQuestion &&
    !(positioningSeeded && initialSignedQuestion.question.field === "positioning");
  const [transcript, setTranscript] = useState<AdaptiveInterviewTurn[]>(seededTranscript);
  const [question, setQuestion] = useState<AdaptiveNextQuestion | null>(
    () => (initialQuestionUsable ? initialSignedQuestion.question : null),
  );
  const [questionToken, setQuestionToken] = useState<string | null>(
    () => (initialQuestionUsable ? initialSignedQuestion.questionToken : null),
  );
  const [questionHistory, setQuestionHistory] = useState<AdaptiveNextQuestion[]>([]);
  const [responses, setResponses] = useState<EventInterviewResponseSubmission[]>([]);
  const [thinking, setThinking] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [freeTextOpen, setFreeTextOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [persona, setPersona] = useState<EventPersona | null>(null);
  const [error, setError] = useState<string | null>(
    initialRegistration || initialAdmissionApplication || initialSignedQuestion
      ? null
      : copy(language, {
          en: "The AI interview could not start. Retry when the model is available.",
          zh: "AI 访谈暂时无法开始，请在模型恢复后重试。",
        }),
  );
  const [pendingCancel, setPendingCancel] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // 重新回答的世代号：让一次性种入 effect 在 restart 后必定重新运行。
  const [interviewEpoch, setInterviewEpoch] = useState(0);
  const generationRunId = useRef(0);
  const interviewRequest = useRef<AbortController | null>(null);
  const editRevision = useRef(0);
  const renderedRevision = editRevision.current;
  const registrationActorId = actorId ?? initialRegistration?.userId ?? "";
  const scopeKey = JSON.stringify([event.id, registrationActorId, admissionControlled, initialSignedQuestion?.questionToken ?? null]);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const previousScope = useRef(scopeKey);
  const mounted = useRef(true);
  const generationPending = useRef(false);
  const cancelPending = useRef(false);
  const cancelAuthority = useRef<string | null>(null);
  const authority = JSON.stringify([scopeKey, registration?.updatedAt ?? null, admissionApplication?.applicationVersion ?? null, eligibility?.allowedActions ?? null]);
  const latestAuthority = useRef(authority); latestAuthority.current = authority;
  const currentQuestionNode = useRef<HTMLDivElement>(null);

  async function readAdmissionApplicationReadback(
    receipt: EventAdmissionApplication,
    isCurrent: () => boolean,
  ): Promise<EventAdmissionApplication | null> {
    if (!isCurrent()) return null;
    let response: Response;
    try {
      response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/admission/application`,
        { cache: "no-store", method: "GET" },
      );
    } catch {
      if (!isCurrent()) return null;
      throw new Error(
        copy(language, {
          en: "The saved admission application could not be read back. Your answers were kept; reload its status.",
          zh: "暂时无法回读准入申请，答案已保留，请重新读取状态。",
        }),
      );
    }
    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
      error?: { message?: string };
      success?: boolean;
    } | null;
    if (!isCurrent()) return null;
    if (
      !response.ok ||
      body?.success !== true ||
      !matchesAdmissionApplicationReceipt(body?.data, {
        actorId: registrationActorId,
        applicationVersion: receipt.applicationVersion,
        eventId: event.id,
        status: receipt.status,
      })
    ) {
      throw new Error(
        body?.error?.message ??
          copy(language, {
            en: "The saved admission application could not be read back. Your answers were kept; reload its status.",
            zh: "暂时无法回读准入申请，答案已保留，请重新读取状态。",
          }),
      );
    }
    return body.data;
  }

  const status =
    admissionApplication?.status ?? registration?.status ?? "unregistered";
  const canWithdrawAdmission = Boolean(
    admissionControlled &&
      admissionApplication &&
      ["admitted", "pending_review", "waitlisted"].includes(
        admissionApplication.status,
      ),
  );
  const canCancelEnrollment = canWithdrawAdmission || (status === "rsvped" && (!eligibility || eligibility.allowedActions.includes("cancel")));
  const eventHref = `/app/events/${encodeURIComponent(event.id)}?language=${language}`;
  const missingCoreFields = EVENT_PROFILE_CORE_FIELDS.filter(
    (field) => !transcript.some((turn) => turn.field === field),
  );
  const registrationAnswersComplete = missingCoreFields.length === 0;
  const completedRequiredQuestions =
    TOTAL_REQUIRED_QUESTIONS - missingCoreFields.length;
  const currentQuestionNumber = Math.min(
    completedRequiredQuestions + 1,
    TOTAL_REQUIRED_QUESTIONS,
  );
  const ordinaryOptions = question?.options.filter(option => !["其他", "Other", "その他"].includes(option)) ?? [];
  const currentAnswer = question ? (freeTextOpen || question.options.length === 0 ? freeText : selectedOption ?? "") : "";
  const progress = registrationQuestionnaireProgress([
    ...transcript.filter((turn, index) => !(positioningSeeded && index === 0 && turn.field === "positioning")),
    ...(question ? [{ field: question.field, answer: currentAnswer }] : []),
  ]);

  useEffect(() => {
    mounted.current = true;
    if (previousScope.current !== scopeKey) {
      previousScope.current = scopeKey;
      editRevision.current++;
      setTranscript(seededTranscript);
      setResponses([]); setQuestionHistory([]);
      setQuestion(initialQuestionUsable ? initialSignedQuestion.question : null);
      setQuestionToken(initialQuestionUsable ? initialSignedQuestion.questionToken : null);
      setFreeText(""); setFreeTextOpen(false); setSelectedOption(null);
      setInterviewDone(false); setThinking(false); setPersona(null);
      setRegistration(initialRegistration); setAdmissionApplication(initialAdmissionApplication);
      setEligibility(initialEligibility); setPendingCancel(false); setConfirmingCancel(false); cancelPending.current = false; cancelAuthority.current = null;
      setStage(initialAdmissionApplication?.status === "admitted" ? "registered" : initialAdmissionApplication?.status ?? (initialRegistration?.status === "rsvped" ? "registered" : initialRegistration?.status === "cancelled" ? "cancelled" : "interview"));
      autoFetchedFirstQuestion.current = false;
    }
    return () => {
      mounted.current = false;
      interviewRequest.current?.abort(); interviewRequest.current = null;
      generationRunId.current++; generationPending.current = false;
    };
    // Scope is the event and immutable initial signed question, not language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    if (questionHistory.length > 0 && question) currentQuestionNode.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [question]);

  // 挂载时一次性带入详情页速答；只有明确继续才请求下一题。
  // localStorage 只在客户端可读，放在 effect 中避免 SSR 水合不一致。
  const autoFetchedFirstQuestion = useRef(false);
  useEffect(() => {
    if (renderedRevision !== editRevision.current || autoFetchedFirstQuestion.current || stage !== "interview" || thinking || (eligibility && eligibility.allowedActions.length === 0)) {
      return;
    }
    autoFetchedFirstQuestion.current = true;

    const quickAnswers =
      storedTranscript.length === 0 && !admissionControlled
        ? readQuickSignupAnswers(window.localStorage, event.id)
        : null;
    const answeredFields = new Set(transcript.map((turn) => turn.field));
    const seededQuickTurns: AdaptiveInterviewTurn[] = [];
    if (quickAnswers?.targetAttendees && !answeredFields.has("targetAttendees")) {
      seededQuickTurns.push({
        answer: quickAnswers.targetAttendees,
        field: "targetAttendees",
        prompt: copy(language, {
          en: "Who you want to meet (brought in from your quick answer)",
          zh: "这场你想认识谁（来自详情页速答）",
        }),
      });
    }
    if (quickAnswers?.valueOffered && !answeredFields.has("valueOffered")) {
      seededQuickTurns.push({
        answer: quickAnswers.valueOffered,
        field: "valueOffered",
        prompt: copy(language, {
          en: "What you can offer (brought in from your quick answer)",
          zh: "你能提供什么（来自详情页速答）",
        }),
      });
    }

    if (seededQuickTurns.length > 0) {
      const nextTranscript = [...transcript, ...seededQuickTurns];
      setTranscript(nextTranscript);
      const requiredAnswersReady = EVENT_PROFILE_CORE_FIELDS.every((field) =>
        nextTranscript.some((turn) => turn.field === field),
      );
      if (requiredAnswersReady) {
        setQuestion(null);
        setQuestionToken(null);
        return;
      }
      // 当前题若恰好是速答已覆盖的字段则弃用；其余题目仍然有效，保留继续答。
      if (
        question !== null &&
        !seededQuickTurns.some((turn) => turn.field === question.field)
      ) {
        return;
      }
      setQuestion(null);
      setQuestionToken(null);
      return;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, question, thinking, positioningSeeded, interviewEpoch, scopeKey, renderedRevision]);

  const fetchNextQuestion = useCallback(
    async (
      nextTranscript: readonly AdaptiveInterviewTurn[],
      signal?: AbortSignal,
    ) => {
      const response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/registration/interview`,
        {
          body: JSON.stringify({ language, transcript: nextTranscript }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal,
        },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: SignedAdaptiveInterviewStep;
        error?: { message?: string };
        success?: boolean;
      } | null;

      if (!response.ok || body?.success !== true || !body.data) {
        throw new Error(
          body?.error?.message ??
            copy(language, {
              en: "Could not load the next AI question. Your answers were kept; retry this step.",
              zh: "下一道 AI 问题生成失败，已保留当前回答，请重试。",
            }),
        );
      }

      return body.data;
    },
    [event.id, language],
  );

  async function retryInterviewStart() {
    if (!mounted.current || currentScope.current !== scopeKey || interviewRequest.current || generationPending.current || renderedRevision !== editRevision.current || thinking || interviewDone || progress.answeredCount === 8) return;
    const controller = new AbortController(); interviewRequest.current = controller;
    const revision = editRevision.current;

    setThinking(true);
    setError(null);
    try {
      const step = await fetchNextQuestion(transcript, controller.signal);
      if (!mounted.current || currentScope.current !== scopeKey || interviewRequest.current !== controller || revision !== editRevision.current) return;
      if (step.done) { editRevision.current++; setInterviewDone(true); setQuestion(null); setQuestionToken(null); return; }
      if (!step.signedQuestion) {
        throw new Error(
          copy(language, {
            en: "The AI interview returned no verified question. Please retry.",
            zh: "AI 访谈未返回可核验的问题，请重试。",
          }),
        );
      }
      setQuestion(step.signedQuestion.question);
      setQuestionToken(step.signedQuestion.questionToken);
      editRevision.current++;
    } catch (caught) {
      if (!mounted.current || currentScope.current !== scopeKey || interviewRequest.current !== controller) return;
      setError(
        caught instanceof Error
          ? caught.message
          : copy(language, {
              en: "The AI interview could not start. Please retry.",
              zh: "AI 访谈暂时无法开始，请重试。",
            }),
      );
    } finally {
      if (mounted.current && currentScope.current === scopeKey && interviewRequest.current === controller) { interviewRequest.current = null; setThinking(false); }
    }
  }

  // 生成阶段先持久化报名,确认写入成功后再请求派生画像。画像失败时保留
  // 已报名状态和可回读的原始回答,绝不把仅生成画像当作报名成功。
  const runGeneration = useCallback(
    async (
      finalTranscript: readonly AdaptiveInterviewTurn[],
      finalResponses: readonly EventInterviewResponseSubmission[],
      options?: { generatePersona?: boolean; questionSetHash?: string; questionSetVersion?: number },
    ) => {
      if (!mounted.current || currentScope.current !== scopeKey || cancelPending.current || generationPending.current || interviewRequest.current || renderedRevision !== editRevision.current) return;
      if (!admissionControlled && registration?.status !== "rsvped" && eligibility && !eligibility.allowedActions.includes(registration?.status === "cancelled" ? "reactivate" : "register")) return;
      generationPending.current = true;
      const runId = ++generationRunId.current;
      let savedRegistration: EventRegistration | null = null;
      let savedApplication: EventAdmissionApplication | null = null;

      setStage("generating");
      setGeneratingStep(0);
      setError(null);

      const startedAt = Date.now();
      const stageTimer = window.setInterval(() => {
        setGeneratingStep((current) => Math.min(current + 1, 2));
      }, GENERATING_STAGE_MS);

      try {
        if (admissionControlled && admissionApplication && finalResponses.length === 0) {
          // The application is already immutable and persisted. Regenerating
          // its derived persona must not create another application version.
          savedApplication = admissionApplication;
        } else if (registration?.status === "rsvped") {
          // Already saved registrations are immutable; this action is only a derived preview.
          savedRegistration = registration;
        } else {
          const registrationResponse = await fetch(
            admissionControlled
              ? `/api/events/${encodeURIComponent(event.id)}/admission/application`
              : `/api/events/${encodeURIComponent(event.id)}/registration`,
            {
              body: JSON.stringify(
                admissionControlled
                  ? { responses: finalResponses }
                  : {
                        intent: registration?.status === "cancelled" ? "reactivate" : "register",
                        expectedRegistrationVersion: registration?.updatedAt ?? null,
                        // 签名回答之外，附上整份 transcript 的 answers：服务端
                        // 只用它补齐种入轮（定位预填/详情页速答）未覆盖的字段。
                        // 准入审核活动只接受纯签名回答，因此不附带。
                        answers: answersFrom(finalTranscript),
                        ...(options?.questionSetHash ? { questionSetHash: options.questionSetHash } : {}),
                        ...(options?.questionSetVersion ? { questionSetVersion: options.questionSetVersion } : {}),
                        ...(finalResponses.length ? { responses: finalResponses } : {}),
                      },
              ),
              headers: { "content-type": "application/json" },
              method: "POST",
            },
          );
          const registrationBody = (await registrationResponse
            .json()
            .catch(() => null)) as RegistrationEnvelope | AdmissionEnvelope | null;

          if (
            !registrationResponse.ok ||
            registrationBody?.success !== true ||
            !registrationBody.data
          ) {
            throw new Error(
              registrationBody?.error?.message ??
                copy(language, {
                  en: "Your registration answers could not be saved.",
                  zh: "报名回答未能保存，请重试。",
                }),
            );
          }
          if (!mounted.current || currentScope.current !== scopeKey || generationRunId.current !== runId) return;

          if (admissionControlled) {
            if (
              !matchesAdmissionApplicationReceipt(registrationBody.data, {
                actorId: registrationActorId,
                eventId: event.id,
              })
            ) {
              throw new Error(
                copy(language, {
                  en: "The admission response could not be verified. Your answers were kept; reload its status.",
                  zh: "未能核对准入回执，答案已保留，请重新读取准入状态。",
                }),
              );
            }
            const readback = await readAdmissionApplicationReadback(
              registrationBody.data,
              () =>
                mounted.current &&
                currentScope.current === scopeKey &&
                generationRunId.current === runId,
            );
            if (
              !mounted.current ||
              currentScope.current !== scopeKey ||
              generationRunId.current !== runId
            ) {
              return;
            }
            if (!readback) return;
            savedApplication = readback;
            setAdmissionApplication(readback);
          } else {
            savedRegistration = await readRegistrationReadback(registrationBody.data as EventRegistration, registration?.status === "cancelled" ? "reactivate" : "register");
            if (!mounted.current || currentScope.current !== scopeKey || generationRunId.current !== runId) return;
            setRegistration(savedRegistration);
          }
          // 报名已持久化，详情页速答的本机暂存完成使命，清掉避免下次误带入。
          // 准入活动从不读取速答，也就不动它。
          if (!admissionControlled) {
            try {
              window.localStorage.removeItem(quickSignupStorageKey(event.id));
            } catch {
              // localStorage 不可用时忽略：暂存本就不存在。
            }
          }
        }

        if (options?.generatePersona === false) {
          if (mounted.current && currentScope.current === scopeKey && generationRunId.current === runId) setStage("registered");
          return;
        }
        const personaResponse = await fetch(
          `/api/events/${encodeURIComponent(event.id)}/registration/persona`,
          {
            body: JSON.stringify({ language, transcript: finalTranscript }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        const personaBody = (await personaResponse.json().catch(() => null)) as {
          data?: { persona: EventPersona };
          success?: boolean;
        } | null;

        if (
          !personaResponse.ok ||
          personaBody?.success !== true ||
          !personaBody.data
        ) {
          throw new Error(
            copy(language, {
              en: "Your registration was saved, but the event persona could not be generated.",
              zh: "报名已保存，但活动画像生成失败。",
            }),
          );
        }

        const elapsed = Date.now() - startedAt;

        if (elapsed < GENERATING_MIN_MS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, GENERATING_MIN_MS - elapsed),
          );
        }

        if (generationRunId.current === runId) {
          setPersona(personaBody.data.persona);
          setStage("persona");
        }
      } catch (caught) {
        if (generationRunId.current === runId) {
          setError(
            caught instanceof Error
              ? caught.message
              : copy(language, { en: "Something went wrong.", zh: "出错了,请重试。" }),
          );
          const application = savedApplication ?? admissionApplication;
          setStage(application
            ? application.status === "admitted"
              ? "registered"
              : application.status
            : (savedRegistration ?? registration)?.status === "rsvped"
              ? "registered"
              : "interview");
        }
      } finally {
        window.clearInterval(stageTimer);
        if (generationRunId.current === runId) generationPending.current = false;
      }
    },
    [admissionApplication, admissionControlled, event.id, language, registration, scopeKey, renderedRevision, eligibility],
  );

  async function submitAnswer(answer: string) {
    if (!mounted.current || currentScope.current !== scopeKey || renderedRevision !== editRevision.current || interviewRequest.current || generationPending.current || !question || !questionToken || thinking || interviewDone) {
      return;
    }

    const trimmed = answer.trim();

    if (!trimmed) {
      return;
    }
    const controller = new AbortController(); interviewRequest.current = controller;
    const revision = editRevision.current;

    const turn: AdaptiveInterviewTurn = {
      answer: trimmed.slice(0, 1000),
      field: question.field,
      prompt: question.prompt,
    };
    const nextTranscript = [...transcript, turn];
    const nextResponses = [
      ...responses,
      {
        answer: turn.answer,
        questionToken,
      },
    ];

    setSelectedOption(answer);
    setError(null);
    setThinking(true);
    try {
      let step: SignedAdaptiveInterviewStep | null = null;
      const requiredAnswersReady = EVENT_PROFILE_CORE_FIELDS.every((field) =>
        nextTranscript.some((candidate) => candidate.field === field),
      );
      if (!requiredAnswersReady && progress.answeredCount < 8) {
        step = await fetchNextQuestion(nextTranscript, controller.signal);
      }
      if (!mounted.current || currentScope.current !== scopeKey || interviewRequest.current !== controller || revision !== editRevision.current) return;
      if (step && !step.done && !step.signedQuestion) {
        throw new Error(copy(language, { en: "The next question could not be verified. Please retry.", zh: "下一题未通过验证，请重试。" }));
      }
      editRevision.current++;
      setTranscript(nextTranscript);
      setResponses(nextResponses);
      setQuestionHistory((history) => [...history, question]);
      setFreeText(""); setFreeTextOpen(false);
      setSelectedOption(null);
      if (!step || step.done || !step.signedQuestion) {
        setQuestion(null); setQuestionToken(null);
        setInterviewDone(step?.done === true || progress.answeredCount === 8);
        return;
      }

      setQuestion(step.signedQuestion.question);
      setQuestionToken(step.signedQuestion.questionToken);
    } catch (caught) {
      if (!mounted.current || currentScope.current !== scopeKey || interviewRequest.current !== controller) return;
      setError(
        caught instanceof Error
          ? caught.message
          : copy(language, { en: "Something went wrong.", zh: "出错了,请重试。" }),
      );
      // Keep the current choice/custom draft and all confirmed turns for retry.
    } finally {
      if (mounted.current && currentScope.current === scopeKey && interviewRequest.current === controller) { interviewRequest.current = null; setThinking(false); }
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

      if (index >= 0 && index < ordinaryOptions.length) {
        keyEvent.preventDefault();
        editRevision.current++;
        setSelectedOption(ordinaryOptions[index]); setFreeTextOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, thinking, freeTextOpen, question, transcript]);

  function restartInterview() {
    if (!mounted.current || currentScope.current !== scopeKey || cancelPending.current || generationPending.current) return;
    if (!admissionControlled && registration?.status === "cancelled" && eligibility && !eligibility.allowedActions.includes("reactivate")) return;
    generationRunId.current += 1;
    interviewRequest.current?.abort(); interviewRequest.current = null;
    editRevision.current++; generationPending.current = false;
    setThinking(false); setInterviewDone(false); setSelectedOption(null);
    setStage("interview");
    // 重来时回到与首次进入一致的种子状态：定位预填仍然生效，挂载 effect
    // 重新武装，速答等种入轮也按同一规则重新带入并取下一题。
    autoFetchedFirstQuestion.current = false;
    setInterviewEpoch((epoch) => epoch + 1);
    setTranscript(seededTranscript);
    setResponses([]);
    setQuestionHistory([]);
    setPersona(null);
    setQuestion(initialQuestionUsable ? initialSignedQuestion.question : null);
    setQuestionToken(
      initialQuestionUsable ? initialSignedQuestion.questionToken : null,
    );
    setFreeText("");
    setFreeTextOpen(false);
    setError(
      initialSignedQuestion || positioningSeeded
        ? null
        : copy(language, {
            en: "The AI interview could not start. Retry when the model is available.",
            zh: "AI 访谈暂时无法开始，请在模型恢复后重试。",
          }),
    );
    setConfirmingCancel(false);
  }

  async function readRegistrationReadback(receipt: EventRegistration, action: "cancel" | "reactivate" | "register") {
    const raw = receipt as EventRegistration & { mutationReceipt?: { action?: string; actorId?: string; eventId?: string; recordId?: string; registrationVersion?: string } };
    const status = action === "cancel" ? "cancelled" : "rsvped";
    const matches = (record: EventRegistration | undefined) => record && record.id && record.eventId === event.id && record.userId === registrationActorId && record.status === status &&
      record.participantProfileId === record.participantProfile?.id && record.participantProfile.eventId === event.id && record.participantProfile.userId === registrationActorId;
    if (!matches(raw) || !raw.updatedAt || raw.mutationReceipt?.action !== action || raw.mutationReceipt.actorId !== registrationActorId || raw.mutationReceipt.eventId !== event.id || raw.mutationReceipt.recordId !== raw.id || raw.mutationReceipt.registrationVersion !== raw.updatedAt || (registration && raw.id !== registration.id)) throw new Error(copy(language, { en: "The registration receipt could not be verified. Reload its status.", zh: "未能核对报名回执，请重新读取报名状态。" }));
    const response = await fetch(`/api/events/${encodeURIComponent(event.id)}/registration?questions=false`, { method: "GET", cache: "no-store" });
    const body = await response.json().catch(() => null) as { success?: boolean; data?: { registration?: EventRegistration; eligibility?: EventRegistrationEligibility } } | null;
    const record = body?.data?.registration;
    if (!response.ok || body?.success !== true || !matches(record) || record?.id !== raw.id || record.updatedAt !== raw.updatedAt) throw new Error(copy(language, { en: "The saved registration could not be read back. Keep your answers and reload its status.", zh: "暂时无法回读报名结果，答案已保留，请重新读取报名状态。" }));
    if (mounted.current && currentScope.current === scopeKey) setEligibility(body?.data?.eligibility);
    return record;
  }

  function confirmCancellation() {
    if (!mounted.current || currentScope.current !== scopeKey || cancelPending.current || generationPending.current || !canCancelEnrollment) return;
    cancelAuthority.current = authority;
    setConfirmingCancel(true);
  }

  async function cancelRegistration() {
    if (!mounted.current || currentScope.current !== scopeKey || cancelPending.current || generationPending.current || !canCancelEnrollment || cancelAuthority.current !== latestAuthority.current) return;
    const operationScope = scopeKey;
    const operationEpoch = generationRunId.current;
    const expectedApplicationVersion = admissionApplication?.applicationVersion;
    cancelPending.current = true;
    setError(null);
    setPendingCancel(true);

    try {
      const response = await fetch(
        admissionControlled
          ? `/api/events/${encodeURIComponent(event.id)}/admission/application`
          : `/api/events/${encodeURIComponent(event.id)}/registration/cancel`,
        admissionControlled
          ? {
              body: JSON.stringify({
                expectedApplicationVersion,
              }),
              headers: { "content-type": "application/json" },
              method: "DELETE",
            }
          : {
              body: JSON.stringify({
                expectedRegistrationVersion: registration?.updatedAt ?? null,
                intent: "cancel",
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
            },
      );
      const body = (await response.json()) as
        | AdmissionEnvelope
        | RegistrationEnvelope;
      if (
        !mounted.current ||
        currentScope.current !== operationScope ||
        generationRunId.current !== operationEpoch
      ) {
        return;
      }

      if (!response.ok || body.success !== true || !body.data) {
        throw new Error(
          body.error?.message ??
            copy(language, { en: "Registration could not be cancelled.", zh: "暂时无法取消预约。" }),
        );
      }

      if (admissionControlled) {
        if (
          typeof expectedApplicationVersion !== "number" ||
          !Number.isSafeInteger(expectedApplicationVersion) ||
          expectedApplicationVersion < 1 ||
          expectedApplicationVersion >= Number.MAX_SAFE_INTEGER ||
          !matchesAdmissionApplicationReceipt(body.data, {
            actorId: registrationActorId,
            applicationVersion: expectedApplicationVersion + 1,
            eventId: event.id,
            status: "withdrawn",
          })
        ) {
          throw new Error(
            copy(language, {
              en: "The withdrawal response could not be verified. Reload the application status.",
              zh: "未能核对撤回回执，请重新读取申请状态。",
            }),
          );
        }
        const readback = await readAdmissionApplicationReadback(
          body.data,
          () =>
            mounted.current &&
            currentScope.current === operationScope &&
            generationRunId.current === operationEpoch &&
            cancelPending.current,
        );
        if (
          !mounted.current ||
          currentScope.current !== operationScope ||
          generationRunId.current !== operationEpoch ||
          !cancelPending.current
        ) {
          return;
        }
        if (!readback) return;
        setAdmissionApplication(readback);
      } else {
        const readback = await readRegistrationReadback(body.data as EventRegistration, "cancel");
        if (
          !mounted.current ||
          currentScope.current !== operationScope ||
          generationRunId.current !== operationEpoch
        ) {
          return;
        }
        setRegistration(readback);
      }
      setPersona(null);
      setConfirmingCancel(false);
      setStage(admissionControlled ? "withdrawn" : "cancelled");
    } catch (caught) {
      if (
        !mounted.current ||
        currentScope.current !== operationScope ||
        generationRunId.current !== operationEpoch
      ) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : copy(language, { en: "Registration could not be cancelled.", zh: "暂时无法取消预约。" }),
      );
    } finally {
      if (
        mounted.current &&
        currentScope.current === operationScope &&
        generationRunId.current === operationEpoch
      ) {
        cancelPending.current = false;
        setPendingCancel(false);
      }
    }
  }

  const generatingLines = [
    copy(language, { en: "Reading your answers", zh: "正在解读你的回答" }),
    copy(language, { en: "Aligning with the event", zh: "正在对齐活动语境" }),
    copy(language, { en: "Composing your persona", zh: "正在生成你的活动画像" }),
  ];

  if (!admissionControlled && !registration && eligibility && !eligibility.allowedActions.includes("register")) {
    return <main data-registration-stage="unavailable" style={{ padding: 24 }}>
      <h1>{event.title}</h1>
      <p role="status">{eligibility.state === "unavailable" ? registrationBlockingReasonCopy(eligibility.blockingReason, language) : copy(language, { en: "Registration is not open for this event.", zh: "这场活动目前未开放报名。" })}</p>
      <a href={eventHref}>{copy(language, { en: "Back to event", zh: "返回活动页" })}</a>
    </main>;
  }

  return (
    <RegistrationPortraitWorkspace actorId={actorId ?? ""} event={event} language={language} initialDraftAnswers={answersFrom(transcript)} enrollment={actorId && !admissionControlled ? {
      stage, status, pending: stage === "generating" || pendingCancel,
      error, canSubmit: Boolean(!eligibility || eligibility.allowedActions.includes(registration?.status === "cancelled" ? "reactivate" : "register")),
      onSubmit: async (answers, identity) => { await runGeneration(Object.entries(answers).filter(([, answer]) => answer?.trim()).map(([field, answer]) => ({ field: field as AdaptiveInterviewTurn["field"], answer: answer!.trim(), prompt: field })), [], { ...identity, generatePersona: false }); },
      ...(canCancelEnrollment ? { onCancel: confirmCancellation } : {}),
      ...(confirmingCancel ? { confirmation: { pending: pendingCancel, onKeep: () => { cancelAuthority.current = null; setConfirmingCancel(false); }, onConfirm: () => { void cancelRegistration(); } } } : {}),
    } : undefined}>
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
        .reg-chip:focus-visible, .reg-ghost-btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 38%, transparent); outline-offset: 3px; }
        @media (max-width: 600px) {
          [data-orbit-registration-profile-guide="register"] { padding: 20px 12px 40px !important; }
          .reg-page-header { align-items: flex-start !important; margin: 14px 4px 18px !important; }
          .reg-question-body { padding: 24px 20px 22px !important; }
          .reg-question-footer { align-items: flex-start !important; flex-direction: column !important; padding: 13px 16px !important; }
          .reg-question-footer > span { line-height: 1.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-reg-anim], .reg-stagger > * { animation: none !important; }
        }
      `}</style>

      <section style={{ margin: "0 auto", maxWidth: 760 }}>
        <a
          className="reg-ghost-btn"
          href={eventHref}
          style={{ alignItems: "center", color: "var(--text-3)", display: "inline-flex", fontSize: 14, fontWeight: 600, gap: 6, marginLeft: -12, textDecoration: "none" }}
        >
          <Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />
          {copy(language, { en: "Back to event", zh: "返回活动页" })}
        </a>

        <header className="reg-page-header" style={{ alignItems: "flex-end", display: "flex", gap: 18, justifyContent: "space-between", margin: "20px 0 24px" }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ alignItems: "center", color: "var(--accent)", display: "inline-flex", fontSize: 12, fontWeight: 750, gap: 6, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              <Icon name="sparkle" size={13} />
              {copy(language, { en: "Event persona", zh: "活动个人画像" })}
            </span>
            <h1 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "clamp(1.4rem, 3.2vw, 2rem)", fontWeight: 680, lineHeight: 1.22, margin: "8px 0 0", overflowWrap: "anywhere" }}>
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
          {status === "rsvped" || status === "admitted" ? (
            <span style={{ alignItems: "center", background: "var(--live-soft, var(--accent-soft))", borderRadius: "var(--r-pill)", color: "var(--live, var(--accent))", display: "inline-flex", flexShrink: 0, fontSize: 12, fontWeight: 700, gap: 6, padding: "6px 13px" }}>
              <span style={{ background: "currentcolor", borderRadius: "var(--r-pill)", height: 6, width: 6 }} />
              {copy(language, { en: "Registered", zh: "已报名" })}
            </span>
          ) : status === "cancelled" || status === "withdrawn" ? (
            <span style={{ alignItems: "center", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", color: "var(--text-3)", display: "inline-flex", flexShrink: 0, fontSize: 12, fontWeight: 700, gap: 6, padding: "6px 13px" }}>
              {status === "withdrawn"
                ? copy(language, { en: "Application withdrawn", zh: "申请已撤回" })
                : copy(language, { en: "Registration cancelled", zh: "报名已取消" })}
            </span>
          ) : status === "pending_review" || status === "waitlisted" || status === "rejected" ? (
            <span style={{ alignItems: "center", background: "var(--accent-soft)", borderRadius: "var(--r-pill)", color: "var(--accent)", display: "inline-flex", flexShrink: 0, fontSize: 12, fontWeight: 700, gap: 6, padding: "6px 13px" }}>
              {status === "pending_review"
                ? copy(language, { en: "Pending review", zh: "待审核" })
                : status === "waitlisted"
                  ? copy(language, { en: "Waitlisted", zh: "候补中" })
                  : copy(language, { en: "Not admitted", zh: "未通过" })}
            </span>
          ) : null}
        </header>

        <p style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
          {copy(language, { en: "A few more answers can clarify your role at this event. Once the core information is complete, generate your persona or keep answering.", zh: "多回答几题，能让你在这场活动中的定位更清楚。核心信息填完后，可以先生成画像，也可以继续补充。" })}
        </p>
        <p data-registration-progress-label={`${progress.answeredCount}/8`}>
          {copy(language, { en: `Core information ${progress.coreAnsweredCount}/2 · Information coverage ${progress.answeredCount}/8`, zh: `核心信息 ${progress.coreAnsweredCount}/2 · 信息覆盖 ${progress.answeredCount}/8` })}
        </p>
        <div role="progressbar" aria-label={copy(language, { en: "Information coverage", zh: "信息覆盖" })} aria-valuemin={0} aria-valuemax={8} aria-valuenow={progress.answeredCount} style={{ height: 4, background: "var(--surface-3)", marginBottom: 12 }}>
          <span style={{ display: "block", height: 4, width: `${progress.answeredCount / 8 * 100}%`, background: "var(--accent)" }} />
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>
          {copy(language, { en: "This is completion progress, not accuracy. Unsubmitted answers are not saved; a persona preview is not proof that registration was saved.", zh: "这是填写进度，不是准确率；未提交的回答尚未保存，画像预览不代表报名已保存。" })}
        </p>
        {progress.canSuggestStop ? <p role="status">{interviewDone || progress.answeredCount === 8
          ? copy(language, { en: "Your answers are complete. You can generate your persona.", zh: "问卷已填写完成，可以生成画像。" })
          : copy(language, { en: "You can generate your persona now or keep answering.", zh: "可以先生成画像，也可以继续补充。" })}</p> : null}
        {stage === "interview" ? transcript.slice(transcript.length - questionHistory.length).filter(() => questionHistory.length > 0).map((turn, index) => (
          <section key={responses[index]?.questionToken ?? `${index}:${turn.field}`} data-registration-history={true} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 12, padding: "16px 20px" }}>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>{copy(language, { en: "Answered · read only", zh: "已回答 · 只读" })}</p>
            <h2 style={{ fontSize: 18, margin: "6px 0" }}>{turn.prompt}</h2>
            <p style={{ lineHeight: 1.6, margin: 0 }}>{turn.answer}</p>
          </section>
        )) : null}

        {isStatusCardApplication(admissionApplication) &&
        stage === admissionApplication.status ? (
          <EventAdmissionStatusCard
            application={admissionApplication}
            eventHref={eventHref}
            language={language}
            onWithdraw={() => {
              setError(null);
              confirmCancellation();
            }}
            pendingWithdraw={pendingCancel}
          />
        ) : null}

        {stage === "interview" && question ? (
          <div
            ref={currentQuestionNode}
            key={`${question.field}-${transcript.length}`}
            data-reg-anim="question"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "var(--sh-lg)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* 顶部进度束 */}
            <div
              aria-label={copy(language, { en: "Registration progress", zh: "报名进度" })}
              aria-hidden="true"
              style={{ background: "var(--surface-3)", display: "flex", height: 4 }}
            >
              <span
                style={{
                  background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 70%, var(--surface)), var(--accent))",
                  borderRadius: "0 99px 99px 0",
                  transition: "width .45s cubic-bezier(.22,1,.36,1)",
                  width: `${progress.answeredCount / 8 * 100}%`,
                }}
              />
            </div>

            <div className="reg-question-body" style={{ padding: "30px 34px 26px", position: "relative" }}>
              {/* 幽灵序号:填充留白,给页面编辑感 */}
              <span
                aria-hidden="true"
                style={{
                  color: "color-mix(in srgb, var(--accent) 8%, transparent)",
                  fontFamily: "var(--ff-display)",
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
                {String(currentQuestionNumber).padStart(2, "0")}
              </span>

              <div style={{ alignItems: "center", display: "flex", gap: 10, marginBottom: 20 }}>
                <span className="chip" style={{ background: "var(--accent-soft)", border: 0, color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>
                  {fieldLabel(language, question.field)}
                </span>
                <span
                  className="mono"
                  style={{ color: "var(--text-4)", fontSize: 12 }}
                >
                  {currentQuestionNumber} / {TOTAL_REQUIRED_QUESTIONS}
                </span>
              </div>

              {positioningSeeded && transcript.some((turn) => turn.field === "positioning") ? (
                <div data-registration-prefilled-positioning style={{ alignItems: "center", background: "var(--surface-2)", border: "1px dashed var(--border-2)", borderRadius: 12, color: "var(--text-2)", display: "flex", fontSize: 13, gap: 8, marginBottom: 16, padding: "9px 13px" }}>
                  <Icon color="var(--accent)" name="user" size={14} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {copy(language, { en: "Positioning from your profile: ", zh: "定位已从通用画像带入：" })}
                    <strong style={{ color: "var(--ink)" }}>{transcript.find((turn) => turn.field === "positioning")?.answer}</strong>
                  </span>
                  <a href="/app/profile" style={{ color: "var(--accent)", flexShrink: 0, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                    {copy(language, { en: "Edit profile", zh: "改通用画像" })}
                  </a>
                </div>
              ) : null}

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

              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "clamp(1.3rem, 2.8vw, 1.7rem)", fontWeight: 660, lineHeight: 1.38, margin: "0 0 24px", maxWidth: "88%" }}>
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
                    {ordinaryOptions.map((option, optionIndex) => (
                      <button
                        key={option}
                        aria-pressed={selectedOption === option}
                        className="reg-chip"
                        data-reg-option
                        onClick={() => { editRevision.current++; setSelectedOption(option); setFreeTextOpen(false); }}
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
                            fontSize: 12,
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
                    {question.options.length > 0 ? <button className="reg-chip" type="button" aria-pressed={freeTextOpen} onClick={() => { editRevision.current++; setFreeTextOpen(true); setSelectedOption(null); }} style={{ border: "1.5px solid var(--border)", borderRadius: 14, padding: "13px 16px", textAlign: "left", background: freeTextOpen ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)" }}>
                      {copy(language, { en: "Other", zh: "其他" })}
                    </button> : null}
                  </div>

                  {freeTextOpen || question.options.length === 0 ? (
                    <form
                      onSubmit={(formEvent) => {
                        formEvent.preventDefault();
                        return submitAnswer(freeText);
                      }}
                      style={{ display: "flex", gap: 10, marginTop: 14 }}
                    >
                      <input
                        aria-label={copy(language, { en: "Your own answer", zh: "你的回答" })}
                        aria-invalid={error ? true : undefined}
                        className="field"
                        onChange={(changeEvent) => { editRevision.current++; setFreeText(changeEvent.target.value); }}
                        placeholder={copy(language, { en: "Write your own answer…", zh: "用自己的话说…" })}
                        value={freeText}
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-primary" disabled={!freeText.trim()} type="submit" style={{ alignItems: "center", display: "inline-flex", gap: 7 }}>
                        {copy(language, { en: "Next", zh: "继续" })}
                      </button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={!selectedOption?.trim()}
                      onClick={() => submitAnswer(selectedOption ?? "")}
                      type="button"
                      style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 14, fontWeight: 600, gap: 6, marginLeft: -12, marginTop: 14 }}
                    >
                      {copy(language, { en: "Next", zh: "继续" })}
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

            <footer className="reg-question-footer" style={{ alignItems: "center", background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))", borderTop: "1px solid var(--border)", display: "flex", gap: 14, justifyContent: "space-between", padding: "13px 22px" }}>
              <span>{copy(language, { en: "Your earlier answers stay above.", zh: "已答问题保留在上方。" })}</span>
              <span style={{ color: "var(--text-4)", fontSize: 13 }}>
                {copy(language, {
                  en: `${missingCoreFields.length} question(s) left before registration. Answers stay scoped to this event.`,
                  zh: `还需完成 ${missingCoreFields.length} 个问题即可报名；回答只用于本次活动。`,
                })}
              </span>
            </footer>
          </div>
        ) : null}

        {stage === "registered" ? (
          <section
            data-reg-saved-registration
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "var(--sh-lg)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "grid", gap: 12, padding: "30px 34px 24px" }}>
              <span style={{ alignItems: "center", color: "var(--live, var(--accent))", display: "inline-flex", fontSize: 12, fontWeight: 750, gap: 7, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <Icon name="check" size={15} />
                {copy(language, { en: "Registration saved", zh: "报名已保存" })}
              </span>
              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "clamp(1.35rem, 3vw, 1.8rem)", margin: 0 }}>
                {copy(language, {
                  en: "Your event-scoped answers are stored.",
                  zh: "你的本场回答已可靠保存",
                })}
              </h2>
              <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.65, margin: 0 }}>
                {copy(language, {
                  en: "These exact answers remain after refresh or sign-in. The AI persona is a derived preview and is regenerated only when you request it.",
                  zh: "下列原始回答在刷新或重新登录后仍会保留。AI 活动画像属于派生预览，只会在你主动要求时重新生成。",
                })}
              </p>
              <dl style={{ display: "grid", gap: 10, margin: "6px 0 0" }}>
                {transcript.map((turn) => (
                  <div
                    key={turn.field}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      display: "grid",
                      gap: 5,
                      padding: "13px 15px",
                    }}
                  >
                    <dt style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 700 }}>
                      {fieldLabel(language, turn.field)}
                    </dt>
                    <dd style={{ color: "var(--ink)", fontSize: 15, lineHeight: 1.55, margin: 0 }}>
                      {turn.answer}
                    </dd>
                  </div>
                ))}
              </dl>
              {error ? (
                <div className="orbit-alert error" role="alert">
                  {error}
                </div>
              ) : null}
            </div>
            <footer style={{ alignItems: "center", background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", padding: "14px 22px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  className="btn btn-primary"
                  disabled={transcript.length === 0}
                  onClick={() => void runGeneration(transcript, responses)}
                  type="button"
                >
                  {copy(language, { en: "Generate event persona", zh: "生成活动画像" })}
                </button>
                {!admissionControlled ? (
                  <button
                    className="reg-ghost-btn"
                    onClick={restartInterview}
                    type="button"
                    style={{ background: "transparent", border: 0, color: "var(--text-2)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600 }}
                  >
                    {copy(language, { en: "Edit answers", zh: "修改回答" })}
                  </button>
                ) : null}
                <button
                  className="reg-ghost-btn"
                  onClick={() => {
                    setError(null);
                    confirmCancellation();
                  }}
                  type="button"
                  style={{ background: "transparent", border: 0, color: "var(--danger, #C2410C)", cursor: "pointer", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600 }}
                >
                  {admissionControlled
                    ? copy(language, { en: "Withdraw from event", zh: "撤回参会资格" })
                    : copy(language, { en: "Cancel registration", zh: "取消报名" })}
                </button>
              </div>
              <a className="reg-ghost-btn" href={eventHref} style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                {copy(language, { en: "Back to event", zh: "返回活动页" })}
              </a>
            </footer>
          </section>
        ) : null}

        {stage === "cancelled" ? (
          <section
            data-reg-cancelled-registration
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "var(--sh-lg)",
              display: "grid",
              gap: 14,
              padding: "30px 34px",
            }}
          >
            <span style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 750, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {copy(language, { en: "Registration cancelled", zh: "报名已取消" })}
            </span>
            <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "clamp(1.35rem, 3vw, 1.8rem)", margin: 0 }}>
              {copy(language, {
                en: "You are no longer registered for this event.",
                zh: "你已不再参加这场活动",
              })}
            </h2>
            <p role="status" style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.65, margin: 0 }}>
              {copy(language, {
                en: "No email, organizer message, calendar update, or refund was triggered. You can reactivate the same registration record by answering again.",
                zh: "本次取消不会发送邮件、联系主办方、修改日历或发起退款。再次回答时会重新激活同一条报名记录，不会创建重复记录。",
              })}
            </p>
            {transcript.length > 0 ? (
              <details>
                <summary style={{ color: "var(--text-2)", cursor: "pointer", fontSize: 14, fontWeight: 650 }}>
                  {copy(language, { en: "Review previously saved answers", zh: "查看此前保存的回答" })}
                </summary>
                <dl style={{ display: "grid", gap: 8, margin: "12px 0 0" }}>
                  {transcript.map((turn) => (
                    <div key={turn.field}>
                      <dt style={{ color: "var(--text-3)", fontSize: 12 }}>
                        {fieldLabel(language, turn.field)}
                      </dt>
                      <dd style={{ color: "var(--ink)", fontSize: 14, margin: "3px 0 0" }}>
                        {turn.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            {error ? (
              <div className="orbit-alert error" role="alert">
                {error}
              </div>
            ) : null}
            {eligibility && !eligibility.allowedActions.includes("reactivate") ? <p role="status">{eligibility.blockingReason ? registrationBlockingReasonCopy(eligibility.blockingReason, language) : copy(language, { en: "Registration is closed. Your cancellation remains in effect.", zh: "报名已截止，取消状态仍然有效。" })}</p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button className="btn btn-primary" disabled={Boolean(eligibility && !eligibility.allowedActions.includes("reactivate"))} onClick={restartInterview} type="button">
                {copy(language, { en: "Register again", zh: "重新报名" })}
              </button>
              <a className="reg-ghost-btn" href={eventHref} style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                {copy(language, { en: "Back to event", zh: "返回活动页" })}
              </a>
            </div>
          </section>
        ) : null}

        {stage === "generating" ? (
          <div
            style={{
              alignItems: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "var(--sh-lg)",
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
                      fontSize: index === generatingStep ? 15 : 14,
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
              boxShadow: "var(--sh-pop)",
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
              <span style={{ alignItems: "center", color: "var(--accent)", display: "inline-flex", fontSize: 12, fontWeight: 750, gap: 6, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                <Icon name="sparkle" size={13} />
                {copy(language, { en: "Your persona for this event", zh: "你的本场活动画像" })}
              </span>
              {admissionApplication ? (
                <p data-persona-admission-status={admissionApplication.status} style={{ color: "var(--text-2)", fontSize: 13, fontWeight: 650, margin: "10px 0 0" }}>
                  {admissionApplication.status === "admitted"
                    ? copy(language, { en: "Admission confirmed", zh: "参会资格已确认" })
                    : admissionApplication.status === "pending_review"
                      ? copy(language, { en: "Application saved · pending organizer review", zh: "申请已保存 · 等待主办方审核" })
                      : admissionApplication.status === "waitlisted"
                        ? copy(language, { en: "Application saved · waitlisted", zh: "申请已保存 · 当前候补中" })
                        : copy(language, { en: "Application state updated", zh: "申请状态已更新" })}
                </p>
              ) : null}
              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "clamp(1.4rem, 3.2vw, 1.9rem)", fontWeight: 720, lineHeight: 1.3, margin: "12px 0 16px", maxWidth: "86%" }}>
                {persona.tagline}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {persona.industryTags.map((tag) => (
                  <span
                    key={`industry-${tag}`}
                    style={{
                      background: "var(--accent)",
                      borderRadius: "var(--r-pill)",
                      color: "var(--on-dark)",
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "5px 13px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
                {persona.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: "color-mix(in srgb, var(--surface) 65%, transparent)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid color-mix(in srgb, var(--accent) 34%, var(--border))",
                      borderRadius: "var(--r-pill)",
                      color: "var(--accent)",
                      fontSize: 13,
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
                {
                  body: persona.energyStyle,
                  icon: "sparkle" as const,
                  label: copy(language, { en: "Social energy", zh: "社交能量" }),
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
                  <p style={{ color: "var(--text)", fontSize: 15, lineHeight: 1.65, margin: 0 }}>{section.body}</p>
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
                      <span className="mono" style={{ color: "var(--text-4)", flexShrink: 0, fontSize: 12, fontWeight: 700 }}>
                        {String(openerIndex + 1).padStart(2, "0")}
                      </span>
                      <span style={{ color: "var(--text)", fontSize: 15, lineHeight: 1.6 }}>{opener}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ alignItems: "center", display: "flex", gap: 8, gridColumn: "1 / -1" }}>
                <span className="chip" style={{ fontSize: 12 }}>
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
                {!admissionControlled ? (
                  <button
                    className="reg-ghost-btn"
                    onClick={restartInterview}
                    type="button"
                    style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--text-3)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 5 }}
                  >
                    <Icon name="edit" size={13} />
                    {copy(language, { en: "Redo the interview", zh: "重新回答" })}
                  </button>
                ) : null}
                {canCancelEnrollment ? (
                  <button
                    className="reg-ghost-btn"
                    onClick={() => {
                      setError(null);
                      confirmCancellation();
                    }}
                    type="button"
                    style={{ alignItems: "center", background: "transparent", border: 0, color: "var(--danger, #C2410C)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--ff)", fontSize: 13, fontWeight: 600, gap: 5 }}
                  >
                    {admissionControlled
                      ? copy(language, { en: "Withdraw from event", zh: "撤回参会资格" })
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

        {confirmingCancel && canCancelEnrollment ? (
          <div
            role="presentation"
            style={{
              alignItems: "center",
              background: "color-mix(in srgb, var(--ink) 38%, transparent)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              padding: 20,
              position: "fixed",
              zIndex: ORBIT_Z.modal,
            }}
          >
            <section
              aria-labelledby="event-registration-cancel-title"
              aria-modal="true"
              role="alertdialog"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                boxShadow: "var(--sh-pop)",
                display: "grid",
                gap: 14,
                maxWidth: 460,
                padding: 24,
                width: "100%",
              }}
            >
              <h2
                id="event-registration-cancel-title"
                style={{ color: "var(--ink)", fontSize: 22, margin: 0 }}
              >
                {admissionControlled
                  ? copy(language, {
                      en: "Withdraw from this event?",
                      zh: "确认撤回本次活动申请？",
                    })
                  : copy(language, {
                      en: "Cancel this event registration?",
                      zh: "确认取消这次活动报名？",
                    })}
              </h2>
              <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                {admissionControlled
                  ? copy(language, {
                      en: "The application becomes final and you will leave attendee matching. If already admitted, your attendee membership is cancelled atomically and the next waitlisted person may be promoted.",
                      zh: "撤回后申请将进入最终状态，并退出本场活动撮合；若此前已通过，参会资格会原子取消，并可能自动递补下一位候补者。",
                    })
                  : copy(language, {
                      en: "You will leave attendee matching. Your saved answers remain attached to this registration so you can reactivate the same record later.",
                      zh: "取消后你将退出本场活动撮合。已保存的回答仍归属于这条报名记录，之后可重新激活同一记录。",
                    })}
              </p>
              {error ? (
                <div className="orbit-alert error" role="alert">
                  {error}
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
                <button
                  autoFocus
                  className="btn btn-secondary"
                  disabled={pendingCancel}
                  onClick={() => {
                    setError(null);
                    setConfirmingCancel(false);
                  }}
                  type="button"
                >
                  {admissionControlled
                    ? copy(language, { en: "Keep application", zh: "保留申请" })
                    : copy(language, { en: "Keep registration", zh: "保留报名" })}
                </button>
                <button
                  className="btn"
                  disabled={pendingCancel}
                  onClick={cancelRegistration}
                  type="button"
                  style={{ background: "var(--danger, #C2410C)", color: "white" }}
                >
                  {pendingCancel
                    ? copy(language, { en: "Cancelling…", zh: "取消中…" })
                    : admissionControlled
                      ? copy(language, {
                          en: "Confirm withdrawal",
                          zh: "确认撤回申请",
                        })
                      : copy(language, {
                          en: "Confirm cancellation",
                          zh: "确认取消报名",
                        })}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {stage === "interview" && !question ? (
          <section
            aria-busy={thinking}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              boxShadow: "var(--sh-lg)",
              display: "grid",
              gap: 16,
              padding: "30px 34px",
            }}
          >
            <span style={{ color: "var(--accent)", display: "inline-flex" }}>
              <Icon name="sparkle" size={20} />
            </span>
            <div>
              <h2 style={{ color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: 22, margin: 0 }}>
                {registrationAnswersComplete
                  ? copy(language, {
                      en: "Registration has not been submitted yet",
                      zh: "报名尚未提交完成",
                    })
                  : transcript.length > 0
                  ? copy(language, {
                      en: "The next AI question is temporarily unavailable",
                      zh: "下一道 AI 问题暂时未生成",
                    })
                  : copy(language, {
                      en: "The AI interview is temporarily unavailable",
                      zh: "AI 访谈暂时未生成",
                    })}
              </h2>
              <p style={{ color: "var(--text-2)", lineHeight: 1.65, margin: "8px 0 0" }}>
                {registrationAnswersComplete
                  ? copy(language, {
                      en: "Your core answers are kept. Save registration and generate your persona now, or continue answering optional questions.",
                      zh: "核心回答已保留。可以保存报名并生成画像，也可以继续补充选填信息。",
                    })
                  : transcript.length > 0
                  ? copy(language, {
                      en: "Your answers so far are kept. No substitute question was used.",
                      zh: "已完成的回答都已保留，系统没有使用替代问题。",
                    })
                  : copy(language, {
                      en: "No substitute question was used and no answer was saved. Retry the real AI generation here.",
                      zh: "系统没有使用替代问题，也没有保存任何回答。你可以在这里重新请求真实 AI 生成。",
                    })}
              </p>
            </div>
            {error ? (
              <div className="orbit-alert error" role="alert">
                {error}
              </div>
            ) : null}
            {registrationAnswersComplete ? (
              <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  className="btn btn-primary"
                  data-registration-complete-anyway
                  disabled={thinking}
                  onClick={() => runGeneration(transcript, responses)}
                  type="button"
                >
                  {copy(language, { en: "Save registration and generate persona", zh: "保存报名并生成画像" })}
                </button>
                {!interviewDone && progress.answeredCount < 8 ? <button className="btn btn-secondary" disabled={thinking} type="button" onClick={() => retryInterviewStart()}>{copy(language, { en: "Continue answering", zh: "继续补充" })}</button> : null}
              </div>
            ) : (
              <div>
                <button
                  className="btn btn-primary"
                  data-registration-interview-retry
                  disabled={thinking || interviewDone || progress.answeredCount === 8}
                  onClick={() => retryInterviewStart()}
                  type="button"
                >
                  <Icon name="sparkle" size={15} />
                  {thinking
                    ? copy(language, { en: "Generating…", zh: "正在生成…" })
                    : copy(language, { en: "Retry AI interview", zh: "重试 AI 访谈" })}
                </button>
              </div>
            )}
          </section>
        ) : null}
      </section>
    </main>
    </RegistrationPortraitWorkspace>
  );
}
