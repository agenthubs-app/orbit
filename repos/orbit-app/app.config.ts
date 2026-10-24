import type { ExpoConfig } from "expo/config";

// 主会话代定 §R19-10: local builds stay free of WidgetKit/App Group entitlements by default.
const widgetkitEnabled = process.env.ORBIT_ENABLE_WIDGETS === "1";

const config: ExpoConfig = {
  name: "Orbit",
  slug: "orbit-app",
  icon: "./assets/icon.png",
  scheme: "orbit",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
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
    "expo-notifications",
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
    buildNumber: "6",
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
    output: "static"
  },
  extra: {
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    widgetkitEnabled,
    ...(process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL
      ? { orbitApiBaseUrl: process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL }
      : {})
  }
};

export default config;
