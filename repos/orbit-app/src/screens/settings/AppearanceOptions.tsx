import { Pressable, Text, View } from "react-native";

import { setAppearanceChoice, useAppearanceChoice, type AppearanceChoice } from "../../design/appearance";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";

const appearanceOptions = [
  { choice: "system", labelKey: "settings.appearanceSystem" },
  { choice: "light", labelKey: "settings.appearanceLight" },
  { choice: "dark", labelKey: "settings.appearanceDark" }
] as const satisfies readonly { choice: AppearanceChoice; labelKey: MessageKey }[];

export function AppearanceOptions() {
  const { styles } = useStyles();
  const locale = useOrbitLocale();
  const current = useAppearanceChoice();
  return (
    <View style={styles.block}>
      <Text style={styles.title}>{locale.t("settings.appearance")}</Text>
      <Text style={styles.hint}>{locale.t("settings.appearanceHint")}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {appearanceOptions.map((option) => {
          const selected = current === option.choice;
          return (
            <Pressable
              key={option.choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              onPress={() => void setAppearanceChoice(option.choice)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={selected ? styles.optionSelectedText : styles.optionText}>{locale.t(option.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  block: { borderBottomColor: colors.line, borderBottomWidth: 1, gap: 8, paddingVertical: 13.5 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "500" as const },
  hint: { color: colors.ink3Text, fontSize: 13, lineHeight: 20 },
  options: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  option: { backgroundColor: colors.surface2, borderRadius: 999, justifyContent: "center" as const, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  optionSelected: { backgroundColor: colors.ink },
  optionText: { color: colors.ink2, fontSize: 13, fontWeight: "600" as const, lineHeight: 18 },
  optionSelectedText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" as const, lineHeight: 18 }
}));
