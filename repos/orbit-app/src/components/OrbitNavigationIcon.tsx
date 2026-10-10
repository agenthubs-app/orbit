import { Icon, type IconName } from "./ui/Icon";

// R02 / R05: the tab icons are the design kit's (kit.js TABS: home / users /
// sparkle / calendar / task) drawn by <Icon> from the icon source.
export type NavigationIconName = "home" | "contacts" | "iorbit" | "events" | "task";

const TAB_ICONS: Record<NavigationIconName, IconName> = {
  home: "home",
  contacts: "users",
  iorbit: "sparkle",
  events: "calendar",
  task: "task"
};

export function OrbitNavigationIcon({ name, size = 21, color }: {
  name: NavigationIconName;
  size?: number;
  color: string;
}) {
  // The icon scale is 16 / 20 / 21 / 24; the kit's tab bar uses 21, a large tab 24.
  return <Icon name={TAB_ICONS[name]} size={size >= 24 ? 24 : 21} color={color} />;
}
