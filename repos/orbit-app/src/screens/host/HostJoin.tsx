// R17 共同運営に参加（App）：`/host/join/[code]` = b12 #416 落地（邀请卡 + 参加する / コードを入力する）；`/host/join` = 输 8 文字のコード。
// 数据：GET /api/host/cohost-invites/[code]（预览；无效 / 过期 / 已用一律 valid:false，不区分原因）→ POST …/accept（以邀请为凭证授予）。
// 接受后去服务端给的地方（受付 → 受付画面，其他 → 运营台）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import type { HostCohostInvitePreview } from "../../api/contract/host-cohosts";
import { UiPressable, UiText, useToast } from "../../components/ui";
import { addDesignMock } from "../add/add-design-mock";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi } from "./host-api";
import { Btn, useHostStyles } from "./host-ui";
import { CodeBoxes, normalizeCode } from "./center-view";
import { useHostT } from "./useHostT";
import { JoinCard, useJoinStyles } from "./join-view";

const appHref = (href: string) => href.replace(/^\/app(?=\/)/, "");

export function HostJoinScreen() {
  const { t } = useHostT();
  const router = useRouter();
  const toast = useToast();
  const api = useHostApi();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = String(params.code ?? "").trim();
  const [invite, setInvite] = useState<HostCohostInvitePreview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    if (!code) return;
    void api.invite(code).then((res) => { if (live) setInvite(res.ok ? res.data : { eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, valid: false }); });
    return () => { live = false; };
  }, [api, code]);
  const accept = async (value: string) => {
    if (busy) return;
    setBusy(true);
    const res = await api.acceptInvite(value);
    setBusy(false);
    if (res.ok) { toast.success(t("jnJoined")); router.replace(appHref(res.data.href) as Href); return; }
    toast.error(res.reason === "forbidden" ? t("jnMismatch") : res.reason === "rate_limited" ? t("jnLimited") : t("jnInvalidTitle"));
  };
  if (!code) return <JoinCodePage onSubmit={(value) => router.replace(`/host/join/${encodeURIComponent(value)}` as Href)} />;
  return (
    <JourneyPage title={t("jnInvite")} leftIcon="x" leftLabel={t("close")} fallback="/events/center" testID="host-join">
      {invite ? <JoinCard invite={invite} t={t} busy={busy} onJoin={() => void accept(code)} onCode={() => router.replace("/host/join" as Href)} /> : null}
    </JourneyPage>
  );
}

/** `/host/join`：8 文字のコード（同 b12 #418 弹层的格子）。 */
function JoinCodePage({ onSubmit }: { onSubmit: (code: string) => void }) {
  const { t } = useHostT();
  const { styles } = useHostStyles();
  const j = useJoinStyles().styles;
  const input = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const noKeyboard = addDesignMock("no-keyboard");
  const ready = value.replace("-", "").length === 8;
  return (
    <JourneyPage title={t("jnCodeTitle")} leftLabel={t("appBack")} fallback="/events/center" testID="host-join-code">
      <View style={styles.card}>
        <UiText style={styles.lbl}>{t("appCodeSub")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("appCodeSub")} onPress={() => input.current?.focus()}><CodeBoxes value={value} /></UiPressable>
        <TextInput ref={input} value={value} onChangeText={(text) => setValue(normalizeCode(text))} autoCapitalize="characters" autoCorrect={false} autoFocus showSoftInputOnFocus={!noKeyboard} maxLength={9} accessibilityLabel={t("appCodeSub")} style={j.hidden} onSubmitEditing={() => { if (ready) onSubmit(value); }} />
        <Btn label={t("jnNext")} variant="primary" height={50} onPress={() => { if (ready) onSubmit(value); }} style={j.mt16} />
      </View>
    </JourneyPage>
  );
}
