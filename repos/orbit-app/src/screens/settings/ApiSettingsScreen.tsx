import { Text } from "react-native";
import { createOrbitApiClient } from "../../api/client";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

export function ApiSettingsScreen() {
  const client = createOrbitApiClient();

  return (
    <AppScreen eyebrow="Development" title="Server">
      <DataCard
        detail="Used by the iOS simulator and development builds."
        title="Orbit server address"
      >
        <Text>{client.baseUrl}</Text>
      </DataCard>
    </AppScreen>
  );
}
