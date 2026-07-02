import { Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useApiResource } from "../../hooks/useApiResource";
import { contactsToSummaries } from "../../view-models/contacts";

export function ContactsScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.contacts,
    (data) => contactsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Address book" title="Contacts">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="Evidence-backed relationships will appear here."
          title="No contacts"
        />
      ) : null}
      {state.kind === "success"
        ? contactsToSummaries(state.data).map((contact) => (
            <DataCard
              detail={contact.organization}
              key={contact.id}
              title={contact.name}
            >
              <Text>{contact.relationship}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
