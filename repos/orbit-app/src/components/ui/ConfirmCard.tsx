import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { MacTile } from "./MacTile";
import { UiPressable } from "./Pressable";
import { UiText } from "./Text";
import { mixHex } from "./toast-model";

export type ConfirmCardAction = { label: string; onPress: () => void; primary?: boolean };

// 01-system ④ / kit .confirm-card → .ok-card → .ng-card: an AI write waits for the
// user in place and changes in place.
//   pending: dashed plum border, a question and what it will write, [追加する][やめる];
//   success: ok (green, RD-17) border + check mark, what was written, 元に戻す;
//   failure: coral-soft, what failed, why, that nothing was written, next steps.
export function ConfirmCard({ state, title, detail, actions = [], children, illustrationEmoji, link, presentation = "default" }: {
  state: "pending" | "success" | "failure";
  title: string;
  detail?: string;
  actions?: ConfirmCardAction[];
  children?: ReactNode;
  illustrationEmoji?: string;
  link?: { label: string; onPress: () => void };
  presentation?: "default" | "kit";
}) {
  const { colors, styles } = useStyles();
  if (presentation === "kit") {
    const [reason, ...rest] = detail?.split("\n") ?? [];
    return (
      <View accessibilityLiveRegion="polite" style={[styles.kitCard, state === "pending" && styles.kitPending, styles[state], state === "success" && styles.kitSuccess]}>
        <View style={[styles.kitHead, state === "failure" && styles.kitFailureHead]}>
          {state === "pending" && illustrationEmoji ? <MacTile emoji={illustrationEmoji} tone="lav" size="sm" /> : null}
          {state === "success" ? <View style={styles.kitOkMark}><Icon name="check" size={16} color={colors.surface} /></View> : null}
          {state === "failure" ? <View style={styles.kitNgMark}><Icon name="alert" size={16} color={colors.coralText} /></View> : null}
          <View style={styles.kitHeading}>
            <UiText style={styles.kitTitle}>{title}</UiText>
            {state === "failure" && reason ? <UiText style={styles.kitReason}>{reason}</UiText> : null}
          </View>
          {state === "success" && actions[0] ? <Button label={actions[0].label} onPress={actions[0].onPress} size="sm" variant="ghost" /> : null}
        </View>
        {state === "pending" && detail ? <UiText style={styles.kitPendingDetail}>{detail}</UiText> : null}
        {state === "success" && detail ? <UiText style={styles.kitSuccessDetail}>{detail}</UiText> : null}
        {state === "failure" && rest.length ? <UiText style={styles.kitFailureDetail}>{rest.join("\n")}</UiText> : null}
        {children}
        {state === "success" && link ? <UiPressable accessibilityRole="link" accessibilityLabel={link.label} hitSlop={12} onPress={link.onPress} style={styles.kitLink}><UiText style={styles.kitLinkText}>{link.label}</UiText><Icon name="right" size={12} color={colors.plum700} /></UiPressable> : null}
        {state !== "success" && actions.length ? (
          <View style={[styles.kitActions, state === "failure" && styles.kitFailureActions]}>{actions.map((action, index) => <Button key={action.label} label={action.label} onPress={action.onPress} size="sm" variant={action.primary ? "primary" : state === "failure" ? index === actions.length - 1 ? "ghost" : "surface" : "secondary"} />)}</View>
        ) : null}
      </View>
    );
  }
  return (
    <View accessibilityLiveRegion="polite" style={[styles.card, styles[state]]}>
      <View style={styles.head}>
        {state === "success" ? <View style={[styles.mark, { backgroundColor: colors.ok }]}><Icon name="check" size={16} color={colors.surface} /></View> : null}
        {state === "failure" ? <View style={[styles.mark, { backgroundColor: colors.surface }]}><Icon name="alert" size={16} color={colors.coralText} /></View> : null}
        <UiText style={[styles.title, state === "failure" && { color: colors.coralText }]}>{title}</UiText>
      </View>
      {detail ? <UiText style={styles.detail}>{detail}</UiText> : null}
      {children}
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((action) => <Button key={action.label} label={action.label} onPress={action.onPress} size="sm" variant={action.primary ? "primary" : state === "failure" ? "secondary" : "ghost"} />)}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { borderRadius: 20, padding: 14, gap: 8 },
  pending: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.plum300, backgroundColor: "transparent" },
  success: { borderWidth: 1.5, borderColor: colors.ok, backgroundColor: colors.surface },
  failure: { backgroundColor: colors.coralSoft },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  detail: { color: colors.ink2, fontSize: 12.5, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  kitCard: { borderRadius: 20, padding: 14 },
  kitPending: { padding: 0 },
  kitSuccess: { borderColor: mixHex(colors.ok, colors.surface, 0.45), paddingBottom: 17 },
  kitHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  kitFailureHead: { alignItems: "flex-start", gap: 10 },
  kitHeading: { flex: 1, minWidth: 0 },
  kitTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", lineHeight: 19.5 },
  kitOkMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ok, alignItems: "center", justifyContent: "center" },
  kitNgMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  kitReason: { color: colors.ink3Text, fontSize: 11.5, lineHeight: 17.25 },
  kitPendingDetail: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75, marginTop: 6, marginBottom: 10 },
  kitSuccessDetail: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75, marginTop: 6, marginLeft: 34 },
  kitFailureDetail: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75, marginTop: 8 },
  kitLink: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 13, marginLeft: 34 },
  kitLinkText: { color: colors.plum700, fontSize: 12.5, fontWeight: "700" },
  kitActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kitFailureActions: { gap: 6, marginTop: 10 },
}));
