import { Pressable, StyleSheet, Text, View } from "react-native";
import { eventDetailRecommendationsSchema } from "../../api/event-detail-contract";
import type { ApiResourceState } from "../../hooks/useApiResource";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function Registration7aRecommendationsView({ eventId, state, onContact }: { eventId: string; state: ApiResourceState<unknown>; onContact: (id: string) => void }) {
  const locale = useOrbitLocale();
  const parsed = state.kind === "success" || state.kind === "empty" ? eventDetailRecommendationsSchema(eventId).safeParse(state.data) : null;
  const failed = state.kind === "failure" || state.kind === "offline" || parsed?.success === false;
  const data = parsed?.success ? parsed.data : null;
  const preparing = state.kind === "loading" || data?.state === "pending";
  return <View style={styles.section}>
    <Text style={styles.title}>{locale.t("portrait66.recommendations")}</Text>
    {failed ? <>
      <Text accessibilityRole="alert" style={styles.muted}>{locale.t("portrait66.recommendationsFailed")}</Text>
      <Pressable accessibilityRole="button" onPress={state.refresh} disabled={state.refreshing}><Text style={styles.link}>{locale.t("common.retry")}</Text></Pressable>
    </> : preparing ? <Text style={styles.muted}>{locale.t("common.loading")}</Text> : data && data.recommendations.length === 0 ? <Text style={styles.muted}>{locale.t("portrait66.noRecommendations")}</Text> : data?.recommendations.map(person => {
      // attendeeId is not a contact id and cannot grant operations-directory access.
      const contactId = person.attendee.contactId;
      const canOpenContact = typeof contactId === "string" && contactId.trim().length > 0 && contactId.length <= 512;
      return <View key={person.recommendationId} style={styles.person}>
        <Text style={styles.name}>{person.attendee.displayName}</Text>
        <Text style={styles.muted}>{[person.attendee.role, person.attendee.organization].filter(Boolean).join(" · ")}</Text>
        {person.reasons.length ? <Text style={styles.muted}>{person.reasons.join(" · ")}</Text> : null}
        {canOpenContact ? <Pressable accessibilityRole="button" onPress={() => onContact(contactId as string)}><Text style={styles.link}>{locale.t("portrait66.viewContact")}</Text></Pressable> : null}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 18, gap: 8 },
  title: { color: "#0B1220", fontSize: 15, fontWeight: "800", lineHeight: 22 },
  person: { paddingVertical: 10, borderBottomColor: "#EEF0F4", borderBottomWidth: 1, gap: 4 },
  name: { color: "#0B1220", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  muted: { color: "#6B7280", fontSize: 12, lineHeight: 19 },
  link: { color: "#0A5CFF", fontSize: 13, fontWeight: "600", paddingVertical: 8 }
});
