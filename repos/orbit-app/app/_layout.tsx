import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OrbitAuthSessionProvider } from "../src/api/AuthSessionProvider";
import { OrbitApiBaseUrlProvider } from "../src/api/ApiBaseUrlProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <OrbitApiBaseUrlProvider>
        <OrbitAuthSessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="dark" />
        </OrbitAuthSessionProvider>
      </OrbitApiBaseUrlProvider>
    </SafeAreaProvider>
  );
}
