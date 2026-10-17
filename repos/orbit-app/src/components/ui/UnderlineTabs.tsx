import { Platform, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

export type UnderlineTab<Key extends string> = { key: Key; label: string; count?: number };

// R31a (G23 / R27-04): kit b2 .utabs (b2-events-flow.html:51-55) — text tabs over a hairline, gap 20, margin 14 0 12;
// tabs 13 / 700 at line-height 1.5 with padding 9 0, ink-3, the selected one ink with a 2.5 underline (radius 2)
// sitting on the hairline. An optional count follows the label in ink-3 (kit .utabs small).
// Replaces the hand-written tablist in EventDetailPage (detail 紹介 / 当日の流れ / 主催者 / 参加者).
export function UnderlineTabs<Key extends string>({ tabs, value, onChange, accessibilityLabel, testIDPrefix }: {
  tabs: UnderlineTab<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  accessibilityLabel?: string;
  /** testID of each tab = `${testIDPrefix}${key}` */
  testIDPrefix?: string;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.utabs} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <UiPressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }} aria-selected={selected} onPress={() => onChange(tab.key)} style={styles.utab} {...(testIDPrefix ? { testID: `${testIDPrefix}${tab.key}` } : {})}>
            <UiText style={[styles.label, selected ? styles.labelOn : null]}>{tab.label}{tab.count !== undefined ? <UiText style={styles.count}>{` ${tab.count}`}</UiText> : null}</UiText>
            {selected ? <View style={styles.line} /> : null}
          </UiPressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  utabs: { borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 20, marginBottom: 12, marginTop: 14 },
  // 9 + 19.5 + 9 = 37.5 tall; the 20 gaps keep neighbours apart, VoiceOver reads each as a tab.
  utab: { paddingVertical: 9 },
  label: { color: colors.ink3, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  labelOn: { color: colors.ink },
  count: { color: colors.ink3, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 10.8, fontWeight: "700" },
  line: { backgroundColor: colors.ink, borderRadius: 2, bottom: -1, height: 2.5, left: 0, position: "absolute", right: 0 },
}));
