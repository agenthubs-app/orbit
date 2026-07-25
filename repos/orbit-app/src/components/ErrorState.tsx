import { Text } from "react-native";
import { colors, typography } from "../design/tokens";
import { DataCard } from "./DataCard";

interface ErrorStateProps {
  message: string;
  title?: string;
}

export function ErrorState({
  message,
  title = "页面暂时无法加载"
}: ErrorStateProps) {
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
