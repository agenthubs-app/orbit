import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

export type Segment<Key extends string> = { key: Key; label: string };

// kit .seg: a surface-2 pill holding equal options; the selected one sits on surface.
// It replaces the hand-written accessibilityRole="tablist" rows in old screens.
export function Segmented<Key extends string>({ segments, value, onChange, accessibilityLabel }: { segments: Segment<Key>[]; value: Key; onChange: (key: Key) => void; accessibilityLabel: string }) {
  const { styles } = useStyles();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.track}>
      {segments.map((segment) => {
        const selected = segment.key === value;
        return (
          <UiPressable key={segment.key} accessibilityRole="tab" accessibilityLabel={segment.label} accessibilityState={{ selected }} aria-selected={selected} hitSlop={4} onPress={() => onChange(segment.key)} pressedScale={0.97} style={[styles.option, selected && styles.selected]}>
            {/* Like UISegmentedControl: equal fixed widths, so text size is capped (1.4×) and shrinks to fit; the full label stays in accessibilityLabel. */}
            <UiText adjustsFontSizeToFit maxFontSizeMultiplier={1.4} minimumFontScale={0.75} numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{segment.label}</UiText>
          </UiPressable>
        );
      })}
    </View>
  );
}

// kit .tseg (Task 四段) + .tswipe page dots: equal segments over pages the user can
// also swipe between. Segment positions are frozen (RD-20); the parent owns which
// page is shown — a value set from outside (a link, restored state) moves the pager.
export function SwipeSegments<Key extends string>({ segments, value, onChange, accessibilityLabel, renderPage }: {
  segments: Segment<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  accessibilityLabel: string;
  renderPage: (key: Key) => ReactNode;
}) {
  const { styles } = useStyles();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(width);
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
      <View style={styles.segmentsInset}><Segmented segments={segments} value={value} onChange={select} accessibilityLabel={accessibilityLabel} /></View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.dots}>
        {segments.map((segment) => <View key={segment.key} style={[styles.dot, segment.key === value && styles.dotOn]} />)}
      </View>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        contentOffset={initialOffset}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={(event) => {
          const landed = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          const segment = segments[landed];
          shown.current = landed;
          if (segment && segment.key !== value) onChange(segment.key);
        }}
      >
        {segments.map((segment) => <View key={segment.key} style={{ width: pageWidth }}>{renderPage(segment.key)}</View>)}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  track: { flexDirection: "row", padding: 3, gap: 2, borderRadius: 999, backgroundColor: colors.surface2, alignSelf: "stretch" },
  option: { flex: 1, minHeight: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  selected: { backgroundColor: colors.surface },
  label: { color: colors.ink2, fontSize: 12.5, fontWeight: "600", textAlign: "center" },
  labelSelected: { color: colors.ink, fontWeight: "700" },
  segmentsInset: { paddingHorizontal: 16 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8, marginBottom: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.surface3 },
  dotOn: { width: 16, backgroundColor: colors.ink3 },
}));
