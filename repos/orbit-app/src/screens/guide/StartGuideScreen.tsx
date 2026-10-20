import * as Crypto from "expo-crypto";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

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
  zh: { title: "开始使用 Orbit", subtitle: "先完成这三步", contacts: "确认 3 位联系人", goal: "写下当前目标", plan: "制定第一份计划", add: "添加名片", edit: "填写目标", make: "继续制定计划", failed: "进度暂时无法读取", choose: "确认计划类型", missing: "请选择计划类型", href: "计划入口暂时无法打开，请重试", saved: "当前目标", done: "已完成", locked: "先完成上一步", back: "返回首页" },
  en: { title: "Get started with Orbit", subtitle: "Three steps to begin", contacts: "Confirm 3 contacts", goal: "Set your current goal", plan: "Make your first plan", add: "Add a card", edit: "Set a goal", make: "Continue to plan", failed: "Could not load your progress", choose: "Choose a plan type", missing: "Choose a plan type", href: "Could not open the plan. Retry.", saved: "Current goal", done: "Done", locked: "Finish the previous step first", back: "Back to home" },
  ja: { title: "Orbit を始める", subtitle: "はじめの 3 ステップ", contacts: "連絡先を 3 人確認", goal: "今の目標を決める", plan: "最初のプランを作る", add: "名刺を追加", edit: "目標を書く", make: "プランを作る", failed: "進捗を読み込めませんでした", choose: "プランの種類を確認", missing: "プランの種類を選んでください", href: "プランを開けませんでした。もう一度お試しください", saved: "保存済みの目標", done: "完了", locked: "前のステップを先に完了", back: "ホームに戻る" },
} as const;

export function StartGuideScreen() {
  const { styles, colors } = useStyles();
  const { language } = useOrbitLocale();
  const c = copy[language];
  const client = useOrbitApiClient();
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
      setKind(first.suggestedKind);
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

  return (
    <AppScreen inset="kit" title={c.title} subtitle={c.subtitle} onBack={() => router.replace("/home" as Href)}>
      {loading ? <Skeleton lines={4} /> : !guide ? <RetryCard title={c.failed} onRetry={() => void reload()} /> : (
        <View testID="app-start-guide" style={styles.stack}>
          <UiText style={styles.progress}>{guide.completed} / 3</UiText>
          <Step title={c.contacts} done={guide.flags.contacts} locked={false} action={c.add} onPress={() => router.push("/contacts/new/scan" as Href)} styles={styles} copy={c} />
          <Step title={c.goal} done={guide.flags.goal} locked={!guide.flags.contacts} action={c.edit} onPress={() => router.push("/profile/onboarding?next=%2Fstart" as Href)} styles={styles} copy={c} />
          <Card>
            <UiText style={styles.stepTitle}>{c.plan}</UiText>
            <UiText style={styles.hint}>{guide.flags.plan ? c.done : !guide.flags.contacts || !guide.flags.goal ? c.locked : c.saved}</UiText>
            {guide.flags.contacts && guide.flags.goal && !guide.flags.plan ? (
              <View style={styles.planForm}>
                <TextInput accessibilityLabel={c.saved} multiline onChangeText={(value) => { setGoalText(value); keyRef.current = null; }} style={[styles.input, { color: colors.ink }]} value={goalText} />
                <UiText style={styles.hint}>{c.choose}</UiText>
                <View style={styles.kinds}>
                  {PLAN_GOAL_KINDS.map((value) => <Button key={value} label={goalKindLabel(value, language) ?? value} variant={kind === value ? "primary" : "secondary"} onPress={() => { setKind(value); keyRef.current = null; }} />)}
                </View>
                <Button block disabled={!kind || !goalText.trim() || working} label={c.make} loading={working} onPress={() => void openPlan()} />
              </View>
            ) : null}
          </Card>
          {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
          <Button label={c.back} variant="secondary" onPress={() => router.replace("/home" as Href)} />
        </View>
      )}
    </AppScreen>
  );
}

function Step({ title, done, locked, action, onPress, styles, copy: c }: {
  title: string; done: boolean; locked: boolean; action: string; onPress: () => void;
  styles: ReturnType<typeof useStyles>["styles"]; copy: typeof copy.ja | typeof copy.en | typeof copy.zh;
}) {
  return <Card><View style={styles.step}>
    <View style={styles.stepText}><UiText style={styles.stepTitle}>{title}</UiText><UiText style={styles.hint}>{done ? c.done : locked ? c.locked : ""}</UiText></View>
    {!done && !locked ? <Button label={action} onPress={onPress} /> : null}
  </View></Card>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  stack: { gap: 12 },
  progress: { color: colors.ink, fontSize: 22, fontWeight: "800", marginBottom: 4 },
  step: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepText: { flex: 1, gap: 4 },
  stepTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  hint: { color: colors.ink2, fontSize: 12 },
  planForm: { gap: 12, marginTop: 16 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, minHeight: 54 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { color: colors.coralText, fontSize: 13 },
}));
