import * as Crypto from "expo-crypto";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlanGoalKind } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KINDS } from "../../api/compute/plan-templates";
import { firstProfileGoalForPlan } from "../../api/compute/profile-onboarding-goal";
import { readAppGuideEntry, type AppGuideProgress } from "../../api/guide-progress";
import { resumeOrCreateAppOnboardingIntake } from "../../api/onboarding-plan-intake";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, RetryCard, Skeleton, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createPlanApi } from "../plan/plan-api";
import { goalKindLabel } from "../plan/plan-model";

export function StartGuideScreen() {
  const { styles, colors } = useStyles();
  const { language, t } = useOrbitLocale();
  const c = {
    title: t("guide.title"), subtitle: t("guide.subtitle"), contacts: t("guide.contacts"), goal: t("guide.goal"),
    plan: t("guide.plan"), add: t("guide.add"), edit: t("guide.edit"), make: t("guide.make"),
    failed: t("guide.failed"), choose: t("guide.choose"), missing: t("guide.missing"), href: t("guide.href"),
    saved: t("guide.saved"), done: t("guide.done"), locked: t("guide.locked"), back: t("guide.back"),
    helpContacts: t("guide.helpContacts"), helpGoal: t("guide.helpGoal"), helpPlan: t("guide.helpPlan"),
  };
  const client = useOrbitApiClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const api = createPlanApi(client, language);
  const [guide, setGuide] = useState<AppGuideProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [kind, setKind] = useState<PlanGoalKind | null>(null);
  const keyRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setGuide(null);
    const result = await readAppGuideEntry(client);
    if (result.kind === "onboarding") {
      router.replace("/profile/onboarding?next=%2Fstart" as Href);
      return;
    }
    if (result.kind === "ready") {
      setGuide(result.guide);
      const first = firstProfileGoalForPlan(result.guide.relationshipGoal);
      setGoalText(first.text);
      setKind(null);
      setError("");
    } else setError(c.failed);
    setLoading(false);
  }, [client, c.failed, router]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function openPlan() {
    if (!guide || !kind || !goalText.trim() || working) { setError(c.missing); return; }
    setWorking(true);
    setError("");
    try {
      keyRef.current ??= `ios:guide-plan:${Crypto.randomUUID()}`;
      const result = await resumeOrCreateAppOnboardingIntake(api, { goalText, goalKind: kind, idempotencyKey: keyRef.current });
      if (!result.ok) { setError(result.kind === "contract" ? c.href : c.failed); return; }
      router.push(result.href as Href);
    } finally {
      setWorking(false);
    }
  }

  const nextStep = !guide?.flags.contacts ? "contacts" : !guide.flags.goal ? "goal" : !guide.flags.plan ? "plan" : null;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
    <AppScreen inset="kit" title={c.title} onBack={() => router.replace("/home" as Href)}>
      {loading ? <Skeleton lines={4} /> : !guide ? <RetryCard title={c.failed} onRetry={() => void reload()} /> : (
        <View testID="app-start-guide" style={styles.stack}>
          <UiText style={styles.meta}>{c.subtitle} · {guide.completed} / 3</UiText>
          <UiText style={styles.headline}>{c.subtitle}</UiText>
          <UiText style={styles.hint}>{nextStep === "contacts" ? c.helpContacts : nextStep === "goal" ? c.helpGoal : nextStep === "plan" ? c.helpPlan : c.done}</UiText>
          <Card style={styles.guideCard}>
            <GuideRow index={1} title={c.contacts} status={guide.flags.contacts ? c.done : `${guide.snapshot.confirmedContacts} / 3`} styles={styles} />
            <GuideRow index={2} title={c.goal} status={guide.flags.goal ? c.done : !guide.flags.contacts ? c.locked : c.edit} styles={styles} />
            <GuideRow index={3} title={c.plan} status={guide.flags.plan ? c.done : !guide.flags.contacts || !guide.flags.goal ? c.locked : c.make} styles={styles} />
          </Card>
          {nextStep === "plan" ? <Card>
            <UiText style={styles.stepTitle}>{c.saved}</UiText>
            {guide.flags.contacts && guide.flags.goal && !guide.flags.plan ? (
              <View style={styles.planForm}>
                <TextInput accessibilityLabel={c.saved} multiline onChangeText={(value) => { setGoalText(value); keyRef.current = null; }} style={[styles.input, { color: colors.ink }]} value={goalText} />
                <UiText style={styles.hint}>{c.choose}</UiText>
                <View style={styles.kinds}>
                  {PLAN_GOAL_KINDS.map((value) => <Button key={value} label={goalKindLabel(value, language) ?? value} variant={kind === value ? "primary" : "secondary"} onPress={() => { setKind(value); keyRef.current = null; }} />)}
                </View>
              </View>
            ) : null}
          </Card> : null}
          {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
        </View>
      )}
    </AppScreen>
    {guide && nextStep ? <View style={[styles.footer, { backgroundColor: colors.bg, paddingBottom: Math.max(12, insets.bottom) }]}>
      <Button block size="lg" variant="primary" disabled={working || (nextStep === "plan" && (!kind || !goalText.trim()))} label={nextStep === "contacts" ? c.add : nextStep === "goal" ? c.edit : c.make}
        loading={working} onPress={() => {
          if (nextStep === "contacts") router.push("/contacts/new/scan" as Href);
          else if (nextStep === "goal") router.push("/profile/onboarding?next=%2Fstart" as Href);
          else void openPlan();
        }} />
    </View> : null}
    </View>
  );
}

function GuideRow({ index, title, status, styles }: {
  index: number; title: string; status: string; styles: ReturnType<typeof useStyles>["styles"];
}) {
  return <View style={styles.row}>
    <UiText style={styles.rowTitle}>{index} {title}</UiText><UiText style={styles.rowStatus}>{status}</UiText>
  </View>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { flex: 1 },
  stack: { gap: 12, paddingBottom: 96 },
  meta: { color: colors.ink3Text, fontSize: 12 },
  headline: { color: colors.ink, fontSize: 25, fontWeight: "800", marginTop: 6 },
  guideCard: { gap: 0 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  rowStatus: { color: colors.ink3Text, fontSize: 12 },
  stepTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  hint: { color: colors.ink2, fontSize: 12 },
  planForm: { gap: 12, marginTop: 16 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, minHeight: 54 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: { paddingHorizontal: 18, paddingTop: 12 },
  error: { color: colors.coralText, fontSize: 13 },
}));
