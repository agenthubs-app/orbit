import { Text } from "react-native";
import { textStyles } from "../design/tokens";
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
          ...textStyles.small,
          color: colors.muted
        }}
      >
        {message}
      </Text>
    </DataCard>
  );
}
