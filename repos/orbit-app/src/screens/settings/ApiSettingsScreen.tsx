import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { validateOrbitApiBaseUrl } from "../../api/base-url";
import { createOrbitApiClient } from "../../api/client";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { spacing, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { healthPayloadToSummary } from "../../view-models/health";

export function ApiSettingsScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const { baseUrl, error, ready, resetBaseUrl, setBaseUrl } =
    useOrbitApiBaseUrl();
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthMessage, setHealthMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftBaseUrl(baseUrl);
  }, [baseUrl]);

  async function saveBaseUrl() {
    const result = await setBaseUrl(draftBaseUrl);
    setMessage(result.success ? locale.t("settings.apiSaved") : result.error);
  }

  async function checkServerHealth() {
    const validation = validateOrbitApiBaseUrl(draftBaseUrl);
    if (!validation.success) {
      setHealthMessage(validation.error);
      return;
    }

    setCheckingHealth(true);
    setHealthMessage(null);

    try {
      const client = createOrbitApiClient({ baseUrl: validation.value });
      const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.health);

      if (result.success) {
        const summary = healthPayloadToSummary(result.data, locale.t);
        setHealthMessage(`${summary.title}. ${summary.detail}`);
      } else {
        setHealthMessage(result.error.message);
      }
    } catch (checkError) {
      setHealthMessage(
        checkError instanceof Error
          ? checkError.message
          : locale.t("settings.apiCheckUnavailable")
      );
    } finally {
      setCheckingHealth(false);
    }
  }

  async function resetServerAddress() {
    await resetBaseUrl();
    setHealthMessage(null);
    setMessage(locale.t("settings.apiResetMessage"));
  }

  return (
    <AppScreen eyebrow={locale.t("settings.apiEyebrow")} title={locale.t("settings.server")}>
      <DataCard
        detail={ready ? baseUrl : locale.t("settings.apiReading")}
        title={locale.t("settings.apiCurrent")}
      />
      <DataCard
        detail={locale.t("settings.apiDetail")}
        title={locale.t("settings.apiAddress")}
        variant="inset"
      >
        <View style={styles.form}>
          <TextInput
            accessibilityLabel={locale.t("settings.apiAddress")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setDraftBaseUrl}
            placeholder="http://localhost:3000"
            placeholderTextColor={colors.text4}
            style={styles.input}
            value={draftBaseUrl}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={saveBaseUrl}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.primaryButtonText}>{locale.t("common.save")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={checkingHealth}
              onPress={checkServerHealth}
              style={({ pressed }) => [
                styles.secondaryButton,
                checkingHealth ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {checkingHealth ? locale.t("settings.apiChecking") : locale.t("settings.apiCheck")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={resetServerAddress}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.secondaryButtonText}>{locale.t("settings.apiReset")}</Text>
            </Pressable>
          </View>
          {message || error ? (
            <Text style={styles.message}>{message ?? error}</Text>
          ) : null}
          {healthMessage ? (
            <Text style={styles.message}>{healthMessage}</Text>
          ) : null}
        </View>
      </DataCard>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actions: {
    gap: spacing.sm
  },
  disabled: {
    opacity: 0.54
  },
  form: {
    gap: spacing.md
  },
  input: {
    ...createControlStyles(colors).input
  },
  message: {
    ...textStyles.small,
    color: colors.text2,
  },
  pressed: {
    opacity: 0.72
  },
  primaryButton: {
    ...createControlStyles(colors).primaryButton
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  secondaryButton: {
    ...createControlStyles(colors).secondaryButton
  },
  secondaryButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  }
}));
