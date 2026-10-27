import { type Href, useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/States";
import { UiText } from "../../components/ui/Text";
import { createThemedStyles } from "../../design/theme";
import { typography } from "../../design/tokens";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { adminLoginToView } from "../../view-models/admin";

export function AdminLoginScreen() {
  const { styles } = useStyles();
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const { language, t } = useOrbitLocale();
  const view = adminLoginToView({ signedIn: auth.signedIn, language });

  return (
    <AppScreen eyebrow={t("admin.label")} inset="kit" title={view.title}>
      {!auth.ready ? <Skeleton /> : null}
      {auth.ready ? (
        <Card style={styles.card}>
          <UiText style={styles.heading}>{t("admin.login.account")}</UiText>
          <UiText style={styles.body}>{view.summary}</UiText>
          <Button block label={view.primaryLabel} onPress={() => router.push(view.primaryHref as Href)} variant="primary" />
        </Card>
      ) : null}
      <Card variant="flat" style={styles.card}>
        <UiText style={styles.body}>{view.boundary}</UiText>
      </Card>
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { gap: 12 },
  heading: { color: colors.ink, fontSize: typography.dialogTitle, fontWeight: "800" },
  body: { color: colors.ink2, fontSize: typography.bodySm, lineHeight: 23 },
}));
