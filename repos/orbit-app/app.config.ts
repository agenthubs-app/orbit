import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Orbit",
  slug: "orbit-app",
  scheme: "orbit",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true
  },
  plugins: [
    [
      "expo-image-picker",
      {
        cameraPermission: "拍摄名片图片，用于生成待确认联系人候选。",
        photosPermission: "选择名片图片，用于生成待确认联系人候选。"
      }
    ]
  ],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "app.agenthubs.orbit"
  },
  extra: {
    orbitApiBaseUrl:
      process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? "http://localhost:3000"
  }
};

export default config;
