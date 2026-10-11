// R25 目標の切替と編集 (b4 A6, App). The goal name under the プラン segment with 「▾」
// opens a BottomSheet: the active goals (score, people talked to, a tick on the
// current one; switching calls POST …/v2/[planId]/open and reloads), the achieved
// goals (read only → their 完了 page), 「以前のプラン」 when a v1 plan exists, and
// 「＋ 目標を追加」 (with two active goals: greyed with the limit explained, never a
// paywall). 「この目標を編集」 opens the edit sheet: goal text + type; a change asks
// どうするか with three ways out — 方案を作り直す (save_and_rebuild → 見直し page),
// 目標だけ保存 (save_only; allocation unchanged), キャンセル.
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import type { PlanGoalKind, PlanGoalListItem, PlanLegacyItem, PlanV2Detail } from "../../api/contract/plan-v2";
import { PLAN_GOAL_KIND_COPY, planCopy } from "../../api/compute/plan-template-copy";
import { planDoneHref, planLegacyHref, planReviewHref } from "../../api/compute/plan-href";
import { PLAN_GOAL_KINDS, PLAN_GOAL_TEMPLATES } from "../../api/compute/plan-templates";
import { ActionSheet, BottomSheet, Button, Icon, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { isKnownGoalKind, newIdempotencyKey } from "./plan-model";
import { goalEditChange, goalGroups } from "./plan-review-model";
import { ChoiceChip, FailureNote, usePlanStyles } from "./plan-ui";

const goalEmoji = (kind: string) => (isKnownGoalKind(kind as PlanGoalKind) ? PLAN_GOAL_TEMPLATES[kind as PlanGoalKind].emoji : "🎯");

/** The goal row under the segment: 「💰 シリーズA 資金調達 ▾」 + 「目標 1 / 2」. */
export function PlanGoalTitle({ goal, goalKind, index, count, onPress }: { goal: string; goalKind: string; index: number; count: number; onPress: () => void }) {
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.goals.open", { goal })} hitSlop={6} onPress={onPress} style={styles.title} testID="goal-switcher-open">
      <UiText style={shared.emoji}>{goalEmoji(goalKind)}</UiText>
      <UiText numberOfLines={2} style={[styles.titleText, shared.grow]}>{goal}</UiText>
      <Icon name="down" size={16} color={colors.ink2} />
      {count > 0 ? <UiText style={shared.caption}>{t("plan.goals.position", { count, index })}</UiText> : null}
    </UiPressable>
  );
}

export function PlanGoalSwitcher({ visible, onClose, goals, currentPlanId, activeGoalLimit, onSwitched, onAdd, onEdit }: {
  visible: boolean;
  onClose: () => void;
  goals: readonly PlanGoalListItem[];
  currentPlanId: string | null;
  activeGoalLimit: number;
  onSwitched: () => void;
  onAdd: () => void;
  onEdit: (() => void) | null;
}) {
  const api = usePlanApi();
  const router = useRouter();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const [legacy, setLegacy] = useState<readonly PlanLegacyItem[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [failure, setFailure] = useState<PlanFailure | null>(null);
  const { active, achieved } = goalGroups(goals);
  const full = active.length >= activeGoalLimit;

  // 以前のプラン shows only when a v1 plan exists (read when the sheet opens).
  useEffect(() => {
    if (!visible) return;
    setFailure(null);
    let live = true;
    void api.legacyList().then((result) => { if (live) setLegacy(result.ok ? result.data.plans : []); });
    return () => { live = false; };
  }, [api, visible]);

  const choose = async (goal: PlanGoalListItem) => {
    if (goal.planId === currentPlanId) return onClose();
    if (switching) return;
    setSwitching(goal.planId);
    setFailure(null);
    const result = await api.openGoal(goal.planId);
    setSwitching(null);
    if (!result.ok) return setFailure(result.failure);
    onClose();
    onSwitched();
  };
  const go = (href: string) => { onClose(); router.push(href as Href); };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("plan.goals.title")}>
      <View style={styles.sheet} testID="goal-switcher">
        <UiText accessibilityRole="header" style={shared.heading}>{t("plan.goals.title")}</UiText>
        {active.map((goal) => {
          const current = goal.planId === currentPlanId;
          return (
            <UiPressable
              key={goal.planId}
              accessibilityRole="radio"
              accessibilityLabel={t("plan.goals.rowA11y", { goal: goal.goal, people: goal.talkedPeople, score: goal.total })}
              accessibilityState={{ checked: current, selected: current, busy: switching === goal.planId }}
              aria-checked={current}
              onPress={() => void choose(goal)}
              style={[styles.row, current && styles.rowOn]}
              testID="goal-row"
            >
              <UiText style={shared.emoji}>{goalEmoji(goal.goalKind)}</UiText>
              <View style={shared.grow}>
                <UiText numberOfLines={2} style={shared.title}>{goal.goal}</UiText>
                <UiText style={shared.caption}>{t("plan.goals.rowMeta", { people: goal.talkedPeople, score: goal.total })}</UiText>
              </View>
              {current ? <Icon name="check" size={20} color={colors.accentText} /> : null}
            </UiPressable>
          );
        })}
        {achieved.length ? (
          <View style={styles.group}>
            <UiText style={shared.label}>{t("plan.goals.achievedTitle", { count: achieved.length })}</UiText>
            {achieved.map((goal) => (
              <UiPressable key={goal.planId} accessibilityRole="link" accessibilityLabel={t("plan.goals.achievedOpen", { goal: goal.goal })} onPress={() => go(planDoneHref("app", goal.planId))} style={styles.row} testID="goal-achieved">
                <UiText style={shared.emoji}>🏁</UiText>
                <View style={shared.grow}>
                  <UiText numberOfLines={2} style={shared.title}>{goal.goal}</UiText>
                  <UiText style={shared.caption}>{t("plan.goals.rowMeta", { people: goal.talkedPeople, score: goal.total })}</UiText>
                </View>
                <Icon name="right" size={16} color={colors.ink3Text} />
              </UiPressable>
            ))}
          </View>
        ) : null}
        {failure ? <FailureNote failure={failure} onReload={onSwitched} /> : null}
        <Button block disabled={full} icon="plus" label={t("plan.goals.add")} onPress={() => { onClose(); onAdd(); }} variant="secondary" />
        {full ? <UiText style={shared.caption}>{t("plan.limit.goalActive")}</UiText> : null}
        {onEdit ? <Button block icon="edit" label={t("plan.goals.edit")} onPress={() => { onClose(); onEdit(); }} variant="ghost" /> : null}
        {legacy.length ? (
          <View style={styles.group} testID="goal-legacy">
            <UiText style={shared.label}>{t("plan.legacy.title")}</UiText>
            {legacy.map((plan) => (
              <UiPressable key={plan.planId} accessibilityRole="link" accessibilityLabel={t("plan.legacy.open", { goal: plan.goal })} onPress={() => go(planLegacyHref("app", plan.planId))} style={styles.row}>
                <Icon name="archive" size={20} color={colors.ink3Text} />
                <UiText numberOfLines={2} style={[shared.body2, shared.grow]}>{plan.goal}</UiText>
                <Icon name="right" size={16} color={colors.ink3Text} />
              </UiPressable>
            ))}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** 目標を編集: goal text + type; a change asks for one of three ways out. */
export function PlanGoalEditSheet({ visible, onClose, plan, reviewLeft, onSaved }: {
  visible: boolean;
  onClose: () => void;
  plan: Pick<PlanV2Detail, "planId" | "goal" | "goalKind" | "revision">;
  reviewLeft: number;
  onSaved: () => void;
}) {
  const api = usePlanApi();
  const router = useRouter();
  const toast = useToast();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const [text, setText] = useState(plan.goal);
  const [kind, setKind] = useState<PlanGoalKind | null>(isKnownGoalKind(plan.goalKind) ? plan.goalKind : null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);

  useEffect(() => {
    if (!visible) return;
    setText(plan.goal);
    setKind(isKnownGoalKind(plan.goalKind) ? plan.goalKind : null);
    setFailure(null);
  }, [plan.goal, plan.goalKind, visible]);

  const change = goalEditChange(plan, { goalKind: kind, goalText: text });

  const save = async (mode: "save_only" | "save_and_rebuild") => {
    if (!change || saving) return;
    setAsking(false);
    setSaving(true);
    setFailure(null);
    const result = await api.editGoal(plan.planId, { ...change, expectedRevision: plan.revision, idempotencyKey: newIdempotencyKey("goal-edit"), mode });
    setSaving(false);
    if (!result.ok) return setFailure(result.failure);
    onClose();
    if (mode === "save_and_rebuild") {
      router.push(planReviewHref("app", plan.planId) as Href);
      return;
    }
    toast.success(t("plan.goals.saved"));
    onSaved();
  };

  return (
    <>
      <BottomSheet visible={visible && !asking} onClose={onClose} accessibilityLabel={t("plan.goals.editTitle")}>
        <View style={styles.sheet} testID="goal-edit">
          <UiText accessibilityRole="header" style={shared.heading}>{t("plan.goals.editTitle")}</UiText>
          <UiText style={shared.label}>{t("plan.goal.inputLabel")}</UiText>
          <TextInput
            accessibilityLabel={t("plan.goal.inputLabel")}
            editable={!saving}
            multiline
            onChangeText={setText}
            placeholderTextColor={colors.ink3Text}
            style={[shared.input, shared.inputMultiline]}
            value={text}
          />
          {change?.goalText ? <UiText style={shared.caption}>{t("plan.goals.before", { value: plan.goal })}</UiText> : null}
          <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.goal.kindLabel")} style={shared.wrap}>
            {PLAN_GOAL_KINDS.map((item) => (
              <ChoiceChip key={item} label={`${PLAN_GOAL_TEMPLATES[item].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[item], language)}`} selected={kind === item} onPress={() => setKind(item)} />
            ))}
          </View>
          <UiText style={shared.caption}>{t("plan.goals.noDeadline")}</UiText>
          {failure ? <FailureNote failure={failure} onReload={() => { onClose(); onSaved(); }} /> : null}
          <View style={shared.footerRow}>
            <Button label={copy.action.cancel} onPress={onClose} variant="secondary" />
            <View style={shared.grow}><Button block disabled={!change} label={t("plan.goals.save")} loading={saving} onPress={() => setAsking(true)} variant="primary" /></View>
          </View>
        </View>
      </BottomSheet>
      <ActionSheet
        visible={visible && asking}
        title={t("plan.goals.rebuildTitle")}
        effects={[
          { icon: "shield", text: t("plan.goals.rebuildKeeps") },
          { icon: "refresh", text: t("plan.goals.rebuildHow") },
          { icon: "info", text: reviewLeft > 0 ? t("plan.goals.rebuildUses", { count: reviewLeft }) : t("plan.goals.rebuildNoneLeft") },
        ]}
        options={[
          { key: "rebuild", label: t("plan.goals.rebuild") },
          { key: "save", label: t("plan.goals.saveOnly") },
          { key: "cancel", label: copy.action.cancel },
        ]}
        defaultFocusKey="rebuild"
        onSelect={(key) => {
          if (key === "rebuild") void save("save_and_rebuild");
          else if (key === "save") void save("save_only");
          else setAsking(false);
        }}
        onClose={() => setAsking(false)}
      />
    </>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  title: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  titleText: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: "800" },
  sheet: { gap: 10, paddingBottom: 8 },
  group: { gap: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  rowOn: { backgroundColor: colors.accentSoft },
}));
