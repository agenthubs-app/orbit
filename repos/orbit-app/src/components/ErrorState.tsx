import { Text } from "react-native";
import { textStyles } from "../design/tokens";
import { useOrbitTheme } from "../design/theme";
import { DataCard } from "./DataCard";
import { useOrbitLocale } from "../i18n/OrbitLocaleContext";

interface ErrorStateProps {
  message: string;
  title?: string;
}

export function ErrorState({
  message,
  title
}: ErrorStateProps) {
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  return (
    <DataCard title={title ?? t("common.loadFailedTitle")} variant="inset">
      <Text
        style={{
          ...textStyles.small,
          color: colors.coralText
        }}
      >
        {message}
      </Text>
    </DataCard>
  );
}
