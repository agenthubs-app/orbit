// R36b: the v3 first draft page, after plan-draft-v5-proposal.html v16「手机」·「初稿 · 确认」(body.m, 390 wide,
// .page padding 18). Sections in the design's order: .top (AI 修正 pill) → .hero（kick + mine / goal / h1 結論 /
// .sum 理由段 / .badges 判定 + 確信度 / .why1）→ .route → .seats（stage headers + adjustable .adj rows + .tot）→
// .evi（.ord / ladder / .more: .nums + .risk + .srcl / .toggle）→ .dock（書き直す / この内容で確定）. Numbers are
// the design's CSS values; colours are tokens (ladder fills / verdict dot = R36a's chart-* / verdict-conditional). Adjustments live in
// `plan-draft-v3-model`; nothing here sends a request.
import { useState } from "react";
import { Linking, Platform, StyleSheet, View, type TextStyle, type ViewStyle } from "react-native";

import type { PlanComparisonVerdict, PlanConfidenceLevel, PlanDraftView, PlanV2PersonType, PlanVerdict } from "../../api/contract/plan-v2";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { FlowFoot } from "./plan-flow-kit";
import { KitGradient, kitText, type KitTone } from "./plan-kit";
import {
  adjustAllocation,
  adjustTargetCount,
  adjustTotals,
  canToggleOff,
  PLAN_DRAFT_ALLOCATION_MAX,
  PLAN_DRAFT_ALLOCATION_MIN,
  sourceStale,
  sourceTitle,
  sourceUrl,
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
const NUM_FONT = Platform.OS === "ios" ? { fontFamily: "ui-rounded" } : null;
// react-native-web (tests / sanity shots) lays a View inside Text out as a block; native iOS keeps it inline.
const INLINE = Platform.OS === "web" ? ({ display: "inline-flex", verticalAlign: "middle" } as unknown as ViewStyle) : null;

const VERDICT_KEYS: Record<PlanVerdict, "plan.v3.verdictFeasible" | "plan.v3.verdictConditional" | "plan.v3.verdictNotRecommended"> = {
  conditional: "plan.v3.verdictConditional",
  feasible: "plan.v3.verdictFeasible",
  not_recommended: "plan.v3.verdictNotRecommended",
};
const LEVEL_KEYS: Record<PlanConfidenceLevel, "plan.v3.levelHigh" | "plan.v3.levelMid" | "plan.v3.levelLow"> = { high: "plan.v3.levelHigh", low: "plan.v3.levelLow", mid: "plan.v3.levelMid" };
const CMP_KEYS: Record<PlanComparisonVerdict, "plan.v3.cmpPreferred" | "plan.v3.cmpPossible" | "plan.v3.cmpNotRecommended"> = {
  not_recommended: "plan.v3.cmpNotRecommended",
  possible: "plan.v3.cmpPossible",
  preferred: "plan.v3.cmpPreferred",
};

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
  const [full, setFull] = useState(false);
  const sources = content.sources ?? [];
  const answers = draft.premise.filter((row) => row.source !== "background");
  const totals = adjustTotals(content, state);
  const groups = typeGroups(content);
  // 判定点：可行 = ok、有条件 = verdict-conditional、不建议 = coral；对比条填充 = chart-* token（R36a 加，原型的写死色）。
  const verdictColor = (verdict: PlanVerdict) => verdict === "feasible" ? colors.ok : verdict === "conditional" ? colors.verdictConditional : colors.coral;
  const fillColor = (verdict: PlanComparisonVerdict) => verdict === "preferred" ? colors.chartPreferred : verdict === "possible" ? colors.chartPossible : colors.chartNot;
  const vColor = (verdict: PlanComparisonVerdict) => verdict === "preferred" ? colors.okText : verdict === "possible" ? colors.macApricotText : colors.coralText;
  const badge = (n: number) => <View key={`src-${n}`} style={styles.src}><UiText style={styles.srcText}>{String(n)}</UiText></View>;
  const sg = (label: string) => <View style={styles.sg}><UiText style={styles.sgText}>{label}</UiText></View>;

  const summary = summarySegments(content.summary, sources, draft.premise);
  const moreParts = [
    content.keyNumbers?.length ? t("plan.v3.moreNums", { count: content.keyNumbers.length }) : null,
    content.risks?.length ? t("plan.v3.moreRisks", { count: content.risks.length }) : null,
    sources.length ? t("plan.v3.moreSources", { count: sources.length }) : null,
  ].filter((part): part is string => Boolean(part));
  const moreLabel = moreParts.length ? `${t("plan.v3.morePre")}${moreParts.length > 1 ? `${moreParts.slice(0, -1).join(t("plan.v3.moreJoin"))}${t("plan.v3.moreLast")}${moreParts[moreParts.length - 1]}` : moreParts[0]}${t("plan.v3.morePost")}` : null;

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
      {content.steps.length ? (
        <View style={styles.route} testID="draft-v3-route">
          <View pointerEvents="none" style={[styles.routeLine, { left: `${50 / content.steps.length}%`, right: `${50 / content.steps.length}%` }]}>
            <View style={[styles.routeHalf, { backgroundColor: colors.plum700 }]} />
            <View style={[styles.routeHalf, { backgroundColor: colors.plum300 }]} />
          </View>
          {content.steps.map((step, index) => (
            <View key={step.key} style={styles.st}>
              <View style={styles.nodeBox}>
                {index === 0 ? <View style={styles.halo} /> : null}
                <View style={[styles.nodeRing, index === 0 && styles.nodeRingCur]} />
                <View style={[styles.node, index === 0 && styles.nodeCur]}><UiText style={[styles.nodeText, index === 0 && styles.nodeTextCur]}>{String(index + 1)}</UiText></View>
              </View>
              <UiText style={[styles.stB, index === 0 && styles.stBCur]}>{step.title}</UiText>
            </View>
          ))}
        </View>
      ) : null}

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
      {content.orderReasons?.length || content.comparison ? (
        <View style={styles.section}>
          <View style={styles.sh}>
            <UiText accessibilityRole="header" style={styles.h2}>{t("plan.v3.whyTitle")}</UiText>
            <UiText style={styles.shSpan}>{t("plan.v3.whySub", { count: sources.length })}</UiText>
          </View>
          <View style={styles.evi} testID="draft-v3-evidence">
            {content.orderReasons?.length ? (
              <>
                <View style={[styles.sh, styles.shTight]}><UiText style={styles.h2Sm}>{t("plan.v3.orderTitle")}</UiText></View>
                <View style={styles.ord}>
                  {content.orderReasons.map((line, index) => (
                    <View key={index} style={styles.li}>
                      <UiText style={styles.liNum}>{`${index + 1}.`}</UiText>
                      <UiText style={styles.liText}>{line.text}{line.sourceIds.map((id) => { const n = sources.findIndex((source) => source.id === id) + 1; return n > 0 ? <UiText key={id}>{" "}{badge(n)}</UiText> : null; })}</UiText>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {content.comparison ? (
              <>
                <View style={[styles.sh, styles.shLadder]}>
                  <UiText style={styles.h2Sm}>{content.comparison.title}</UiText>
                  <UiText style={styles.shSpan}>{t("plan.v3.ladderSub")}</UiText>
                </View>
                <UiText style={styles.funnel}>{content.comparison.funnel}</UiText>
                <View style={styles.ladder}>
                  {content.comparison.rows.map((row, index) => (
                    <View key={`${row.label}-${index}`} style={styles.lr}>
                      <UiText style={styles.lrLabel}>{row.label}{row.sourceIds.slice(0, 1).map((id) => { const n = sources.findIndex((source) => source.id === id) + 1; return n > 0 ? <UiText key={id}>{" "}{badge(n)}</UiText> : null; })}</UiText>
                      <View style={styles.bar}><View style={[styles.barFill, { backgroundColor: fillColor(row.verdict), width: `${Math.max(0, Math.min(100, row.score))}%` }]} /></View>
                      <UiText style={[styles.lrV, { color: vColor(row.verdict) }]}>{t(CMP_KEYS[row.verdict])}</UiText>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {full ? (
              <View testID="draft-v3-more">
                {content.keyNumbers?.length ? (
                  <View style={styles.nums}>
                    {content.keyNumbers.map((number, index) => (
                      <View key={`${number.value}-${index}`} style={[styles.nb, index > 0 && styles.nbLine]}>
                        <UiText style={styles.nbB}>{number.value}</UiText>
                        <UiText style={styles.nbSpan}>{number.label}{number.sourceIds.map((id) => { const n = sources.findIndex((source) => source.id === id) + 1; return n > 0 ? <UiText key={id}>{" "}{badge(n)}</UiText> : null; })}</UiText>
                      </View>
                    ))}
                  </View>
                ) : null}
                {content.risks?.length ? (
                  <View style={styles.risks}>
                    {content.risks.map((risk, index) => (
                      <View key={index} style={styles.risk} testID={risk.kind === "unverified" ? "draft-v3-risk-unverified" : "draft-v3-risk"}>
                        <View style={[styles.riskTag, risk.kind === "risk" ? styles.riskTagRisk : styles.riskTagUnverified]}><UiText style={[styles.riskTagText, risk.kind === "risk" ? styles.riskTagTextRisk : styles.riskTagTextUnverified]}>{t(risk.kind === "risk" ? "plan.v3.riskTag" : "plan.v3.unverifiedTag")}</UiText></View>
                        <UiText style={styles.riskText}>{risk.text}</UiText>
                      </View>
                    ))}
                  </View>
                ) : null}
                {sources.length ? (
                  <View style={styles.srcl}>
                    {sources.map((source, index) => {
                      const url = sourceUrl(source, draft.citations);
                      return (
                        <View key={source.id} style={styles.srclLi}>
                          <View style={[styles.src, styles.srcInList]}><UiText style={styles.srcText}>{String(index + 1)}</UiText></View>
                          <UiText style={styles.srclText}>{sourceTitle(source, draft.citations)}{sourceStale(source, now) ? <UiText>{" "}<View style={styles.chg}><UiText style={styles.chgText}>{t("plan.v3.sourceStale")}</UiText></View></UiText> : null}</UiText>
                          {url ? <UiPressable accessibilityRole="link" hitSlop={6} onPress={() => void Linking.openURL(url)}><UiText style={styles.srclA}>{t("plan.v3.sourceOpen")}</UiText></UiPressable> : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
            {moreLabel ? (
              <UiPressable accessibilityRole="button" accessibilityState={{ expanded: full }} hitSlop={6} onPress={() => setFull((value) => !value)} style={styles.toggle} testID="draft-v3-toggle">
                <UiText style={styles.toggleText}>{full ? t("plan.v3.less") : moreLabel}</UiText>
              </UiPressable>
            ) : null}
          </View>
        </View>
      ) : null}

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

const shadow = (color: string, opacity: number): ViewStyle => ({ shadowColor: color, shadowOffset: { height: 1, width: 0 }, shadowOpacity: opacity, shadowRadius: 1 });
const num = (size: number, weight: TextStyle["fontWeight"], lineHeight = 1.6): TextStyle => ({ ...kitText(size, weight, lineHeight), ...NUM_FONT });

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { paddingTop: 18 },
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 26, minHeight: 34.8 },
  crumb: { color: colors.ink3, ...kitText(12.5, "400", 1.6) },
  ai: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.glass, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  aiOff: { opacity: 0.45 },
  aiText: { color: colors.plum700, ...kitText(13, "400", 1.6) },

  hero: { alignItems: "center", paddingTop: 6, paddingBottom: 4 },
  kick: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.plum500 },
  kickText: { color: colors.ink3, ...kitText(12, "400", 1.6) },
  kickU: { textDecorationLine: "underline", textDecorationStyle: "dashed", textDecorationColor: colors.ink4 },
  mine: { alignSelf: "stretch", maxWidth: 560, marginBottom: 14, backgroundColor: colors.glass, borderRadius: 16, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 },
  mineH: { color: colors.ink3, ...kitText(12, "400", 1.6), paddingTop: 6, paddingBottom: 2 },
  pr: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  prK: { width: 64, color: colors.ink3, ...kitText(12, "400", 1.6) },
  prV: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(13, "400", 1.6) },
  prNone: { color: colors.ink4 },
  prTag: { width: "100%", paddingLeft: 74, alignItems: "flex-start" },
  goal: { color: colors.plum700, ...kitText(12.5, "500", 1.6), marginBottom: 10 },
  h1: { color: colors.ink, textAlign: "center", maxWidth: 560, ...kitText(24, "600", 1.35, 0.01) },
  sum: { marginTop: 14, maxWidth: 600, alignSelf: "stretch", color: colors.ink2, textAlign: "left", ...kitText(14, "400", 1.8) },
  sumBold: { color: colors.ink, fontWeight: "600" },
  sg: { ...INLINE, backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8, marginHorizontal: 2, transform: [{ translateY: -1 }] },
  sgText: { color: colors.ink3, ...kitText(11, "400", 1.6) },
  src: { ...INLINE, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.plum100, paddingHorizontal: 4, marginLeft: 3, alignItems: "center", justifyContent: "center", transform: [{ translateY: -1 }] },
  srcText: { color: colors.macLavText, ...num(10, "600", 1.6) },
  srcInList: { marginLeft: 0, transform: [] },
  badges: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassLine, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { color: colors.ink2, ...kitText(12.5, "400", 1.6) },
  pillInfo: { color: colors.ink4 },
  why1: { maxWidth: 460, marginTop: 12, backgroundColor: colors.glass, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  why1Text: { color: colors.ink2, ...kitText(13, "400", 1.6) },

  route: { flexDirection: "row", marginTop: 30, marginBottom: 26 },
  routeLine: { position: "absolute", top: 15, height: 2, flexDirection: "row", opacity: 0.5 },
  routeHalf: { flex: 1, height: 2 },
  st: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  nodeBox: { width: 32, height: 32, marginBottom: 10, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: colors.plum700, opacity: 0.14 },
  nodeRing: { position: "absolute", width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.plum300 },
  nodeRingCur: { borderColor: colors.ink, backgroundColor: colors.ink },
  node: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  nodeCur: { backgroundColor: colors.ink },
  nodeText: { color: colors.plum700, ...num(13, "600", 1.6) },
  nodeTextCur: { color: colors.surface },
  stB: { color: colors.ink2, textAlign: "center", ...kitText(12.5, "500", 1.6) },
  stBCur: { color: colors.ink, fontWeight: "700" },

  section: { marginBottom: 42 },
  sh: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 14 },
  shTight: { marginBottom: 4 },
  shLadder: { marginTop: 18, marginBottom: 4 },
  h2: { color: colors.ink, ...kitText(18, "600", 1.6) },
  h2Sm: { color: colors.ink, ...kitText(15, "600", 1.6) },
  shSpan: { flex: 1, minWidth: 0, color: colors.ink3, ...kitText(12.5, "400", 1.6) },
  guide: { color: colors.ink2, ...kitText(13.5, "400", 1.7), marginTop: -4, marginHorizontal: 2, marginBottom: 12 },
  seats: { backgroundColor: colors.surface, borderRadius: 20, paddingTop: 16, paddingBottom: 6, ...shadow(colors.ink, 0.04) },
  stg: { gap: 2, paddingTop: 14, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.surface2 },
  stgAfter: { marginTop: 4 },
  stgB: { color: colors.ink, ...kitText(13, "700", 1.6) },
  stgSpan: { color: colors.ink3, ...kitText(12, "400", 1.6) },
  adj: { paddingVertical: 10, paddingHorizontal: 14, gap: 8 },
  adjLine: { borderTopWidth: 1, borderTopColor: colors.line },
  adjOff: { opacity: 0.38 },
  adjHead: { flexDirection: "row", alignItems: "center", gap: 14 },
  em: { width: 36, height: 36, marginRight: -4, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  emText: { fontSize: 17, lineHeight: 27 },
  nm: { flex: 1, minWidth: 0 },
  nmText: { color: colors.ink, ...kitText(14.5, "600", 1.3) },
  nmOff: { textDecorationLine: "line-through" },
  nmSmall: { color: colors.ink3, ...kitText(11.5, "400", 1.3) },
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
  stpSmall: { color: colors.ink3, marginLeft: 1, ...kitText(10.5, "500", 1.6) },
  tot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line },
  totText: { color: colors.ink3, ...kitText(12.5, "400", 1.6) },
  totB: { color: colors.ink, ...num(15, "600", 1.6) },
  totBad: { color: colors.coralText },

  evi: { backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 22, ...shadow(colors.ink, 0.04) },
  ord: { marginBottom: 4 },
  li: { flexDirection: "row", paddingLeft: 2 },
  liNum: { width: 18, color: colors.ink2, ...kitText(13.5, "400", 1.7) },
  liText: { flex: 1, minWidth: 0, color: colors.ink2, ...kitText(13.5, "400", 1.7) },
  funnel: { color: colors.ink3, ...kitText(12, "400", 1.6), marginBottom: 14 },
  ladder: { gap: 8, marginBottom: 6 },
  lr: { flexDirection: "row", alignItems: "center", gap: 12 },
  lrLabel: { width: 96, color: colors.ink, ...kitText(13.5, "400", 1.6) },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  lrV: { width: 50, textAlign: "right", ...kitText(12, "400", 1.6) },
  nums: { marginTop: 22, marginHorizontal: -22, borderTopWidth: 1, borderTopColor: colors.line },
  nb: { paddingVertical: 12, paddingHorizontal: 22 },
  nbLine: { borderTopWidth: 1, borderTopColor: colors.line },
  nbB: { color: colors.ink, ...num(26, "600", 1.15), letterSpacing: -0.26 },
  nbSpan: { color: colors.ink3, ...kitText(12, "400", 1.6) },
  risks: { marginTop: 18 },
  risk: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 10 },
  riskTag: { borderRadius: 6, paddingVertical: 1, paddingHorizontal: 7, marginTop: 2 },
  riskTagRisk: { backgroundColor: colors.coralSoft },
  riskTagUnverified: { backgroundColor: colors.macApricot },
  riskTagText: { ...kitText(11, "400", 1.6) },
  riskTagTextRisk: { color: colors.coralText },
  riskTagTextUnverified: { color: colors.macApricotText },
  riskText: { flex: 1, minWidth: 0, color: colors.ink2, ...kitText(13, "400", 1.6) },
  srcl: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
  srclLi: { flexDirection: "row", alignItems: "center", gap: 8 },
  srclText: { flex: 1, minWidth: 0, color: colors.ink2, ...kitText(12.5, "400", 1.7) },
  srclA: { color: colors.plum700, ...kitText(12, "400", 1.7) },
  toggle: { marginTop: 14, alignSelf: "flex-start" },
  toggleText: { color: colors.plum700, ...kitText(13, "500", 1.6) },

  dock: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 18 },
  dockFade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.92 },
  dockIn: { flexDirection: "row", alignItems: "center", gap: 10 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, backgroundColor: colors.surface, alignItems: "center", ...shadow(colors.ink, 0.06) },
  btnPri: { backgroundColor: colors.ink, paddingHorizontal: 28 },
  btnText: { color: colors.ink, ...kitText(14, "400", 1.6) },
  btnTextPri: { color: colors.surface },
}));
