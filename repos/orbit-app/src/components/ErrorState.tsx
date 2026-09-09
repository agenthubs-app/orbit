import { Text } from "react-native";
import { typography } from "../design/tokens";
import { useOrbitTheme } from "../design/theme";
import { DataCard } from "./DataCard";

interface ErrorStateProps {
  message: string;
  title?: string;
}

export function ErrorState({
  message,
  title = "页面暂时无法加载"
}: ErrorStateProps) {
  const { colors } = useOrbitTheme();
  return (
    <DataCard title={title}>
      <Text
        style={{
          color: colors.rose,
          fontSize: typography.small,
          lineHeight: 20
        }}
      >
        {message}
      </Text>
    </DataCard>
  );
}
