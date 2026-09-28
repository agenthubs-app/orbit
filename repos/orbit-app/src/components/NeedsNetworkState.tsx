import { Pressable, StyleSheet, Text, View } from "react-native";

import { createControlStyles } from "../design/controls";
import { createThemedStyles } from "../design/theme";
import { spacing, textStyles } from "../design/tokens";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

/**
 * Sprint 0131: the calm 「需要联网」 / 「还没保存在这台设备上」 state — the muted
 * empty-state text and the secondary button, no new colours. Used by the
 * online-only page frame (OnlineOnlyBoundary) and by local-first pages that
 * have no device copy yet.
 */
export function NeedsNetworkState({ onRetry, retrying = false, message }: { onRetry?: () => void; retrying?: boolean; message?: string }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  return (
    <View style={styles.group}>
      <Text style={styles.body}>{message ?? locale.t("sync.needsNetworkBody")}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: retrying, busy: retrying }} disabled={retrying} onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>{locale.t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  group: { gap: spacing.md, paddingVertical: spacing.sm },
  body: { ...textStyles.small, color: colors.muted },
  button: { ...createControlStyles(colors).secondaryButton, alignSelf: "flex-start" },
  buttonText: { ...createControlStyles(colors).secondaryButtonText },
}));
