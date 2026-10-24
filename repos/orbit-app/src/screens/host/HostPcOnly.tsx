// R17：App 不做的主办画面（建活动 / 编辑基本情報 / 主催者ページ一覧と編集）——画板「PC が便利です」。
// 路由在 App 也存在（route-parity），打开后是一张说明卡 +「PC で開くリンクを自分に送る」（POST /api/host/desktop-link，写自己的收件箱，不发邮件）。
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi } from "./host-api";
import { desktopPath } from "./host-model";
import { Btn, Emo, useHostStyles } from "./host-ui";
import { useHostT } from "./useHostT";

export type PcOnlyKind = "create" | "edit" | "profiles";
const TITLE: Record<PcOnlyKind, string> = { create: "createEvent", edit: "appEditTitle", profiles: "appProfilesTitle" };

export function PcOnlyCard({ title, onSend, t }: { title: string; onSend: () => void; t: (key: string) => string }) {
  const { styles } = useHostStyles();
  const p = usePcStyles().styles;
  return (
    <View style={[styles.card, p.card]} testID="host-pc-only">
      <Emo emoji="💻" tone="blue" />
      <UiText style={p.title}>{title}</UiText>
      <UiText style={[styles.sub, p.sub]}>{t("appPcOnlySub")}</UiText>
      <Btn label={t("appSendPc")} variant="primary" height={46} onPress={onSend} style={p.btn} />
    </View>
  );
}

export function HostPcOnlyScreen({ kind }: { kind: PcOnlyKind }) {
  const { t } = useHostT();
  const toast = useToast();
  const api = useHostApi();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = String(params.id ?? "");
  const path = kind === "edit" ? desktopPath.edit(eventId) : kind === "profiles" ? desktopPath.profiles : desktopPath.create;
  const send = async () => { const res = await api.desktopLink(path); if (res.ok) toast.success(t("appPcSent")); else toast.error(t("saveError")); };
  return (
    <JourneyPage title={t(TITLE[kind])} leftLabel={t("appBack")} fallback="/events/center" testID={`host-pc-${kind}`}>
      <PcOnlyCard title={t("appPcOnlyTitle")} onSend={() => void send()} t={t} />
    </JourneyPage>
  );
}

const usePcStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { alignItems: "center" },
  title: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 29, marginTop: 12, textAlign: "center" },
  sub: { marginTop: 6, textAlign: "center" },
  btn: { alignSelf: "stretch", marginTop: 16 },
}));
