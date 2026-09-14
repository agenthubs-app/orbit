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
import { isRelationshipEligibility } from "../../view-models/contact-communication";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function RelationshipInvitationScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(params.token);
  const actorId = useOrbitAuthSession().user?.id ?? "";
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
        setError("邀请尚未确认，当前账号不会获得聊天资格。请刷新后重试。");
        return;
      }
      setConversationId(result.data.conversationId);
    } catch {
      setError("邀请暂时无法确认，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (!token) return <AppScreen title="关系邀请"><ErrorState message="邀请链接不完整。" /></AppScreen>;
  return (
    <AppScreen eyebrow="Orbit 关系邀请" title="确认邀请">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" || state.kind === "failure" ? <ErrorState message={state.error.message} /> : null}
      {state.kind === "success" && !isRelationshipInvitationPreview(state.data) ? <ErrorState message="邀请内容不完整，当前不会建立关系。" /> : null}
      {state.kind === "success" && isRelationshipInvitationPreview(state.data) ? (
        <DataCard detail={state.data.status === "pending" ? "等待你确认" : "邀请已处理"} title={`${state.data.inviterDisplayName} 邀请你建立关系对话`}>
          <Text style={styles.bodyText}>邀请对象：{state.data.recipientName}</Text>
          <Text style={styles.helperText}>打开本页不会自动接受邀请，也不会发送邮件、短信或消息。</Text>
          <Text style={styles.helperText}>有效期至 {new Date(state.data.expiresAt).toLocaleString()}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {conversationId ? (
            <View style={styles.actions}>
              <Text style={styles.successText}>身份已验证，关系对话已建立。</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace(`/chat/${encodeURIComponent(conversationId)}` as Href)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>打开关系对话</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" disabled={!state.data.canAccept || pending} onPress={() => void acceptInvitation()} style={[styles.primaryButton, !state.data.canAccept || pending ? styles.disabled : null]}>
              <Text style={styles.primaryButtonText}>{pending ? "正在确认" : "接受邀请并建立关系对话"}</Text>
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
