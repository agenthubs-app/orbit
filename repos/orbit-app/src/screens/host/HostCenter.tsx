// R17 運営センター（App；b6 #21 空 / #22 大，b12 #420 少 · #418 コード入力 · #426 テンプレート）。
// 数据：GET /api/host/center?filter=（规则，不调 AI）。App 不建活动、不编辑申込フォーム（画板「PC が便利です」）：
// 「イベントを作成」「PC で開くリンクを自分に送る」「テンプレート」都走 POST /api/host/desktop-link（写进自己的收件箱，不发邮件）。
// 「共同運営に参加」「受付だけ担当」→ 8 文字のコード（同招待コード格式）→ POST /api/host/cohost-invites/[code]/accept。
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import type { HostCenterFilter, HostCenterResponse } from "../../api/contract/host-events";
import { BottomSheet, Icon, IconButton, UiPressable, UiText, useToast } from "../../components/ui";
import { addDesignMock } from "../add/add-design-mock";
import { JourneyPage } from "../events/v2/JourneyPage";
import { useHostApi, type HostApi } from "./host-api";
import { checkInHref, consoleHref, desktopPath, type HostT } from "./host-model";
import { Btn, Emo, PcCard, useHostStyles } from "./host-ui";
import { useHostT } from "./useHostT";
import { CodeBoxes, HostCenterBody, normalizeCode, TEMPLATES, useCenterStyles, type CenterSheet } from "./center-view";


export function HostCenterScreen() {
  const { t, language } = useHostT();
  const router = useRouter();
  const toast = useToast();
  const api = useHostApi();
  const [filter, setFilter] = useState<HostCenterFilter>("all");
  const [data, setData] = useState<HostCenterResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<CenterSheet>(null);

  useEffect(() => {
    let live = true;
    void api.center(filter).then((res) => {
      if (!live) return;
      if (res.ok) { setData(res.data); setFailed(false); } else setFailed(true);
    });
    return () => { live = false; };
  }, [api, filter]);

  const sendPc = useCallback(async (path?: string) => {
    const res = await api.desktopLink(path);
    if (res.ok) toast.success(t("appPcSent")); else toast.error(t("saveError"));
  }, [api, t, toast]);

  return (
    <JourneyPage title={t("centerTitle")} subtitle={t("appCrumb")} leftLabel={t("appBack")} fallback="/profile"
      right={<IconButton icon="plus" accessibilityLabel={t("createEvent")} onPress={() => router.push("/events/center/new" as Href)} />} testID="host-center">
      {data ? (
        <HostCenterBody data={data} filter={filter} t={t} language={language} onFilter={setFilter}
          onCreate={() => router.push("/events/center/new" as Href)} onSendPc={() => void sendPc(desktopPath.center)}
          onTemplate={() => setSheet("template")} onJoin={() => setSheet("code")} onCheckInOnly={() => setSheet("code")}
          onOpenRow={(row) => router.push(consoleHref(row.eventId) as Href)}
          onRowAction={(row) => router.push((row.action === "open_check_in" ? checkInHref(row.eventId) : consoleHref(row.eventId)) as Href)} />
      ) : failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null}
      <CodeSheet visible={sheet === "code"} onClose={() => setSheet(null)} api={api} t={t} />
      <TemplateSheet visible={sheet === "template"} onClose={() => setSheet(null)} t={t} onPick={(id) => { setSheet(null); void sendPc(desktopPath.template(id)); }} />
    </JourneyPage>
  );
}

function CodeSheet({ visible, onClose, api, t }: { visible: boolean; onClose: () => void; api: HostApi; t: HostT }) {
  const { styles } = useCenterStyles();
  const h = useHostStyles().styles;
  const router = useRouter();
  const toast = useToast();
  const input = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const noKeyboard = addDesignMock("no-keyboard");
  const join = async () => {
    if (code.replace("-", "").length !== 8 || busy) return;
    setBusy(true);
    const res = await api.acceptInvite(code);
    setBusy(false);
    if (!res.ok) { toast.error(t("appCodeInvalid")); return; }
    onClose();
    setCode("");
    router.push(res.data.href.replace(/^\/app(?=\/)/, "") as Href);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("joinCohost")}>
      <View testID="host-code-sheet">
        <UiText style={styles.sheetTitle}>{t("joinCohost")}</UiText>
        <UiText style={[h.lbl, { marginTop: 4 }]}>{t("appCodeSub")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("appCodeSub")} onPress={() => input.current?.focus()}>
          <CodeBoxes value={code} />
        </UiPressable>
        <TextInput ref={input} value={code} onChangeText={(text) => setCode(normalizeCode(text))} autoCapitalize="characters" autoCorrect={false} autoFocus={visible} showSoftInputOnFocus={!noKeyboard} maxLength={9} accessibilityLabel={t("appCodeSub")} style={styles.hiddenInput} onSubmitEditing={() => void join()} />
        <Btn label={t("jnJoin")} variant="primary" height={50} onPress={() => void join()} style={styles.joinBtn} testID="host-code-join" />
      </View>
    </BottomSheet>
  );
}

function TemplateSheet({ visible, onClose, onPick, t }: { visible: boolean; onClose: () => void; onPick: (id: (typeof TEMPLATES)[number]["id"]) => void; t: HostT }) {
  const { styles, colors } = useCenterStyles();
  const h = useHostStyles().styles;
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("appTplTitle")}>
      <View testID="host-template-sheet">
        <UiText style={styles.sheetTitle}>{t("appTplTitle")}</UiText>
        <UiText style={[h.lbl, styles.tplSub]}>{t("appTplSub")}</UiText>
        {TEMPLATES.map((tpl) => (
          <UiPressable key={tpl.id} accessibilityRole="button" accessibilityLabel={t(tpl.title)} onPress={() => onPick(tpl.id)} style={[h.row, styles.tplRow]}>
            <Emo emoji={tpl.emoji} tone={tpl.tone} />
            <View style={h.grow}><UiText style={h.b14}>{t(tpl.title)}</UiText><UiText style={h.lbl}>{t(tpl.sub)}</UiText></View>
            <Icon name="right" size={16} color={colors.ink3} />
          </UiPressable>
        ))}
        <UiText style={[h.lbl, styles.center, { marginTop: 8 }]}>{t("appTplPc")}</UiText>
      </View>
    </BottomSheet>
  );
}
