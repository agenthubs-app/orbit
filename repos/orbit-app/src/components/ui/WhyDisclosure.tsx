import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { Icon } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";

// 01-system ④ 「?」: every AI suggestion can show what it is based on. The body
// starts with 「根拠：」 (standard copy aiCard.why).
export function WhyDisclosure({ reason }: { reason: string }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <UiPressable accessibilityRole="button" accessibilityLabel={copy.aiCard.showWhy} accessibilityState={{ expanded: open }} hitSlop={10} onPress={() => setOpen((value) => !value)} style={styles.button}>
        <UiText maxFontSizeMultiplier={1.3} style={styles.mark}>?</UiText>
      </UiPressable>
      {open ? (
        <View style={styles.body}>
          <Icon name="info" size={16} color={colors.ink3Text} />
          <UiText style={styles.text}>{fillCopy(copy.aiCard.why, { reason })}</UiText>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  button: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  mark: { color: colors.ink2, fontSize: 12, fontWeight: "800" },
  body: { flexDirection: "row", gap: 6, marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: colors.surface2 },
  text: { flex: 1, color: colors.ink2, fontSize: 12, lineHeight: 19 },
}));
