import { StyleSheet, Text, View } from "react-native";
import { spacing, textStyles } from "../design/tokens";
import { createThemedStyles } from "../design/theme";

interface SectionHeaderProps {
  detail?: string;
  title: string;
}

export function SectionHeader({ detail, title }: SectionHeaderProps) {
  const { styles } = useStyles();
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  detail: {
    ...textStyles.small,
    color: colors.text3
  },
  title: {
    ...textStyles.section,
    color: colors.ink
  }
}));
