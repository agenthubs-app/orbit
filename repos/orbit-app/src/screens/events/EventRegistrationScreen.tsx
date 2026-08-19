import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  eventDetailPath,
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
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  buildEventRegistrationAdaptiveBody,
  buildEventRegistrationAnswers,
  eventRegistrationAdaptiveStepToView,
  eventRegistrationPersonaToView,
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
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const router = useRouter();
  const client = useOrbitApiClient();
  const eventState = useApiResource<unknown>(eventDetailPath(eventId), () => false);
  const registrationState = useApiResource<unknown>(
    `${eventRegistrationPath(eventId)}?language=zh`,
    () => false
  );
  const registrationView =
    registrationState.kind === "success" || registrationState.kind === "empty"
      ? eventRegistrationToView(registrationState.data)
      : null;
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

  useEffect(() => {
    setAnswers(answersFromView(registrationView));
    setAdaptiveAnswer("");
    setAdaptiveError(null);
    setAdaptiveQuestion(null);
    setAdaptiveStatusText("继续补充画像");
    setAdaptiveTurns([]);
    setPersona(null);
  }, [registrationData]);

  function refresh() {
    eventState.refresh();
    registrationState.refresh();
  }

  function setAnswer(question: EventRegistrationQuestionView, value: string) {
    setAnswers((current) => ({
      ...current,
      [question.field]: value
    }));
  }

  function adaptiveBody() {
    const nextTurns =
      adaptiveQuestion && adaptiveAnswer.trim()
        ? [
            ...adaptiveTurns,
            {
              answer: adaptiveAnswer,
              field: adaptiveQuestion.field,
              prompt: adaptiveQuestion.prompt
            }
          ]
        : adaptiveTurns;

    return buildEventRegistrationAdaptiveBody(
      registrationView?.questions ?? [],
      answers,
      nextTurns
    );
  }

  async function requestAdaptiveQuestion() {
    if (!registrationView) {
      return;
    }

    const body = adaptiveBody();

    setAdaptivePending("interview");
    setAdaptiveError(null);

    const result = await client.post<unknown>(
      eventRegistrationInterviewPath(eventId),
      { body }
    );

    if (result.success) {
      const nextStep = eventRegistrationAdaptiveStepToView(result.data);
      setAdaptiveTurns(body.transcript);
      setAdaptiveAnswer("");
      setAdaptiveQuestion(nextStep.question);
      setAdaptiveStatusText(nextStep.statusText);
    } else {
      setAdaptiveError(result.error.message);
    }

    setAdaptivePending(null);
  }

  async function generateAdaptivePersona() {
    if (!registrationView) {
      return;
    }

    const body = adaptiveBody();

    if (body.transcript.length === 0) {
      setAdaptiveError("先回答一题，再生成活动画像。");
      return;
    }

    setAdaptivePending("persona");
    setAdaptiveError(null);

    const result = await client.post<unknown>(
      eventRegistrationPersonaPath(eventId),
      { body }
    );

    if (result.success) {
      setAdaptiveTurns(body.transcript);
      setAdaptiveAnswer("");
      setPersona(eventRegistrationPersonaToView(result.data));
    } else {
      setAdaptiveError(result.error.message);
    }

    setAdaptivePending(null);
  }

  async function submitRegistration() {
    if (!registrationView) {
      return;
    }

    setPendingAction("register");
    setSubmitError(null);
    setFeedback(null);

    const result = await client.post<unknown>(eventRegistrationPath(eventId), {
      body: {
        answers: buildEventRegistrationAnswers(registrationView.questions, answers),
        ...(registrationView.questionSetHash &&
        registrationView.questionSetVersion !== null
          ? {
              questionSetHash: registrationView.questionSetHash,
              questionSetVersion: registrationView.questionSetVersion
            }
          : {})
      }
    });

    if (result.success) {
      setFeedback("报名资料已保存。");
      registrationState.refresh();
    } else {
      setSubmitError(result.error.message);
    }

    setPendingAction(null);
  }

  async function cancelRegistration() {
    setPendingAction("cancel");
    setSubmitError(null);
    setFeedback(null);

    const result = await client.post<unknown>(eventRegistrationCancelPath(eventId));

    if (result.success) {
      setFeedback("已取消报名。");
      registrationState.refresh();
    } else {
      setSubmitError(result.error.message);
    }

    setPendingAction(null);
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
      {event && registrationView ? (
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
          onAdaptiveAnswerChange={setAdaptiveAnswer}
          onBack={() =>
            router.push({
              params: { id: eventId },
              pathname: "/events/[id]"
            })
          }
          onCancel={cancelRegistration}
          onGenerateAdaptivePersona={generateAdaptivePersona}
          onRequestAdaptiveQuestion={requestAdaptiveQuestion}
          onSetAnswer={setAnswer}
          onSubmit={submitRegistration}
          pendingAction={pendingAction}
          persona={persona}
          registration={registrationView}
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
  onSetAnswer,
  onSubmit,
  pendingAction,
  persona,
  registration,
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
  onSetAnswer: (question: EventRegistrationQuestionView, value: string) => void;
  onSubmit: () => void;
  pendingAction: "cancel" | "register" | null;
  persona: EventRegistrationPersonaView | null;
  registration: EventRegistrationView;
  submitError: string | null;
}) {
  return (
    <>
      <DataCard detail={registration.statusDetail} title={eventTitle}>
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
      <DataCard detail="标记为必答的问题需要回答，其余问题可以跳过" title="参与资料">
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
          disabled={pendingAction !== null}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            pendingAction ? styles.disabled : null,
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
            disabled={pendingAction !== null}
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              pendingAction ? styles.disabled : null,
              pressed ? styles.pressed : null
            ]}
          >
            <Ionicons color={colors.rose} name="close-outline" size={18} />
            <Text style={styles.cancelButtonText}>
              {pendingAction === "cancel" ? "取消中" : "取消报名"}
            </Text>
          </Pressable>
        ) : null}
      </DataCard>
      <AdaptiveRegistrationCard
        answer={adaptiveAnswer}
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
  error: string | null;
  onAnswerChange: (value: string) => void;
  onGeneratePersona: () => void;
  onRequestQuestion: () => void;
  pending: "interview" | "persona" | null;
  persona: EventRegistrationPersonaView | null;
  question: EventRegistrationAdaptiveQuestionView | null;
  statusText: string;
}) {
  return (
    <DataCard detail={statusText} title="活动画像">
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
          disabled={pending !== null}
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
          disabled={pending !== null}
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

const styles = StyleSheet.create({
  adaptiveActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  adaptiveQuestionBlock: {
    gap: spacing.sm
  },
  answerInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
    minHeight: 86,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  cancelButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.roseSoft,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  cancelButtonText: {
    color: colors.rose,
    fontSize: typography.small,
    fontWeight: "700"
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
    backgroundColor: colors.surface2,
    borderColor: colors.border2,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  optionPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  optionText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  optionTextActive: {
    color: colors.onAccent
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
    borderRadius: radius.md,
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
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "700"
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
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
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
});
