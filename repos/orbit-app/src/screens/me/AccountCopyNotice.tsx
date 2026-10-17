import { StyleSheet } from "react-native";
import type { PageCopyStatus } from "../../data/sync/page-copies";
import { UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { radius, spacing, typography } from "../../design/tokens";
import type { OrbitTranslator } from "../../i18n/messages";

export function AccountCopyNotice({ copy, language, t }: { copy: PageCopyStatus | null; language: "ja" | "zh" | "en"; t: OrbitTranslator }) {
  const { styles } = useStyles();
  if (!copy?.offline) return null;
  const time = copy.lastSyncedAt && Number.isFinite(Date.parse(copy.lastSyncedAt)) ? new Date(copy.lastSyncedAt).toLocaleString(language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  return <UiText accessibilityRole="alert" style={styles.notice}>{time ? t(copy.reason === "unavailable" ? "sync.unavailableSnapshot" : "sync.offlineSnapshot", { time }) : t("sync.offlineNoSnapshot")}</UiText>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({ notice: { color: colors.macApricotText, backgroundColor: colors.macApricot, borderRadius: radius.md, padding: spacing.md, fontSize: typography.bodySm, lineHeight: typography.bodySm * 1.6 } }));
