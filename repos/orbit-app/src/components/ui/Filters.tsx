import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// kit .fopt (ui.css:395-397): multi-select filter, padding 7 / 12, 12.5 / 700 at line-height 1.5, 1.5 border;
// on = plum-500 outline, accent-soft fill and a plum-700 「✓」 (weight 900) before the label.
export function FilterOption({ label, selected, count, onToggle }: { label: string; selected: boolean; count?: number; onToggle: () => void }) {
  const { colors, styles } = useStyles();
  return (
    <UiPressable accessibilityRole="checkbox" accessibilityLabel={count === undefined ? label : `${label} ${count}`} accessibilityState={{ checked: selected }} hitSlop={5} onPress={onToggle} style={[styles.option, selected && styles.on]}>
      {/* kit draws the ✓ in plum-700; the readable accent-text (RD-05, ΔRGB ≤ 3) keeps 4.5:1 on accent-soft. */}
      {selected ? <UiText style={[styles.label, styles.tick, { color: colors.accentText }]}>✓</UiText> : null}
      <UiText numberOfLines={1} style={[styles.label, selected && styles.labelOn]}>{label}</UiText>
      {count !== undefined ? <UiText style={styles.count}>{count}</UiText> : null}
    </UiPressable>
  );
}

// 32.75 tall: 6 above and below makes 44; sideways only 3 so neighbours 6 apart never share a touch area.
const CAT_HIT_SLOP = { top: 6, bottom: 6, left: 3, right: 3 } as const;

// kit .cat (ui.css:399-400): single-choice category tabs, padding 7 / 12, no border, gap 5; ink fill when selected.
export function CategoryTabs<Key extends string>({ options, value, onChange, accessibilityLabel }: { options: { key: Key; label: string; count?: number }[]; value: Key; onChange: (key: Key) => void; accessibilityLabel: string }) {
  const { styles } = useStyles();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <UiPressable key={option.key} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} aria-selected={selected} hitSlop={CAT_HIT_SLOP} onPress={() => onChange(option.key)} style={[styles.cat, selected && styles.catOn]}>
            <UiText numberOfLines={1} style={[styles.label, selected && styles.catLabelOn]}>{option.label}</UiText>
            {option.count !== undefined ? <UiText style={[styles.count, selected && styles.catLabelOn]}>{option.count}</UiText> : null}
          </UiPressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  option: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  cat: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2 },
  tick: { fontWeight: "900" },
  on: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  catOn: { backgroundColor: colors.ink },
  label: { color: colors.ink2, fontSize: 12.5, fontWeight: "700", lineHeight: 18.75 },
  labelOn: { color: colors.ink },
  catLabelOn: { color: colors.onAccent },
  count: { color: colors.ink2, fontSize: 11, fontWeight: "600" },
}));
