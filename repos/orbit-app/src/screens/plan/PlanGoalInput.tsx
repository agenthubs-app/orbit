// R23 ① 目標入力 (Task › プラン with no v2 plan). One sentence, kept as written; six
// goal-type chips whose default comes from POST …/goal-kind (after an 800 ms pause and
// at least 6 characters, never twice for the same text, never over a chip the user
// picked); 「iOrbit と具体化する」 creates the intake and opens the flow page. The
// faded sample card below is static: it sends nothing and stores nothing.
// 像素返工（RD-16）：照 b10 ①（#0）与 b12 A-R23-02a–c（画板 124 / 126 / 128）的 kit 源码搬——
// .guide 卡（右上 lav 光斑）、.fld 输入（46 高、聚焦 plum-500 边）、.fopt 选项、.btn.xl 主按钮、
// 作りかけ卡（.fm 五段进度）、上限卡（.card.flat ⏳）与「目標 2つ」列表、faded サンプル类型卡。
import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanGoalListItem, PlanIntakeListItem, PlanIntakeListResponse } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { guessGoalKindByKeywords, PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { planTaskSegmentHref } from "../../api/compute/plan-href";
import { openMainTab } from "../../components/shell-navigation";
import { Icon, UiPressable, UiText } from "../../components/ui";
import Svg, { Circle, Defs, RadialGradient, Stop } from "../../components/ui/svg";
import { faceFor } from "../../components/ui/Text";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { KitButton, KitEmo, KitStages, kitText, useKitStyles } from "./plan-kit";
import { goalKindLabel, GOAL_KIND_DEBOUNCE_MS, GOAL_KIND_MIN_LENGTH, newIdempotencyKey } from "./plan-model";
import { InlineProblem, isLimitFailure, LimitNote, useFailureText } from "./plan-ui";

export function PlanGoalInput({ intakes, goals = [] }: { intakes: PlanIntakeListResponse; goals?: readonly PlanGoalListItem[] }) {
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const api = usePlanApi();
  const router = useRouter();
  const failureText = useFailureText();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PlanGoalKind | null>(null);
  const [picked, setPicked] = useState(false);
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const input = useRef<TextInput>(null);
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
  const active = goals.filter((goal) => goal.status === "active");

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
      {resume ? <ResumeCard intake={resume} onOpen={() => router.push(resume.href as Href)} /> : null}
      <View style={[styles.guide, resume && styles.guideAfterResume]} testID="goal-input">
        <View pointerEvents="none" style={styles.glow}><Glow color={colors.macLav} /></View>
        <UiText accessibilityRole="header" style={styles.title}>{t("plan.goal.title")}</UiText>
        <UiText style={styles.sub}>{t("plan.goal.body")}</UiText>
        <View style={[styles.field, focused && styles.fieldFocus]}>
          <TextInput
            ref={input}
            accessibilityLabel={t("plan.goal.inputLabel")}
            editable={!creating}
            onBlur={() => setFocused(false)}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            accessibilityHint={t("plan.goal.placeholder")}
            returnKeyType="done"
            selectionColor={colors.plum700}
            // 输入框不经 UiText：日文 iOS 下占位文字会落到系统的窄 CJK 字形（比 kit 窄约 19pt、不出省略号），这里同 UiText 用 Hiragino。
            style={[styles.input, Platform.OS === "ios" && language === "ja" ? { fontFamily: faceFor("400") } : null]}
            value={text}
          />
          {/* 占位文字自己画：iOS 的 placeholder 放不下时直接裁掉，kit（Chrome）是单行省略号。 */}
          {text ? null : <UiText pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no" numberOfLines={1} style={styles.placeholder}>{t("plan.goal.placeholder")}</UiText>}
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.goal.kindLabel")} style={styles.kinds}>
          {PLAN_GOAL_KINDS.map((item) => {
            const on = kind === item;
            const name = planCopy(PLAN_GOAL_KIND_COPY[item], language);
            const label = `${PLAN_GOAL_TEMPLATES[item].emoji} ${name}`;
            return (
              <UiPressable key={item} accessibilityRole="radio" accessibilityLabel={label} aria-checked={on} accessibilityState={{ checked: on, selected: on }} hitSlop={5} onPress={() => { setKind(item); setPicked(true); }} style={[styles.fopt, on && styles.foptOn]}>
                {on ? <UiText style={styles.foptCheck}>✓</UiText> : null}
                <UiText style={[styles.foptText, on && styles.foptTextOn]}><UiText style={styles.foptEmoji}>{PLAN_GOAL_TEMPLATES[item].emoji}</UiText>{` ${name}`}</UiText>
              </UiPressable>
            );
          })}
        </View>
        {monthlyOut ? <LimitCard kind="monthly" /> : activeOut ? <LimitCard kind="active" goals={active} /> : null}
        {/* 空着也画成可按（b12 A-R23-02a）：按下把焦点给输入框，有字才建。 */}
        <KitButton xl primary icon="sparkle" label={t("plan.goal.start")} disabled={blocked || creating} onPress={() => (text.trim() ? void create() : input.current?.focus())} style={[styles.start, blocked && styles.startAfterLimit]} testID="goal-start" />
        {failure ? isLimitFailure(failure) ? <LimitNote failure={failure} /> : <InlineProblem text={failureText(failure)} /> : null}
        <UiText style={styles.steps}>{`${t("plan.goal.previewFirst")}\n${t("plan.goal.previewSecond")}`}</UiText>
      </View>
      <SampleTypeCard />
    </View>
  );
}

/** .guide::before — 220 圆、right −80 / top −90、radial-gradient(circle, mac-lav, transparent 70%)、opacity .9。 */
function Glow({ color }: { color: string }) {
  return (
    <Svg width={220} height={220}>
      <Defs>
        {/* CSS radial-gradient(circle) 默认半径到最远角（220 方块 → 155.6 = 70.71%），70% 处透明 ≈ 109，正好到圆边。 */}
        <RadialGradient id="goal-glow" cx="50%" cy="50%" r="70.71%">
          <Stop offset={0} stopColor={color} stopOpacity={1} />
          <Stop offset={0.7} stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={110} cy={110} r={110} fill="url(#goal-glow)" />
    </Svg>
  );
}

/** 作りかけのプラン（b12 A-R23-02a .k-resume）：🧭 · 目標 · 続ける ›，下面五段 .fm 与「質問まで · 10月10日」。 */
function ResumeCard({ intake, onOpen }: { intake: PlanIntakeListItem; onOpen: () => void }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const stage = intakeStage(intake.status);
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  const date = new Date(intake.updatedAt).toLocaleDateString(locale, { day: "numeric", month: "long" });
  return (
    <View style={styles.resume} testID="goal-resume">
      <View style={styles.row10}>
        <KitEmo emoji="🧭" tone="lav" sm />
        <View style={kit.grow}>
          <UiText style={kit.lbl}>{t("plan.goal.resumeTitle")}</UiText>
          <UiText numberOfLines={1} style={styles.resumeGoal}>{intake.goal}</UiText>
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.goal.resume", { goal: intake.goal })} hitSlop={6} onPress={onOpen} style={styles.resumeBtn}>
          <UiText style={styles.resumeBtnText}>{t("plan.goal.resumeAction")}</UiText>
          <Icon name="right" size={16} color={colors.bg} />
        </UiPressable>
      </View>
      <View style={[styles.row10, styles.resumeFoot]}>
        <KitStages stage={stage} style={styles.fm} />
        <UiText style={kit.lbl}>{t("plan.goal.resumeWhere", { date, stage: t(STAGE_KEYS[stage]) })}</UiText>
      </View>
    </View>
  );
}

const STAGE_KEYS = ["plan.stage.background", "plan.stage.questions", "plan.stage.draft", "plan.stage.fix", "plan.stage.manual"] as const;
/** The step an unfinished intake stopped at (背景 → 質問 → 初版 → AI 修正). */
function intakeStage(status: PlanIntakeListItem["status"]): 0 | 1 | 2 | 3 {
  if (status === "drafting" || status === "background") return 0;
  if (status === "questions" || status === "premise") return 1;
  return status === "drafted" ? 3 : 2;
}

/** 今月の上限 / 目標 2つ（b12 画板 126 / 128 .card.flat ⏳）：说明 + 何时恢复 / 现在的两个目标。 */
function LimitCard({ kind, goals = [] }: { kind: "monthly" | "active"; goals?: readonly PlanGoalListItem[] }) {
  const { styles, colors } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = Math.max(1, Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000));
  const locale = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
  return (
    <View style={styles.limitWrap} testID={kind === "monthly" ? "goal-limit-monthly" : "goal-limit-active"}>
      <View accessible style={styles.flat}>
        <View style={styles.row10}>
          <KitEmo emoji="⏳" tone="apricot" sm />
          <View style={kit.grow}>
            <UiText style={styles.limitTitle}>{t(kind === "monthly" ? "plan.limit.goalMonthly" : "plan.limit.goalActive")}</UiText>
            <UiText style={[kit.lbl, styles.limitNote]}>{kind === "monthly" ? t("plan.limit.goalMonthlyNote", { date: next.toLocaleDateString(locale, { day: "numeric", month: "long" }), days }) : t("plan.limit.goalActiveNote")}</UiText>
          </View>
        </View>
      </View>
      {kind === "active" && goals.length > 0 ? (
        <View style={[styles.flat, styles.goalList]}>
          {goals.map((goal, index) => (
            <UiPressable key={goal.planId} accessibilityRole="link" onPress={() => openMainTab(router, planTaskSegmentHref("app", goal.planId))} style={[styles.sumrow, index > 0 && styles.line]}>
              <View style={[styles.sumEmo, index % 2 === 1 && styles.sumEmoPink]}><UiText style={styles.sumEmoText}>{goalKindLabel(goal.goalKind, language)?.split(" ")[0] ?? "🎯"}</UiText></View>
              <View style={kit.grow}>
                <UiText numberOfLines={1} style={styles.sumTitle}>{goal.goal}</UiText>
                <UiText style={kit.lbl}>{t("plan.goal.activeLine", { talked: goal.talkedPeople, total: goal.total })}</UiText>
              </View>
              <Icon name="right" size={16} color={colors.ink} />
            </UiPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The faded 「サンプル」 person-type card (b10 ① .k-gsample): static text only (no request, nothing stored). */
function SampleTypeCard() {
  const { styles } = useStyles();
  const kit = useKitStyles().styles;
  const { t, language } = useOrbitLocale();
  const shortLabel = planCopy(PLAN_SHORT_NAME_COPY["first_payer@community_nonprofit"]!, language);
  const cells = [
    { label: t("plan.sample.candidates"), small: t("plan.type.cellPeople"), value: "2" },
    { label: t("plan.sample.events"), value: "2" },
    { label: t("plan.sample.routes"), value: "1" },
  ];
  return (
    <View accessibilityLabel={t("plan.sample.title")} style={styles.sampleCard}>
      <View style={styles.sampleHead}>
        <UiText accessibilityRole="header" style={kit.h3}>{t("plan.sample.title")}</UiText>
        <View style={styles.sampleTag}><UiText style={styles.sampleTagText}>{t("plan.sample.tag")}</UiText></View>
      </View>
      <View style={styles.faded}>
        <View style={styles.tcard}>
          <View style={styles.tcardHead}>
            <KitEmo emoji="🎪" tone="lav" sm />
            <View style={kit.grow}>
              <UiText style={styles.tk}>{t("plan.sample.kicker", { label: shortLabel })}</UiText>
              <UiText style={styles.tname}>{t("plan.sample.roleSituation")}</UiText>
            </View>
            <UiText style={styles.pp}>0<UiText style={styles.ppSmall}> / 20</UiText></UiText>
          </View>
          <View style={styles.m3}>
            {cells.map((cell) => (
              <View key={cell.label} style={styles.m3cell}>
                <UiText style={styles.m3b}>{cell.value}{cell.small ? <UiText style={styles.m3small}>{cell.small}</UiText> : null}</UiText>
                <UiText numberOfLines={1} style={styles.m3span}>{cell.label}</UiText>
              </View>
            ))}
          </View>
          <View style={styles.tfoot}>
            <UiText style={kit.lbl}>{t("plan.sample.pace")}</UiText>
            <View style={styles.mb} />
          </View>
        </View>
      </View>
      <UiText style={[kit.lbl, styles.sampleNote]}>{t("plan.sample.note")}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  // AppScreen 内容区多 spacing.md 12 的上边距、左右 16（kit .scroll 18）：先在页内抵消（同 PlanOverview）。
  page: { marginTop: -12, marginHorizontal: 2 },
  row10: { flexDirection: "row", alignItems: "center", gap: 10 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },

  guide: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, overflow: "hidden" },
  guideAfterResume: { marginTop: 12 },
  glow: { position: "absolute", right: -80, top: -90, width: 220, height: 220, opacity: 0.9 },
  title: { color: colors.ink, ...kitText(19, "800") },
  sub: { color: colors.ink2, ...kitText(12.5, "400"), marginTop: 4, marginBottom: 12 },
  field: { minHeight: 46, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: "transparent", justifyContent: "center", paddingHorizontal: 14 },
  fieldFocus: { borderColor: colors.plum500 },
  input: { color: colors.ink, fontSize: 14, lineHeight: 21, padding: 0, minHeight: 21 },
  placeholder: { position: "absolute", left: 14, right: 14, color: colors.ink4, fontSize: 14 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  // kit 实测 chip 高 34.8（padding 7 + 行盒 17.8），iOS 行盒 18.75 → 上下各 6.5。
  fopt: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6.5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  foptOn: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  foptCheck: { color: colors.plum700, ...kitText(12.5, "900") },
  foptText: { color: colors.ink2, ...kitText(12.5, "700") },
  foptTextOn: { color: colors.ink },
  // iOS 的 Apple Color Emoji 在 12.5 号比 kit（Chrome）画得大约 2pt、chip 宽 2.5pt，第二行 chip 逐个右移；按实测比例缩到 11。
  foptEmoji: { fontSize: 11 },
  start: { height: 50, marginTop: 14 },
  startAfterLimit: { marginTop: 10 },
  steps: { color: colors.ink3, ...kitText(11.5, "500", 1.6), textAlign: "center", marginTop: 8 },

  resume: { backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  resumeGoal: { color: colors.ink, ...kitText(13.5, "700") },
  resumeBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.ink },
  resumeBtnText: { color: colors.bg, ...kitText(12, "700") },
  resumeFoot: { marginTop: 10 },
  fm: { flex: 1, minWidth: 0 },

  limitWrap: { marginTop: 12 },
  flat: { backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  limitTitle: { color: colors.ink, ...kitText(13, "700") },
  limitNote: { marginTop: 2, lineHeight: 17.83 },
  goalList: { paddingVertical: 4, marginTop: 10 },
  sumrow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  sumEmo: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.macLav, alignItems: "center", justifyContent: "center" },
  sumEmoPink: { backgroundColor: colors.macPink },
  sumEmoText: { fontSize: 15, lineHeight: 22.5 },
  sumTitle: { color: colors.ink, ...kitText(13, "700") },

  sampleCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 14 },
  sampleHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sampleTag: { marginLeft: 4, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.macApricot },
  sampleTagText: { color: colors.macApricotInk, ...kitText(9.5, "800") },
  faded: { opacity: 0.5 },
  tcard: { backgroundColor: colors.surface2, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  tcardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tk: { color: colors.ink3, ...kitText(10.5, "800", 1.5, 0.04) },
  tname: { color: colors.ink, ...kitText(13.5, "800") },
  pp: { color: colors.ink, ...kitText(15, "800") },
  ppSmall: { color: colors.ink3, ...kitText(11, "700") },
  m3: { flexDirection: "row", gap: 6, marginTop: 10 },
  m3cell: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 },
  m3b: { color: colors.ink, ...kitText(17, "800", 1.2) },
  m3small: { color: colors.ink3, ...kitText(10.5, "700", 1.2) },
  m3span: { color: colors.ink3, ...kitText(10.5, "600") },
  tfoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  mb: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surface3 },
  sampleNote: { marginTop: 8, lineHeight: 18.4 },
}));
