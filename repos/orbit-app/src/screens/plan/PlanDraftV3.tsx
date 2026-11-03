// R36b: the v3 first draft page, after plan-draft-v5-proposal.html v16「手机」·「初稿 · 确认」(body.m, 390 wide,
// .page padding 18). Sections in the design's order: .top (AI 修正 pill) → .hero（kick + mine / goal / h1 結論 /
// .sum 理由段 / .badges 判定 + 確信度 / .why1）→ .route → .seats（stage headers + adjustable .adj rows + .tot）→
// .evi（.ord / ladder / .more: .nums + .risk + .srcl / .toggle）→ .dock（書き直す / この内容で確定）. Numbers are
// the design's CSS values; colours are tokens (ladder fills / verdict dot = R36a's chart-* / verdict-conditional). Adjustments live in
// `plan-draft-v3-model`; nothing here sends a request.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { PlanConfidenceLevel, PlanDraftView, PlanV2PersonType, PlanVerdict } from "../../api/contract/plan-v2";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { FlowFoot } from "./plan-flow-kit";
import { SrcBadge, V3_INLINE as INLINE, V3Evidence, V3Route, v3Num as num, v3Shadow as shadow } from "./plan-draft-v3-kit";
import { KitGradient, kitText, type KitTone } from "./plan-kit";
import {
  adjustAllocation,
  adjustTargetCount,
  adjustTotals,
  canToggleOff,
  PLAN_DRAFT_ALLOCATION_MAX,
  PLAN_DRAFT_ALLOCATION_MIN,
  summarySegments,
  toggleType,
  typeAdjusted,
  typeGroups,
  type DraftAdjustState,
  type PlanDraftV3Content,
} from "./plan-draft-v3-model";
import { PLAN_EVENT_EMOJI } from "./plan-model";
import { PLAN_ALLOCATION_STEP, PLAN_TYPE_TARGET_MAX } from "../../api/compute/plan-allocation";

/** 系统轮流 5 色（设计稿 types[i][1] 的顺序）。 */
const TYPE_TONES: readonly Exclude<KitTone, "neutral" | "coral" | "ok">[] = ["blue", "teal", "apricot", "pink", "lav"];

const VERDICT_KEYS: Record<PlanVerdict, "plan.v3.verdictFeasible" | "plan.v3.verdictConditional" | "plan.v3.verdictNotRecommended"> = {
  conditional: "plan.v3.verdictConditional",
  feasible: "plan.v3.verdictFeasible",
  not_recommended: "plan.v3.verdictNotRecommended",
};
const LEVEL_KEYS: Record<PlanConfidenceLevel, "plan.v3.levelHigh" | "plan.v3.levelMid" | "plan.v3.levelLow"> = { high: "plan.v3.levelHigh", low: "plan.v3.levelLow", mid: "plan.v3.levelMid" };

export function PlanDraftV3({ draft, content, state, onState, aiFixLeft, aiFixOpen, onAiFix, onConfirm, confirming, onRedraft, redraftEnabled, redrafting, now = new Date() }: {
  draft: PlanDraftView;
  content: PlanDraftV3Content;
  state: DraftAdjustState;
  onState: (next: DraftAdjustState) => void;
  aiFixLeft: number;
  /** The AI-fix composer is open in the bottom bar (the dock steps aside). */
  aiFixOpen: boolean;
  onAiFix: () => void;
  onConfirm: () => void;
  confirming: boolean;
  /** 「重新起草」(R36b, 用户拍板接接口): off when the AI fixes are used up, after a manual edit, or while anything runs. */
  onRedraft: () => void;
  redraftEnabled: boolean;
  redrafting: boolean;
  now?: Date;
}) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const [mine, setMine] = useState(false);
  const [why, setWhy] = useState(false);
  const sources = content.sources ?? [];
  const answers = draft.premise.filter((row) => row.source !== "background");
  const totals = adjustTotals(content, state);
  const groups = typeGroups(content);
  // 判定点：可行 = ok、有条件 = verdict-conditional、不建议 = coral；对比条填充 = chart-* token（R36a 加，原型的写死色）。
  const verdictColor = (verdict: PlanVerdict) => verdict === "feasible" ? colors.ok : verdict === "conditional" ? colors.verdictConditional : colors.coral;
  const badge = (n: number) => <SrcBadge key={`src-${n}`} n={n} />;
  const sg = (label: string) => <View style={styles.sg}><UiText style={styles.sgText}>{label}</UiText></View>;

  const summary = summarySegments(content.summary, sources, draft.premise);

  return (
    <View style={styles.page} testID="draft-v3">
      {/* .top：面包屑 + AI 修正 pill（顶栏是壳，页身从这里起与原型一致；REPORT 自定决定）。 */}
      <View style={styles.top}>
        <UiText style={styles.crumb}>{t("plan.v3.crumb")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityState={{ disabled: aiFixLeft === 0, expanded: aiFixOpen }} disabled={aiFixLeft === 0} hitSlop={6} onPress={onAiFix} style={[styles.ai, aiFixLeft === 0 && styles.aiOff]} testID="draft-v3-ai">
          <UiText style={styles.aiText}>{t("plan.v3.aiFix", { count: aiFixLeft })}</UiText>
        </UiPressable>
      </View>

      {/* .hero */}
      <View style={styles.hero}>
        <UiPressable accessibilityRole="button" accessibilityState={{ expanded: mine }} hitSlop={8} onPress={() => setMine((value) => !value)} style={styles.kick} testID="draft-v3-kick">
          <View style={styles.dot} />
          <UiText style={styles.kickText}>
            {t("plan.v3.kickPre")}
            <UiText style={styles.kickU}>{t("plan.v3.kickMine", { answers: answers.length })}</UiText>
            {t("plan.v3.kickPost", { sources: sources.length })} {mine ? "▴" : "▾"}
          </UiText>
        </UiPressable>
        {mine ? (
          <View style={styles.mine} testID="draft-v3-mine">
            <UiText style={styles.mineH}>{t("plan.v3.mineHead")}</UiText>
            {draft.premise.map((row) => (
              <View key={row.key} style={styles.pr}>
                <UiText style={styles.prK}>{row.label}</UiText>
                <UiText style={[styles.prV, row.guessed && styles.prNone]}>{row.value}</UiText>
                <View style={styles.prTag}>{sg(t(row.source === "background" ? "plan.v3.tagProfile" : "plan.v3.tagAnswer"))}</View>
              </View>
            ))}
          </View>
        ) : null}
        <UiText style={styles.goal}>{t("plan.v3.goal", { outcome: content.outcome })}</UiText>
        <UiText accessibilityRole="header" style={styles.h1}>{content.conclusion}</UiText>
        <UiText style={styles.sum} testID="draft-v3-summary">
          {summary.map((segment, index) => segment.kind === "text"
            ? <UiText key={index} style={segment.bold ? styles.sumBold : undefined}>{segment.text}</UiText>
            : segment.kind === "source"
              ? <UiText key={index}>{" "}{badge(segment.n)}</UiText>
              : <UiText key={index}>{" "}{sg(t("plan.v3.tagAnswer"))}</UiText>)}
        </UiText>
        <View style={styles.badges}>
          {content.verdict ? (
            <View style={styles.pill}><View style={[styles.pillDot, { backgroundColor: verdictColor(content.verdict) }]} /><UiText style={styles.pillText}>{t(VERDICT_KEYS[content.verdict])}</UiText></View>
          ) : null}
          {content.confidence ? (
            <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.v3.confidenceWhy")} accessibilityState={{ expanded: why }} hitSlop={6} onPress={() => setWhy((value) => !value)} style={styles.pill} testID="draft-v3-confidence">
              <UiText style={styles.pillText}>{t("plan.v3.confidence", { level: t(LEVEL_KEYS[content.confidence.level]) })} <UiText style={styles.pillInfo}>ⓘ</UiText></UiText>
            </UiPressable>
          ) : null}
        </View>
        {why && content.confidence ? <View style={styles.why1}><UiText style={styles.why1Text}>{content.confidence.reason}</UiText></View> : null}
      </View>

      {/* .route：N 个阶段，线从第一个节点中心到最后一个节点中心（left/right = 1/2N）。 */}
      <V3Route steps={content.steps} testID="draft-v3-route" />

      {/* 要认识这几类人 */}
      <View style={styles.section}>
        <View style={styles.sh}>
          <UiText accessibilityRole="header" style={styles.h2}>{t("plan.v3.typesTitle")}</UiText>
          <UiText style={styles.shSpan}>{t("plan.v3.typesSub")}</UiText>
        </View>
        <UiText style={styles.guide}>{t("plan.v3.guide")}</UiText>
        <View style={styles.seats} testID="draft-v3-types">
          {groups.map((group, groupIndex) => (
            <View key={group.step.key}>
              <View style={[styles.stg, groupIndex > 0 && styles.stgAfter]} testID={`draft-v3-stage-${group.stepIndex + 1}`}>
                <UiText style={styles.stgB}>{t("plan.v3.stage", { n: group.stepIndex + 1, title: group.step.title })}</UiText>
                <UiText style={styles.stgSpan}>{t("plan.v3.stageDone", { text: group.step.doneCriteria })}</UiText>
              </View>
              {group.types.map((type, index) => (
                <TypeRow key={type.key} type={type} tone={TYPE_TONES[content.personTypes.indexOf(type) % TYPE_TONES.length]!} first={index === 0} state={state} content={content} onState={onState} />
              ))}
            </View>
          ))}
          <View style={[styles.adj, styles.adjLine]} testID="draft-v3-event">
            <View style={styles.adjHead}>
              <View style={[styles.em, { backgroundColor: colors.macPink }]}><UiText style={styles.emText}>{PLAN_EVENT_EMOJI}</UiText></View>
              <View style={styles.nm}><UiText style={styles.nmText}>{t("plan.v3.eventRow")}</UiText></View>
              <View style={styles.rmSpace} />
            </View>
            <View style={styles.adjCtl}>
              <View style={styles.stp}><StpValue value={state.event.targetCount} unit={t("plan.v3.unitEvents")} /></View>
              <View style={styles.stp}><StpValue value={state.event.allocation} unit={t("plan.v3.unitPoints")} /></View>
            </View>
          </View>
          <View style={styles.tot} testID="draft-v3-total">
            <UiText style={styles.totText}>{t("plan.v3.totLeft", { events: totals.eventCount, people: totals.peopleCount, types: totals.typeCount })}</UiText>
            <UiText style={styles.totText}>{t("plan.v3.totPre")}<UiText style={[styles.totB, !totals.ok && styles.totBad]}>{String(totals.total)}</UiText>{t("plan.v3.totPost")}{totals.ok ? "" : t("plan.v3.totBad")}</UiText>
          </View>
        </View>
      </View>

      {/* 为什么这么排 */}
      <V3Evidence content={content} citations={draft.citations} now={now} />

      {!aiFixOpen ? (
        <FlowFoot>
          <View style={styles.dock} testID="draft-v3-dock">
            <View pointerEvents="none" style={styles.dockFade}><KitGradient id="draft-v3-dock" from={colors.bg} fromOpacity={0} to={colors.bg} stop={0.4} vertical /></View>
            <View style={styles.dockIn}>
              <UiPressable accessibilityRole="button" accessibilityState={{ busy: redrafting, disabled: !redraftEnabled || redrafting }} disabled={!redraftEnabled || redrafting} onPress={onRedraft} style={styles.btn} testID="draft-v3-redraft">
                <UiText style={styles.btnText}>{t("plan.v3.redraft")}</UiText>
              </UiPressable>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("plan.v3.confirm")} accessibilityHint={totals.ok ? undefined : t("plan.v3.confirmBlocked", { total: totals.total })} accessibilityState={{ disabled: !totals.ok || confirming || redrafting }} disabled={!totals.ok || confirming || redrafting} onPress={onConfirm} style={[styles.btn, styles.btnPri]} testID="draft-confirm">
                <UiText style={[styles.btnText, styles.btnTextPri]}>{t("plan.v3.confirm")}</UiText>
              </UiPressable>
            </View>
          </View>
        </FlowFoot>
      ) : null}
    </View>
  );
}

/** .adj（手机：32 | 1fr | auto | 28，两行）：emoji · 名 + 说明 · 人数 stepper · 分量 stepper · ×／↺。 */
function TypeRow({ type, tone, first, state, content, onState }: { type: PlanV2PersonType; tone: Exclude<KitTone, "neutral" | "coral" | "ok">; first: boolean; state: DraftAdjustState; content: PlanDraftV3Content; onState: (next: DraftAdjustState) => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const current = state.types[type.key] ?? { allocation: type.allocation, on: true, targetCount: type.targetCount };
  const off = !current.on;
  const changed = typeAdjusted(content, state, type.key);
  const toneColor = { apricot: colors.macApricot, blue: colors.macBlue, lav: colors.macLav, pink: colors.macPink, teal: colors.macTeal }[tone];
  return (
    <View accessibilityLabel={type.shortLabel} style={[styles.adj, !first && styles.adjLine, off && styles.adjOff]} testID={`draft-v3-type-${type.key}`}>
      <View style={styles.adjHead}>
        <View style={[styles.em, { backgroundColor: toneColor }]}><UiText style={styles.emText}>{type.emoji}</UiText></View>
        <View style={styles.nm}>
          <UiText style={[styles.nmText, off && styles.nmOff]}>{type.shortLabel}{changed ? <UiText>{" "}<View style={styles.chg}><UiText style={styles.chgText}>{t("plan.v3.changed")}</UiText></View></UiText> : null}</UiText>
          <UiText style={styles.nmSmall}>{type.roleSituation}</UiText>
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={off ? t("plan.v3.restore", { label: type.shortLabel }) : t("plan.manual.removeType", { label: type.shortLabel })} accessibilityState={{ disabled: !canToggleOff(state, type.key) }} disabled={!canToggleOff(state, type.key)} hitSlop={8} onPress={() => onState(toggleType(state, type.key))} style={styles.rm} testID={`draft-v3-remove-${type.key}`}>
          <Icon name={off ? "undo" : "x"} size={16} color={colors.ink4} />
        </UiPressable>
      </View>
      <View style={styles.adjCtl}>
        <Stepper
          value={current.targetCount}
          unit={t("plan.v3.unitPeople")}
          valueLabel={t("plan.manual.countValue", { count: current.targetCount, label: type.shortLabel })}
          lessLabel={t("plan.manual.fewer", { label: type.shortLabel })}
          moreLabel={t("plan.manual.more", { label: type.shortLabel })}
          lessDisabled={off || current.targetCount <= 1}
          moreDisabled={off || current.targetCount >= PLAN_TYPE_TARGET_MAX}
          onLess={() => onState(adjustTargetCount(state, type.key, -1))}
          onMore={() => onState(adjustTargetCount(state, type.key, 1))}
          testID={`draft-v3-people-${type.key}`}
        />
        <Stepper
          value={current.allocation}
          unit={t("plan.v3.unitPoints")}
          valueLabel={t("plan.v3.pointsValue", { label: type.shortLabel, points: current.allocation })}
          lessLabel={t("plan.v3.fewerPoints", { label: type.shortLabel })}
          moreLabel={t("plan.v3.morePoints", { label: type.shortLabel })}
          lessDisabled={off || current.allocation <= PLAN_DRAFT_ALLOCATION_MIN}
          moreDisabled={off || current.allocation >= PLAN_DRAFT_ALLOCATION_MAX}
          onLess={() => onState(adjustAllocation(state, type.key, -PLAN_ALLOCATION_STEP))}
          onMore={() => onState(adjustAllocation(state, type.key, PLAN_ALLOCATION_STEP))}
          testID={`draft-v3-points-${type.key}`}
        />
      </View>
    </View>
  );
}

/** .stp：−（26×26）· 值 + 单位（min-width 44）· ＋。 */
function Stepper({ value, unit, valueLabel, lessLabel, moreLabel, lessDisabled, moreDisabled, onLess, onMore, testID }: {
  value: number; unit: string; valueLabel: string; lessLabel: string; moreLabel: string; lessDisabled: boolean; moreDisabled: boolean; onLess: () => void; onMore: () => void; testID: string;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.stp} testID={testID}>
      <UiPressable accessibilityRole="button" accessibilityLabel={lessLabel} accessibilityState={{ disabled: lessDisabled }} disabled={lessDisabled} hitSlop={6} onPress={onLess} style={[styles.stpBtn, lessDisabled && styles.stpBtnOff]}><UiText style={styles.stpBtnText}>−</UiText></UiPressable>
      <StpValue value={value} unit={unit} label={valueLabel} />
      <UiPressable accessibilityRole="button" accessibilityLabel={moreLabel} accessibilityState={{ disabled: moreDisabled }} disabled={moreDisabled} hitSlop={6} onPress={onMore} style={[styles.stpBtn, moreDisabled && styles.stpBtnOff]}><UiText style={styles.stpBtnText}>+</UiText></UiPressable>
    </View>
  );
}

function StpValue({ value, unit, label }: { value: number; unit: string; label?: string }) {
  const { styles } = useStyles();
  return <UiText accessibilityLabel={label} style={styles.stpB}>{String(value)}<UiText style={styles.stpSmall}>{unit}</UiText></UiText>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { paddingTop: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 26, minHeight: 34.8 },
  // CSS flex items shrink by default (RN: 0) — with the longer Japanese label the pill wraps instead of running off screen (Web same).
  crumb: { flexShrink: 1, color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },
  ai: { flexShrink: 1, marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.glass, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  aiOff: { opacity: 0.45 },
  aiText: { flexShrink: 1, color: colors.plum700, ...kitText(13, "400", 1.6) },

  hero: { alignItems: "center", paddingTop: 6, paddingBottom: 4 },
  kick: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.plum500 },
  kickText: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  kickU: { textDecorationLine: "underline", textDecorationStyle: "dashed", textDecorationColor: colors.ink4 },
  mine: { alignSelf: "stretch", maxWidth: 560, marginBottom: 14, backgroundColor: colors.glass, borderRadius: 16, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 },
  mineH: { color: colors.ink3Text, ...kitText(12, "400", 1.6), paddingTop: 6, paddingBottom: 2 },
  pr: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  prK: { width: 64, color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  prV: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(13, "400", 1.6) },
  prNone: { color: colors.ink4 },
  prTag: { width: "100%", paddingLeft: 74, alignItems: "flex-start" },
  goal: { color: colors.plum700, ...kitText(12.5, "500", 1.6), marginBottom: 10 },
  h1: { color: colors.ink, textAlign: "center", maxWidth: 560, ...kitText(24, "600", 1.35, 0.01) },
  sum: { marginTop: 14, maxWidth: 600, alignSelf: "stretch", color: colors.ink2, textAlign: "left", ...kitText(14, "400", 1.8) },
  sumBold: { color: colors.ink, fontWeight: "600" },
  sg: { ...INLINE, backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8, marginHorizontal: 2, transform: [{ translateY: -1 }] },
  sgText: { color: colors.ink3Text, ...kitText(11, "400", 1.6) },
  badges: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassLine, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { color: colors.ink2, ...kitText(12.5, "400", 1.6) },
  pillInfo: { color: colors.ink4 },
  why1: { maxWidth: 460, marginTop: 12, backgroundColor: colors.glass, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  why1Text: { color: colors.ink2, ...kitText(13, "400", 1.6) },

  section: { marginBottom: 42 },
  sh: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 14 },
  h2: { color: colors.ink, ...kitText(18, "600", 1.6) },
  shSpan: { flex: 1, minWidth: 0, color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },
  guide: { color: colors.ink2, ...kitText(13.5, "400", 1.7), marginTop: -4, marginHorizontal: 2, marginBottom: 12 },
  seats: { backgroundColor: colors.surface, borderRadius: 20, paddingTop: 16, paddingBottom: 6, ...shadow(colors.ink, 0.04) },
  stg: { gap: 2, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.surface2 },
  stgAfter: { marginTop: 4 },
  stgB: { color: colors.ink, ...kitText(13, "700", 1.6) },
  stgSpan: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  adj: { paddingVertical: 10, paddingHorizontal: 14, gap: 8 },
  adjLine: { borderTopWidth: 1, borderTopColor: colors.line },
  adjOff: { opacity: 0.38 },
  adjHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  em: { width: 36, height: 36, marginRight: -4, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  emText: { fontSize: 17, lineHeight: 27 },
  nm: { flex: 1, minWidth: 0 },
  nmText: { color: colors.ink, ...kitText(14.5, "600", 1.3) },
  nmOff: { textDecorationLine: "line-through" },
  nmSmall: { color: colors.ink3Text, ...kitText(11.5, "400", 1.3) },
  chg: { ...INLINE, backgroundColor: colors.macApricot, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, marginLeft: 6, transform: [{ translateY: -1 }] },
  chgText: { color: colors.macApricotText, ...kitText(11, "400", 1.6) },
  rm: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rmSpace: { width: 28 },
  adjCtl: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 46, paddingRight: 42 },
  stp: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 999, overflow: "hidden" },
  stpBtn: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
  stpBtnOff: { opacity: 0.3 },
  stpBtnText: { color: colors.ink2, ...kitText(15, "400", 1.6) },
  stpB: { minWidth: 44, textAlign: "center", color: colors.ink, ...num(13, "600", 1.6) },
  stpSmall: { color: colors.ink3Text, marginLeft: 1, ...kitText(10.5, "500", 1.6) },
  tot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line },
  totText: { color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },
  totB: { color: colors.ink, ...num(15, "600", 1.6) },
  totBad: { color: colors.coralText },

  dock: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 18 },
  dockFade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.92 },
  dockIn: { flexDirection: "row", alignItems: "center", gap: 10 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, backgroundColor: colors.surface, alignItems: "center", ...shadow(colors.ink, 0.06) },
  btnPri: { backgroundColor: colors.ink, paddingHorizontal: 28 },
  btnText: { color: colors.ink, ...kitText(14, "400", 1.6) },
  btnTextPri: { color: colors.surface },
}));
