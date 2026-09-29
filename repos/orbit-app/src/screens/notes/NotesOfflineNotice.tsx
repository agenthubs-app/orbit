import { StyleSheet, Text } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function NotesOfflineNotice({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const time = lastSyncedAt && Number.isFinite(Date.parse(lastSyncedAt))
    ? new Date(lastSyncedAt).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  return <Text accessibilityRole="alert" style={styles.notice}>{locale.t(time ? "notes.offlineQueuedSnapshot" : "notes.offlineQueuedNoSnapshot", time ? { time } : undefined)}</Text>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  notice: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: radius.control, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21 },
}));
