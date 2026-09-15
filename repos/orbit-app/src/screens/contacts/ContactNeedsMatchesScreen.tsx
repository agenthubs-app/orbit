import { type Href, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { contactNeedsMatchesPayloadSchema } from "../../api/schema/contact-needs";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles } from "../../design/tokens";
import { useOrbitTheme } from "../../design/theme";
import { useContactNeeds } from "../../hooks/useContactNeeds";
import { useValidatedApiResource } from "../../hooks/useValidatedApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { contactNeedsToView } from "../../view-models/contact-needs";
import {
  ContactNeedsEditor,
  contactNeedsErrorMessageKeys,
  contactNeedsSuccessMessageKeys,
} from "./ContactNeedsEditor";
import { ContactNeedsMatchesContent } from "./ContactNeedsMatchesContent";

export function ContactNeedsMatchesScreen() {
  const locale = useOrbitLocale();
  const { colors } = useOrbitTheme();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { baseUrl } = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, baseUrl]);
  const matchesState = useValidatedApiResource(ORBIT_API_ENDPOINTS.contactNeedsMatches, contactNeedsMatchesPayloadSchema, () => false, { cachePolicy: "network-only", scopeKey });
  const needs = useContactNeeds({ onSaved: matchesState.refresh });
  const view = useMemo(() => matchesState.kind === "success" || matchesState.kind === "empty" ? contactNeedsToView(matchesState.data) : null, [matchesState]);
  const saveError = needs.error ? locale.t(contactNeedsErrorMessageKeys[needs.error]) : null;
  const saveMessage = needs.message ? locale.t(contactNeedsSuccessMessageKeys[needs.message]) : null;
  return (
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("contacts.back") })}
      backLabel={locale.t("contacts.back")}
      title={locale.t("contacts.needMatchesTitle")}
      refreshControl={<RefreshControl onRefresh={matchesState.refresh} refreshing={matchesState.refreshing} tintColor={colors.accent} />}
    >
      {matchesState.kind === "loading" ? <LoadingState /> : null}
      {matchesState.kind === "offline" || matchesState.kind === "failure" ? (
        <View style={styles.failure}>
          <ErrorState message={locale.t("contacts.needReadFailed")} title={locale.t("contacts.needLoadFailed")} />
          <Pressable accessibilityLabel={locale.t("common.retry")} accessibilityRole="button" onPress={matchesState.refresh} style={styles.retryAction}>
            <Text style={[styles.retry, { color: colors.accent }]}>{locale.t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : null}
      {view ? <ContactNeedsMatchesContent error={null} onEdit={needs.open} onOpenContact={(id) => router.push(`/contacts/${encodeURIComponent(id)}` as Href)} onRetry={matchesState.refresh} refreshing={matchesState.refreshing} view={view} /> : null}
      <ContactNeedsEditor draft={needs.draft} error={saveError} message={saveMessage} onCancel={needs.cancel} onChange={needs.setDraft} onSave={needs.save} saving={needs.saving} visible={needs.visible} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  failure: { gap: 12 },
  retry: { ...textStyles.small, fontWeight: "700", textAlign: "center" },
  retryAction: { minHeight: layout.control, justifyContent: "center" },
});
