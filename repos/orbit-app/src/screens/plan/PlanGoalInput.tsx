// R23 ① 目標入力 (Task › プラン with no v2 plan). One sentence, kept as written; six
// goal-type chips whose default comes from POST …/goal-kind (after an 800 ms pause and
// at least 6 characters, never twice for the same text, never over a chip the user
// picked); 「iOrbit と具体化する」 creates the intake and opens the flow page. The
// faded sample card below is static: it sends nothing and stores nothing.
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanIntakeListResponse } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { guessGoalKindByKeywords, PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { Button, SampleTag, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { GOAL_KIND_DEBOUNCE_MS, GOAL_KIND_MIN_LENGTH, newIdempotencyKey } from "./plan-model";
import { ChoiceChip, InlineProblem, isLimitFailure, LimitNote, useFailureText, usePlanStyles } from "./plan-ui";

export function PlanGoalInput({ intakes }: { intakes: PlanIntakeListResponse }) {
  const { styles, colors } = useStyles();
  const shared = usePlanStyles().styles;
  const { t, language } = useOrbitLocale();
  const api = usePlanApi();
  const router = useRouter();
  const failureText = useFailureText();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PlanGoalKind | null>(null);
  const [picked, setPicked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const asked = useRef<string | null>(null);
  const latest = useRef({ picked, text });
  latest.current = { picked, text };
  // One key per attempt of the same goal; a network retry of it reuses the key.
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (picked) return;
    const trimmed = text.trim();
    if ([...trimmed].length < GOAL_KIND_MIN_LENGTH || asked.current === trimmed) return;
    const timer = setTimeout(() => {
      asked.current = trimmed;
      void api.goalKind(trimmed).then((result) => {
        if (result.ok && !latest.current.picked && latest.current.text.trim() === trimmed) setKind(result.data.goalKind);
      });
    }, GOAL_KIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, picked, text]);

  const monthlyOut = intakes.newGoalsLeftThisMonth <= 0;
  const activeOut = intakes.activeGoals >= intakes.activeGoalLimit;
  const blocked = monthlyOut || activeOut;
  const resume = intakes.intakes[0] ?? null;

  const create = async () => {
    const goalText = text.trim();
    if (!goalText || blocked || creating) return;
    const goalKind = kind ?? guessGoalKindByKeywords(goalText);
    const fingerprint = JSON.stringify([goalText, goalKind]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey("intake") };
    setCreating(true);
    setFailure(null);
    const result = await api.createIntake({ goalKind, goalText, idempotencyKey: attempt.current.key, source: "task" });
    setCreating(false);
    if (result.ok) {
      attempt.current = null;
      router.push(result.data.href as Href);
      return;
    }
    if (result.failure.kind !== "network") attempt.current = null;
    setFailure(result.failure);
  };

  return (
    <View style={styles.page}>
      {resume ? (
        <View style={[shared.softCard, shared.row]}>
          <UiText numberOfLines={2} style={[shared.body2, shared.grow]}>{t("plan.goal.resume", { goal: resume.goal })}</UiText>
          <Button label={t("plan.goal.resumeAction")} onPress={() => router.push(resume.href as Href)} size="sm" variant="secondary" />
        </View>
      ) : null}
      <View style={shared.card}>
        <UiText accessibilityRole="header" style={shared.heading}>{t("plan.goal.title")}</UiText>
        <UiText style={shared.body2}>{t("plan.goal.body")}</UiText>
        <TextInput
          accessibilityLabel={t("plan.goal.inputLabel")}
          editable={!creating}
          multiline
          onChangeText={setText}
          placeholder={t("plan.goal.placeholder")}
          placeholderTextColor={colors.ink3Text}
          style={[shared.input, shared.inputMultiline]}
          value={text}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.goal.kindLabel")} style={shared.wrap}>
          {PLAN_GOAL_KINDS.map((item) => (
            <ChoiceChip
              key={item}
              label={`${PLAN_GOAL_TEMPLATES[item].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[item], language)}`}
              selected={kind === item}
              onPress={() => { setKind(item); setPicked(true); }}
            />
          ))}
        </View>
        {monthlyOut ? <LimitNote failure={{ kind: "goalMonthlyLimit" }} /> : activeOut ? <LimitNote failure={{ kind: "goalLimit" }} /> : null}
        <Button block disabled={blocked || !text.trim()} label={t("plan.goal.start")} loading={creating} onPress={() => void create()} variant="primary" />
        {failure ? isLimitFailure(failure) ? <LimitNote failure={failure} /> : <InlineProblem text={failureText(failure)} /> : null}
        <View style={styles.preview}>
          <UiText style={shared.caption}>{t("plan.goal.previewFirst")}</UiText>
          <UiText style={shared.caption}>{t("plan.goal.previewSecond")}</UiText>
        </View>
      </View>
      <SampleTypeCard />
    </View>
  );
}

/** The faded 「サンプル」 person-type card: static text only (no request, nothing stored). */
function SampleTypeCard() {
  const { styles } = useStyles();
  const shared = usePlanStyles().styles;
  const { t, language } = useOrbitLocale();
  const shortLabel = planCopy(PLAN_SHORT_NAME_COPY["first_payer@community_nonprofit"]!, language);
  const cells = [
    { label: t("plan.sample.candidates"), value: "2" },
    { label: t("plan.sample.events"), value: "1" },
    { label: t("plan.sample.routes"), value: "0" },
  ];
  return (
    <View accessibilityLabel={t("plan.sample.title")} style={[shared.card, styles.sample]}>
      <View style={shared.row}>
        <UiText style={[shared.title, shared.grow]}>{t("plan.sample.title")}</UiText>
        <SampleTag />
      </View>
      <View style={shared.rowTop}>
        <UiText style={shared.emoji}>🎪</UiText>
        <View style={shared.grow}>
          <UiText style={shared.title}>{t("plan.sample.type", { label: shortLabel })}</UiText>
          <UiText style={shared.body2}>{t("plan.sample.roleSituation")}</UiText>
        </View>
      </View>
      <View style={styles.cells}>
        {cells.map((cell) => (
          <View key={cell.label} style={styles.cell}>
            <UiText style={styles.cellValue}>{cell.value}</UiText>
            <UiText style={shared.caption}>{cell.label}</UiText>
          </View>
        ))}
      </View>
      <UiText style={shared.caption}>{t("plan.sample.note")}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { gap: 14 },
  preview: { gap: 2, alignItems: "center" },
  sample: { opacity: 0.72 },
  cells: { flexDirection: "row", gap: 8 },
  cell: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, paddingVertical: 10, alignItems: "center", gap: 2 },
  cellValue: { color: colors.ink, fontSize: 16, fontWeight: "800" },
}));
