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
  buildEventRegistrationAnswers,
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"cancel" | "register" | null>(
    null
  );

  useEffect(() => {
    setAnswers(answersFromView(registrationView));
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

  async function submitRegistration() {
    if (!registrationView) {
      return;
    }

    setPendingAction("register");
    setSubmitError(null);
    setFeedback(null);

    const result = await client.post<unknown>(eventRegistrationPath(eventId), {
      body: {
        answers: buildEventRegistrationAnswers(registrationView.questions, answers)
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
          answers={answers}
          eventMeta={[event.startsAt, event.location].filter(Boolean).join(" · ")}
          eventTitle={event.title}
          feedback={feedback}
          onBack={() =>
            router.push({
              params: { id: eventId },
              pathname: "/events/[id]"
            })
          }
          onCancel={cancelRegistration}
          onSetAnswer={setAnswer}
          onSubmit={submitRegistration}
          pendingAction={pendingAction}
          registration={registrationView}
          submitError={submitError}
        />
      ) : null}
    </AppScreen>
  );
}

function RegistrationForm({
  answers,
  eventMeta,
  eventTitle,
  feedback,
  onBack,
  onCancel,
  onSetAnswer,
  onSubmit,
  pendingAction,
  registration,
  submitError
}: {
  answers: Record<string, string>;
  eventMeta: string;
  eventTitle: string;
  feedback: string | null;
  onBack: () => void;
  onCancel: () => void;
  onSetAnswer: (question: EventRegistrationQuestionView, value: string) => void;
  onSubmit: () => void;
  pendingAction: "cancel" | "register" | null;
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
      <DataCard detail="所有问题都可以跳过" title="参与资料">
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
    </>
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
