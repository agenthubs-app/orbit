import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { adminLoginToView } from "../../view-models/admin";

export function AdminLoginScreen() {
  const router = useRouter();
  const view = adminLoginToView();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function enterAdmin() {
    router.push(view.directHref as Href);
  }

  return (
    <AppScreen eyebrow="管理员" title={sent ? view.sentTitle : view.title}>
      <DataCard detail={sent ? view.sentDescription : view.summary} title="后台入口">
        <View style={styles.form}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>{view.field.label}</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder={view.field.placeholder}
              placeholderTextColor={colors.text4}
              style={styles.input}
              value={email}
            />
          </View>
          {sent ? (
            <View style={styles.notice}>
              <Ionicons color={colors.live} name="checkmark-circle" size={18} />
              <Text style={styles.noticeText}>
                已发送至 {email.trim() || view.field.placeholder}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setSent(true)}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.primaryButtonText}>{view.primaryLabel}</Text>
            <Ionicons color={colors.onAccent} name="mail" size={17} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={enterAdmin}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.secondaryButtonText}>{view.skipLabel}</Text>
            <Ionicons color={colors.accent} name="arrow-forward" size={17} />
          </Pressable>
        </View>
      </DataCard>

      <DataCard detail={view.boundary} title="当前边界">
        <Text style={styles.bodyText}>
          真实管理员登录接入后，这里再处理邮件发送、会话写入和权限刷新。
        </Text>
      </DataCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text2,
    fontSize: typography.small,
    lineHeight: 20
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "700"
  },
  fieldWrap: {
    gap: spacing.xs
  },
  form: {
    gap: spacing.md
  },
  input: {
    backgroundColor: colors.bgSunken,
    borderColor: colors.border2,
    borderRadius: radius.input,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  notice: {
    alignItems: "center",
    backgroundColor: colors.liveSoft,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  noticeText: {
    color: colors.live,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  pressed: {
    opacity: 0.82,
    transform: [{ translateY: 0.5 }]
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: typography.body,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderRadius: radius.control,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.md
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: typography.body,
    fontWeight: "700"
  }
});
