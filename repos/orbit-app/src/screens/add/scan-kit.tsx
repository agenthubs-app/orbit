// R12 名刺（App）像素返工：b11 A1 ③④⑤ / b9 ① 画板里名刺批次页用到的 kit 类，按原数值翻成 RN 小件。
// 规则同 plan-kit：字号 / 字重 / 行高 / 间距 / 圆角照抄，颜色只用 token；通用组件仍用 components/ui。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { ContactDensityLevel } from "../../api/compute/contact-density";
import { Icon, UiText } from "../../components/ui";
import { useReducedMotion } from "../../components/ui/motion";
import Svg, { Defs, Rect, Stop } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { LinearGradient } from "../plan/plan-svg";

/** .tp：名刺缩略（宽 44、91:55、纸色 + 两条墨线、圆角 4）；.tp.ng 外加 2px 珊瑚色描边（偏 1）。 */
export function KitThumb({ failed = false }: { failed?: boolean }) {
  const { styles } = useStyles();
  return (
    <View style={failed ? styles.tpNgRing : styles.tpRing}>
      <View style={styles.tp}>
        <View style={styles.tpLine1} />
        <View style={styles.tpLine2} />
      </View>
    </View>
  );
}

/** .okd：20 圆、ok 底、✓ 12。 */
export function KitOk() {
  const { colors, styles } = useStyles();
  return <View style={styles.okd}><Icon name="check" size={16} color={colors.bg} /></View>;
}

/** .ngd：20 圆、珊瑚底、白「!」900 12px。 */
export function KitNg() {
  const { styles } = useStyles();
  return <View style={styles.ngd}><UiText style={styles.ngdText}>!</UiText></View>;
}

/** .spin：14 圆，2px surface-3 圈、上沿 plum-700，0.9s 一圈；「視差効果を減らす」时不转。 */
export function KitSpin({ tone = "plum" }: { tone?: "plum" | "muted" }) {
  const { colors, styles } = useStyles();
  const reduce = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(turn, { duration: 900, easing: Easing.linear, toValue: 1, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={[styles.spin, { borderTopColor: tone === "plum" ? colors.plum700 : colors.ink3 }, { transform: [{ rotate }] }]} />;
}

/** .bar：高 6、surface-3 底；填充 90° plum-300 → plum-700，右端 14 圆钮（surface 底、3px plum-700 圈）。 */
export function KitBar({ percent, style }: { percent: number; style?: StyleProp<ViewStyle> }) {
  const { colors, styles } = useStyles();
  const [width, setWidth] = useState(0);
  const fill = Math.max(0, Math.min(100, percent)) / 100 * width;
  return (
    <View style={[styles.bar, style]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width ? (
        <>
          <View style={[styles.barFill, { width: fill }]}>
            <Svg width={Math.max(fill, 1)} height={6}>
              <Defs>
                <LinearGradient id="scan-bar" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset={0} stopColor={colors.plum300} />
                  <Stop offset={1} stopColor={colors.plum700} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={Math.max(fill, 1)} height={6} rx={3} fill="url(#scan-bar)" />
            </Svg>
          </View>
          <View style={[styles.knob, { left: fill - 7 }]} />
        </>
      ) : null}
    </View>
  );
}

/** .prow2：缩略 + 名字 / 副文（一行省略）+ 右侧标记；相邻行之间 1px line。 */
export function KitCardRow({ title, sub, trailing, failed = false, first = false, testID }: { title: string; sub: string; trailing?: ReactNode; failed?: boolean; first?: boolean; testID?: string }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.prow, !first && styles.prowLine]} testID={testID}>
      <KitThumb failed={failed} />
      <View style={styles.meta}>
        <UiText numberOfLines={1} style={styles.metaTitle}>{title}</UiText>
        <UiText numberOfLines={1} style={styles.metaSub}>{sub}</UiText>
      </View>
      {trailing}
    </View>
  );
}

/**
 * .phone .foot：贴底的按钮区（上方 26% 渐隐到底色，padding 22 / 18 / 30，按钮间距 8）。
 * 放在 AppScreen 外面（不随内容滚动）；内容区底部要留 KIT_FOOT_SPACE。
 */
export function KitFoot({ children }: { children: ReactNode }) {
  const { colors, styles } = useStyles();
  const [height, setHeight] = useState(0);
  return (
    <View pointerEvents="box-none" style={styles.foot} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      {height ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={height}>
          <Defs>
            <LinearGradient id="scan-foot" x1="0" y1="0" x2="0" y2="1">
              <Stop offset={0} stopColor={colors.bg} stopOpacity={0} />
              <Stop offset={0.26} stopColor={colors.bg} stopOpacity={1} />
              <Stop offset={1} stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height={height} fill="url(#scan-foot)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
/** kit `.scroll` padding-bottom 130：内容不被 KitFoot 盖住。 */
export const KIT_FOOT_SPACE = 130;

/** .bignum3：三格（surface-2、圆角 16、padding 10 / 12），数字 26 / 800 / 行高 1.15，下方 .lbl。 */
export function KitBigNums({ items }: { items: readonly { key: string; value: number; label: string; accessibilityLabel: string; tone?: "coral" }[] }) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.big3}>
      {items.map((item) => (
        <View key={item.key} accessible accessibilityLabel={item.accessibilityLabel} style={styles.bigCell} testID={`add-tile-${item.key}`}>
          <UiText style={[styles.bigNum, item.tone === "coral" ? { color: colors.coral } : null]}>{item.value}</UiText>
          <UiText numberOfLines={1} style={[styles.lbl, styles.bigLbl]}>{item.label}</UiText>
        </View>
      ))}
    </View>
  );
}

/** .stack3（高 12、圆角 6、段间 2）+ 图例行（●●○ 点 + 「N人」，间距 12，11px ink-3）。 */
export function KitDensityStack({ counts, accessibilityLabel }: { counts: Readonly<Record<ContactDensityLevel, number>>; accessibilityLabel: string }) {
  const { colors, styles } = useStyles();
  const tone: Record<ContactDensityLevel, string> = { 1: colors.plum300, 2: colors.plum500, 3: colors.plum700 };
  const levels = ([1, 2, 3] as const).filter((level) => counts[level] > 0);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID="add-done-density">
      <View style={styles.stack3}>
        {levels.map((level) => <View key={level} style={{ backgroundColor: tone[level], flex: counts[level] }} />)}
      </View>
      <View style={styles.legend}>
        {([1, 2, 3] as const).map((level) => (
          <View key={level} style={styles.legendItem}>
            <View style={styles.dn}>{[1, 2, 3].map((dot) => <View key={dot} style={[styles.dnDot, { backgroundColor: dot <= level ? colors.plum700 : colors.surface3 }]} />)}</View>
            <UiText style={styles.legendText}>{`${counts[level]}人`}</UiText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** .err-card（01-system ⑧，b12 N11）：54 圆角 18 的珊瑚色图标块、16 号标题、.sub、竖排按钮（间距 8）。 */
export function KitErrCard({ title, sub, children, testID }: { title: string; sub: string; children: ReactNode; testID?: string }) {
  const { colors, styles } = useStyles();
  return (
    <View accessibilityRole="alert" style={styles.err} testID={testID}>
      <View style={styles.errIc}><Icon name="alert" size={24} color={colors.coral} /></View>
      <UiText accessibilityRole="header" style={styles.errTitle}>{title}</UiText>
      <UiText style={styles.errSub}>{sub}</UiText>
      <View style={styles.errActs}>{children}</View>
    </View>
  );
}

export const useScanKitStyles = () => useStyles();

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  tpRing: { padding: 0 },
  tpNgRing: { margin: -3, padding: 1, borderWidth: 2, borderColor: colors.coral, borderRadius: 7 },
  tp: { width: 44, height: 44 * 55 / 91, borderRadius: 4, backgroundColor: colors.paper, shadowColor: "#0F0E12", shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 2 } },
  tpLine1: { position: "absolute", left: 6, top: 6, width: 22, height: 3, borderRadius: 2, backgroundColor: colors.paperInk2, opacity: 0.5 },
  tpLine2: { position: "absolute", left: 6, bottom: 7, width: 30, height: 5, borderRadius: 2, backgroundColor: colors.paperInk, opacity: 0.7 },
  okd: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ok, alignItems: "center", justifyContent: "center", transform: [{ scale: 1 }] },
  ngd: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  ngdText: { fontSize: 12, fontWeight: "900", lineHeight: 18, color: colors.bg },
  spin: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.surface3 },
  bar: { height: 6, borderRadius: 6, backgroundColor: colors.surface3, marginTop: 8, marginBottom: 4 },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 6, overflow: "hidden" },
  knob: { position: "absolute", top: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 3, borderColor: colors.plum700 },
  prow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  prowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  meta: { flex: 1, minWidth: 0 },
  metaTitle: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  metaSub: { fontSize: 11.5, fontWeight: "400", lineHeight: 17.25, color: colors.ink3 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  big3: { flexDirection: "row", gap: 8 },
  bigCell: { flex: 1, minWidth: 0, backgroundColor: colors.surface2, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  bigNum: { fontSize: 26, fontWeight: "800", lineHeight: 29.9, color: colors.ink, fontVariant: ["tabular-nums"] },
  lbl: { fontSize: 11.5, fontWeight: "500", lineHeight: 17.25, color: colors.ink3 },
  // .bignum3 的 span.lbl 是行内元素：行盒取父级 14px × 1.5 = 21。
  bigLbl: { lineHeight: 21 },
  stack3: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2, marginTop: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  dn: { flexDirection: "row", gap: 3, alignItems: "center" },
  dnDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, lineHeight: 16.5, color: colors.ink3 },
  err: { marginTop: 8, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 22, alignItems: "center" },
  errIc: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.coralSoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  errTitle: { fontSize: 16, fontWeight: "700", lineHeight: 24, color: colors.ink, textAlign: "center" },
  errSub: { marginTop: 6, marginBottom: 16, fontSize: 12.5, lineHeight: 20.6, color: colors.ink2, textAlign: "center" },
  errActs: { alignSelf: "stretch", gap: 8 },
}));
