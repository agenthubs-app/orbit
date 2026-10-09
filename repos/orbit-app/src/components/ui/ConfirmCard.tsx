import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { createThemedStyles } from "../../design/theme";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { UiText } from "./Text";

export type ConfirmCardAction = { label: string; onPress: () => void; primary?: boolean };

// 01-system ④ / kit .confirm-card → .ok-card → .ng-card: an AI write waits for the
// user in place and changes in place.
//   pending: dashed plum border, a question and what it will write, [追加する][やめる];
//   success: ok (green, RD-17) border + check mark, what was written, 元に戻す;
//   failure: coral-soft, what failed, why, that nothing was written, next steps.
export function ConfirmCard({ state, title, detail, actions = [], children }: {
  state: "pending" | "success" | "failure";
  title: string;
  detail?: string;
  actions?: ConfirmCardAction[];
  children?: ReactNode;
}) {
  const { colors, styles } = useStyles();
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
}));
