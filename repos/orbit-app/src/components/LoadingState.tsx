import { ActivityIndicator, StyleSheet, View } from "react-native";
import { spacing } from "../design/tokens";
import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

export function LoadingState({ accessibilityLabel }: { accessibilityLabel?: string } = {}) {
  const { colors, styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.container}>
      <ActivityIndicator accessibilityLabel={accessibilityLabel ?? t("common.loadingLabel")} color={colors.accentText} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  container: {
    padding: spacing.xl
  }
}));
