import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isRelationshipInvitationPreview } from "../../api/contact-communication";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import {
  relationshipCommunicationInvitationAcceptPath,
  relationshipCommunicationInvitationPath
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { createControlStyles } from "../../design/controls";
import { spacing, textStyles, typography } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { isRelationshipEligibility } from "../../view-models/contact-communication";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function RelationshipInvitationScreen() {
  const locale = useOrbitLocale();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(params.token);
  const actorId = useOrbitAuthSession().actorId ?? "";
  const client = useOrbitApiClient({ scopeKey: `${actorId}:${token}` });
  const router = useRouter();
  const { styles } = useStyles();
  const state = useApiResource<unknown>(
    relationshipCommunicationInvitationPath(token || "missing"),
    () => false,
    { scopeKey: `${actorId}:${token}`, cachePolicy: "network-only" }
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");

  async function acceptInvitation() {
    if (!token || pending || state.kind !== "success" || !isRelationshipInvitationPreview(state.data) || !state.data.canAccept) return;
    setPending(true);
    setError("");
    try {
      const result = await client.post<unknown>(relationshipCommunicationInvitationAcceptPath(token), {
        body: { confirmed: true }
      });
      if (!result.success || result.status < 200 || result.status >= 300 || !isRelationshipEligibility(result.data) || !result.data.canSend || !result.data.conversationId) {
        setError(locale.t("invitation.unconfirmed"));
        return;
      }
      setConversationId(result.data.conversationId);
    } catch {
      setError(locale.t("invitation.unavailable"));
    } finally {
      setPending(false);
    }
  }

  if (!token) return <AppScreen title={locale.t("invitation.title")}><ErrorState message={locale.t("invitation.linkIncomplete")} /></AppScreen>;
  return (
    <AppScreen eyebrow={locale.t("invitation.eyebrow")} title={locale.t("invitation.confirmTitle")}>
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" || state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "success" && !isRelationshipInvitationPreview(state.data) ? <ErrorState message={locale.t("invitation.contentIncomplete")} /> : null}
      {state.kind === "success" && isRelationshipInvitationPreview(state.data) ? (
        <DataCard detail={state.data.status === "pending" ? locale.t("invitation.waiting") : locale.t("invitation.handled")} title={locale.t("invitation.from", { name: locale.t.literal(state.data.inviterDisplayName) })}>
          <Text style={styles.bodyText}>{locale.t("invitation.recipient", { name: locale.t.literal(state.data.recipientName) })}</Text>
          <Text style={styles.helperText}>{locale.t("invitation.noAutomaticAction")}</Text>
          <Text style={styles.helperText}>{locale.t("invitation.expires", { time: locale.t.literal(new Date(state.data.expiresAt).toLocaleString()) })}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {conversationId ? (
            <View style={styles.actions}>
              <Text style={styles.successText}>{locale.t("invitation.verified")}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace(`/chat/${encodeURIComponent(conversationId)}` as Href)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{locale.t("invitation.openChat")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" disabled={!state.data.canAccept || pending} onPress={() => void acceptInvitation()} style={[styles.primaryButton, !state.data.canAccept || pending ? styles.disabled : null]}>
              <Text style={styles.primaryButtonText}>{pending ? locale.t("invitation.confirming") : locale.t("invitation.accept")}</Text>
            </Pressable>
          )}
        </DataCard>
      ) : null}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actions: { gap: spacing.md },
  bodyText: { ...textStyles.body, color: colors.text },
  disabled: { opacity: 0.45 },
  errorText: { color: colors.rose, fontSize: typography.small, lineHeight: 20 },
  helperText: { color: colors.text2, fontSize: typography.small, lineHeight: 20 },
  primaryButton: { ...createControlStyles(colors).primaryButton, alignSelf: "flex-start" },
  primaryButtonText: { ...createControlStyles(colors).primaryButtonText },
  successText: { color: colors.live, fontSize: typography.small, lineHeight: 20 }
}));
