// R17 交付给 R18 的组件：マイページ「主催したイベント」行（b5 マイページ · .sgroup .srow：.lbtn 34 + 标题 13.5/700 + 一行 11.5 ink3 + ›）。
// 数据：GET /api/events/center?summary=1（活动 N件 · 運営中 N）；没有主办过就写「イベントを主催する」。点一下进運営センター。
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { HostCenterSummary } from "../../api/contract/host-events";
import { Icon, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useHostApi } from "./host-api";
import { centerHref } from "./host-model";
import { hostEventsRowSub } from "./host-model";
import { useHostT } from "./useHostT";


/** 行本体（展示页 / 渲染测试传 summary；不传时自己读接口）。 */
export function HostEventsRow({ summary: given, onPress }: { summary?: HostCenterSummary | null; onPress?: () => void }) {
  const { t } = useHostT();
  const { styles, colors } = useRowStyles();
  const router = useRouter();
  const api = useHostApi();
  const [summary, setSummary] = useState<HostCenterSummary | null>(given ?? null);
  useEffect(() => {
    if (given !== undefined) { setSummary(given); return; }
    let live = true;
    void api.centerSummary().then((res) => { if (live && res.ok) setSummary(res.data); });
    return () => { live = false; };
  }, [api, given]);
  const title = t("appRowTitle");
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress ?? (() => router.push(centerHref as Href))} style={styles.srow} testID="host-events-row">
      <View style={styles.lbtn}><Icon name="brief" size={16} color={colors.ink2} /></View>
      <View style={styles.meta}>
        <UiText style={styles.title} numberOfLines={1}>{title}</UiText>
        <UiText style={styles.sub} numberOfLines={1}>{hostEventsRowSub(summary, t)}</UiText>
      </View>
      <Icon name="right" size={16} color={colors.ink3} />
    </UiPressable>
  );
}

const useRowStyles = createThemedStyles((colors) => StyleSheet.create({
  srow: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  lbtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, height: 34, justifyContent: "center", width: 34 },
  meta: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24 },
  sub: { color: colors.ink3, fontSize: 13, lineHeight: 20 },
}));
