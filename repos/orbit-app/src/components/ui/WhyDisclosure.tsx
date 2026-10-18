import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { fillCopy, useStandardCopy } from "../../i18n/standard-copy";
import { Icon } from "./Icon";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";
import { Chip } from "./Chip";
import { Card } from "./Card";
import { MacTile } from "./MacTile";

// 01-system ④ 「?」: every AI suggestion can show what it is based on. The body
// starts with 「根拠：」 (standard copy aiCard.why).
export function WhyDisclosure({ reason, initialOpen = false, presentation = "default", title, summary, chip, illustrationEmoji }: { reason: string; initialOpen?: boolean; presentation?: "default" | "kit" | "kit-card" | "kit-inline"; title?: string; summary?: string; chip?: string; illustrationEmoji?: string }) {
  const { colors, styles } = useStyles();
  const copy = useStandardCopy();
  const [open, setOpen] = useState(initialOpen);
  if (presentation === "kit-card" || presentation === "kit-inline") {
    const content = <>
      <View style={styles.kitHead}>
        {presentation === "kit-card" ? <>{illustrationEmoji ? <MacTile emoji={illustrationEmoji} tone="apricot" size="sm" /> : null}<UiText style={styles.kitTitle}>{title}</UiText></> : chip ? <View style={styles.kitChip}><Chip label={chip} tone="lav" expand /></View> : null}
        <UiPressable accessibilityRole="button" accessibilityLabel={copy.aiCard.showWhy} accessibilityState={{ expanded: open }} hitSlop={13} onPress={() => setOpen((value) => !value)} style={[styles.button, styles.kitButton]}><UiText style={styles.mark}>?</UiText></UiPressable>
      </View>
      {summary ? <UiText style={styles.kitSummary}>{summary}</UiText> : null}
      {open ? <View style={[styles.body, styles.kitBody]}><UiText style={[styles.text, styles.kitText]}>{reason}</UiText></View> : null}
    </>;
    return presentation === "kit-card" ? <Card style={styles.kitCard}>{content}</Card> : <View style={styles.kitInline}>{content}</View>;
  }
  return (
    <View>
      <UiPressable accessibilityRole="button" accessibilityLabel={copy.aiCard.showWhy} accessibilityState={{ expanded: open }} hitSlop={10} onPress={() => setOpen((value) => !value)} style={[styles.button, presentation === "kit" && styles.kitButton]}>
        <UiText maxFontSizeMultiplier={1.3} style={styles.mark}>?</UiText>
      </UiPressable>
      {open ? (
        <View style={[styles.body, presentation === "kit" && styles.kitBody]}>
          {presentation !== "kit" ? <Icon name="info" size={16} color={colors.ink3Text} /> : null}
          <UiText style={[styles.text, presentation === "kit" && styles.kitText]}>{presentation === "kit" ? reason : fillCopy(copy.aiCard.why, { reason })}</UiText>
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
  kitButton: { width: 18, height: 18, borderRadius: 9 },
  kitBody: { paddingHorizontal: 12, paddingVertical: 10, gap: 0 },
  kitText: { lineHeight: 19.8 },
  kitCard: { padding: 16 },
  kitInline: { marginTop: 12 },
  kitHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  kitTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  kitSummary: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21.7, marginTop: 8 },
  kitChip: { flex: 1, minWidth: 0 },
}));
