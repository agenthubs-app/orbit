import {
  Redirect,
  Stack,
  type Href,
  useGlobalSearchParams,
  usePathname
} from "expo-router";
import type { ComponentType, PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { colors, spacing, typography } from "../design/tokens";
import {
  isPrivateMobileRoute,
  mobileLoginHref
} from "../view-models/mobile-route-access";

export function OrbitRouteAccessBoundary() {
  const auth = useOrbitAuthSession();

  if (!auth.ready) {
    return <OrbitAuthLoading />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
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
  return (
    <View
      accessibilityLabel="正在确认登录状态"
      accessibilityRole="progressbar"
      style={styles.loading}
    >
      <ActivityIndicator color={colors.accent} size="small" />
      <Text style={styles.loadingText}>正在确认登录状态…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center"
  },
  loadingText: {
    color: colors.text2,
    fontSize: typography.body
  }
});
