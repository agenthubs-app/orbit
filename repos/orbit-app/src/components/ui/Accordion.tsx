import { useState, type ReactNode } from "react";
import { LayoutAnimation, StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Icon } from "./Icon";
import { durations, useReducedMotion } from "./motion";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// kit .acc: header row with a chevron that turns 180°; body expands in 350ms
// (motion.expand). With Reduce Motion it opens instantly.
export function Accordion({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const { colors, styles } = useStyles();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <UiPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(durations.expand, "easeInEaseOut", "opacity"));
          setOpen((value) => !value);
        }}
        pressedScale={0.99}
        style={styles.header}
      >
        <UiText style={styles.title}>{title}</UiText>
        <View style={open ? styles.chevronOpen : null}><Icon name="down" size={16} color={colors.ink3Text} /></View>
      </UiPressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  header: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "700" },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  body: { paddingBottom: 8 },
}));
