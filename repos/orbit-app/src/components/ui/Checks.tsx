import { StyleSheet, View } from "react-native";

import { useOrbitTheme } from "../../design/theme";
import { successHaptic, tapHaptic } from "./haptics";
import { Icon } from "./Icon";
import { UiPressable } from "./Pressable";

// kit .ckr / .cbx / .rad. CheckCircle (22) marks a task done — green (ok, RD-17);
// Checkbox (20, square) is batch multi-select — plum; Radio (18) single choice — plum.
// Each keeps a 44 hit area.
export function CheckCircle({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange: (next: boolean) => void; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  return (
    <UiPressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} haptic={false} hitSlop={11} onPress={() => { if (checked) tapHaptic(); else successHaptic(); onChange(!checked); }} pressedScale={0.85}
      style={[styles.circle, { borderColor: checked ? colors.ok : colors.ink4, backgroundColor: checked ? colors.ok : "transparent" }]}>
      {checked ? <Icon name="check" size={16} color={colors.surface} /> : null}
    </UiPressable>
  );
}

export function Checkbox({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange: (next: boolean) => void; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  return (
    <UiPressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} hitSlop={12} onPress={() => onChange(!checked)} pressedScale={0.9}
      style={[styles.box, { borderColor: checked ? colors.plum700 : colors.ink4, backgroundColor: checked ? colors.plum700 : "transparent" }]}>
      {checked ? <Icon name="check" size={16} color={colors.surface} /> : null}
    </UiPressable>
  );
}

export function Radio({ selected, onSelect, accessibilityLabel }: { selected: boolean; onSelect: () => void; accessibilityLabel: string }) {
  const { colors } = useOrbitTheme();
  return (
    <UiPressable accessibilityRole="radio" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected, checked: selected }} hitSlop={13} onPress={onSelect} pressedScale={0.9}
      style={[styles.radio, { borderColor: selected ? colors.plum700 : colors.ink4 }]}>
      {selected ? <View style={[styles.dot, { backgroundColor: colors.plum700 }]} /> : null}
    </UiPressable>
  );
}

const styles = StyleSheet.create({
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  box: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.8, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
