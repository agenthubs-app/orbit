import { confirmEventCancellation } from "../../platform/confirm-event-cancellation";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  eventAdmissionApplicationPath,
  publicEventDetailPath,
  eventRegistrationCancelPath,
  eventRegistrationInterviewPath,
  eventRegistrationPersonaPath,
  eventRegistrationPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import {
  buildEventRegistrationAdaptiveBody,
  buildEventRegistrationAnswers,
  eventAdmissionApplicationMatches,
  eventAdmissionApplicationResponses,
  eventAdmissionWithdrawalMatches,
  eventRegistrationAdaptiveStepToView,
  eventRegistrationAuthorityKey,
  eventRegistrationPersonaToView,
  eventRegistrationQuestionKey,
  eventRegistrationReceiptMatches,
  type EventRegistrationAdaptiveQuestionView,
  type EventRegistrationInterviewTurn,
  type EventRegistrationPersonaView,
  eventRegistrationToView,
  type EventRegistrationQuestionView,
  type EventRegistrationView
} from "../../view-models/event-registration";
import { eventDetailToSummary } from "../../view-models/events";
import { registrationQuestionDraft, registrationQuestionAnswer, registrationQuestionOptions, registrationQuestionnaireProgress, type ChoiceDraft, type Progress } from "../../view-models/event-registration-questionnaire";
import { Registration7aViews } from "./Registration7aViews";
import { Registration7aRecommendations } from "./Registration7aRecommendationsResource";
import { appendPortraitAnswer, createPortraitSession, editPortraitHistory, restartUnstoredPortraitQuestions, portraitPreviewBody, portraitReceiptMatches, portraitToView, seedPortraitHistory, type PortraitSession } from "../../view-models/event-registration-portrait";
import { portraitPersonaSchema, portraitReadResultSchema } from "../../api/schema/event-registration-portrait";
import type { PortraitField, PortraitPreviewResult, PortraitRegistrationSource, PortraitSaveBody } from "../../api/contract/event-registration-portrait";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

function answersFromView(view: EventRegistrationView | null): Record<string, string> {
  return Object.fromEntries(
    (view?.questions ?? []).map((question) => [question.field, question.answer])
  );
}

export function EventRegistrationScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.user?.id ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scopeKey = JSON.stringify([server.baseUrl, actorId, eventId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({ client, scopeKey }), [client, scopeKey]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const previousScope = useRef(scope);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const dirty = useRef(false);
  const editRevision = useRef(0);
  const eventState = useApiResource<unknown>(publicEventDetailPath(eventId), () => false, { scopeKey });
  const registrationState = useApiResource<unknown>(
    `${eventRegistrationPath(eventId)}?language=${encodeURIComponent(locale.language)}&portraitProofs=true`,
    () => false,
    { scopeKey, cachePolicy: "network-only" }
  );
  const portraitState = useApiResource<unknown>(`${eventRegistrationPath(eventId)}/portrait`, () => false, { scopeKey, cachePolicy: "network-only" });
  const portraitData = portraitState.kind === "success" || portraitState.kind === "empty" ? portraitState.data : null;
  let loadedPortrait = null;
  let registrationSource: PortraitRegistrationSource | null = null;
  let portraitReadConfirmed = false;
  let portraitReadError: string | null = null;
  if (portraitState.kind === "success" || portraitState.kind === "empty") {
    try {
      const read = portraitReadResultSchema.parse(portraitState.data);
      loadedPortrait = portraitToView(portraitState.data);
      registrationSource = read.registrationSource ?? null;
      if (registrationSource && (registrationSource.actorId !== actorId || registrationSource.eventId !== eventId)) throw new Error("The registration reference belongs to another scope.");
      const registration = registrationState.kind === "success" || registrationState.kind === "empty" ? (registrationState.data as { registration?: { participantProfile?: unknown } } | null)?.registration : null;
      if (registration?.participantProfile && !registrationSource && !loadedPortrait) throw new Error("The canonical registration reference is unavailable.");
      if (loadedPortrait && (loadedPortrait.actorId !== actorId || loadedPortrait.eventId !== eventId)) throw new Error("The portrait belongs to another scope.");
      portraitReadConfirmed = true;
    } catch { portraitReadError = locale.t("registration.reasonTemporary"); }
  } else if (portraitState.kind === "failure" || portraitState.kind === "offline") portraitReadError = portraitState.error.message;
  const loadedRegistrationView =
    registrationState.kind === "success" || registrationState.kind === "empty"
      ? eventRegistrationToView(registrationState.data, locale.language)
      : null;
  const latestView = useRef(loadedRegistrationView); latestView.current = loadedRegistrationView;
  const [registrationView, setRegistrationView] = useState<EventRegistrationView | null>(null);
  const formView = useRef(registrationView); formView.current = registrationView;
  const registrationData =
    registrationState.kind === "success" || registrationState.kind === "empty"
      ? registrationState.data
      : null;
  const event =
    eventState.kind === "success" || eventState.kind === "empty"
      ? eventDetailToSummary(eventState.data)
      : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [portraitSession, setPortraitSession] = useState(() => createPortraitSession(scopeKey));
  const pendingPortraitSave = useRef<PortraitSaveBody | null>(null);
  const [adaptiveAnswer, setAdaptiveAnswer] = useState("");
  const [adaptiveDone, setAdaptiveDone] = useState(false);
  const doneRef = useRef(adaptiveDone); doneRef.current = adaptiveDone;
  const [adaptiveError, setAdaptiveError] = useState<string | null>(null);
  const [adaptivePending, setAdaptivePending] = useState<
    "interview" | "persona" | null
  >(null);
  const [adaptiveQuestion, setAdaptiveQuestion] =
    useState<EventRegistrationAdaptiveQuestionView | null>(null);
  const [adaptiveStatusText, setAdaptiveStatusText] =
    useState("继续补充画像");
  const [adaptiveTurns, setAdaptiveTurns] = useState<
    EventRegistrationInterviewTurn[]
  >([]);
  const [persona, setPersona] = useState<EventRegistrationPersonaView | null>(
    null
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"cancel" | "register" | null>(
    null
  );

  function resetDraft(view: EventRegistrationView | null, clearAnswers = false) {
    dirty.current = clearAnswers;
    editRevision.current++;
    formView.current = view;
    setRegistrationView(view);
    const initialAnswers = answersFromView(view);
    setAnswers(clearAnswers ? Object.fromEntries(Object.keys(initialAnswers).map(field => [field, ""])) : initialAnswers);
    setAdaptiveAnswer("");
    setAdaptiveDone(false);
    setAdaptiveError(null);
    setAdaptiveQuestion(null);
    setAdaptiveStatusText("继续补充画像");
    setAdaptiveTurns([]);
    setPersona(null);
    setFeedback(null);
    setSubmitError(null);
    setPortraitSession(createPortraitSession(scopeKey));
    pendingPortraitSave.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); request.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !registrationData) return;
    const received = eventRegistrationToView(registrationData, locale.language);
    const previous = formView.current;
    if (!previous) { resetDraft(received); return; }
    if (eventRegistrationQuestionKey(previous) !== eventRegistrationQuestionKey(received)) {
      setRegistrationView({ ...received, questions: previous.questions,
        questionSetHash: previous.questionSetHash, questionSetVersion: previous.questionSetVersion });
      return;
    }
    setRegistrationView(received);
    if (!dirty.current) setAnswers(answersFromView(received));
  }, [registrationData, scope, locale.language]);

  useEffect(() => {
    if (!ready || !portraitReadConfirmed || !loadedPortrait || currentScope.current !== scope || portraitSession.preview || portraitSession.editRevision > 0) return;
    setPortraitSession(current => current.scopeKey !== scopeKey || current.preview || current.editRevision > 0 ? current : { ...current, savedPortrait: loadedPortrait, saveState: "saved", history: current.history.length ? current.history : seedPortraitHistory({ registrationData, questions: [], answers: {}, savedPortrait: loadedPortrait }) });
    setPersona(current => current ?? eventRegistrationPersonaToView({ persona: loadedPortrait!.persona }));
  }, [portraitData, scope]);

  if (previousScope.current !== scope) {
    previousScope.current = scope;
    request.current?.abort(); request.current = null;
    setPendingAction(null); setAdaptivePending(null);
    resetDraft(null);
    return null;
  }

  const questionsChanged = Boolean(registrationView && loadedRegistrationView &&
    eventRegistrationQuestionKey(registrationView) !== eventRegistrationQuestionKey(loadedRegistrationView));
  const renderedRevision = editRevision.current;

  function isScopeCurrent() {
    return mounted.current && currentScope.current === scope && ready;
  }

  function beginRequest(requireCurrentQuestions = true) {
    if (!isScopeCurrent() || request.current || renderedRevision !== editRevision.current || !formView.current || !latestView.current ||
      (requireCurrentQuestions && latestView.current.canSubmit === false) ||
      (requireCurrentQuestions && eventRegistrationQuestionKey(formView.current) !== eventRegistrationQuestionKey(latestView.current))) return null;
    const controller = new AbortController(); request.current = controller;
    return controller;
  }

  function beginRegistrationAction(
    action: "apply" | "cancel" | "reactivate" | "register" | "update" | "withdraw"
  ) {
    const current = formView.current;
    const latest = latestView.current;
    if (
      !current ||
      !latest ||
      (current.allowedActions !== undefined &&
        !current.allowedActions.includes(action)) ||
      eventRegistrationAuthorityKey(current) !==
        eventRegistrationAuthorityKey(latest)
    ) {
      return null;
    }
    return beginRequest(action !== "cancel" && action !== "withdraw");
  }

  function finishRequest(controller: AbortController) {
    if (!isScopeCurrent() || request.current !== controller) return;
    request.current = null;
    setPendingAction(null); setAdaptivePending(null);
  }

  function loadNewQuestions() {
    const nextView = latestView.current;
    if (!isScopeCurrent() || request.current || !nextView || !questionsChanged) return;
    const intendedRevision = editRevision.current;
    const intendedKey = eventRegistrationQuestionKey(nextView);
    Alert.alert("载入新问题", "这会清空未提交的答案和辅助问答。请先复制需要保留的内容。", [
      { text: "取消", style: "cancel" },
      { text: "清空草稿并载入", style: "destructive", onPress: () => {
        if (!isScopeCurrent() || request.current || editRevision.current !== intendedRevision ||
          !latestView.current || eventRegistrationQuestionKey(latestView.current) !== intendedKey) return;
        resetDraft(latestView.current, true);
      } }
    ]);
  }

  function refresh() {
    if (!isScopeCurrent() || request.current) return;
    latestView.current = null;
    eventState.refresh();
    registrationState.refresh();
    portraitState.refresh();
  }

  function setAnswer(question: EventRegistrationQuestionView, value: string) {
    if (!isScopeCurrent()) return;
    if ((answers[question.field] ?? question.answer) === value) return;
    dirty.current = true; editRevision.current++;
    setAnswers((current) => ({
      ...current,
      [question.field]: value
    }));
    const index = portraitSession.history.findIndex(entry => entry.field === question.field);
    if (index >= 0) {
      const changed = value.trim() ? editPortraitHistory(portraitSession, index, value) : { ...portraitSession, history: portraitSession.history.slice(0, index), editRevision: portraitSession.editRevision + 1, preview: null, saveState: "idle" as const };
      setPortraitSession(changed);
      setAdaptiveTurns(adaptiveTurns.filter(turn => changed.history.some(entry => entry.field === turn.field && entry.answer === turn.answer)));
    } else if (portraitSession.preview || portraitSession.savedPortrait) setPortraitSession(current => ({ ...current, preview: null, editRevision: current.editRevision + 1, saveState: "idle" }));
    pendingPortraitSave.current = null;
    setPersona(null); setAdaptiveQuestion(null); setAdaptiveAnswer(""); setAdaptiveDone(false);
  }

  function changeAdaptiveAnswer(value: string) {
    if (!isScopeCurrent()) return;
    editRevision.current++;
    setAdaptiveAnswer(value);
  }

  function adaptiveBody() {
    const nextTurns =
      adaptiveQuestion && adaptiveAnswer.trim()
        ? [
            ...adaptiveTurns,
            {
              answer: adaptiveAnswer,
              field: adaptiveQuestion.field,
              prompt: adaptiveQuestion.prompt,
              ...(adaptiveQuestion.questionToken
                ? { questionToken: adaptiveQuestion.questionToken }
                : {}),
              ...(adaptiveQuestion.portraitAdaptiveToken ? { portraitAdaptiveToken: adaptiveQuestion.portraitAdaptiveToken } : {})
            }
          ]
        : adaptiveTurns;

    return {
      body: buildEventRegistrationAdaptiveBody(
        registrationView?.allowedActions?.includes("apply")
          ? []
          : registrationView?.questions ?? [],
        answers,
        nextTurns
      ),
      turns: nextTurns
    };
  }

  async function requestAdaptiveQuestion() {
    if (!registrationView || !portraitReadConfirmed || questionsChanged || doneRef.current || registrationQuestionnaireProgress([
      ...portraitSession.history,
      ...(adaptiveQuestion ? [{ field: adaptiveQuestion.field, answer: adaptiveAnswer }] : [])
    ]).answeredCount === 8) {
      return;
    }

    let nextSession: PortraitSession;
    try { nextSession = portraitDraft(); } catch { setAdaptiveError(locale.t("portrait66.stale")); return; }
    const { body: admissionBody, turns } = adaptiveBody();
    const body = { mode: "portrait-interview", language: locale.language === "en" ? "en" : "zh", transcript: registrationView.allowedActions?.includes("apply") ? admissionBody.transcript : nextSession.history.map(entry => ({ field: entry.field, answer: entry.answer, prompt: entry.prompt ?? locale.t(`portrait66.field.${entry.field}`) })) };
    const controller = beginRequest(false);
    if (!controller) return;
    const revision = editRevision.current;

    setAdaptivePending("interview");
    setAdaptiveError(null);

    const result = await client.post<unknown>(
      eventRegistrationInterviewPath(eventId),
      { body, signal: controller.signal }
    );

    if (!isScopeCurrent() || request.current !== controller) return;

    if (result.success && result.status >= 200 && result.status < 300) {
      if (editRevision.current !== revision) { finishRequest(controller); return; }
      const nextStep = eventRegistrationAdaptiveStepToView(result.data);
      if ((!nextStep.done && !nextStep.question) || (nextStep.question && (!nextStep.question.questionToken || !nextStep.question.portraitAdaptiveToken || nextSession.history.some(entry => entry.field === nextStep.question!.field)))) { setAdaptiveError(locale.t("registration.reasonTemporary")); finishRequest(controller); return; }
      editRevision.current++;
      setPortraitSession(nextSession);
      setAdaptiveTurns(turns);
      setAdaptiveAnswer("");
      setAdaptiveDone(nextStep.done);
      setAdaptiveQuestion(nextStep.question);
      setAdaptiveStatusText(nextStep.statusText);
    } else {
      setAdaptiveError(result.success ? "暂时无法生成问题，请重试。" : result.error.message);
    }

    finishRequest(controller);
  }

  async function generateAdaptivePersona() {
    if (!registrationView) {
      return;
    }

    let nextSession: PortraitSession;
    let body: ReturnType<typeof portraitPreviewBody>;
    try { nextSession = portraitDraft(); body = portraitPreviewBody(nextSession, locale.language === "en" ? "en" : "zh"); }
    catch { setAdaptiveError(locale.t("registration.questionnaireHint")); return; }
    if (!portraitReadConfirmed || questionsChanged) return;
    const { turns } = adaptiveBody();
    const controller = beginRequest(false);
    if (!controller) return;
    const revision = editRevision.current;

    setAdaptivePending("persona");
    setAdaptiveError(null);

    const result = await client.post<unknown>(
      eventRegistrationPersonaPath(eventId),
      { body, signal: controller.signal }
    );

    if (!isScopeCurrent() || request.current !== controller) return;

    if (result.success && result.status >= 200 && result.status < 300) {
      if (editRevision.current !== revision) { finishRequest(controller); return; }
      const preview = result.data as PortraitPreviewResult;
      const validatedPersona = portraitPersonaSchema.safeParse(preview?.persona);
      if (!validatedPersona.success || typeof preview?.generationToken !== "string" || !preview.generationToken || typeof preview.answersVersion !== "string" || !/^[a-f0-9]{64}$/.test(preview.answersVersion)) { setAdaptiveError(locale.t("registration.reasonTemporary")); finishRequest(controller); return; }
      editRevision.current++;
      pendingPortraitSave.current = null;
      setPortraitSession({ ...nextSession, view: "result", preview: { ...preview, persona: validatedPersona.data }, saveState: "idle" });
      setAdaptiveTurns(turns);
      setAdaptiveAnswer("");
      setAdaptiveQuestion(null);
      setPersona(eventRegistrationPersonaToView(result.data));
    } else {
      // Sprint 0081: a rejected portrait preview used to read the same either way,
      // so a data fault and a transient outage looked identical. Carry the server's
      // portraitCode into the message; it is the only thing that tells them apart.
      const portraitCode = !result.success ? String(result.error.context?.portraitCode ?? "").trim() : "";
      setAdaptiveError(result.success
        ? "暂时无法生成活动画像，请重试。"
        : portraitCode ? `${result.error.message}（${portraitCode}）` : result.error.message);
      if (!result.success && [409, 422].includes(result.status) && editRevision.current === revision) setPortraitSession({ ...nextSession, preview: null, saveState: "rejected" });
    }

    finishRequest(controller);
  }

  function portraitDraft(): PortraitSession {
    if (!adaptiveQuestion || !adaptiveAnswer.trim()) return portraitSession;
    if (!adaptiveQuestion.questionToken || !adaptiveQuestion.portraitAdaptiveToken) throw new Error("A workspace-bound question proof is required.");
    return appendPortraitAnswer(portraitSession, { id: adaptiveQuestion.questionToken, field: adaptiveQuestion.field as PortraitField, prompt: adaptiveQuestion.prompt, options: adaptiveQuestion.options, answer: adaptiveAnswer.trim(), proof: { kind: "signed_question", questionToken: adaptiveQuestion.questionToken, portraitAdaptiveToken: adaptiveQuestion.portraitAdaptiveToken, answer: adaptiveAnswer.trim() } });
  }

  async function savePortrait() {
    if (!portraitSession.preview || !portraitReadConfirmed || questionsChanged || portraitSession.saveState === "saved") return;
    const controller = beginRequest(false);
    if (!controller) return;
    const revision = editRevision.current;
    const mutation = pendingPortraitSave.current ?? { mutationId: `portrait:${Date.now()}:${Math.random().toString(36).slice(2)}`, expectedPortraitVersion: portraitSession.savedPortrait?.version ?? null, generationToken: portraitSession.preview.generationToken };
    pendingPortraitSave.current = mutation;
    setAdaptivePending("persona"); setAdaptiveError(null);
    setPortraitSession(current => ({ ...current, saveState: "saving" }));
    const saved = await client.post<unknown>(`${eventRegistrationPath(eventId)}/portrait`, { body: mutation, signal: controller.signal });
    if (!isScopeCurrent() || request.current !== controller) return;
    if (!saved.success || saved.status < 200 || saved.status >= 300) {
      setAdaptiveError(saved.success ? locale.t("portrait66.pending") : saved.error.message);
      const rejected = !saved.success && [400, 401, 403, 404, 409, 422].includes(saved.status);
      if (rejected) pendingPortraitSave.current = null;
      setPortraitSession(current => ({ ...current, preview: rejected ? null : current.preview, saveState: rejected ? "rejected" : "pending-confirmation" }));
      finishRequest(controller); return;
    }
    const readback = await client.get<unknown>(`${eventRegistrationPath(eventId)}/portrait`, { signal: controller.signal });
    if (!isScopeCurrent() || request.current !== controller) return;
    if (!readback.success || readback.status < 200 || readback.status >= 300 || !portraitReceiptMatches(saved.data, readback.data, actorId, eventId, mutation.mutationId)) {
      setPortraitSession(current => ({ ...current, saveState: "pending-confirmation" }));
      setAdaptiveError(locale.t("portrait66.pending")); finishRequest(controller); return;
    }
    const confirmed = portraitToView(readback.data)!;
    pendingPortraitSave.current = null;
    setPortraitSession(current => ({ ...current, savedPortrait: confirmed, saveState: editRevision.current === revision ? "saved" : "idle" }));
    finishRequest(controller);
  }

  async function recoverPortraitSources() {
    if (portraitSession.saveState !== "rejected") return;
    const controller = beginRequest(false);
    if (!controller) return;
    const revision = editRevision.current;
    setAdaptivePending("persona");
    const [registrationRead, portraitRead] = await Promise.all([
      client.get<unknown>(`${eventRegistrationPath(eventId)}?language=${encodeURIComponent(locale.language)}&portraitProofs=true`, { signal: controller.signal }),
      client.get<unknown>(`${eventRegistrationPath(eventId)}/portrait`, { signal: controller.signal })
    ]);
    if (!isScopeCurrent() || request.current !== controller) return;
    try {
      if (!registrationRead.success || !portraitRead.success) throw new Error(locale.t("registration.reasonTemporary"));
      const sourceRead = portraitReadResultSchema.parse(portraitRead.data);
      const savedPortrait = portraitToView(portraitRead.data);
      if (sourceRead.registrationSource && (sourceRead.registrationSource.actorId !== actorId || sourceRead.registrationSource.eventId !== eventId)) throw new Error(locale.t("registration.reasonTemporary"));
      if (savedPortrait && (savedPortrait.actorId !== actorId || savedPortrait.eventId !== eventId)) throw new Error(locale.t("registration.reasonTemporary"));
      const latest = eventRegistrationToView(registrationRead.data, locale.language);
      const draftAnswers = Object.fromEntries(portraitSession.history.map(entry => [entry.field, entry.answer]));
      const currentSources = seedPortraitHistory({ registrationData: registrationRead.data, questions: latest.questions, answers: draftAnswers, savedPortrait, registrationSource: sourceRead.registrationSource ?? null });
      const history = portraitSession.history.map(entry => {
        if (entry.proof.kind === "signed_question") return entry;
        const source = currentSources.find(item => item.field === entry.field);
        if (!source) throw new Error(locale.t("portrait66.stale"));
        return { ...source, answer: entry.answer, proof: { ...source.proof, answer: entry.answer } };
      });
      if (editRevision.current !== revision) return;
      editRevision.current++;
      pendingPortraitSave.current = null;
      setPortraitSession(current => ({ ...current, history, savedPortrait, preview: null, view: "interview", saveState: "idle", editRevision: current.editRevision + 1 }));
      setPersona(null); setAdaptiveError(null);
    } catch (error) { setAdaptiveError(error instanceof Error ? error.message : locale.t("registration.reasonTemporary")); }
    finally { finishRequest(controller); }
  }
  function restartPortraitQuestions() {
    if (!isScopeCurrent() || !portraitReadConfirmed || questionsChanged || request.current || portraitSession.saveState !== "rejected") return;
    const restarted = restartUnstoredPortraitQuestions(portraitSession);
    if (restarted === portraitSession) return;
    editRevision.current++; pendingPortraitSave.current = null;
    setPortraitSession(restarted); setAdaptiveQuestion(null); setAdaptiveAnswer(""); setAdaptiveDone(false); setAdaptiveError(null); setPersona(null);
    setAdaptiveTurns(adaptiveTurns.filter(turn => restarted.history.some(entry => entry.field === turn.field && entry.answer === turn.answer)));
  }

  async function verifyRegistrationReadback(receipt: unknown, status: "rsvped" | "cancelled", controller: AbortController) {
    const readback = await client.get<unknown>(`${eventRegistrationPath(eventId)}?questions=false`, { signal: controller.signal });
    if (!isScopeCurrent() || request.current !== controller || !readback.success || readback.status < 200 || readback.status >= 300) return false;
    const record = readback.data && typeof readback.data === "object" ? (readback.data as { registration?: unknown }).registration : null;
    if (!eventRegistrationReceiptMatches(record, eventId, actorId, status) || !receipt || typeof receipt !== "object" || !record || typeof record !== "object") return false;
    const expected = receipt as { id?: unknown; updatedAt?: unknown };
    const actual = record as { id?: unknown; updatedAt?: unknown };
    const previous = registrationData && typeof registrationData === "object" ? (registrationData as { registration?: { id?: unknown } }).registration : null;
    return (!previous || expected.id === previous.id) && actual.id === expected.id && actual.updatedAt === expected.updatedAt;
  }

  async function submitRegistration() {
    if (!registrationView) {
      return;
    }
    const action = registrationView.allowedActions?.find((value) =>
      value === "apply" || value === "register" || value === "reactivate" || value === "update"
    ) ?? "register";
    const admissionResponses = eventAdmissionApplicationResponses(
      action === "apply" ? adaptiveBody().turns : adaptiveTurns
    );
    if (action === "apply" && admissionResponses.length < 2) {
      setSubmitError("请先在活动画像中完成两道必答问题，再提交申请。");
      return;
    }
    const controller = beginRegistrationAction(action);
    if (!controller) return;
    const revision = editRevision.current;

    setPendingAction("register");
    setSubmitError(null);
    setFeedback(null);

    const result = action === "apply"
      ? await client.post<unknown>(eventAdmissionApplicationPath(eventId), {
          signal: controller.signal,
          body: { responses: admissionResponses }
        })
      : await client.post<unknown>(eventRegistrationPath(eventId), {
          signal: controller.signal,
          body: {
            answers: buildEventRegistrationAnswers(registrationView.questions, answers),
            intent: action,
            expectedRegistrationVersion: registrationView.registrationVersion ?? null,
            ...(admissionResponses.length ? { responses: admissionResponses } : {}),
            ...(registrationView.questionSetHash &&
            registrationView.questionSetVersion !== null
              ? {
                  questionSetHash: registrationView.questionSetHash,
                  questionSetVersion: registrationView.questionSetVersion
                }
              : {})
          }
        });

    if (!isScopeCurrent() || request.current !== controller) return;

    const receiptMatches = action === "apply"
      ? eventAdmissionApplicationMatches(
          result.success ? result.data : null,
          eventId,
          actorId
        )
      : eventRegistrationReceiptMatches(
          result.success ? result.data : null,
          eventId,
          actorId,
          "rsvped",
          action
        );
    const readbackMatches = result.success && result.status >= 200 && result.status < 300 && receiptMatches && (action === "apply" || await verifyRegistrationReadback(result.data, "rsvped", controller));
    if (!isScopeCurrent() || request.current !== controller) return;
    if (result.success && result.status >= 200 && result.status < 300 && readbackMatches) {
      if (editRevision.current === revision) dirty.current = false;
      const applicationStatus = result.success && typeof result.data === "object" && result.data
        ? (result.data as { status?: unknown }).status
        : null;
      setFeedback(
        action !== "apply"
          ? "报名资料已保存。"
          : applicationStatus === "admitted"
            ? "报名已确认。"
            : applicationStatus === "waitlisted"
              ? "申请已进入候补。"
              : "申请已提交，等待审核。"
      );
      eventState.refresh();
      registrationState.refresh();
    } else {
      setSubmitError(result.success ? "未能确认保存结果，答案已保留。请刷新后核对报名状态。" : result.error.message);
    }

    finishRequest(controller);
  }

  async function cancelRegistration() {
    const action = registrationView?.allowedActions?.includes("withdraw")
      ? "withdraw"
      : "cancel";
    const controller = beginRegistrationAction(action);
    if (!controller) return;
    setPendingAction("cancel");
    setSubmitError(null);
    setFeedback(null);

    const expectedApplicationVersion = registrationView?.applicationVersion;
    if (action === "withdraw" && expectedApplicationVersion === null) {
      finishRequest(controller);
      setSubmitError("无法确认当前申请版本，请刷新后再试。");
      return;
    }
    const result = action === "withdraw"
      ? await client.delete<unknown>(eventAdmissionApplicationPath(eventId), {
          body: { expectedApplicationVersion },
          signal: controller.signal
        })
      : await client.post<unknown>(eventRegistrationCancelPath(eventId), {
          body: {
            expectedRegistrationVersion: registrationView?.registrationVersion ?? null,
            intent: "cancel"
          },
          signal: controller.signal
        });

    if (!isScopeCurrent() || request.current !== controller) return;

    const receiptMatches = action === "withdraw"
      ? eventAdmissionWithdrawalMatches(
          result.success ? result.data : null,
          eventId,
          actorId,
          expectedApplicationVersion ?? 0
        )
      : eventRegistrationReceiptMatches(
          result.success ? result.data : null,
          eventId,
          actorId,
          "cancelled",
          "cancel"
        );
    const readbackMatches = result.success && result.status >= 200 && result.status < 300 && receiptMatches && (action === "withdraw" || await verifyRegistrationReadback(result.data, "cancelled", controller));
    if (!isScopeCurrent() || request.current !== controller) return;
    if (result.success && result.status >= 200 && result.status < 300 && readbackMatches) {
      setFeedback(action === "withdraw" ? "已撤回申请。" : "已取消报名。");
      eventState.refresh();
      registrationState.refresh();
    } else {
      setSubmitError(result.success ? "未能确认取消结果，答案已保留。请刷新后核对报名状态。" : result.error.message);
    }

    finishRequest(controller);
  }

  function confirmCancellation() {
    if (registrationView?.allowedActions?.includes("withdraw")) { void cancelRegistration(); return; }
    if (!isScopeCurrent() || request.current || !registrationView?.canCancel) return;
    const intendedAuthority = eventRegistrationAuthorityKey(registrationView);
    confirmEventCancellation({
      title: locale.t("registration.actionCancel"), message: locale.t("registration.cancelConfirmation"),
      keepLabel: locale.t("registration.cancelKeep"), cancelLabel: locale.t("registration.actionCancel"),
      onUnavailable: () => { if (isScopeCurrent()) setSubmitError(locale.t("registration.cancelConfirmationUnavailable")); },
      onConfirm: () => {
        if (!latestView.current || intendedAuthority !== eventRegistrationAuthorityKey(latestView.current)) return;
        void cancelRegistration();
      }
    });
  }

  function showPortraitView(view: PortraitSession["view"]) {
    if (!isScopeCurrent() || (view !== "registration" && !portraitReadConfirmed)) return;
    setPortraitSession(current => ({ ...current, view, history: current.history.length ? current.history : seedPortraitHistory({ registrationData, questions: registrationView?.questions ?? [], answers, savedPortrait: current.saveState === "saved" ? current.savedPortrait : null, registrationSource }) }));
  }

  function editPortraitAnswer(index: number, answer: string) {
    if (!isScopeCurrent() || request.current || !portraitReadConfirmed || !latestView.current || questionsChanged) return;
    try {
      const edited = editPortraitHistory(portraitSession, index, answer);
      if (edited === portraitSession) return;
      editRevision.current++;
      pendingPortraitSave.current = null;
      setPortraitSession(edited);
      setPersona(null); setAdaptiveQuestion(null); setAdaptiveAnswer(""); setAdaptiveDone(false);
      setAdaptiveTurns(adaptiveTurns.filter(turn => edited.history.some(entry => entry.field === turn.field && entry.answer === turn.answer)));
    } catch { setAdaptiveError(locale.t("portrait66.stale")); }
  }

  if (ready && event && registrationView) return <Registration7aViews
    recommendations={<Registration7aRecommendations eventId={eventId} scopeKey={scopeKey} onContact={id => { if (isScopeCurrent()) router.push({ pathname: "/contacts/[id]", params: { id } }); }} />}
    onReloadPortraitSources={recoverPortraitSources}
    onRestartUnstoredQuestions={restartPortraitQuestions}
    session={portraitSession} eventTitle={event.title} eventMeta={[event.startsAt, event.location].filter(Boolean).join(" · ")}
    registration={registrationView} answers={answers} question={adaptiveQuestion} answer={adaptiveAnswer} done={adaptiveDone} persona={persona}
    pending={pendingAction !== null} portraitPending={adaptivePending !== null} readConfirmed={loadedRegistrationView !== null}
    portraitReadConfirmed={portraitReadConfirmed} readFailure={registrationState.kind === "failure" || registrationState.kind === "offline" || eventState.kind === "failure" || eventState.kind === "offline" || portraitReadError !== null} onRetryRead={refresh}
    questionsChanged={questionsChanged} error={submitError ?? adaptiveError ?? portraitReadError ?? (registrationState.kind === "failure" || registrationState.kind === "offline" ? registrationState.error.message : eventState.kind === "failure" || eventState.kind === "offline" ? eventState.error.message : null)} feedback={feedback}
    refreshControl={<RefreshControl onRefresh={refresh} refreshing={eventState.refreshing || registrationState.refreshing} tintColor="#0A5CFF" />}
    onBack={() => router.push({ params: { id: eventId }, pathname: "/events/[id]" })} onView={showPortraitView} onSetAnswer={setAnswer} onAnswer={changeAdaptiveAnswer}
    onNext={requestAdaptiveQuestion} onGenerate={generateAdaptivePersona} onSave={savePortrait} onSubmit={submitRegistration} onCancel={confirmCancellation} onLoadNew={loadNewQuestions} onEdit={editPortraitAnswer}
  />;

  return (
    <AppScreen
      eyebrow={locale.t("registration.eyebrow")}
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={eventState.refreshing || registrationState.refreshing}
          tintColor={colors.accent}
        />
      }
      title={locale.t("registration.title")}
    >
      {eventState.kind === "loading" || registrationState.kind === "loading" ? (
        <LoadingState />
      ) : null}
      {eventState.kind === "offline" || registrationState.kind === "offline" ? (
        <ErrorState
          message={
            eventState.kind === "offline"
              ? eventState.error.message
              : registrationState.kind === "offline"
                ? registrationState.error.message
                : "服务器连不上"
          }
          title="服务器连不上"
        />
      ) : null}
      {eventState.kind === "failure" ? (
        <ErrorState message={eventState.error.message} />
      ) : null}
      {registrationState.kind === "failure" ? (
        <ErrorState message={registrationState.error.message} />
      ) : null}
      {eventState.kind === "failure" || eventState.kind === "offline" ||
        registrationState.kind === "failure" || registrationState.kind === "offline" ? (
        <Pressable accessibilityRole="button" onPress={refresh}
          disabled={eventState.refreshing || registrationState.refreshing}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>重新读取报名资料</Text>
        </Pressable>
      ) : null}
      {ready && event && registrationView ? (
        <RegistrationForm
          key={JSON.stringify([scopeKey, eventRegistrationQuestionKey(registrationView)])}
          adaptiveAnswer={adaptiveAnswer}
          adaptiveDone={adaptiveDone}
          adaptiveTurns={adaptiveTurns}
          adaptiveError={adaptiveError}
          adaptivePending={adaptivePending}
          adaptiveQuestion={adaptiveQuestion}
          adaptiveStatusText={adaptiveStatusText}
          answers={answers}
          eventMeta={[event.startsAt, event.location].filter(Boolean).join(" · ")}
          eventTitle={event.title}
          feedback={feedback}
          onAdaptiveAnswerChange={changeAdaptiveAnswer}
          onBack={() =>
            router.push({
              params: { id: eventId },
              pathname: "/events/[id]"
            })
          }
          onCancel={confirmCancellation}
          onGenerateAdaptivePersona={generateAdaptivePersona}
          onRequestAdaptiveQuestion={requestAdaptiveQuestion}
          onLoadNewQuestions={loadNewQuestions}
          onSetAnswer={setAnswer}
          onSubmit={submitRegistration}
          pendingAction={pendingAction}
          persona={persona}
          registration={registrationView}
          readConfirmed={loadedRegistrationView !== null}
          questionsChanged={questionsChanged}
          submitError={submitError}
        />
      ) : null}
    </AppScreen>
  );
}

function RegistrationForm({
  adaptiveAnswer,
  adaptiveDone,
  adaptiveTurns,
  adaptiveError,
  adaptivePending,
  adaptiveQuestion,
  adaptiveStatusText,
  answers,
  eventMeta,
  eventTitle,
  feedback,
  onAdaptiveAnswerChange,
  onBack,
  onCancel,
  onGenerateAdaptivePersona,
  onRequestAdaptiveQuestion,
  onLoadNewQuestions,
  onSetAnswer,
  onSubmit,
  pendingAction,
  persona,
  registration,
  readConfirmed,
  questionsChanged,
  submitError
}: {
  adaptiveAnswer: string;
  adaptiveDone: boolean;
  adaptiveTurns: EventRegistrationInterviewTurn[];
  adaptiveError: string | null;
  adaptivePending: "interview" | "persona" | null;
  adaptiveQuestion: EventRegistrationAdaptiveQuestionView | null;
  adaptiveStatusText: string;
  answers: Record<string, string>;
  eventMeta: string;
  eventTitle: string;
  feedback: string | null;
  onAdaptiveAnswerChange: (value: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onGenerateAdaptivePersona: () => void;
  onRequestAdaptiveQuestion: () => void;
  onLoadNewQuestions: () => void;
  onSetAnswer: (question: EventRegistrationQuestionView, value: string) => void;
  onSubmit: () => void;
  pendingAction: "cancel" | "register" | null;
  persona: EventRegistrationPersonaView | null;
  registration: EventRegistrationView;
  readConfirmed: boolean;
  questionsChanged: boolean;
  submitError: string | null;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  return (
    <>
      <DataCard detail={readConfirmed ? registration.statusDetail : "显示上次读取的报名资料，当前答案和辅助问答已保留。"} title={eventTitle}>
        <View style={styles.statusRow}>
          <Text style={styles.statusPill}>{registration.statusLabel}</Text>
          {eventMeta ? <Text style={styles.eventMetaText}>{eventMeta}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="arrow-back-outline" size={17} />
          <Text style={styles.secondaryButtonText}>{locale.t("registration.backEvent")}</Text>
        </Pressable>
      </DataCard>
      <DataCard variant="inset" detail={locale.t("registration.profileDetail")} title={locale.t("registration.profileTitle")}>
        {questionsChanged ? <>
          <Text style={styles.errorText}>报名问题已更新，当前答案和辅助问答已保留。</Text>
          <Pressable accessibilityRole="button" disabled={pendingAction !== null || adaptivePending !== null || !readConfirmed}
            onPress={onLoadNewQuestions} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>载入新问题</Text>
          </Pressable>
        </> : null}
        {registration.questions.length === 0 ? (
          <EmptyState
            message="这场活动暂时没有需要补充的问题。"
            title="没有报名问题"
          />
        ) : (
          registration.questions.map((question) => (
            <RegistrationQuestion
              answer={answers[question.field] ?? question.answer}
              key={question.id}
              onChange={(value) => onSetAnswer(question, value)}
              question={question}
            />
          ))
        )}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={pendingAction !== null || adaptivePending !== null || questionsChanged || !readConfirmed || registration.canSubmit === false}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            pendingAction || !readConfirmed || registration.canSubmit === false ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="checkmark-outline" size={18} />
          <Text style={styles.primaryButtonText}>
            {pendingAction === "register" ? locale.t("profile.saving") : registration.confirmLabel || locale.t("registration.submit")}
          </Text>
        </Pressable>
        {registration.canCancel ? (
          <Pressable
            accessibilityRole="button"
            disabled={pendingAction !== null || adaptivePending !== null || !readConfirmed}
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              pendingAction || !readConfirmed ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.rose} name="close-outline" size={18} />
            <Text style={styles.cancelButtonText}>
              {pendingAction === "cancel" ? "取消中" : registration.cancelLabel ?? "取消报名"}
            </Text>
          </Pressable>
        ) : null}
      </DataCard>
      <AdaptiveRegistrationCard
        answer={adaptiveAnswer}
        done={adaptiveDone}
        turns={adaptiveTurns}
        progress={registrationQuestionnaireProgress([
          ...Object.entries(answers).map(([field, answer]) => ({ field, answer })),
          ...adaptiveTurns,
          ...(adaptiveQuestion ? [{ field: adaptiveQuestion.field, answer: adaptiveAnswer }] : [])
        ])}
        disabled={pendingAction !== null || questionsChanged || !readConfirmed || registration.canSubmit === false}
        error={adaptiveError}
        onAnswerChange={onAdaptiveAnswerChange}
        onGeneratePersona={onGenerateAdaptivePersona}
        onRequestQuestion={onRequestAdaptiveQuestion}
        pending={adaptivePending}
        persona={persona}
        question={adaptiveQuestion}
        statusText={adaptiveStatusText}
      />
    </>
  );
}

function AdaptiveRegistrationCard({
  answer,
  done,
  turns,
  progress,
  disabled,
  error,
  onAnswerChange,
  onGeneratePersona,
  onRequestQuestion,
  pending,
  persona,
  question,
  statusText
}: {
  answer: string;
  done: boolean;
  turns: EventRegistrationInterviewTurn[];
  progress: Progress;
  disabled: boolean;
  error: string | null;
  onAnswerChange: (value: string) => void;
  onGeneratePersona: () => void;
  onRequestQuestion: () => void;
  pending: "interview" | "persona" | null;
  persona: EventRegistrationPersonaView | null;
  question: EventRegistrationAdaptiveQuestionView | null;
  statusText: string;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const scroll = useRef<ScrollView>(null);
  const previousQuestion = useRef(question);
  const scrollPending = useRef(false);
  if (previousQuestion.current !== question) { previousQuestion.current = question; scrollPending.current = Boolean(question); }
  return (
    <DataCard variant="inset" detail={statusText} title={locale.t("registration.questionnaireTitle")}>
      <Text style={styles.bodyText}>{locale.t("registration.questionnaireHint")}</Text>
      <Text style={styles.bodyText}>{locale.t("registration.questionnaireProgress", { core: progress.coreAnsweredCount, count: progress.answeredCount })}</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 8, now: progress.answeredCount }} style={{ height: 4, backgroundColor: colors.border }}>
        <View style={{ height: 4, width: `${progress.answeredCount / 8 * 100}%`, backgroundColor: colors.accent }} />
      </View>
      {done || progress.answeredCount === 8 ? <Text style={styles.feedbackText}>{locale.t("registration.questionnaireComplete")}</Text> : progress.canSuggestStop ? <Text style={styles.feedbackText}>{locale.t("registration.questionnaireStop")}</Text> : null}
      <Text style={styles.evidenceText}>{locale.t("registration.questionnaireUnsaved")}</Text>
      <ScrollView ref={scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }} onContentSizeChange={() => {
        if (scrollPending.current) { scrollPending.current = false; scroll.current?.scrollToEnd({ animated: true }); }
      }}>
      {turns.map((turn, index) => <View key={turn.questionToken ?? `${index}:${turn.field}`} style={styles.questionBlock}>
        <Text style={styles.evidenceText}>{locale.t("registration.questionnaireAnswered")}</Text>
        <Text style={styles.questionText}>{turn.prompt}</Text>
        <Text style={styles.bodyText}>{turn.answer}</Text>
      </View>)}
      {question ? (
        <View style={styles.adaptiveQuestionBlock}>
          {question.acknowledgment ? (
            <Text style={styles.feedbackText}>{question.acknowledgment}</Text>
          ) : null}
          <RegistrationQuestion
            key={question.questionToken ?? `${turns.length}:${question.field}:${question.prompt}`}
            answer={answer}
            onChange={onAnswerChange}
            question={{
              answer: "",
              field: question.field,
              id: question.field,
              options: question.options,
              prompt: question.prompt
            }}
          />
        </View>
      ) : null}
      </ScrollView>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {persona ? <PersonaPreview persona={persona} /> : null}
      <View style={styles.adaptiveActionsRow}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || pending !== null || done || progress.answeredCount === 8}
          onPress={onRequestQuestion}
          style={({ pressed }) => [
            styles.secondaryButton,
            pending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.accent} name="chatbubble-outline" size={17} />
          <Text style={styles.secondaryButtonText}>
            {pending === "interview" ? "生成中" : "下一题"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || pending !== null}
          onPress={onGeneratePersona}
          style={({ pressed }) => [
            styles.primaryButton,
            pending ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="sparkles-outline" size={17} />
          <Text style={styles.primaryButtonText}>
            {pending === "persona" ? "生成中" : "生成活动画像"}
          </Text>
        </Pressable>
      </View>
    </DataCard>
  );
}

function PersonaPreview({
  persona
}: {
  persona: EventRegistrationPersonaView;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.personaPreview}>
      <Text style={styles.personaTitle}>{persona.tagline}</Text>
      {persona.tags.length > 0 ? (
        <View style={styles.personaTagsRow}>
          {persona.tags.map((tag) => (
            <Text key={tag} style={styles.personaTag}>
              {tag}
            </Text>
          ))}
        </View>
      ) : null}
      {persona.industryTags.length > 0 ? (
        <Text style={styles.bodyText}>{persona.industryTags.join(" · ")}</Text>
      ) : null}
      {persona.energyStyle ? (
        <Text style={styles.bodyText}>{persona.energyStyle}</Text>
      ) : null}
      {persona.seeking ? <Text style={styles.bodyText}>{persona.seeking}</Text> : null}
      {persona.offering ? (
        <Text style={styles.bodyText}>{persona.offering}</Text>
      ) : null}
      {persona.openers.length > 0 ? (
        <View style={styles.openersStack}>
          {persona.openers.map((opener) => (
            <Text key={opener} style={styles.evidenceText}>
              {opener}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.evidenceText}>{persona.safetyText}</Text>
      <Text style={styles.evidenceText}>{persona.nextAction}</Text>
    </View>
  );
}

function RegistrationQuestion({
  answer,
  onChange,
  question
}: {
  answer: string;
  onChange: (value: string) => void;
  question: EventRegistrationQuestionView;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const [draft, setDraft] = useState(() => registrationQuestionDraft(question.options, answer));
  const previousAnswer = useRef(answer);
  useEffect(() => {
    if (previousAnswer.current !== answer) {
      previousAnswer.current = answer;
      setDraft(registrationQuestionDraft(question.options, answer));
    }
  }, [answer, question.options]);
  function changeDraft(next: ChoiceDraft) {
    const value = registrationQuestionAnswer(next);
    previousAnswer.current = value;
    setDraft(next);
    onChange(value);
  }
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionText}>{question.prompt}</Text>
      <Text style={styles.evidenceText}>{locale.t(question.required ? "registration.required" : "registration.optional")}</Text>
      {question.options.length > 0 ? (
        <View style={styles.optionsRow}>
          {registrationQuestionOptions(question.options).map((option) => (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => changeDraft({ ...draft, mode: "option", option })}
              style={({ pressed }) => [
                styles.optionPill,
                answer === option ? styles.optionPillActive : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  answer === option ? styles.optionTextActive : null
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: draft.mode === "other" }} onPress={() => changeDraft({ ...draft, mode: "other", option: null })} style={[styles.optionPill, draft.mode === "other" ? styles.optionPillActive : null]}>
            <Text style={[styles.optionText, draft.mode === "other" ? styles.optionTextActive : null]}>{locale.t("registration.questionnaireOther")}</Text>
          </Pressable>
        </View>
      ) : null}
      {question.options.length === 0 || draft.mode === "other" ? <TextInput
        multiline
        onChangeText={(customText) => changeDraft({ mode: "other", option: null, customText })}
        placeholder={locale.t("registration.answerPlaceholder")}
        placeholderTextColor={colors.text4}
        style={styles.answerInput}
        textAlignVertical="top"
        value={draft.customText}
      /> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  adaptiveActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  adaptiveQuestionBlock: {
    gap: spacing.sm
  },
  answerInput: {
    paddingTop: spacing.md,
    ...createControlStyles(colors).input,
    minHeight: 86,
    textAlignVertical: "top"
  },
  bodyText: {
    color: colors.text,
    ...textStyles.body
  },
  cancelButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.roseSoft
  },
  cancelButtonText: {
    ...createControlStyles(colors).secondaryButtonText,
    color: colors.rose
  },
  disabled: {
    opacity: 0.55
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
  },
  eventMetaText: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  evidenceText: {
    color: colors.text3,
    fontSize: typography.caption,
    lineHeight: 17
  },
  feedbackText: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
  },
  optionPill: {
    ...createControlStyles(colors).chip,
    maxWidth: "100%"
  },
  optionPillActive: {
    ...createControlStyles(colors).selectedChip
  },
  optionText: {
    ...createControlStyles(colors).chipText
  },
  optionTextActive: {
    ...createControlStyles(colors).selectedChipText
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  openersStack: {
    gap: spacing.xs
  },
  personaPreview: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  personaTag: {
    backgroundColor: colors.accentSofter,
    borderRadius: radius.pill,
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  personaTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  personaTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 22
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  questionBlock: {
    gap: spacing.sm
  },
  questionText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 22
  },
  secondaryButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  secondaryButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  statusPill: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  }
}));
