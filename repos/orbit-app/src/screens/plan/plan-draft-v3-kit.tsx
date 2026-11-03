// R37b: the pieces the v3 draft page (R36b) and the v3 plan home share, lifted out of PlanDraftV3 unchanged (R36b
// REPORT「给 R37b」): the .top row, section heads (.sh / h2 / span / .guide), the source badge (.src), the .route
// (nodes + line; `current` = the stage in progress) and the evidence card (.evi: .ord / ladder / .more / .toggle).
// Numbers are the design's `.m` CSS values (plan-draft-v5-proposal.html v16, body.m, 390 wide).
import { useState } from "react";
import { Linking, Platform, StyleSheet, View, type TextStyle, type ViewStyle } from "react-native";

import type { PlanCitationView, PlanComparisonVerdict, PlanV2Content, PlanV2Step } from "../../api/contract/plan-v2";
import { UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { kitText } from "./plan-kit";
import { sourceStale, sourceTitle, sourceUrl } from "./plan-draft-v3-model";

export const V3_NUM_FONT = Platform.OS === "ios" ? { fontFamily: "ui-rounded" } : null;
// react-native-web (tests / sanity shots) lays a View inside Text out as a block; native iOS keeps it inline.
export const V3_INLINE = Platform.OS === "web" ? ({ display: "inline-flex", verticalAlign: "middle" } as unknown as ViewStyle) : null;

const CMP_KEYS: Record<PlanComparisonVerdict, "plan.v3.cmpPreferred" | "plan.v3.cmpPossible" | "plan.v3.cmpNotRecommended"> = {
  not_recommended: "plan.v3.cmpNotRecommended",
  possible: "plan.v3.cmpPossible",
  preferred: "plan.v3.cmpPreferred",
};

export const v3Shadow = (color: string, opacity: number): ViewStyle => ({ shadowColor: color, shadowOffset: { height: 1, width: 0 }, shadowOpacity: opacity, shadowRadius: 1 });
export const v3Num = (size: number, weight: TextStyle["fontWeight"], lineHeight = 1.6): TextStyle => ({ ...kitText(size, weight, lineHeight), ...V3_NUM_FONT });

/** The .src number badge (inline in text). */
export function SrcBadge({ n, inList = false }: { n: number; inList?: boolean }) {
  const { styles } = useV3KitStyles();
  return <View style={[styles.src, inList && styles.srcInList]}><UiText style={styles.srcText}>{String(n)}</UiText></View>;
}

/** .route: N stages, the line from the first node's centre to the last's (left/right = 1/2N); `current` gets the dark node + halo. */
export function V3Route({ steps, current = 0, testID }: { steps: readonly PlanV2Step[]; current?: number; testID?: string }) {
  const { styles, colors } = useV3KitStyles();
  if (!steps.length) return null;
  return (
    <View style={styles.route} testID={testID}>
      <View pointerEvents="none" style={[styles.routeLine, { left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }]}>
        <View style={[styles.routeHalf, { backgroundColor: colors.plum700 }]} />
        <View style={[styles.routeHalf, { backgroundColor: colors.plum300 }]} />
      </View>
      {steps.map((step, index) => {
        const cur = index === current;
        return (
          <View key={step.key} style={styles.st} accessibilityState={cur ? { selected: true } : undefined}>
            <View style={styles.nodeBox}>
              {cur ? <View style={styles.halo} /> : null}
              <View style={[styles.nodeRing, cur && styles.nodeRingCur]} />
              <View style={[styles.node, cur && styles.nodeCur]}><UiText style={[styles.nodeText, cur && styles.nodeTextCur]}>{String(index + 1)}</UiText></View>
            </View>
            <UiText style={[styles.stB, cur && styles.stBCur]}>{step.title}</UiText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 「为什么这么排」: the section head + the .evi card (order reasons / ladder / folded key numbers, risks, sources).
 * Renders nothing without order reasons and a comparison. `citations` titles the landscape sources (the draft carries
 * them; the plan detail does not, so the home falls back to the library id). `onClose` adds the home's 「閉じる ▴」.
 */
export function V3Evidence({ content, citations, now, testID = "draft-v3-evidence", onClose }: { content: PlanV2Content; citations: readonly PlanCitationView[]; now: Date; testID?: string; onClose?: () => void }) {
  const { styles, colors } = useV3KitStyles();
  const { t } = useOrbitLocale();
  const [full, setFull] = useState(false);
  const sources = content.sources ?? [];
  const fillColor = (verdict: PlanComparisonVerdict) => verdict === "preferred" ? colors.chartPreferred : verdict === "possible" ? colors.chartPossible : colors.chartNot;
  const vColor = (verdict: PlanComparisonVerdict) => verdict === "preferred" ? colors.okText : verdict === "possible" ? colors.macApricotText : colors.coralText;
  const badges = (ids: readonly string[]) => ids.map((id) => { const n = sources.findIndex((source) => source.id === id) + 1; return n > 0 ? <UiText key={id}>{" "}<SrcBadge n={n} /></UiText> : null; });
  const moreParts = [
    content.keyNumbers?.length ? t("plan.v3.moreNums", { count: content.keyNumbers.length }) : null,
    content.risks?.length ? t("plan.v3.moreRisks", { count: content.risks.length }) : null,
    sources.length ? t("plan.v3.moreSources", { count: sources.length }) : null,
  ].filter((part): part is string => Boolean(part));
  const moreLabel = moreParts.length ? `${t("plan.v3.morePre")}${moreParts.length > 1 ? `${moreParts.slice(0, -1).join(t("plan.v3.moreJoin"))}${t("plan.v3.moreLast")}${moreParts[moreParts.length - 1]}` : moreParts[0]}${t("plan.v3.morePost")}` : null;
  if (!content.orderReasons?.length && !content.comparison) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sh}>
        <UiText accessibilityRole="header" style={styles.h2}>{t("plan.v3.whyTitle")}</UiText>
        <UiText style={styles.shSpan}>{t("plan.v3.whySub", { count: sources.length })}</UiText>
      </View>
      <View style={styles.evi} testID={testID}>
        {content.orderReasons?.length ? (
          <>
            <View style={[styles.sh, styles.shTight]}><UiText style={styles.h2Sm}>{t("plan.v3.orderTitle")}</UiText></View>
            <View style={styles.ord}>
              {content.orderReasons.map((line, index) => (
                <View key={index} style={styles.li}>
                  <UiText style={styles.liNum}>{`${index + 1}.`}</UiText>
                  <UiText style={styles.liText}>{line.text}{badges(line.sourceIds)}</UiText>
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
                  <UiText style={styles.lrLabel}>{row.label}{badges(row.sourceIds.slice(0, 1))}</UiText>
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
                    <UiText style={styles.nbSpan}>{number.label}{badges(number.sourceIds)}</UiText>
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
                  const url = sourceUrl(source, citations);
                  return (
                    <View key={source.id} style={styles.srclLi}>
                      <SrcBadge n={index + 1} inList />
                      <UiText style={styles.srclText}>{sourceTitle(source, citations)}{sourceStale(source, now) ? <UiText>{" "}<View style={styles.chg}><UiText style={styles.chgText}>{t("plan.v3.sourceStale")}</UiText></View></UiText> : null}</UiText>
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
      {onClose ? (
        <UiPressable accessibilityRole="button" hitSlop={6} onPress={onClose} style={[styles.toggle, styles.close]} testID="plan-home-evidence-close">
          <UiText style={styles.toggleText}>{t("plan.home.evClose")}</UiText>
        </UiPressable>
      ) : null}
    </View>
  );
}

export const useV3KitStyles = createThemedStyles((colors) => StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 26, minHeight: 34.8 },
  // CSS flex items shrink by default (RN: 0) — with the longer Japanese label the pill wraps instead of running off screen (Web same).
  crumb: { flexShrink: 1, color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },
  ai: { flexShrink: 1, marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.glass, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  aiOff: { opacity: 0.45 },
  aiText: { flexShrink: 1, color: colors.plum700, ...kitText(13, "400", 1.6) },

  src: { ...V3_INLINE, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.plum100, paddingHorizontal: 4, marginLeft: 3, alignItems: "center", justifyContent: "center", transform: [{ translateY: -1 }] },
  srcText: { color: colors.macLavText, ...v3Num(10, "600", 1.6) },
  srcInList: { marginLeft: 0, transform: [] },
  chg: { ...V3_INLINE, backgroundColor: colors.macApricot, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, marginLeft: 6, transform: [{ translateY: -1 }] },
  chgText: { color: colors.macApricotText, ...kitText(11, "400", 1.6) },

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
  nodeText: { color: colors.plum700, ...v3Num(13, "600", 1.6) },
  nodeTextCur: { color: colors.surface },
  stB: { color: colors.ink2, textAlign: "center", ...kitText(12.5, "500", 1.6) },
  stBCur: { color: colors.ink, fontWeight: "700" },

  section: { marginBottom: 42 },
  sh: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 14 },
  shTight: { marginBottom: 4 },
  shLadder: { marginTop: 18, marginBottom: 4 },
  h2: { color: colors.ink, ...kitText(18, "600", 1.6) },
  h2Sm: { color: colors.ink, ...kitText(15, "600", 1.6) },
  shSpan: { flex: 1, minWidth: 0, color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },
  guide: { color: colors.ink2, ...kitText(13.5, "400", 1.7), marginTop: -4, marginHorizontal: 2, marginBottom: 12 },

  evi: { backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 22, ...v3Shadow(colors.ink, 0.04) },
  ord: { marginBottom: 4 },
  li: { flexDirection: "row", paddingLeft: 2 },
  liNum: { width: 18, color: colors.ink2, ...kitText(13.5, "400", 1.7) },
  liText: { flex: 1, minWidth: 0, color: colors.ink2, ...kitText(13.5, "400", 1.7) },
  funnel: { color: colors.ink3Text, ...kitText(12, "400", 1.6), marginBottom: 14 },
  ladder: { gap: 8, marginBottom: 6 },
  lr: { flexDirection: "row", alignItems: "center", gap: 12 },
  lrLabel: { width: 96, color: colors.ink, ...kitText(13.5, "400", 1.6) },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  lrV: { width: 50, textAlign: "right", ...kitText(12, "400", 1.6) },
  nums: { marginTop: 22, marginHorizontal: -22, borderTopWidth: 1, borderTopColor: colors.line },
  nb: { paddingVertical: 12, paddingHorizontal: 22 },
  nbLine: { borderTopWidth: 1, borderTopColor: colors.line },
  nbB: { color: colors.ink, ...v3Num(26, "600", 1.15), letterSpacing: -0.26 },
  nbSpan: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
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
  close: { marginTop: 10 },
}));
