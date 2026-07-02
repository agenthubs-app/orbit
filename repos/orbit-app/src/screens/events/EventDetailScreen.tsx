import { useLocalSearchParams } from "expo-router";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();

  return (
    <AppScreen eyebrow="Event detail" title="Event">
      <DataCard
        detail="Detailed event preparation will connect in the Events goal."
        title={firstParam(id)}
      />
    </AppScreen>
  );
}
