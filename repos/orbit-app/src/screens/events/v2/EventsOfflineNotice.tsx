import { StyleSheet } from "react-native";

import { UiText } from "../../../components/ui/Text";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";

/** LF2: the events pages' 「截至」 notice in the kit style — the content is the device's page copy as of `lastSyncedAt`. */
export function EventsOfflineNotice({ lastSyncedAt, reason = "unreachable" }: { lastSyncedAt: string | null; reason?: "unreachable" | "unavailable" | null }) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const time = lastSyncedAt && Number.isFinite(Date.parse(lastSyncedAt))
    ? new Date(lastSyncedAt).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const key = time ? (reason === "unavailable" ? "sync.unavailableSnapshot" : "sync.offlineSnapshot") : "sync.offlineNoSnapshot";
  return <UiText accessibilityRole="alert" style={styles.notice}>{locale.t(key, time ? { time } : undefined)}</UiText>;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  notice: { color: colors.macApricotText, backgroundColor: colors.macApricot, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, lineHeight: 21, marginBottom: 12 },
}));
