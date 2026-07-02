import { useLocalSearchParams } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "contact";
  }

  return value ?? "contact";
}

export function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();

  return (
    <AppScreen eyebrow="Contact detail" title="Contact">
      <DataCard
        detail="Detailed relationship context will connect in the Contacts goal."
        title={firstParam(id)}
      />
    </AppScreen>
  );
}
