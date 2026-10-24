// 今日の 1問 (b9 A7 Task › To-do · 判断待ちの 1問; DESIGN §2.8): who, the question, the options as
// chips, the hint and スキップ. Rule-based on the server (no AI), one a day. 「答えると ●●○ に」 only
// when answering really lifts the person to ●●○ (`densityIfAnswered`), otherwise 「情報が 1つ増えます」.
// 「自分で入力」 opens a field. TodayQuestionCard = the live card R20 (To-do) / R11 / R10 mount.
import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { COMPLETION_OPTION_LABELS } from "../../api/compute/completion-question-rules";
import type { ContactCompletionQuestion } from "../../api/contract/contact-completion";
import { contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../api/schema/contact-completion";
import { Avatar, FilterOption, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { DensityDots } from "./add-ui";
import { newImportKey } from "./import/import-api";

type MessageKey = Parameters<ReturnType<typeof useOrbitLocale>["t"]>[0];

const FIXED: Record<string, MessageKey> = {
  [COMPLETION_OPTION_LABELS.intro]: "add.completion.optionReferral",
  [COMPLETION_OPTION_LABELS.formerColleague]: "add.completion.optionFormerColleague",
  [COMPLETION_OPTION_LABELS.forgot]: "add.completion.optionUnknown",
};
const TYPE_IN: string = COMPLETION_OPTION_LABELS.typeIn;

export function CompletionQuestionCard({ question, busy = false, onAnswer, onSkip }: { question: ContactCompletionQuestion; busy?: boolean; onAnswer: (answer: string) => void; onSkip: () => void }) {
  const { t } = useOrbitLocale();
  const { colors, styles } = useStyles();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const name = question.contactName ?? "";
  const title = name ? t(question.kind === "organization" ? "add.completion.questionCompany" : "add.completion.questionMetWhere", { name }) : question.question;
  // LinkedIn is the same word in every language (brand), so it is not copy.
  const source = question.sourceChip === "linkedin" ? "LinkedIn" : question.sourceChip === "phone" ? t("add.import.sourceContacts") : "";
  const sub = [question.contactSubtitle, source].filter(Boolean).join(" · ");
  // The server only asks about people at ●○○, so any densityIfAnswered above 1 is a real step up.
  const after = question.densityIfAnswered ?? 1;
  return (
    <View style={styles.card} testID={`completion-question-${question.id}`}>
      <View style={styles.head}>
        {name ? <Avatar name={name} size="sm" /> : null}
        <View style={styles.grow}>
          <UiText style={styles.title}>{title}</UiText>
          {sub ? <UiText numberOfLines={1} style={styles.lbl}>{sub}</UiText> : null}
        </View>
        <DensityDots level={1} />
      </View>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={title}>
        {question.options.map((option) => (
          option === TYPE_IN
            ? <FilterOption key={option} label={t("add.completion.typeIn")} selected={typing} onToggle={() => setTyping((value) => !value)} />
            : <FilterOption key={option} label={FIXED[option] ? t(FIXED[option]!) : option} selected={false} onToggle={() => { if (!busy) onAnswer(option); }} />
        ))}
      </View>
      {typing ? (
        <View style={styles.typeIn}>
          <TextInput accessibilityLabel={t("add.completion.typeInLabel")} placeholder={t("add.completion.typeInLabel")} placeholderTextColor={colors.ink3} value={text} onChangeText={setText}
            style={styles.input} returnKeyType="done" onSubmitEditing={() => { if (text.trim() && !busy) onAnswer(text.trim()); }} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("add.completion.save")} disabled={!text.trim() || busy} onPress={() => onAnswer(text.trim())} style={[styles.save, (!text.trim() || busy) && styles.off]}>
            <UiText style={styles.saveText}>{t("add.completion.save")}</UiText>
          </UiPressable>
        </View>
      ) : null}
      <View style={styles.foot}>
        <UiText style={styles.lbl}>{`${t("add.completion.cardLabel")} · ${t(after === 3 ? "add.completion.hint3" : after === 2 ? "add.completion.hint" : "add.completion.hintSame")}`}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("add.completion.skip")} disabled={busy} onPress={onSkip} hitSlop={8} testID="completion-skip">
          <UiText style={[styles.lbl, styles.skip]}>{t("add.completion.skip")}</UiText>
        </UiPressable>
      </View>
    </View>
  );
}

/** Reads today's question, answers or skips it, then hides for the day; nothing while loading, without a question, or when not live (503). */
const COMPLETION_QUESTION_FRESH_MS = 10 * 60_000;

export function TodayQuestionCard({ onSettled }: { onSettled?: () => void } = {}) {
  const { t } = useOrbitLocale();
  const client = useOrbitApiClient();
  const toast = useToast();
  const [settledId, setSettledId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per question and action: a retry after a timeout replays the same request (idempotent).
  const keys = useRef<Record<string, string>>({});
  // LF1: today's question is kept as a page copy and re-read only after its fresh window or a write
  // (an answer or skip is a write, so the next open asks the server for the next question).
  const state = usePageCopyResource<unknown>("/api/contacts/completion-question", (value) => !value, {
    copy: { id: "completion-question" }, freshForMs: COMPLETION_QUESTION_FRESH_MS,
    accept: (value) => value === null || contactCompletionQuestionSchema.safeParse(value).success,
  });
  const parsed = state.kind === "success" ? contactCompletionQuestionSchema.safeParse(state.data) : null;
  const question: ContactCompletionQuestion | null = parsed?.success && parsed.data.id !== settledId && !state.copy?.offline ? parsed.data : null;
  if (!question) return null;
  const settle = async (path: string, body: Record<string, string>, message: string) => {
    setBusy(true);
    const slot = `${path}:${body.answer ?? ""}`;
    const result = await client.post<unknown>(path, { body: { ...body, idempotencyKey: (keys.current[slot] ??= newImportKey()) } }).catch(() => null);
    setBusy(false);
    if (!result?.success || !contactCompletionResultSchema.safeParse(result.data).success) { toast.error(t("add.completion.failed")); return; }
    toast.success(message);
    setSettledId(question.id);
    onSettled?.();
  };
  const base = `/api/contacts/completion-question/${encodeURIComponent(question.id)}`;
  return (
    <CompletionQuestionCard question={question} busy={busy}
      onAnswer={(answer) => void settle(`${base}/answer`, { answer }, t("add.completion.answered", { name: question.contactName ?? "" }))}
      onSkip={() => void settle(`${base}/skip`, {}, t("add.completion.skipped"))} />
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface2, borderRadius: 24, padding: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  skip: { fontWeight: "700" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  typeIn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  input: { flex: 1, height: 40, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface, color: colors.ink, fontSize: 15 },
  save: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  saveText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
  off: { opacity: 0.4 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 },
}));
