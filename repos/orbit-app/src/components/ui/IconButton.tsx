import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Icon, type IconName } from "./Icon";
import { UiPressable } from "./Pressable";

// kit .rbtn (40, surface) / .lbtn (34, surface-2). Always icon-only, so the label is
// required (it is what VoiceOver reads). The 34 size keeps a 44 hit area. `dot`
// draws the unread marker (coral).
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 40,
  soft = false,
  dot = false,
  disabled = false,
}: {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: 40 | 34;
  soft?: boolean;
  dot?: boolean;
  disabled?: boolean;
}) {
  const { colors, styles } = useStyles();
  return (
    <UiPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={(44 - size) / 2 + 2}
      onPress={onPress}
      pressedScale={0.9}
      style={[styles.base, { width: size, height: size, backgroundColor: soft || size === 34 ? colors.surface2 : colors.surface }, disabled && styles.disabled]}
    >
      <Icon name={icon} size={size === 34 ? 16 : 20} color={colors.ink2} />
      {dot ? <View style={styles.dot} /> : null}
    </UiPressable>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  base: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  dot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral, borderWidth: 1.5, borderColor: colors.surface },
}));
