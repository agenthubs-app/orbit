import { useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
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
          <UiPressable key={segment.key} accessibilityRole="tab" accessibilityLabel={segment.label} accessibilityState={{ selected }} hitSlop={4} onPress={() => onChange(segment.key)} pressedScale={0.97} style={[styles.option, selected && styles.selected]}>
            {/* Like UISegmentedControl: equal fixed widths, so text size is capped (1.4×) and shrinks to fit; the full label stays in accessibilityLabel. */}
            <UiText adjustsFontSizeToFit maxFontSizeMultiplier={1.4} minimumFontScale={0.75} numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>{segment.label}</UiText>
          </UiPressable>
        );
      })}
    </View>
  );
}

// kit .tseg (Task 四段): equal segments over pages the user can also swipe between.
// Segment positions are frozen (RD-20); the parent owns which page is shown.
export function SwipeSegments<Key extends string>({ segments, value, onChange, accessibilityLabel, renderPage }: {
  segments: Segment<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  accessibilityLabel: string;
  renderPage: (key: Key) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(width);
  const select = (key: Key) => {
    onChange(key);
    pager.current?.scrollTo({ x: segments.findIndex((segment) => segment.key === key) * pageWidth, animated: true });
  };
  return (
    <View style={{ flex: 1 }} onLayout={(event) => setPageWidth(event.nativeEvent.layout.width || width)}>
      <Segmented segments={segments} value={value} onChange={select} accessibilityLabel={accessibilityLabel} />
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          const segment = segments[index];
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
}));
