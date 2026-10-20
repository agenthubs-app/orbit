import * as Crypto from "expo-crypto";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PlanGoalKind } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KINDS } from "../../api/compute/plan-templates";
import { firstProfileGoalForPlan } from "../../api/compute/profile-onboarding-goal";
import { readAppGuideProgress, type AppGuideProgress } from "../../api/guide-progress";
import { resumeOrCreateAppOnboardingIntake } from "../../api/onboarding-plan-intake";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, RetryCard, Skeleton, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { createPlanApi } from "../plan/plan-api";
import { goalKindLabel } from "../plan/plan-model";

const copy = {
  zh: { title: "开始使用 Orbit", subtitle: "距离第一份计划只差几步", contacts: "确认 3 位联系人", goal: "写下当前目标", plan: "制定第一份计划", add: "添加名片", edit: "填写目标", make: "继续制定计划", failed: "进度暂时无法读取", choose: "确认计划类型", missing: "请选择计划类型", href: "计划入口暂时无法打开，请重试", saved: "当前目标", done: "已完成", locked: "先完成上一步", back: "返回首页", helpContacts: "先确认 3 位联系人。", helpGoal: "写下你现在最想推进的目标。", helpPlan: "确认目标和计划类型后继续。" },
  en: { title: "Get started with Orbit", subtitle: "A few steps to your first plan", contacts: "Confirm 3 contacts", goal: "Set your current goal", plan: "Make your first plan", add: "Add a card", edit: "Set a goal", make: "Continue to plan", failed: "Could not load your progress", choose: "Choose a plan type", missing: "Choose a plan type", href: "Could not open the plan. Retry.", saved: "Current goal", done: "Done", locked: "Finish the previous step first", back: "Back to home", helpContacts: "Start by confirming 3 contacts.", helpGoal: "Set the goal you want to work on now.", helpPlan: "Confirm your goal and plan type to continue." },
  ja: { title: "はじめのガイド", subtitle: "最初のプランまで、あと少し", contacts: "人脈をつくる", goal: "目標を決める", plan: "プランをつくる", add: "人脈を追加する", edit: "目標を書く", make: "プランを作る", failed: "進捗を読み込めませんでした", choose: "プランの種類を確認", missing: "プランの種類を選んでください", href: "プランを開けませんでした。もう一度お試しください", saved: "保存済みの目標", done: "完了", locked: "前のステップを先に完了", back: "ホームに戻る", helpContacts: "まずは人脈を 3 人確認しましょう。", helpGoal: "今の目標を決めましょう。", helpPlan: "目標に合うプランを選びましょう。" },
} as const;

export function StartGuideScreen() {
  const { styles, colors } = useStyles();
  const { language } = useOrbitLocale();
  const c = copy[language];
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
    const result = await readAppGuideProgress(client);
    if (result.ok) {
      setGuide(result.data);
      const first = firstProfileGoalForPlan(result.data.relationshipGoal);
      setGoalText(first.text);
      setKind(null);
      setError("");
    } else setError(c.failed);
    setLoading(false);
  }, [client, c.failed]);
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
