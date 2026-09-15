import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ORBIT_API_ENDPOINTS,
  profileUpdateSuggestionAcceptPath,
  profileUpdateSuggestionDismissPath,
} from "../../api/endpoints";
import {
  profileSuggestionDismissReceiptSchema,
  profileSuggestionReceiptSchema,
  profileSuggestionsSchema,
  type ProfileSuggestion,
} from "../../api/profile-detail-contract";
import { validateApiResourceState } from "../../api/validated-resource-state";
import {
  applyProfileSuggestionToDraft,
  profileSuggestionDecisionMutationId,
  recordProfileSuggestionDecision,
  updateProfileEditDraft,
} from "../../data/profile-edit-session";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { ProfileNotice, ProfilePageFrame, ProfilePrimaryButton } from "./ProfilePagePrimitives";
import { useProfileEditSessionScreen } from "./useProfileEditSessionScreen";

type Decision = "accepted" | "dismissed";

export function ProfileSuggestionsScreen() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const router = useRouter();
  const sessionState = useProfileEditSessionScreen();
  const client = useOrbitApiClient();
  const scopeKey = sessionState.scope ? JSON.stringify([sessionState.scope.apiOrigin, sessionState.scope.actorId, "profile-suggestions"]) : null;
  const resource = validateApiResourceState(useApiResource<unknown>(ORBIT_API_ENDPOINTS.profileUpdateSuggestions, () => false, { cachePolicy: "network-only", scopeKey }), profileSuggestionsSchema);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const data = resource.kind === "success" || resource.kind === "empty" ? resource.data : null;
  const decisions = sessionState.session?.suggestionDecisions ?? {};
  const suggestions = useMemo(() => data?.suggestions.map(item => ({
    ...item,
    status: decisions[item.id] ?? item.status,
  })) ?? [], [data, decisions]);

  function applyPatch(suggestion: ProfileSuggestion, patch: Record<string, unknown>) {
    if (!sessionState.scope) return;
    if (["bio", "offering", "seeking"].includes(suggestion.targetProfileField)) {
      applyProfileSuggestionToDraft(sessionState.scope, {
        field: suggestion.targetProfileField as "bio" | "offering" | "seeking",
        id: suggestion.id,
        value: patch[suggestion.targetProfileField] as string | string[],
      });
    } else {
      const fieldMap = {
        headline: "headline", homeMarket: "homeMarket", relationshipGoal: "relationshipGoal",
        targetRelationshipTypes: "targetRelationshipTypes", preferredFollowUpWindow: "preferredFollowUpWindow",
        preferredIntroChannels: "preferredIntroChannels",
      } as const;
      const field = fieldMap[suggestion.targetProfileField as keyof typeof fieldMap];
      if (field) updateProfileEditDraft(sessionState.scope, { [field]: patch[suggestion.targetProfileField] });
    }
  }

  async function decide(suggestion: ProfileSuggestion, decision: Decision): Promise<boolean> {
    if (!sessionState.scope || suggestion.status !== "pending" || busyIds.includes(suggestion.id)) return false;
    let mutationId: string;
    try {
      mutationId = profileSuggestionDecisionMutationId(sessionState.scope, suggestion.id, decision, () => Crypto.randomUUID());
    } catch {
      setErrors(current => ({ ...current, [suggestion.id]: locale.t("profile.savePrepareFailed") }));
      return false;
    }
    setBusyIds(current => [...current, suggestion.id]);
    setErrors(current => { const next = { ...current }; delete next[suggestion.id]; return next; });
    try {
      const result = await client.post<unknown>(decision === "accepted" ? profileUpdateSuggestionAcceptPath(suggestion.id) : profileUpdateSuggestionDismissPath(suggestion.id), { body: { mutationId } });
      if (!result.success || result.status < 200 || result.status >= 300) throw new Error("decision failed");
      if (decision === "accepted") {
        const receipt = profileSuggestionReceiptSchema(suggestion, mutationId).safeParse(result.data);
        if (!receipt.success) throw new Error("receipt mismatch");
        applyPatch(suggestion, receipt.data.profilePatch);
      } else {
        const receipt = profileSuggestionDismissReceiptSchema(suggestion, mutationId).safeParse(result.data);
        if (!receipt.success) throw new Error("receipt mismatch");
      }
      recordProfileSuggestionDecision(sessionState.scope, suggestion.id, decision, mutationId);
      sessionState.syncSession();
      return true;
    } catch {
      setErrors(current => ({ ...current, [suggestion.id]: locale.t("profile.suggestionUnconfirmed") }));
      return false;
    } finally {
      setBusyIds(current => current.filter(id => id !== suggestion.id));
    }
  }

  async function acceptAll() {
    if (batchBusy) return;
    setBatchBusy(true);
    for (const suggestion of suggestions.filter(item => item.status === "pending")) {
      await decide(suggestion, "accepted");
    }
    setBatchBusy(false);
  }

  const pendingCount = suggestions.filter(item => item.status === "pending").length;
  return <ProfilePageFrame backLabel={locale.t("profile.editPageTitle")} onBack={() => router.back()} title={locale.t("profile.suggestionsTitle")}
    footer={pendingCount > 0 ? <ProfilePrimaryButton disabled={batchBusy} label={locale.t("profile.acceptAllSuggestions")} onPress={() => void acceptAll()} /> : undefined}>
    {resource.kind === "loading" ? <ProfileNotice>{locale.t("profile.suggestionsReading")}</ProfileNotice> : null}
    {(resource.kind === "failure" || resource.kind === "offline") ? <><ProfileNotice error>{locale.t("profile.suggestionsUnavailable")}</ProfileNotice><ProfilePrimaryButton label={locale.t("common.retry")} onPress={resource.refresh} secondary /></> : null}
    {data && suggestions.length === 0 ? <ProfileNotice>{locale.t("profile.suggestionsEmpty")}</ProfileNotice> : null}
    {suggestions.map(suggestion => {
      const status = suggestion.status;
      const pending = status === "pending";
      const busy = busyIds.includes(suggestion.id);
      const labelKeys: Partial<Record<ProfileSuggestion["targetProfileField"], MessageKey>> = {
        bio: "profile.currentWork", offering: "profile.offering", seeking: "profile.seeking", headline: "profile.headline",
        homeMarket: "profile.location", relationshipGoal: "profile.relationshipGoal", targetRelationshipTypes: "profile.targetRelationshipTypes",
        preferredFollowUpWindow: "profile.followUpWindow", preferredIntroChannels: "profile.introChannels",
      };
      const display = (value: string | readonly string[]) => typeof value === "string" ? value : value.join("、");
      return <View key={suggestion.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.field}>{locale.t(labelKeys[suggestion.targetProfileField] ?? "profile.fieldDefault")}</Text>
          <Text style={styles.status}>{locale.t(status === "accepted" ? "profile.suggestionStatusAccepted" : status === "dismissed" ? "profile.suggestionStatusDismissed" : "profile.suggestionStatusPending")}</Text>
        </View>
        <Text style={styles.source}>{locale.t(suggestion.sourceKind === "chat" ? "profile.signalSourceChat" : suggestion.sourceKind === "activity" ? "profile.signalSourceActivity" : "profile.signalSourceContact")} · {locale.t(suggestion.confidence === "high" ? "profile.confidenceHigh" : suggestion.confidence === "low" ? "profile.confidenceLow" : "profile.confidenceMedium")}</Text>
        <View style={styles.diff}>
          <Text style={styles.diffLabel}>{locale.t("profile.currentValue")}</Text><Text style={styles.value}>{locale.t.literal(display(suggestion.currentValue))}</Text>
          <Text style={styles.diffLabel}>{locale.t("profile.suggestedValue")}</Text><Text style={styles.strongValue}>{locale.t.literal(display(suggestion.suggestedValue))}</Text>
        </View>
        <Text style={styles.rationale}>{locale.t.literal(suggestion.rationale)}</Text>
        {suggestion.evidence.map(item => <Text key={item.evidenceId} style={styles.evidence}>{locale.t.literal(item.excerpt)}</Text>)}
        {errors[suggestion.id] ? <ProfileNotice error>{errors[suggestion.id]}</ProfileNotice> : null}
        {pending ? <View style={styles.actions}>
          <Pressable accessibilityLabel={`${locale.t("profile.confirmSuggestion")} ${locale.t(labelKeys[suggestion.targetProfileField] ?? "profile.fieldDefault")}`} accessibilityRole="button" disabled={busy} onPress={() => void decide(suggestion, "accepted")} style={({ pressed }) => [styles.accept, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.acceptText}>{locale.t("profile.confirmSuggestion")}</Text></Pressable>
          <Pressable accessibilityLabel={`${locale.t("profile.dismissSuggestion")} ${locale.t(labelKeys[suggestion.targetProfileField] ?? "profile.fieldDefault")}`} accessibilityRole="button" disabled={busy} onPress={() => void decide(suggestion, "dismissed")} style={({ pressed }) => [styles.dismiss, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.dismissText}>{locale.t("profile.dismissSuggestion")}</Text></Pressable>
        </View> : null}
      </View>;
    })}
  </ProfilePageFrame>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  cardHeader: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  field: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: "800" },
  status: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  source: { color: colors.text4, fontSize: 12 },
  diff: { backgroundColor: colors.surface2, borderColor: colors.border, borderRadius: 8, borderWidth: 1, gap: 5, padding: 12 },
  diffLabel: { color: colors.text4, fontSize: 11, fontWeight: "700" },
  value: { color: colors.text3, fontSize: 14 },
  strongValue: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  rationale: { color: colors.text, fontSize: 13 },
  evidence: { color: colors.text4, fontSize: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  accept: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 8, flexGrow: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  acceptText: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  dismiss: { alignItems: "center", borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexGrow: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  dismissText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.68 },
}));
