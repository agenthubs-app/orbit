import { useOrbitLocale } from "../i18n/OrbitLocaleContext";
import { UiText } from "./ui/Text";
import {
  Redirect,
  Stack,
  type Href,
  useGlobalSearchParams,
  usePathname
} from "expo-router";
import type { ComponentType, PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { spacing, typography } from "../design/tokens";
import { createThemedStyles, useOrbitTheme } from "../design/theme";
import { mobileLoginHref } from "../view-models/mobile-route-access";

export function OrbitRouteAccessBoundary() {
  const { colors } = useOrbitTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

export function OrbitPrivateRouteBoundary({
  children,
  enabled = true
}: PropsWithChildren<{ enabled?: boolean }>) {
  const pathname = usePathname();
  const params = useGlobalSearchParams() as Record<
    string,
    string | string[] | undefined
  >;
  const auth = useOrbitAuthSession();

  if (!enabled || auth.signedIn) {
    return children;
  }

  if (!auth.ready) {
    return <OrbitAuthLoading />;
  }

  return <Redirect href={mobileLoginHref(pathname, params) as Href} />;
}

export function withOrbitPrivateRoute<Props extends object>(
  Screen: ComponentType<Props>
): ComponentType<Props> {
  function ProtectedOrbitRoute(props: Props) {
    return (
      <OrbitPrivateRouteBoundary>
        <Screen {...props} />
      </OrbitPrivateRouteBoundary>
    );
  }

  ProtectedOrbitRoute.displayName = `withOrbitPrivateRoute(${
    Screen.displayName ?? Screen.name ?? "Screen"
  })`;

  return ProtectedOrbitRoute;
}

function OrbitAuthLoading() {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  return (
    <View
      accessibilityLabel={locale.t("shell.checkingSignInLabel")}
      accessibilityRole="progressbar"
      style={styles.loading}
    >
      <ActivityIndicator color={colors.accentText} size="small" />
      <UiText style={styles.loadingText}>{locale.t("shell.checkingSignIn")}</UiText>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center"
  },
  loadingText: {
    color: colors.ink2,
    fontSize: typography.body
  }
}));
