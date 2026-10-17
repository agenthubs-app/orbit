import { StyleSheet, View } from "react-native";

import { Button, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function TodoSentPrompt({ busy, confirmationStarted, onYes, onNotYet }: {
  busy: boolean; confirmationStarted: boolean; onYes: () => void; onNotYet?: () => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useStyles();
  return <View style={styles.prompt} accessibilityRole="alert">
    {!confirmationStarted ? <UiText style={styles.question}>{t("todo.sentQuestion")}</UiText> : null}
    <View style={styles.actions}>
      <Button label={t(confirmationStarted ? "todo.sentRetry" : "todo.sentYes")} onPress={onYes} disabled={busy} size="sm" variant="secondary" />
      {!confirmationStarted && onNotYet ? <Button label={t("todo.sentNotYet")} onPress={onNotYet} disabled={busy} size="sm" variant="ghost" /> : null}
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  prompt: { gap: 8, paddingTop: 8 },
  question: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
}));
