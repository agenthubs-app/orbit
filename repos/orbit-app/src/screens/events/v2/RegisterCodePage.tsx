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
    const value = String(code ?? "").trim();
    if (!value) { setInvalid(true); return; }
    void api.byCode(value).then((res) => {
      if (!live) return;
      if (res.ok && res.data.eventId) router.replace(`/events/${encodeURIComponent(res.data.eventId)}/register` as Href);
      else setInvalid(true);
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
