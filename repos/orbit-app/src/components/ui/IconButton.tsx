import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Icon, type IconName } from "./Icon";
import { UiPressable } from "./Pressable";

// kit .rbtn (40, surface) / .lbtn (34, surface-2). Always icon-only, so the label is
// required (it is what VoiceOver reads). `dot` draws the unread marker (coral).
// D01: the drawn circle keeps the kit size; the pressable around it is a real 44pt
// target pulled back by a negative margin, so the layout footprint stays 40 / 34.
export const IconButton = forwardRef<View, {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: 40 | 34;
  soft?: boolean;
  /** R31a: kit topbar confirm button (b5 #42 編集 ✓): ink circle, bg-coloured icon. */
  solid?: boolean;
  dot?: boolean;
  disabled?: boolean;
}>(function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 40,
  soft = false,
  solid = false,
  dot = false,
  disabled = false,
}, ref) {
  const { colors, styles } = useStyles();
  return (
    <UiPressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={2}
      onPress={onPress}
      pressedScale={0.9}
      style={[styles.target, { padding: (44 - size) / 2, margin: -(44 - size) / 2 }, disabled && styles.disabled]}
    >
      <View style={[styles.base, { width: size, height: size, backgroundColor: solid ? colors.ink : soft || size === 34 ? colors.surface2 : colors.surface }]}>
        <Icon name={icon} size={size === 34 ? 16 : 20} color={solid ? colors.bg : colors.ink2} />
        {dot ? <View style={styles.dot} /> : null}
      </View>
    </UiPressable>
  );
});

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  target: { borderRadius: 999 },
  base: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  dot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
}));
