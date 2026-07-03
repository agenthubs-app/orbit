import { useLocalSearchParams } from "expo-router";
import { RefreshControl, StyleSheet, Text } from "react-native";
import { contactDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { contactDetailToSummary } from "../../view-models/contacts";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "contact";
  }

  return value ?? "contact";
}

export function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = firstParam(id);
  const state = useApiResource<unknown>(
    contactDetailPath(contactId),
    () => false
  );

  return (
    <AppScreen
      eyebrow="Contact detail"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Contact"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <ContactDetailCard data={state.data} />
      ) : null}
    </AppScreen>
  );
}

function ContactDetailCard({ data }: { data: unknown }) {
  const contact = contactDetailToSummary(data);

  return (
    <>
      <DataCard
        detail={`${contact.role} ${contact.organization}`.trim()}
        title={contact.name}
      >
        <Text style={styles.bodyText}>{contact.relationship}</Text>
      </DataCard>
      <DataCard detail={contact.location} title="Current status">
        <Text style={styles.bodyText}>{contact.status}</Text>
      </DataCard>
      <DataCard detail={contact.lastInteractionAt} title="Next move">
        <Text style={styles.bodyText}>{contact.nextAction}</Text>
      </DataCard>
    </>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  }
});
