// UR-S 对方的联系方式（S9 人脉详情 / S10 主办方的报名者详情）：每行 名称 + 值 + 能做的事——
// LINE・WeChat「コピー」，メール「メール」（发邮件；复制在长按值上），電話「電話」（拨号）。一个都没有时一行说明。
// 生日不在这里（谁都看不到）；不做「LINE で開く」。整行 64 高，按钮 40 高。
import * as Clipboard from "expo-clipboard";
import { Linking, StyleSheet, View } from "react-native";

import { profileContactMethods, type ProfileContactMethod } from "../api/compute/profile-contact-methods";
import { Icon, UiPressable, UiText, useToast, type IconName } from "./ui";
import { createThemedStyles } from "../design/theme";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

const LABEL = { email: "network.contactMethods.email", lineId: "network.contactMethods.line", phone: "network.contactMethods.phone", wechatId: "network.contactMethods.wechat" } as const;
const COPIED = { email: "network.contactMethods.copiedEmail", lineId: "network.contactMethods.copiedLine", phone: "network.contactMethods.copiedPhone", wechatId: "network.contactMethods.copiedWechat" } as const;
const ORDER: readonly ProfileContactMethod[] = ["lineId", "wechatId", "email", "phone"];

export function ContactMethodRows({ methods, testID }: { methods: unknown; testID?: string }) {
  const { t } = useOrbitLocale();
  const toast = useToast();
  const { styles, colors } = useStyles();
  const values = profileContactMethods(methods);
  const rows = ORDER.filter((method) => values[method]);
  const copy = async (method: ProfileContactMethod) => {
    try { await Clipboard.setStringAsync(values[method]!); toast.success(t(COPIED[method])); } catch { toast.error(t("network.contactMethods.copyFailed")); }
  };
  if (!rows.length) return <UiText style={styles.none} testID={testID ? `${testID}-none` : undefined}>{t("network.contactMethods.none")}</UiText>;
  return (
    <View testID={testID}>
      {rows.map((method, index) => {
        const value = values[method]!;
        const action: { label: string; icon?: IconName; run: () => void } = method === "email"
          ? { icon: "mail", label: t("network.contactMethods.mail"), run: () => void Linking.openURL(`mailto:${value}`) }
          : method === "phone"
            ? { icon: "phone", label: t("network.contactMethods.call"), run: () => void Linking.openURL(`tel:${value.replace(/[^\d+]/gu, "")}`) }
            : { label: t("network.contactMethods.copy"), run: () => void copy(method) };
        return (
          <View key={method} style={[styles.row, index ? styles.line : null, index ? { borderTopColor: colors.line } : null]} testID={`contact-method-${method}`}>
            <UiPressable accessibilityHint={t("network.contactMethods.copyHint")} accessibilityLabel={`${t(LABEL[method])} ${value}`} onLongPress={() => void copy(method)} pressedScale={1} style={styles.grow}>
              <UiText style={styles.key}>{t(LABEL[method])}</UiText>
              <UiText style={styles.value} selectable>{value}</UiText>
            </UiPressable>
            <UiPressable accessibilityLabel={`${action.label} ${t(LABEL[method])}`} accessibilityRole="button" onPress={action.run} style={styles.btn} testID={`contact-method-${method}-action`}>
              {action.icon ? <Icon name={action.icon} size={16} color={colors.ink} /> : null}
              <UiText style={styles.btnText}>{action.label}</UiText>
            </UiPressable>
          </View>
        );
      })}
    </View>
  );
}

// kit .scr：min-height 64、padding 8 0、行间分隔线；small 12/700 ink-3、b 15/700（UX-1 App 档 +2）；.btn 40 高。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 64, paddingVertical: 8 },
  line: { borderTopWidth: 1 },
  grow: { flex: 1, minWidth: 0 },
  key: { color: colors.ink3Text, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  value: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 24, marginTop: 1 },
  btn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, flexDirection: "row", gap: 6, height: 40, justifyContent: "center", paddingHorizontal: 16 },
  btnText: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  none: { color: colors.ink3Text, fontSize: 15, fontWeight: "600", lineHeight: 22, paddingVertical: 4 },
}));
