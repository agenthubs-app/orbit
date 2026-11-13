// 申込の推移（App；概要とレポート共用）。Web `orbit-2026/host/SignupTrend.tsx`（2026-11-13 重做）的移植，规则相同：
// - 柱子铺满整个宽度（服务端已裁掉结束活动开头没人报名的日子），每根柱宽上限 40；
// - 下方日期轴（M/D，柱多时隔几天标一个，最后一天总是标出）；
// - 左上角合计与最多的一天；只在峰值柱上写人数；点按某根柱子在柱上显示「M/D：N名」（触屏代替悬停，再按一次收起）；
// - 0 人的日子画一条 2 高的底线，日期仍在；
// - 有告知等标注时，标注单独放在柱子上方一行；
// - 读屏：每根柱子是一个按钮，标签就是「M/D：N名」，逐日读出。
// 与 Web 的一处不同：最后一天和前一个刻度挨着时（手机上会叠字），去掉前一个刻度，最后一天照旧标出。
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { UiPressable, UiText } from "../../components/ui";
import Svg, { Path } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import type { HostT } from "./host-model";
import { numFont, useHostStyles } from "./host-ui";

export type SignupTrendMark = { index: number; label: string };

/** trend[index] 那一天的「M/D」（startDate = 东京日 YYYY-MM-DD；旧服务端没有就返回空）。 */
export function trendDayLabel(startDate: string | undefined, index: number): string {
  if (!startDate) return "";
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d + index));
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export interface SignupTrendModel {
  total: number;
  max: number;
  /** 峰值柱的下标（全为 0 时 -1）。 */
  peak: number;
  /** 每根柱的日期（M/D）。 */
  labels: string[];
  /** 轴上实际写出的日期（不标的为空）。 */
  axis: string[];
}

export function signupTrendModel(values: readonly number[], startDate: string | undefined): SignupTrendModel {
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(0, ...values);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const step = Math.max(1, Math.ceil(values.length / 7));
  const labels = values.map((_, index) => trendDayLabel(startDate, index));
  const last = labels.length - 1;
  const axis = labels.map((label, index) => {
    if (index === last) return label;
    if (index % step !== 0) return "";
    // 最后一天总要标；离它不到一个间隔的刻度让给它。
    return step > 1 && last - index < step ? "" : label;
  });
  return { axis, labels, max, peak, total };
}

/** 柱区里给顶上人数留的高度（同 Web：柱高 = 值 / 最大 ×（高 − 22））。 */
const VALUE_ROOM = 22;

export function SignupTrend({ values, startDate, t, height = 120, marks }: { values: readonly number[]; startDate?: string | undefined; t: HostT; height?: number; marks?: readonly SignupTrendMark[] | undefined }) {
  const { styles: h } = useHostStyles();
  const { styles, colors } = useTrendStyles();
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const model = signupTrendModel(values, startDate);
  const markOf = new Map((marks ?? []).map((mark) => [mark.index, mark.label]));
  const shown = active ?? model.peak;
  const third = values.length / 3;
  // 靠左的柱提示往右展开、靠右的往左展开，不会超出卡片。
  const align = (index: number) => (index < third ? "flex-start" : index >= values.length - third ? "flex-end" : "center") as "flex-start" | "flex-end" | "center";
  const textAlign = (index: number) => (index < third ? "left" : index >= values.length - third ? "right" : "center") as "left" | "right" | "center";
  return (
    <View style={styles.wrap} testID="host-signup-trend">
      <View style={styles.summary}>
        <UiText style={h.lbl}><UiText style={styles.total}>{model.total}</UiText>{t("unitPeople")}</UiText>
        <UiText style={h.lbl}>{model.peak >= 0 ? t("trendPeak", { d: model.labels[model.peak] || "", n: model.max }) : t("trendNone")}</UiText>
      </View>
      {markOf.size ? (
        <View style={styles.cols} testID="host-signup-trend-marks">
          {values.map((_, index) => (
            <View key={index} style={styles.col}>
              {markOf.has(index) ? (
                <>
                  <UiText style={styles.mark} numberOfLines={1}>{markOf.get(index)}</UiText>
                  <View style={[styles.tick, { backgroundColor: colors.ink3 }]} />
                </>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.plot, { height }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={1} style={[styles.grid, { top: VALUE_ROOM }]} pointerEvents="none">
            <Path d={`M0 0.5 H${width}`} stroke={colors.line} strokeWidth={1} strokeDasharray="3 3" />
          </Svg>
        ) : null}
        <View style={[styles.cols, styles.fill]}>
          {values.map((value, index) => {
            const barHeight = model.max > 0 ? Math.round((value / model.max) * (height - VALUE_ROOM)) : 0;
            const tip = t("trendTip", { d: model.labels[index] ?? "", n: value });
            const on = index === active;
            // RN 按兄弟顺序叠放：写着人数 / 提示的那一列要压在后面的柱子上面，否则提示被右边更高的柱子盖住（Web 的行内文字天然在柱子之上）。
            return (
              <UiPressable key={index} accessibilityRole="button" accessibilityLabel={tip} accessibilityState={{ selected: on }} onPress={() => setActive((current) => (current === index ? null : index))} style={[styles.colBar, index === shown ? styles.front : null]} testID={`host-trend-day-${index}`}>
                {index === shown && value > 0 ? (
                  <View style={[styles.valueBox, { alignItems: align(index) }]}>
                    <UiText style={[styles.value, { textAlign: textAlign(index) }]} numberOfLines={1}>{on ? tip : String(value)}</UiText>
                  </View>
                ) : null}
                <View style={[styles.bar, value === 0 ? styles.zero : { backgroundColor: on ? colors.plum500 : index === model.peak ? colors.plum700 : colors.plum300, height: Math.max(4, barHeight) }]} />
              </UiPressable>
            );
          })}
        </View>
      </View>
      <View style={styles.cols} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {model.axis.map((label, index) => (
          <View key={index} style={styles.col}><UiText style={styles.axis} numberOfLines={1}>{label}</UiText></View>
        ))}
      </View>
    </View>
  );
}

// Web signup-trend.module.css 的数值：wrap gap 10 · 列 gap 6 · 柱宽上限 40、顶角 r-dot · 底线 2 · 轴 caption ink-3。
const useTrendStyles = createThemedStyles((colors) => StyleSheet.create({
  wrap: { gap: 10 },
  summary: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  total: { color: colors.ink, fontFamily: numFont, fontSize: 22, fontWeight: "800", lineHeight: 26 },
  cols: { flexDirection: "row", gap: 6 },
  col: { alignItems: "center", flex: 1, minWidth: 0 },
  fill: { flex: 1 },
  plot: { borderBottomColor: colors.line, borderBottomWidth: 1 },
  grid: { left: 0, position: "absolute", right: 0 },
  colBar: { alignItems: "center", flex: 1, justifyContent: "flex-end", minWidth: 0 },
  front: { zIndex: 1 },
  valueBox: { alignSelf: "stretch", marginBottom: 4 },
  value: { color: colors.ink, fontFamily: numFont, fontSize: 13, fontWeight: "700", lineHeight: 15, width: 120 },
  bar: { borderTopLeftRadius: radius.dot, borderTopRightRadius: radius.dot, maxWidth: 40, width: "100%" },
  zero: { backgroundColor: colors.line, borderRadius: radius.none, height: 2 },
  mark: { color: colors.ink2, fontSize: 12, fontWeight: "700", lineHeight: 16, textAlign: "center", width: 120 },
  tick: { height: 6, marginTop: 2, width: 1 },
  axis: { color: colors.ink3, fontFamily: numFont, fontSize: 12, lineHeight: 16, textAlign: "center", width: 48 },
}));
