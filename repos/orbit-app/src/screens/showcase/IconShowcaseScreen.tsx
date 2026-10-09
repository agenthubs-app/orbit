import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { designIconNames, designIconSources, designIconSpec } from "../../api/design/icons";
import { Icon } from "../../components/ui/Icon";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";

// R02: every icon in the source, for side-by-side checks against the design kit
// (docs/designs/redesign-2026-10/kit). Drawn icons carry ✎. Developer surface:
// names are identifiers, not product copy.
export function IconShowcaseScreen() {
  const { colors, styles } = useStyles();
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Icons · {designIconNames.length}</Text>
        <View style={styles.row}>
          {designIconSpec.sizes.map(size => (
            <View key={size} style={styles.sample}>
              <Icon name="calendar" size={size} />
              <Text style={styles.caption}>{size}</Text>
            </View>
          ))}
          <View style={styles.sample}>
            <Icon name="users" size={21} color={colors.accentText} />
            <Text style={styles.caption}>on</Text>
          </View>
          <View style={styles.sample}>
            <Icon name="users" size={21} color={colors.ink3Text} />
            <Text style={styles.caption}>off</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {designIconNames.map(name => (
            <View key={name} style={styles.cell}>
              <View style={styles.chip}><Icon name={name} size={24} /></View>
              <Text numberOfLines={1} style={styles.caption}>{designIconSources[name] === "drawn" ? `${name} ✎` : name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.ink, fontSize: typography.titleSm, fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, alignItems: "flex-end" },
  sample: { alignItems: "center", gap: spacing.xs, minWidth: 44 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cell: { width: 78, alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  // Functional icons sit on a round light chip (01-system.html:219).
  chip: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  caption: { color: colors.ink2, fontSize: typography.label }
}));
