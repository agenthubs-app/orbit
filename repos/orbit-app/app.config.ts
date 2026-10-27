import type { ExpoConfig } from "expo/config";

// 主会话代定 §R19-10: local builds stay free of WidgetKit/App Group entitlements by default.
const widgetkitEnabled = process.env.ORBIT_ENABLE_WIDGETS === "1";

const config: ExpoConfig = {
  name: "Orbit",
  slug: "orbit-app",
  owner: "orbitsdev",
  icon: "./assets/icon.png",
  scheme: "orbit",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  // iOS permission prompts follow the device language (QA-D: the camera prompt showed Chinese in a Japanese UI).
  locales: {
    en: "./locales/en.json",
    ja: "./locales/ja.json",
    "zh-Hans": "./locales/zh-Hans.json"
  },
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true
  },
  plugins: [
    "./plugins/with-ios-build-settings",
    "./plugins/with-orbit-widget-autolinking",
    ...(widgetkitEnabled ? ["./plugins/with-orbit-widgetkit"] : []),
    "expo-secure-store",
    ["expo-sqlite", { useSQLCipher: true }],
    "expo-localization",
    // TestFlight and App Store builds need the production APNs environment; device debug builds keep development.
    ["expo-notifications", { mode: process.env.ORBIT_RELEASE_BUILD === "1" ? "production" : "development" }],
    "expo-web-browser",
    ["expo-contacts", { contactsPermission: "读取你选中的联系人（姓名、公司、职位、电话、邮件），导入到人脈。" }],
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
    buildNumber: "16",
    infoPlist: {
      NSCameraUsageDescription:
        "扫描二维码和拍摄名片，用于生成待确认联系人候选。",
      NSPhotoLibraryUsageDescription:
        "选择名片图片，用于生成待确认联系人候选。",
      NSContactsUsageDescription:
        "读取你选中的联系人（姓名、公司、职位、电话、邮件），导入到人脈。"
    }
  },
  web: {
    output: (process.env.ORBIT_WEB_OUTPUT as "static" | "single" | undefined) ?? "static"
  },
  extra: {
    // Expo project for push tokens (expo.dev/@orbitsdev/orbit-app); not a secret.
    eas: { projectId: "30a1258f-8f50-4749-8355-0ccb1eb676b4" },
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    widgetkitEnabled,
    ...(process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL
      ? { orbitApiBaseUrl: process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL }
      : {})
  }
};

export default config;
