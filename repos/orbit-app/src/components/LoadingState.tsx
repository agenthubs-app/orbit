import { ActivityIndicator, StyleSheet, View } from "react-native";
import { spacing } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

export function LoadingState() {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  container: {
    padding: spacing.xl
  }
}));
