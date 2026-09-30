import { StyleSheet, Text } from "react-native";

import { createThemedStyles } from "../design/theme";
import { radius } from "../design/tokens";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

/**
 * The amber offline banner the event live page introduced (0107), shared by
 * the mirror-backed notes and personal-schedule screens (0108): the content
 * shown is the device copy as of `lastSyncedAt`, and writing needs a
 * connection. Sprint 0131: `reason="unavailable"` is for a server that
 * answered with a 5xx — it is not "offline", the service is down.
 */
export function OfflineNotice({ lastSyncedAt, reason = "unreachable" }: { lastSyncedAt: string | null; reason?: "unreachable" | "unavailable" | null }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const time = lastSyncedAt && Number.isFinite(Date.parse(lastSyncedAt))
    ? new Date(lastSyncedAt).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const message = time
    ? locale.t(reason === "unavailable" ? "sync.unavailableSnapshot" : "sync.offlineSnapshot", { time })
    : locale.t("sync.offlineNoSnapshot");
  return <Text accessibilityRole="alert" style={styles.notice}>{message}</Text>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  notice: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: radius.control, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21 },
}));
