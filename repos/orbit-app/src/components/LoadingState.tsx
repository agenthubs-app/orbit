import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors, spacing } from "../design/tokens";

export function LoadingState() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl
  }
});
