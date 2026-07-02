import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { colors, radius, spacing, typography } from "../../design/tokens";

export function ApiSettingsScreen() {
  const { baseUrl, error, ready, resetBaseUrl, setBaseUrl } =
    useOrbitApiBaseUrl();
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftBaseUrl(baseUrl);
  }, [baseUrl]);

  async function saveBaseUrl() {
    const result = await setBaseUrl(draftBaseUrl);
    setMessage(result.success ? "Server address saved." : result.error);
  }

  async function resetServerAddress() {
    await resetBaseUrl();
    setMessage("Server address reset.");
  }

  return (
    <AppScreen eyebrow="Development" title="Server">
      <DataCard
        detail={ready ? baseUrl : "Loading saved address"}
        title="Current server"
      />
      <DataCard
        detail="Use localhost for the iOS simulator. Use your Mac LAN address or remote server for a physical iPhone."
        title="Server address"
      >
        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setDraftBaseUrl}
            placeholder="http://localhost:3000"
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
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={resetServerAddress}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </Pressable>
          </View>
          {message || error ? (
            <Text style={styles.message}>{message ?? error}</Text>
          ) : null}
        </View>
      </DataCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  form: {
    gap: spacing.md
  },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  message: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 20
  },
  pressed: {
    opacity: 0.72
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: typography.small,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.tint,
    borderRadius: radius.card,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: "800"
  }
});
