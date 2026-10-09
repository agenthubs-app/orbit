import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import { useStandardCopy } from "../../i18n/standard-copy";

// R03: every standard phrase in the screen language, grouped as in shared/copy,
// for the "put it back into the UI" check (320pt, 2× text) of the copy loop.
// Developer surface: group and key names are identifiers, not product copy.
export function CopyShowcaseScreen() {
  const { styles } = useStyles();
  const copy = useStandardCopy();
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {Object.entries(copy).map(([group, entries]) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupName}>{group}</Text>
            {Object.entries(entries).map(([key, text]) => (
              <View key={key} style={styles.row}>
                <Text style={styles.key}>{key}</Text>
                <Text style={styles.text}>{text}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  groupName: { color: colors.ink2, fontSize: typography.label, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: spacing.sm },
  key: { color: colors.ink3Text, fontSize: typography.label, minWidth: 96 },
  text: { color: colors.ink, fontSize: typography.body, flexShrink: 1 }
}));
