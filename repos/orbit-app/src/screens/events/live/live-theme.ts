import { Platform } from "react-native";

// Same system font stack as the events and contacts pages (eventFont / mainContactFont).
export const liveFont = Platform.select({ web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif', ios: "System", default: "sans-serif" });
