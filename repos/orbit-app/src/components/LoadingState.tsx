import { ActivityIndicator, StyleSheet, View } from "react-native";
import { spacing } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

export function LoadingState({ accessibilityLabel = "正在加载" }: { accessibilityLabel?: string } = {}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.container}>
      <ActivityIndicator accessibilityLabel={accessibilityLabel} color={colors.accent} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  container: {
    padding: spacing.xl
  }
}));
