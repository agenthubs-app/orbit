// 参加者詳細的底部弹层（App 惯例：受付 QR 也是 BottomSheet，不另开路由）。只请求这一个人：GET /api/host/events/[id]/people/[actorId]。
// 换人时先清空、显示占位，晚到的旧回答丢弃（同 Web HostPersonDrawer）。
import { useEffect, useState } from "react";

import type { HostAdmissionDecision, HostPersonResponse } from "../../api/contract/host-console";
import { View } from "react-native";

import { BottomSheet, Icon, UiPressable, UiText } from "../../components/ui";
import type { HostApi } from "./host-api";
import type { HostT } from "./host-model";
import { useHostStyles } from "./host-ui";
import { HostPersonLoading, HostPersonView } from "./person-view";

export function HostPersonSheet({ person, visible, onClose, api, eventId, t, busy = false, onDecide }: {
  person: { actorId: string; name: string } | null; visible: boolean; onClose: () => void; api: HostApi; eventId: string; t: HostT;
  busy?: boolean;
  /** 審査待ち / キャンセル待ち：详情底部 見送り / 待ち / 承認（b13 HM-P6）。見送り 的确认由调用方做。 */
  onDecide?: ((decision: HostAdmissionDecision) => void) | undefined;
}) {
  const { styles, colors } = useHostStyles();
  const [data, setData] = useState<HostPersonResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const actorId = person?.actorId ?? null;
  useEffect(() => {
    if (!visible || !actorId) return undefined;
    let alive = true;
    setData(null);
    setFailed(false);
    void api.person(eventId, actorId).then((res) => { if (!alive) return; if (res.ok) setData(res.data); else setFailed(true); });
    return () => { alive = false; };
  }, [api, eventId, actorId, visible]);
  const current = data && data.actorId === actorId ? data : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} {...(person ? { accessibilityLabel: t("pdOpen", { name: person.name }) } : {})}>
      {current ? (
        <>
          <HostPersonView data={current} t={t} />
          {onDecide && (current.status === "pending" || current.status === "waitlisted") ? (
            <View style={{ marginTop: 18 }} testID="host-person-decide">
              <UiText style={styles.lbl}>{t("pdDecideNote")}</UiText>
              <View style={[styles.row, { gap: 8, marginTop: 10 }]}>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("pReject")} disabled={busy} onPress={() => onDecide("reject")} style={[styles.btn, { flex: 1, height: 44 }]} testID="host-person-reject"><UiText style={[styles.btnText, { color: colors.coralText }]}>{t("pReject")}</UiText></UiPressable>
                {current.status !== "waitlisted" ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pWait")} disabled={busy} onPress={() => onDecide("waitlist")} style={[styles.btn, { flex: 1, height: 44 }]} testID="host-person-wait"><UiText style={styles.btnText}>{t("pWait")}</UiText></UiPressable> : null}
                <UiPressable accessibilityRole="button" accessibilityLabel={t("pApprove")} disabled={busy} onPress={() => onDecide("approve")} style={[styles.btn, styles.primary, { flex: 1.4, height: 44 }]} testID="host-person-approve"><Icon name="check" size={16} color={colors.bg} /><UiText style={[styles.btnText, { color: colors.bg }]}>{t("pApprove")}</UiText></UiPressable>
              </View>
            </View>
          ) : null}
        </>
      )
        : failed ? <UiText style={styles.sub}>{t("loadError")}</UiText>
          : <HostPersonLoading />}
    </BottomSheet>
  );
}
