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
import { healthPayloadToSummary } from "../../view-models/health";

export function ApiSettingsScreen() {
  const { colors, styles } = useStyles();
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
    setMessage(result.success ? "服务器地址已保存。" : result.error);
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
        const summary = healthPayloadToSummary(result.data);
        setHealthMessage(`${summary.title}. ${summary.detail}`);
      } else {
        setHealthMessage(result.error.message);
      }
    } catch (checkError) {
      setHealthMessage(
        checkError instanceof Error
          ? checkError.message
          : "暂时无法检查这台服务器。"
      );
    } finally {
      setCheckingHealth(false);
    }
  }

  async function resetServerAddress() {
    await resetBaseUrl();
    setHealthMessage(null);
    setMessage("服务器地址已重置。");
  }

  return (
    <AppScreen eyebrow="开发设置" title="服务器">
      <DataCard
        detail={ready ? baseUrl : "正在读取已保存地址"}
        title="当前服务器"
      />
      <DataCard
        detail="iOS 模拟器使用 localhost；真机请填写 Mac 的局域网地址或远程服务器地址。"
        title="服务器地址"
        variant="inset"
      >
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="服务器地址"
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
              <Text style={styles.primaryButtonText}>保存</Text>
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
                {checkingHealth ? "检查中" : "检查"}
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
              <Text style={styles.secondaryButtonText}>重置</Text>
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
