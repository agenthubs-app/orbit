// R17 申込页短链 `/e/<slug>`（App）：问 Web 的 `/e/<slug>`（302 → /app/events/<id>），跟随重定向后从最终地址取活动 id，
// 再进 R27 活动详情。未知 / 已中止的 slug → 一张「見つかりません」卡。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { UiText } from "../../components/ui";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostStyles } from "./host-ui";
import { eventIdFromUrl } from "./host-model";
import { useHostT } from "./useHostT";


/** 打开 Web 的公开短链页（不是 /api 读取，不带会话 Cookie，回答不落本机）：只取跟随重定向后的最终地址。 */
const openPage = globalThis.fetch;
const followPublicPage = (url: string): Promise<Response> => openPage(url, { credentials: "omit", method: "GET" });

export function EventShortLinkScreen() {
  const { t } = useHostT();
  const { styles } = useHostStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    const value = String(slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(value)) { setMissing(true); return; }
    void followPublicPage(`${client.baseUrl.replace(/\/+$/, "")}/e/${encodeURIComponent(value)}`)
      .then((response) => {
        if (!live) return;
        const id = response.ok || response.redirected ? eventIdFromUrl(response.url) : null;
        if (id) router.replace(`/events/${encodeURIComponent(id)}` as Href); else setMissing(true);
      })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [client.baseUrl, router, slug]);
  return (
    <JourneyPage title={t("appShortLinkTitle")} leftLabel={t("appBack")} fallback="/events" testID="host-short-link">
      {missing ? <View style={styles.card}><UiText style={styles.h3}>{t("pubNotFound")}</UiText><UiText style={styles.sub}>{t("pubNotFoundSub")}</UiText></View> : null}
    </JourneyPage>
  );
}
