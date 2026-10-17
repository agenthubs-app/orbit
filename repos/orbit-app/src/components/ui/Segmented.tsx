import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { shadows } from "../../design/tokens";
import { cjkLift } from "./cjk-lift";
import { useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

export type Segment<Key extends string> = { key: Key; label: string };

// kit .seg (ui.css:34-36): a surface-2 pill (padding 3, gap 2); options padding 6 / 13, 12 / 600 at line-height 1.5
// (30 tall); the selected one sits on surface with a 1px lift and only changes colour (weight stays 600).
// Default: stretched to the row with equal options (R26 boards). `inline` = the kit's own inline-flex pill sized to its
// labels (R15 下書き sheet …). Touch target: 30 + 7 above and below = 44, never sideways (neighbours must not overlap).
// It replaces the hand-written accessibilityRole="tablist" rows in old screens.
export const SEGMENT_HIT_SLOP = { top: 7, bottom: 7 } as const;
export function Segmented<Key extends string>({ segments, value, onChange, accessibilityLabel, variant = "seg", inline = false }: { segments: Segment<Key>[]; value: Key; onChange: (key: Key) => void; accessibilityLabel: string; variant?: "seg" | "tseg"; inline?: boolean }) {
  const { styles } = useStyles();
  const task = variant === "tseg";
  const hug = inline && !task;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.track, hug && styles.trackInline]}>
      {segments.map((segment) => {
        const selected = segment.key === value;
        return (
          <UiPressable key={segment.key} accessibilityRole="tab" accessibilityLabel={segment.label} accessibilityState={{ selected }} aria-selected={selected} hitSlop={SEGMENT_HIT_SLOP} onPress={() => onChange(segment.key)} pressedScale={0.97} style={[styles.option, hug && styles.optionInline, task && styles.taskOption, selected && styles.selected]}>
            {/* Like UISegmentedControl: equal fixed widths, so text size is capped (1.4×) and shrinks to fit; the full label stays in accessibilityLabel. */}
            <UiText adjustsFontSizeToFit={!hug} maxFontSizeMultiplier={1.4} minimumFontScale={0.75} numberOfLines={1} style={[styles.label, task && styles.taskLabel, task && cjkLift(segment.label, -1, -1.5), selected && styles.labelSelected]}>{segment.label}</UiText>
          </UiPressable>
        );
      })}
    </View>
  );
}

// kit .tseg (Task 四段) + .tswipe page dots: equal segments over pages the user can
// also swipe between. Segment positions are frozen (RD-20); the parent owns which
// page is shown — a value set from outside (a link, restored state) moves the pager.
export function SwipeSegments<Key extends string>({ segments, value, onChange, accessibilityLabel, renderPage, variant = "tseg", dots = true }: {
  segments: Segment<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  accessibilityLabel: string;
  renderPage: (key: Key) => ReactNode;
  /** R26：イベント页用 kit `.seg`（app.html #13–#15），下方无页点、只留 14 的间距。默认同 Task（tseg + 页点）。 */
  variant?: "seg" | "tseg";
  dots?: boolean;
}) {
  const { styles } = useStyles();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(width);
  // Each page gets the pager's height, so a page's own vertical scroll view is bounded
  // (native stretches children of a horizontal scroll view; react-native-web does not).
  const [pageHeight, setPageHeight] = useState<number | undefined>(undefined);
  const reduced = useReducedMotion();
  const index = Math.max(0, segments.findIndex((segment) => segment.key === value));
  const shown = useRef(index);
  const positioned = useRef(false);
  // Only the first position goes through contentOffset (iOS): a changing contentOffset
  // prop fights the animated scrollTo of a tap and lands on the wrong page.
  const initialOffset = useRef({ x: index * pageWidth, y: 0 }).current;
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    pager.current?.scrollTo({ x: index * pageWidth, animated: false });
  }, [index, pageWidth]);
  const select = (key: Key) => {
    const next = segments.findIndex((segment) => segment.key === key);
    shown.current = next;
    onChange(key);
    pager.current?.scrollTo({ x: next * pageWidth, animated: !reduced });
  };
  return (
    <View style={{ flex: 1 }} onLayout={(event) => {
      const next = event.nativeEvent.layout.width || width;
      // contentOffset is iOS-only: place the first page (and re-place after a resize) by hand.
      if (next !== pageWidth || !positioned.current) {
        positioned.current = true;
        if (next !== pageWidth) setPageWidth(next);
        pager.current?.scrollTo({ x: shown.current * next, animated: false });
      }
    }}>
      <View style={[styles.segmentsInset, !dots && styles.segmentsGap]}><Segmented variant={variant} segments={segments} value={value} onChange={select} accessibilityLabel={accessibilityLabel} /></View>
      {dots ? (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.dots}>
          {segments.map((segment) => <View key={segment.key} style={[styles.dot, segment.key === value && styles.dotOn]} />)}
        </View>
      ) : null}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        contentOffset={initialOffset}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height || undefined)}
        onMomentumScrollEnd={(event) => {
          const landed = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          const segment = segments[landed];
          shown.current = landed;
          if (segment && segment.key !== value) onChange(segment.key);
        }}
      >
        {segments.map((segment) => <View key={segment.key} style={{ width: pageWidth, height: pageHeight }}>{renderPage(segment.key)}</View>)}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  track: { flexDirection: "row", padding: 3, gap: 2, borderRadius: 999, backgroundColor: colors.surface2, alignSelf: "stretch" },
  trackInline: { alignSelf: "flex-start" },
  option: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 13 },
  optionInline: { flex: 0, flexGrow: 0, flexShrink: 0 },
  // kit .seg button.on / .tseg button.on: surface + 0 1px 2px.
  selected: { backgroundColor: colors.surface, ...shadows.segment },
  label: { color: colors.ink2, fontSize: 12, fontWeight: "600", lineHeight: 18, textAlign: "center" },
  labelSelected: { color: colors.ink },
  // kit .tseg (ui.css:722): buttons padding 7 0, 12.5/700 at line-height 1.5; the selected one lifts by 0 1px 2px.
  taskOption: { paddingVertical: 7, paddingHorizontal: 0 },
  taskLabel: { fontSize: 12.5, fontWeight: "700", lineHeight: 18.75 },
  segmentsInset: { paddingHorizontal: 18 },
  segmentsGap: { marginBottom: 14 },
  // kit .tswipe: margin 8 0 12
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8, marginBottom: 12 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.surface3 },
  dotOn: { width: 16, backgroundColor: colors.ink3 },
}));
