import { StyleSheet, View } from "react-native";

import type { TaskPlanDemoView } from "../../api/task-plan-demo";
import { Button, ConfirmDialog, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function TaskPlanDemoNotice({ view, busy, error, intercept, onToggle, onContinue, onClose }: {
  view: TaskPlanDemoView; busy: boolean; error: string; intercept: boolean;
  onToggle: () => void; onContinue: () => void; onClose: () => void;
}) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return <>
    {view.bannerCollapsed ? <View style={styles.pillRow} testID="task-demo-pill">
      <UiPressable accessibilityRole="button" accessibilityLabel={`${t("tasks.demoExpand")} · ${view.completed} / 3`}
        accessibilityState={{ disabled: busy }} disabled={busy} onPress={onToggle} style={styles.pill}>
        <UiText style={styles.pillLabel}>{t("tasks.demoExpand")} · {view.completed} / 3</UiText>
      </UiPressable>
      <Button label={t("tasks.demoContinue")} onPress={onContinue} variant="ghost" size="sm" />
    </View> : <View style={styles.banner} testID="task-demo-banner">
      <UiText style={styles.tag}>{t("tasks.demoTag")}</UiText>
      <UiText style={styles.message}>{t("tasks.demoBody")}</UiText>
      <UiText style={styles.progress}>{view.completed} / 3</UiText>
      <View style={styles.actions}>
        <Button label={t("tasks.demoContinue")} onPress={onContinue} variant="secondary" size="sm" />
        <Button label={t("tasks.demoCollapse")} onPress={onToggle} disabled={busy} variant="secondary" size="sm" />
      </View>
    </View>}
    {error ? <UiText accessibilityRole="alert" style={styles.error}>{error}</UiText> : null}
    <ConfirmDialog visible={intercept} title={t("tasks.demoBlockedTitle")} message={t("tasks.demoBlockedBody")}
      confirmLabel={t("tasks.demoContinue")} cancelLabel={t("tasks.demoClose")}
      cancelVariant="ghost" stacked width={280} icon={{ emoji: "🧪" }} onConfirm={onContinue} onCancel={onClose} />
  </>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  banner: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: radius.lg, backgroundColor: colors.macApricot, gap: 7 },
  tag: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  message: { color: colors.ink, fontSize: 15 },
  progress: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pillRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginHorizontal: 16, marginBottom: 8, gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.macApricot },
  pillLabel: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  error: { color: colors.coralText, marginHorizontal: 16, fontSize: 14 },
}));
