import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Icon } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// kit .fopt: multi-select filter — plum outline, accent-soft fill and a check when on.
export function FilterOption({ label, selected, count, onToggle }: { label: string; selected: boolean; count?: number; onToggle: () => void }) {
  const { colors, styles } = useStyles();
  return (
    <UiPressable accessibilityRole="checkbox" accessibilityLabel={count === undefined ? label : `${label} ${count}`} accessibilityState={{ checked: selected }} hitSlop={4} onPress={onToggle} style={[styles.option, selected && styles.on]}>
      {selected ? <Icon name="check" size={16} color={colors.plum700} /> : null}
      <UiText numberOfLines={1} style={[styles.label, selected && styles.labelOn]}>{label}</UiText>
      {count !== undefined ? <UiText style={styles.count}>{count}</UiText> : null}
    </UiPressable>
  );
}

// kit .cat: single-choice category tabs — ink fill when selected.
export function CategoryTabs<Key extends string>({ options, value, onChange, accessibilityLabel }: { options: { key: Key; label: string; count?: number }[]; value: Key; onChange: (key: Key) => void; accessibilityLabel: string }) {
  const { styles } = useStyles();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <UiPressable key={option.key} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} hitSlop={4} onPress={() => onChange(option.key)} style={[styles.option, selected && styles.catOn]}>
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
  option: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: "transparent" },
  on: { borderColor: colors.plum500, backgroundColor: colors.accentSoft },
  catOn: { backgroundColor: colors.ink },
  label: { color: colors.ink2, fontSize: 12.5, fontWeight: "700" },
  labelOn: { color: colors.ink },
  catLabelOn: { color: colors.onAccent },
  count: { color: colors.ink2, fontSize: 11, fontWeight: "600" },
}));
