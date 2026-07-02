import { RefreshControl, Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { profileToSummary } from "../../view-models/profile";

export function ProfileScreen() {
  const state = useApiResource<unknown>(ORBIT_API_ENDPOINTS.profile, () => false);

  return (
    <AppScreen
      eyebrow="Relationship identity"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Profile"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <ProfileCard data={state.data} />
      ) : null}
    </AppScreen>
  );
}

function ProfileCard({ data }: { data: unknown }) {
  const profile = profileToSummary(data);

  return (
    <DataCard detail={profile.headline} title={profile.displayName}>
      <Text>{profile.timezone}</Text>
    </DataCard>
  );
}
