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
    "./plugins/with-ios-build-settings",
    "expo-secure-store",
    "expo-notifications",
    "expo-web-browser",
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
    bundleIdentifier: "app.agenthubs.orbit",
    infoPlist: {
      NSCameraUsageDescription:
        "扫描二维码和拍摄名片，用于生成待确认联系人候选。",
      NSPhotoLibraryUsageDescription:
        "选择名片图片，用于生成待确认联系人候选。"
    }
  },
  extra: {
    orbitApiBaseUrl:
      process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? "http://localhost:3000"
  }
};

export default config;
