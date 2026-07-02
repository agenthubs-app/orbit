import { Text } from "react-native";
import { colors, typography } from "../design/tokens";
import { DataCard } from "./DataCard";

interface EmptyStateProps {
  message: string;
  title: string;
}

export function EmptyState({ message, title }: EmptyStateProps) {
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
