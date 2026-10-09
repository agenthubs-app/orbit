import type { MainTab } from "../view-models/app-navigation";
import { Icon, type IconName } from "./ui/Icon";

// R02: the tab icons are the design kit's (kit.js TABS) drawn by <Icon> from the
// icon source. The tab bar's structure and the Task tab come with R05.
const TAB_ICONS: Record<MainTab | "ai", IconName> = {
  home: "home",
  contacts: "users",
  ai: "sparkle",
  events: "calendar",
  profile: "user"
};

export function OrbitNavigationIcon({ name, size = 21, color }: {
  name: MainTab | "ai";
  size?: number;
  color: string;
}) {
  // The icon scale is 16 / 20 / 21 / 24; the kit's tab bar uses 21, a large tab 24.
  return <Icon name={TAB_ICONS[name]} size={size >= 24 ? 24 : 21} color={color} />;
}
