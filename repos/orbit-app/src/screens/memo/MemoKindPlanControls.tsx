import { StyleSheet, View } from "react-native";

import { Segmented, Toggle, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { spacing } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function MemoKindPlanControls({ kind, usedForPlan, contactCount, disabled = false, onKindChange, onPlanChange }: {
  kind: "free" | "meeting" | "voice";
  usedForPlan: boolean;
  contactCount: number;
  disabled?: boolean;
  onKindChange: (kind: "free" | "meeting") => void;
  onPlanChange: (value: boolean) => void;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const eligible = kind === "meeting" && contactCount === 1;
  return <View style={styles.wrap}>
    <Segmented segments={[{ key: "meeting", label: locale.t("notes.kindMeeting") }, { key: "free", label: locale.t("notes.kindFree") }]}
      value={kind === "meeting" ? "meeting" : "free"} onChange={onKindChange} accessibilityLabel={locale.t("notes.title")} />
    {kind === "voice" ? <UiText style={styles.hint}>{locale.t("notes.voiceSource")}</UiText> : null}
    <View style={styles.planRow}>
      <UiText style={styles.planLabel}>{locale.t("notes.useForPlan")}</UiText>
      <Toggle value={eligible && usedForPlan} onValueChange={onPlanChange} accessibilityLabel={locale.t("notes.useForPlan")} disabled={disabled || !eligible} />
    </View>
    {!eligible ? <UiText style={styles.hint}>{locale.t("notes.planUseRequiresOneContact")}</UiText> : null}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  wrap: { gap: spacing.md },
  planRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  planLabel: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: "700" },
  hint: { color: colors.ink3Text, fontSize: 14 },
}));
