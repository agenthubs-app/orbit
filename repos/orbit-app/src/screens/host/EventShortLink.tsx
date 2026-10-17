// R17 申込页短链 `/e/<slug>`（App）：问 `GET /api/events/by-slug/<slug>`（R17-16，只认已公开活动）拿活动 id，
// 再进 R27 活动详情。未知 / 已中止的 slug → 一张「見つかりません」卡。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { UiText } from "../../components/ui";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi } from "./host-api";
import { useHostStyles } from "./host-ui";
import { useHostT } from "./useHostT";

export function EventShortLinkScreen() {
  const { t } = useHostT();
  const { styles } = useHostStyles();
  const router = useRouter();
  const api = useHostApi();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    const value = String(slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(value)) { setMissing(true); return; }
    void api.eventBySlug(value).then((result) => {
      if (!live) return;
      if (result.ok) router.replace(`/events/${encodeURIComponent(result.data.eventId)}` as Href); else setMissing(true);
    });
    return () => { live = false; };
  }, [api, router, slug]);
  return (
    <JourneyPage title={t("appShortLinkTitle")} leftLabel={t("appBack")} fallback="/events" testID="host-short-link">
      {missing ? <View style={styles.card}><UiText style={styles.h3}>{t("pubNotFound")}</UiText><UiText style={styles.sub}>{t("pubNotFoundSub")}</UiText></View> : null}
    </JourneyPage>
  );
}
