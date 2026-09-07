import { Text } from "react-native";
import { typography } from "../design/tokens";
import { useOrbitTheme } from "../design/theme";
import { DataCard } from "./DataCard";

interface EmptyStateProps {
  message: string;
  title: string;
}

export function EmptyState({ message, title }: EmptyStateProps) {
  const { colors } = useOrbitTheme();
  return (
    <DataCard title={title}>
      <Text
        style={{
          color: colors.muted,
          fontSize: typography.small,
          lineHeight: 20
        }}
      >
        {message}
      </Text>
    </DataCard>
  );
}
