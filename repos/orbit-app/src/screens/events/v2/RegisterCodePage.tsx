// R27 参加コード着地（App `/register/〈コード〉`，设计稿无 → 同 R26 B6 的做法）：查到活动就直接进参加登録（替换当前页），
// 查不到给一张「この参加コードは使えません」卡，可以重新输入（R26 的コード入力）。数据：GET /api/events/by-code/[code]。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { UiPressable, UiText } from "../../../components/ui";
import { useOrbitTheme } from "../../../design/theme";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useJourneyApi } from "./journey-api";
import { JourneyPage } from "./JourneyPage";
import { useJourneyT } from "./useJourneyT";
import { useVenueStyles } from "./venue-ui";

export function RegisterCodePage() {
  const { styles } = useVenueStyles();
  const { colors } = useOrbitTheme();
  const { t } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const api = useJourneyApi();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let live = true;
    // The code input keeps 8 letters/digits; the server matches the printed XXXX-XXXX form.
    const raw = String(code ?? "").trim().toUpperCase();
    const value = /^[A-Z0-9]{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
    if (!value) { setInvalid(true); return; }
    void api.byCode(value).then(async (res) => {
      if (!live) return;
      if (!res.ok || !res.data.eventId) { setInvalid(true); return; }
      const detail = `/events/${encodeURIComponent(res.data.eventId)}`;
      // The host, or someone who already applied, gets the event page (host actions / their status), not a fresh registration.
      const overview = await api.overview(res.data.eventId);
      if (!live) return;
      const status = overview.ok ? overview.data.registration.status : "none";
      const settled = overview.ok && (overview.data.hosting || !["none", "cancelled"].includes(status));
      router.replace((settled ? detail : `${detail}/register`) as Href);
    });
    return () => { live = false; };
  }, [api, code, router]);
  return (
    <JourneyPage title={t("regTitle")} leftLabel={t("back")} fallback="/events" testID="events-register-code">
      {invalid ? (
        <View style={styles.card}>
          <UiText style={styles.h3}>{t("inviteInvalid")}</UiText>
          <UiText style={[styles.sub, { marginTop: 4 }]}>{locale.t("eventsV2.codeDialogSub")}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={locale.t("eventsV2.codeEnter")} onPress={() => router.replace("/events/assess?mode=code" as Href)} style={[styles.btnSm, styles.primary, { alignSelf: "flex-start", marginTop: 14 }]}>
            <UiText style={[styles.btnSmText, { color: colors.bg }]}>{locale.t("eventsV2.codeEnter")}</UiText>
          </UiPressable>
        </View>
      ) : null}
    </JourneyPage>
  );
}
