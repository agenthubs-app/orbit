// R17 共同運営に参加（App）的邀请卡本体（渲染测试直接用）。
import { StyleSheet, View } from "react-native";

import type { HostCohostInvitePreview } from "../../api/contract/host-cohosts";
import { UiText } from "../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { Chip, GradientCard } from "../events/v2/venue-ui";
import { hostDateShort, type HostT } from "./host-model";
import { Btn, useHostStyles } from "./host-ui";
export const ROLE_KEY: Record<string, [string, string]> = { check_in: ["rCheckIn", "jnRoleCheckIn"], manager: ["rManager", "jnRoleManager"], read_only_analyst: ["rReadOnly", "jnRoleReader"] };

/** 邀请卡本体（渲染测试直接用）。 */
export function JoinCard({ invite, t, busy, onJoin, onCode }: { invite: HostCohostInvitePreview; t: HostT; busy: boolean; onJoin: () => void; onCode: () => void }) {
  const { styles } = useHostStyles();
  const { colors } = useOrbitTheme();
  const j = useJoinStyles().styles;
  if (!invite.valid) {
    return (
      <View style={styles.card} testID="host-join-invalid">
        <UiText style={styles.h3}>{t("jnInvalidTitle")}</UiText>
        <UiText style={[styles.sub, j.mt4]}>{t("jnInvalidSub")}</UiText>
        <Btn label={t("jnEnterCode")} onPress={onCode} style={j.mt14} />
      </View>
    );
  }
  const [roleKey, roleSub] = ROLE_KEY[invite.role ?? "check_in"] ?? ROLE_KEY.check_in!;
  return (
    <GradientCard from={colors.macLav} testID="host-join-card">
      <UiText style={styles.lbl}>{t("jnInvite")}</UiText>
      <UiText style={j.title}>{invite.eventTitle ?? ""}</UiText>
      <UiText style={styles.lbl}>{t("jnFrom", { name: invite.inviterName ?? "", org: invite.organizerName ?? "" })}</UiText>
      <View style={[styles.row, j.gap8, j.mt12]}><Chip label={t("jnRole", { role: t(roleKey) })} tone="lav" /><UiText style={[styles.lbl, styles.grow]}>{t(roleSub)}</UiText></View>
      <View style={j.actions}>
        <Btn label={busy ? "…" : t("jnJoin")} variant="primary" onPress={onJoin} testID="host-join-accept" />
        <Btn label={t("jnEnterCode")} onPress={onCode} />
      </View>
      {invite.expiresAt ? <UiText style={[styles.lbl, j.mt8]}>{t("jnValid", { d: hostDateShort(invite.expiresAt, t) })}</UiText> : null}
    </GradientCard>
  );
}

export const useJoinStyles = createThemedStyles((colors) => StyleSheet.create({
  title: { color: colors.ink, fontSize: 20, fontWeight: "700", lineHeight: 30, marginTop: 6 },
  gap8: { gap: 8 },
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt14: { marginTop: 14 },
  mt16: { marginTop: 16 },
  actions: { gap: 8, marginTop: 16 },
  hidden: { height: 1, opacity: 0, position: "absolute", width: 1 },
}));
