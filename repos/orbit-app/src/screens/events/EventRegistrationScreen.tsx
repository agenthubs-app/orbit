import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
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
    `${eventRegistrationPath(eventId)}?language=zh`,
    () => false,
    { scopeKey, cachePolicy: "network-only" }
  );
  const loadedRegistrationView =
    registrationState.kind === "success" || registrationState.kind === "empty"
      ? eventRegistrationToView(registrationState.data)
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
  const [adaptiveAnswer, setAdaptiveAnswer] = useState("");
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
    setAdaptiveError(null);
    setAdaptiveQuestion(null);
    setAdaptiveStatusText("继续补充画像");
    setAdaptiveTurns([]);
    setPersona(null);
    setFeedback(null);
    setSubmitError(null);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); request.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !registrationData) return;
    const received = eventRegistrationToView(registrationData);
    const previous = formView.current;
    if (!previous) { resetDraft(received); return; }
    if (eventRegistrationQuestionKey(previous) !== eventRegistrationQuestionKey(received)) {
      setRegistrationView({ ...received, questions: previous.questions,
        questionSetHash: previous.questionSetHash, questionSetVersion: previous.questionSetVersion });
      return;
    }
    setRegistrationView(received);
    if (!dirty.current) setAnswers(answersFromView(received));
  }, [registrationData, scope]);

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
  }

  function setAnswer(question: EventRegistrationQuestionView, value: string) {
    if (!isScopeCurrent()) return;
    dirty.current = true; editRevision.current++;
    setAnswers((current) => ({
      ...current,
      [question.field]: value
    }));
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
                : {})
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
    if (!registrationView) {
      return;
    }

    const { body, turns } = adaptiveBody();
    const controller = beginRequest();
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
      setAdaptiveTurns(turns);
      setAdaptiveAnswer("");
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

    const { body, turns } = adaptiveBody();

    if (body.transcript.length === 0) {
      setAdaptiveError("先回答一题，再生成活动画像。");
      return;
    }
    const controller = beginRequest();
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
      setAdaptiveTurns(turns);
      setAdaptiveAnswer("");
      setPersona(eventRegistrationPersonaToView(result.data));
    } else {
      setAdaptiveError(result.success ? "暂时无法生成活动画像，请重试。" : result.error.message);
    }

    finishRequest(controller);
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
    if (result.success && result.status >= 200 && result.status < 300 && receiptMatches) {
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
    if (result.success && result.status >= 200 && result.status < 300 && receiptMatches) {
      setFeedback(action === "withdraw" ? "已撤回申请。" : "已取消报名。");
      eventState.refresh();
      registrationState.refresh();
    } else {
      setSubmitError(result.success ? "未能确认取消结果，答案已保留。请刷新后核对报名状态。" : result.error.message);
    }

    finishRequest(controller);
  }

  return (
    <AppScreen
      eyebrow="活动报名"
      refreshControl={
        <RefreshControl
          onRefresh={refresh}
          refreshing={eventState.refreshing || registrationState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="报名资料"
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
          adaptiveAnswer={adaptiveAnswer}
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
          onCancel={cancelRegistration}
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
          <Text style={styles.secondaryButtonText}>返回活动</Text>
        </Pressable>
      </DataCard>
      <DataCard variant="inset" detail="标记为必答的问题需要回答，其余问题可以跳过" title="参与资料">
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
            {pendingAction === "register" ? "保存中" : registration.confirmLabel}
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
        disabled={pendingAction !== null || questionsChanged || !readConfirmed}
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
  return (
    <DataCard variant="inset" detail={statusText} title="活动画像">
      <Text style={styles.bodyText}>
        用几轮问答，把你在这场活动里的介绍写清楚。
      </Text>
      {question ? (
        <View style={styles.adaptiveQuestionBlock}>
          {question.acknowledgment ? (
            <Text style={styles.feedbackText}>{question.acknowledgment}</Text>
          ) : null}
          <RegistrationQuestion
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
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {persona ? <PersonaPreview persona={persona} /> : null}
      <View style={styles.adaptiveActionsRow}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || pending !== null}
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
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionText}>{question.prompt}</Text>
      <Text style={styles.evidenceText}>{question.required ? "必答" : "可选"}</Text>
      {question.options.length > 0 ? (
        <View style={styles.optionsRow}>
          {question.options.map((option) => (
            <Pressable
              accessibilityRole="button"
              key={option}
              onPress={() => onChange(option)}
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
        </View>
      ) : null}
      <TextInput
        multiline
        onChangeText={onChange}
        placeholder="写一句具体的补充。"
        placeholderTextColor={colors.text4}
        style={styles.answerInput}
        textAlignVertical="top"
        value={answer}
      />
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
