// R17 公開主催者ページ（App `/o/[slug]`；照 b7 #36 空 / #37 少 / #38 大，替换旧 OrganizerPublicScreen）。
// App 里已登录，不画手机浏览器的「Orbit · ログイン」顶栏，换成 App 顶栏（‹ · 主催者）。
// 数据：公开 GET /api/organizers/by-slug/[slug]（只列本资料下 published 的未来 / 已结束场次；数字口径见契约）。
// 关注沿用 R27 的 actor 级关注（POST / DELETE /api/organizers/[organizerKey]/follow）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Share, View } from "react-native";

import type { OrganizerPublicResponse, OrganizerPublicUpcoming } from "../../api/contract/organizer-profile";
import { UiText, useToast } from "../../components/ui";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi } from "./host-api";
import { useHostStyles } from "./host-ui";
import { useHostT } from "./useHostT";
import { appEventHref, OrganizerBody } from "./organizer-view";

export function OrganizerPublicPage() {
  const { t, language } = useHostT();
  const router = useRouter();
  const toast = useToast();
  const api = useHostApi();
  const client = useOrbitApiClient();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [data, setData] = useState<OrganizerPublicResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const h = useHostStyles().styles;
  useEffect(() => {
    let live = true;
    void api.organizer(String(slug ?? "")).then((res) => {
      if (!live) return;
      if (res.ok) { setData(res.data); setFollowing(Boolean(res.data.following)); } else setMissing(true);
    });
    return () => { live = false; };
  }, [api, slug]);
  const follow = async () => {
    if (!data || busy) return;
    const next = !following;
    setBusy(true); setFollowing(next);
    const res = await api.follow(data.organizerKey, next);
    setBusy(false);
    if (res.ok) toast.success(next ? t("pubFollowedToast") : t("pubUnfollowedToast")); else { setFollowing(!next); toast.error(t("pubFollowError")); }
  };
  const share = async (event: OrganizerPublicUpcoming) => {
    const url = `${client.baseUrl.replace(/\/+$/, "")}${event.href}`;
    try { await Share.share({ message: `${event.title}\n${url}`, url }); } catch { toast.error(t("saveError")); }
  };
  return (
    <JourneyPage title={t("pubHost")} leftLabel={t("appBack")} fallback="/events" testID="host-organizer-page">
      {data ? <OrganizerBody data={data} t={t} language={language} following={following} busy={busy} expanded={expanded} onFollow={() => void follow()} onOpen={(event) => router.push(appEventHref(event.href) as Href)} onShare={(event) => void share(event)} onSeeAll={() => setExpanded(true)} />
        : missing ? <View style={h.card}><UiText style={h.h3}>{t("pubNotFound")}</UiText><UiText style={h.sub}>{t("pubNotFoundSub")}</UiText></View> : null}
    </JourneyPage>
  );
}
