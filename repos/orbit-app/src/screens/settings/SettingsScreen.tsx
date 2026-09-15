import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Platform, Pressable, Text, View, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { AppScreen } from "../../components/AppScreen";
import { createThemedStyles } from "../../design/theme";
import { revokeNotificationDevice } from "../../notifications/native-notifications";
import { revokePushDeviceRegistrations } from "../../notifications/push-registration-queue";
import {
  isPushNotificationsOptedIn,
  revokeRegisteredPushDevice,
  setPushNotificationsOptIn
} from "../../notifications/push-device-session";
import { useOrbitLocale, type OrbitLanguageChoice } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { clearProfileEditSession } from "../../data/profile-edit-session";

const settingsDestinations = [
  {
    accessibleKey: "settings.account" as MessageKey,
    detailKey: "settings.accountDetail" as MessageKey,
    href: "/account",
    section: "account",
    titleKey: "settings.accountWorkspace" as MessageKey
  },
  {
    accessibleKey: "settings.permissions" as MessageKey,
    detailKey: "settings.permissionsDetail" as MessageKey,
    href: "/account/permissions",
    section: "general",
    titleKey: "settings.permissions" as MessageKey,
    requiresAuthentication: true
  },
  {
    accessibleKey: "settings.server" as MessageKey,
    detailKey: "settings.serverDetail" as MessageKey,
    href: "/settings/api",
    section: "server",
    titleKey: "settings.server" as MessageKey
  }
] as const;

const languageOptions = [
  { choice: "system", labelKey: "settings.languageSystem" },
  { choice: "zh", labelKey: "settings.languageZh" },
  { choice: "ja", labelKey: "settings.languageJa" },
  { choice: "en", labelKey: "settings.languageEn" }
] as const satisfies readonly { choice: OrbitLanguageChoice; labelKey: MessageKey }[];

const webScrollMargin = Platform.OS === "web" ? ({ scrollMarginBottom: 1 } as never) : undefined;

export function SettingsScreen() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const { baseUrl } = useOrbitApiBaseUrl();
  const locale = useOrbitLocale();
  const [pushOptIn, setPushOptIn] = useState<boolean | null>(null);
  const [pushOptInBusy, setPushOptInBusy] = useState(false);
  const [pushOptInError, setPushOptInError] = useState("");
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    if (signOutBusy || !auth.actorId) return;
    const actorId = auth.actorId;
    setSignOutBusy(true);
    setSignOutError("");
    const result = await auth.signOut();
    if (result.success) {
      clearProfileEditSession({ actorId, apiOrigin: baseUrl });
    } else {
      setSignOutError(result.message ?? locale.t("account.signOutFailure"));
    }
    setSignOutBusy(false);
  }

  useEffect(() => {
    if (!auth.signedIn) {
      setPushOptIn(null);
      return;
    }
    let active = true;
    void isPushNotificationsOptedIn().then((enabled) => {
      if (active) setPushOptIn(enabled);
    });
    return () => {
      active = false;
    };
  }, [auth.signedIn]);

  async function enablePushNotifications() {
    setPushOptInBusy(true);
    try {
      await setPushNotificationsOptIn(true);
      setPushOptIn(true);
    } finally {
      setPushOptInBusy(false);
    }
  }

  async function disablePushNotifications() {
    setPushOptInBusy(true);
    setPushOptInError("");
    try {
      await setPushNotificationsOptIn(false);
      setPushOptIn(false);
      const revoked = await revokePushDeviceRegistrations([
        () => revokeNotificationDevice(client),
        () => revokeRegisteredPushDevice({ baseUrl, cookieHeader: auth.cookieHeader }),
      ]);
      if (!revoked) setPushOptInError(locale.t("settings.remindersUnlinkError"));
    } catch {
      setPushOptInError(locale.t("settings.remindersUnlinkError"));
    } finally {
      setPushOptInBusy(false);
    }
  }

  return (
    <AppScreen eyebrow="Orbit" title={locale.t("settings.title")}>
      <View style={styles.sections}>
        {(["general", "account", "server"] as const).map((section) => section === "general" && !auth.signedIn ? null : (
          <View key={section} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{locale.t(`settings.${section}` as MessageKey)}</Text>
            <View style={styles.sectionRows}>
              {section === "general" && auth.signedIn ? <>
                <View style={styles.languageBlock}>
                  <Text style={styles.destinationText}>{locale.t("settings.language")}</Text>
                  <Text style={styles.notificationBody}>{locale.t("settings.languageHint")}</Text>
                  <View accessibilityRole="radiogroup" style={styles.languageOptions}>
                    {languageOptions.map((option) => (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: locale.choice === option.choice }}
                        disabled={locale.syncState === "saving"}
                        key={option.choice}
                        onPress={() => void locale.setLanguage(option.choice)}
                        style={({ pressed }) => [
                          styles.languageOption,
                          locale.choice === option.choice && styles.languageOptionSelected,
                          pressed && styles.pressed
                        ]}
                      >
                        <Text style={locale.choice === option.choice ? styles.languageOptionSelectedText : styles.languageOptionText}>
                          {locale.t(option.labelKey)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {locale.syncState === "loading" ? <Text style={styles.notificationBody}>{locale.t("settings.languageLoading")}</Text> : null}
                  {locale.syncState === "saving" ? <Text style={styles.notificationBody}>{locale.t("settings.languageSaving")}</Text> : null}
                  {locale.syncState === "error" || locale.syncState === "conflict" ? (
                    <Pressable accessibilityRole="button" onPress={() => void locale.retryLanguageSave()} style={styles.retryLanguage}>
                      <Text accessibilityRole="alert" style={styles.errorText}>{locale.t("settings.languageUnsynced")}</Text>
                      <Text style={styles.retryLanguageText}>{locale.t("common.retry")}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel={pushOptInBusy
                    ? locale.t("settings.remindersPreparing")
                    : pushOptIn === null
                      ? locale.t("settings.remindersReadingLabel")
                      : pushOptInError
                        ? locale.t("settings.remindersRetryOffLabel")
                        : pushOptIn === true
                          ? locale.t("settings.remindersTurnOffLabel")
                          : locale.t("settings.remindersTurnOnLabel")}
                  accessibilityHint={locale.t("settings.remindersHint")}
                  accessibilityRole="button"
                  disabled={pushOptInBusy || pushOptIn === null}
                  onPress={() =>
                    void (pushOptIn === true
                      ? disablePushNotifications()
                      : pushOptInError
                        ? disablePushNotifications()
                        : enablePushNotifications())
                  }
                  style={({ pressed }) => [
                    styles.destination,
                    webScrollMargin,
                    pressed && styles.pressed,
                    pushOptInBusy && styles.actionDisabled
                  ]}
                >
                  <Text style={styles.destinationText}>{locale.t("settings.reminders")}</Text>
                  <Text style={styles.valueText}>
                    {pushOptInBusy
                      ? locale.t("settings.remindersPreparing")
                      : pushOptInError
                        ? locale.t("settings.remindersRetryOff")
                        : pushOptIn === null
                          ? locale.t("settings.remindersReading")
                          : pushOptIn === true
                            ? locale.t("settings.remindersOn")
                            : locale.t("settings.remindersOff")}
                  </Text>
                </Pressable>
                <Text style={styles.notificationBody}>
                  {locale.t("settings.remindersHint")}
                </Text>
                {pushOptInError ? <Text accessibilityRole="alert" style={styles.errorText}>{pushOptInError}</Text> : null}
              </> : null}
              {settingsDestinations
                .filter(
                  (destination) =>
                    destination.section === section && (
                      !("requiresAuthentication" in destination) ||
                      !destination.requiresAuthentication ||
                      auth.signedIn)
                )
                .map((destination) => (
                  <Pressable
                    accessibilityLabel={locale.t("common.openNamed", { name: locale.t(destination.accessibleKey) })}
                    accessibilityHint={locale.t(destination.detailKey)}
                    accessibilityRole="button"
                    key={destination.href}
                    onPress={() => router.push(destination.href as Href)}
                    style={({ pressed }) => [styles.destination, webScrollMargin, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.destinationText}>{locale.t(destination.titleKey)}</Text>
                    <Ionicons color={colors.text3} name="chevron-forward" size={16} />
                  </Pressable>
                ))}
              {section === "account" && auth.signedIn ? <Pressable accessibilityLabel={locale.t("account.signOut")} accessibilityRole="button" disabled={signOutBusy} onPress={() => void signOut()} style={({ pressed }) => [styles.destination, signOutBusy && styles.actionDisabled, pressed && styles.pressed]}>
                <Text style={styles.signOutText}>{locale.t("account.signOut")}</Text>
              </Pressable> : null}
              {section === "account" && signOutError ? <Text accessibilityRole="alert" style={styles.errorText}>{signOutError}</Text> : null}
            </View>
            {section === "server" ? <Text style={styles.notificationBody}>{locale.t("settings.serverDetail")}</Text> : null}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  sections: { gap: 22, paddingBottom: 1, paddingTop: 8 },
  section: { gap: 6 },
  sectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  sectionRows: { borderTopColor: colors.border, borderTopWidth: 1 },
  languageBlock: { borderBottomColor: colors.border, borderBottomWidth: 1, gap: 8, paddingVertical: 13.5 },
  languageOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  languageOption: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  languageOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  languageOptionText: { color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  languageOptionSelectedText: { color: colors.onAccent, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  retryLanguage: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8, minHeight: 44 },
  retryLanguageText: { color: colors.accent, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  destination: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 50,
    paddingVertical: 13.25
  },
  destinationText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22
  },
  notificationBody: {
    color: colors.text3,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8
  },
  actionDisabled: {
    opacity: 0.55
  },
  valueText: { color: colors.muted, flexShrink: 1, fontSize: 14, lineHeight: 20, textAlign: "right" },
  errorText: { color: colors.rose, fontSize: 13, lineHeight: 20, paddingVertical: 8 },
  signOutText: { color: colors.rose, flex: 1, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  pressed: {
    opacity: 0.82
  }
}));
