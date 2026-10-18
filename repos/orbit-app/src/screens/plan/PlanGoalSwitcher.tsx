// R25 目標の切替と編集 (b4 A6, App). The goal name under the プラン segment with 「▾」
// opens an anchored Popover: the active goals (score, people talked to, a tick on the
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
import { ActionSheet, BottomSheet, Button, Icon, Popover, PopoverDivider, PopoverRow, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { usePlanApi, type PlanFailure } from "./plan-api";
import { isKnownGoalKind, newIdempotencyKey } from "./plan-model";
import { goalEditChange, goalEditTextWithAmount, goalGroups } from "./plan-review-model";
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
  const [showAchieved, setShowAchieved] = useState(false);
  const { active, achieved } = goalGroups(goals);
  const full = active.length >= activeGoalLimit;

  // 以前のプラン shows only when a v1 plan exists (read when the sheet opens).
  useEffect(() => {
    if (!visible) return;
    setFailure(null);
    setShowAchieved(false);
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
  const tile = (emoji: string, backgroundColor: string) => <View style={[styles.menuTile, { backgroundColor }]}><UiText style={styles.menuEmoji}>{emoji}</UiText></View>;
  const actionTile = (icon: "plus" | "edit" | "archive") => <View style={styles.menuActionTile}><Icon name={icon} size={16} color={colors.ink2} /></View>;

  return (
    <Popover visible={visible} onClose={onClose} anchor={{ top: 192, left: 18, right: 60 }} accessibilityLabel={t("plan.goals.title")} testID="goal-switcher">
      <View>
        {active.map((goal) => {
          const current = goal.planId === currentPlanId;
          return (
            <PopoverRow
              key={goal.planId}
              title={goal.goal}
              subtitle={t("plan.goals.rowMeta", { people: goal.talkedPeople, score: goal.total })}
              leading={tile(goalEmoji(goal.goalKind), goal.goalKind === "fundraising" ? colors.macPink : goal.goalKind === "sales" ? colors.macBlue : colors.macTeal)}
              trailing={current ? <Icon name="check" size={16} color={colors.ink} /> : undefined}
              selected={current}
              accessibilityRole="radio"
              accessibilityLabel={t("plan.goals.rowA11y", { goal: goal.goal, people: goal.talkedPeople, score: goal.total })}
              onPress={() => void choose(goal)}
              testID="goal-row"
            />
          );
        })}
        <PopoverDivider />
        {achieved.length ? (
          <>
            <PopoverRow title={t("plan.goals.achievedMenuTitle")} subtitle={t("plan.goals.achievedCount", { count: achieved.length })} leading={tile("🏁", colors.surface2)} trailing={<Icon name="right" size={16} color={colors.ink3Text} />} muted onPress={() => setShowAchieved((value) => !value)} testID="goal-achieved-summary" />
            {showAchieved ? achieved.map((goal) => <PopoverRow key={goal.planId} title={goal.goal} subtitle={t("plan.goals.rowMeta", { people: goal.talkedPeople, score: goal.total })} leading={tile("🏁", colors.surface2)} trailing={<Icon name="right" size={16} color={colors.ink3Text} />} accessibilityRole="link" accessibilityLabel={t("plan.goals.achievedOpen", { goal: goal.goal })} onPress={() => go(planDoneHref("app", goal.planId))} testID="goal-achieved" />) : null}
          </>
        ) : null}
        {failure ? <FailureNote failure={failure} onReload={onSwitched} /> : null}
        {full ? <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.goals.add")} accessibilityState={{ disabled: true }} disabled style={styles.menuDisabled} testID="goal-add"><View style={styles.menuDisabledInner}>{actionTile("plus")}<View style={styles.menuCopy}><UiText style={styles.menuDisabledTitle}>{t("plan.goals.add")}</UiText><UiText style={styles.menuHint}>{t("plan.goals.addLimitHint")}</UiText></View></View></UiPressable>
          : <PopoverRow title={t("plan.goals.add")} subtitle={t("plan.goals.addLimitHint")} leading={actionTile("plus")} onPress={() => { onClose(); onAdd(); }} testID="goal-add" />}
        {onEdit ? <PopoverRow title={t("plan.goals.edit")} leading={actionTile("edit")} onPress={() => { onClose(); onEdit(); }} /> : null}
        {legacy.length ? (
          <View testID="goal-legacy">
            <PopoverDivider />
            <UiText style={shared.label}>{t("plan.legacy.title")}</UiText>
            {legacy.map((plan) => (
              <PopoverRow key={plan.planId} title={plan.goal} leading={actionTile("archive")} trailing={<Icon name="right" size={16} color={colors.ink3Text} />} accessibilityRole="link" accessibilityLabel={t("plan.legacy.open", { goal: plan.goal })} onPress={() => go(planLegacyHref("app", plan.planId))} />
            ))}
          </View>
        ) : null}
      </View>
    </Popover>
  );
}

/** 目標を編集: goal text + type; a change asks for one of three ways out. */
export function PlanGoalEditSheet({ visible, onClose, plan, reviewLeft, onSaved, previewAmount }: {
  visible: boolean;
  onClose: () => void;
  plan: Pick<PlanV2Detail, "planId" | "goal" | "goalKind" | "goalBackground" | "goalNote" | "premise" | "revision">;
  reviewLeft: number;
  onSaved: () => void;
  /** R32 board #29 shows the amount edited to 5億円; passed only by the dev design route. */
  previewAmount?: string;
}) {
  const api = usePlanApi();
  const router = useRouter();
  const toast = useToast();
  const shared = usePlanStyles().styles;
  const { styles, colors } = useStyles();
  const { t, language } = useOrbitLocale();
  const copy = useStandardCopy();
  const amountBefore = plan.goalKind === "fundraising" ? (plan.goal.match(/\d+(?:[.,]\d+)?億円/u)?.[0] ?? plan.premise.find((row) => row.key === "purpose")?.value.match(/\d+(?:[.,]\d+)?億円/u)?.[0] ?? "") : "";
  const labelBefore = amountBefore ? plan.goal.replace(/\s*（\d+(?:[.,]\d+)?億円）/u, "") : plan.goal;
  const [text, setText] = useState(labelBefore);
  const [kind, setKind] = useState<PlanGoalKind | null>(isKnownGoalKind(plan.goalKind) ? plan.goalKind : null);
  const [amount, setAmount] = useState(previewAmount ?? amountBefore);
  const [background, setBackground] = useState(plan.goalBackground ?? "");
  const [note, setNote] = useState(plan.goalNote ?? "");
  const [showKinds, setShowKinds] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<PlanFailure | null>(null);

  useEffect(() => {
    if (!visible) return;
    setText(labelBefore);
    setKind(isKnownGoalKind(plan.goalKind) ? plan.goalKind : null);
    setAmount(previewAmount ?? amountBefore);
    setBackground(plan.goalBackground ?? "");
    setNote(plan.goalNote ?? "");
    setShowKinds(false);
    setFailure(null);
  }, [amountBefore, labelBefore, plan.goalBackground, plan.goalKind, plan.goalNote, previewAmount, visible]);

  const amountChanged = Boolean(amountBefore && amount.trim() && amount.trim() !== amountBefore);
  const goalText = goalEditTextWithAmount(text, amount, amountBefore, plan.goal);
  const change = goalEditChange(plan, { goalBackground: background, goalKind: kind, goalNote: note, goalText });
  const rebuildChoice = Boolean(change?.goalText || change?.goalKind);

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
          <View style={styles.editHead}><UiText accessibilityRole="header" style={styles.editTitle}>{t("plan.goals.editTitle")}</UiText><Button size="sm" label={copy.action.cancel} onPress={onClose} variant="ghost" /></View>
          <View style={styles.editField}>
            <UiText style={styles.editLabel}>{t("plan.goal.inputLabel")}</UiText>
            <View style={styles.editValue}><UiPressable accessibilityRole="button" accessibilityLabel={t("plan.goals.kindChange")} onPress={() => setShowKinds((value) => !value)} style={styles.kindButton}><UiText style={styles.kindEmoji}>{goalEmoji(kind ?? plan.goalKind)}</UiText></UiPressable><TextInput accessibilityLabel={t("plan.goal.inputLabel")} editable={!saving} onChangeText={setText} placeholderTextColor={colors.ink3Text} style={styles.editInput} value={text} /></View>
          </View>
          {showKinds ? <View accessibilityRole="radiogroup" accessibilityLabel={t("plan.goal.kindLabel")} style={shared.wrap}>{PLAN_GOAL_KINDS.map((item) => <ChoiceChip key={item} label={`${PLAN_GOAL_TEMPLATES[item].emoji} ${planCopy(PLAN_GOAL_KIND_COPY[item], language)}`} selected={kind === item} onPress={() => setKind(item)} />)}</View> : null}
          {amountBefore ? <View style={styles.editField}><UiText style={styles.editLabel}>{t("plan.goals.amount")}</UiText><View style={styles.editValue}>{amountChanged ? <><UiText style={styles.oldValue}>{amountBefore}</UiText><UiText style={styles.arrow}>→</UiText></> : null}<TextInput accessibilityLabel={t("plan.goals.amount")} editable={!saving} onChangeText={setAmount} style={styles.editInput} value={amount} />{amountChanged ? <View style={styles.changedTag}><UiText style={styles.changedTagText}>{t("plan.goals.changed")}</UiText></View> : null}</View></View> : null}
          <View style={styles.editField}><UiText style={styles.editLabel}>{t("plan.goals.background")}</UiText><TextInput accessibilityLabel={t("plan.goals.background")} editable={!saving} maxLength={1000} multiline onChangeText={setBackground} placeholderTextColor={colors.ink3Text} style={styles.editInput} value={background} /></View>
          <View style={styles.editField}><UiText style={styles.editLabel}>{t("plan.goals.focus")}</UiText><TextInput accessibilityLabel={t("plan.goals.focus")} editable={!saving} maxLength={200} multiline onChangeText={setNote} placeholderTextColor={colors.ink3Text} style={styles.editInput} value={note} /></View>
          <UiText style={shared.caption}>{t("plan.goals.noDeadline")}</UiText>
          {failure ? <FailureNote failure={failure} onReload={() => { onClose(); onSaved(); }} /> : null}
          <Button block disabled={!change} label={t("plan.goals.save")} loading={saving} onPress={() => { if (rebuildChoice) setAsking(true); else void save("save_only"); }} variant="primary" />
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
  menuTile: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  menuEmoji: { fontSize: 17, lineHeight: 22 },
  menuActionTile: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  menuDisabled: { borderRadius: 16, padding: 10 },
  menuDisabledInner: { alignItems: "center", flexDirection: "row", gap: 10 },
  menuCopy: { flex: 1 },
  menuDisabledTitle: { color: colors.ink3Text, fontSize: 13.5, fontWeight: "700", lineHeight: 20.25 },
  menuHint: { color: colors.ink3Text, fontSize: 11.5, lineHeight: 17.25 },
  editHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  editTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  editField: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 6, paddingVertical: 8 },
  editLabel: { color: colors.ink3Text, fontSize: 11.5 },
  editValue: { alignItems: "center", flexDirection: "row", gap: 8 },
  editInput: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: "600", minHeight: 24, padding: 0 },
  kindButton: { alignItems: "center", backgroundColor: colors.macPink, borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  kindEmoji: { fontSize: 17 },
  oldValue: { color: colors.ink3Text, fontSize: 13, textDecorationLine: "line-through" },
  arrow: { color: colors.ink2, fontSize: 13 },
  changedTag: { backgroundColor: colors.macLav, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  changedTagText: { color: colors.macLavText, fontSize: 11, fontWeight: "700" },
}));
