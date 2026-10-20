import { Platform, StyleSheet } from "react-native";

import { UiText } from "../../components/ui/Text";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function MemoOfflineNotice({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const time = lastSyncedAt && Number.isFinite(Date.parse(lastSyncedAt))
    ? new Date(lastSyncedAt).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const key = Platform.OS === "web"
    ? time ? "sync.offlineSnapshot" : "sync.offlineNoSnapshot"
    : time ? "notes.offlineQueuedSnapshot" : "notes.offlineQueuedNoSnapshot";
  return <UiText accessibilityRole="alert" style={styles.notice}>{locale.t(key, time ? { time } : undefined)}</UiText>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  notice: { color: colors.macApricotText, backgroundColor: colors.macApricot, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21 },
}));
