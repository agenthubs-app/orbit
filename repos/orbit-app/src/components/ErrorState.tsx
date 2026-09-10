import { Text } from "react-native";
import { textStyles } from "../design/tokens";
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
    <DataCard title={title} variant="inset">
      <Text
        style={{
          ...textStyles.small,
          color: colors.rose
        }}
      >
        {message}
      </Text>
    </DataCard>
  );
}
