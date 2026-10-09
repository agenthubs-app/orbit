import { currentTranslator, type OrbitTranslator } from "../i18n/messages";

export type MainTab = "home" | "contacts" | "events" | "profile";

export function mainTabForPath(pathname: string): MainTab | null {
  switch (pathname) {
    case "/home": return "home";
    case "/contacts": return "contacts";
    case "/events": return "events";
    case "/profile": return "profile";
    default: return null;
  }
}

// R03: the back-target labels come from the shell dictionary in the screen language.
export function parentForPath(pathname: string, t: OrbitTranslator = currentTranslator()): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  switch (parts[0]) {
    case "settings":
      return parts.length > 1 ? { href: "/settings", label: t("shell.parent.settings") } : { href: "/profile", label: t("shell.parent.me") };
    case "contacts":
      if (parts[1] === "new" && parts.length > 2) return { href: "/contacts/new", label: t("shell.parent.importCenter") };
      if (parts[1] === "analysis") return { href: "/contacts/dashboard", label: t("shell.parent.networkAnalysis") };
      return { href: "/contacts", label: t("shell.parent.network") };
    case "events":
      if (parts[2] === "operations" && parts.length > 3) return { href: "/events/" + parts[1] + "/operations", label: t("shell.parent.eventOperations") };
      if (parts.length > 2) return { href: "/events/" + parts[1], label: t("shell.parent.eventDetail") };
      return { href: "/events", label: t("shell.parent.events") };
    case "tasks":
      if (parts.length > 1) return { href: "/tasks", label: t("shell.parent.tasks") };
      break;
    case "inbox":
      if (parts.length > 1) return { href: "/inbox", label: t("shell.parent.inbox") };
      break;
    case "schedule":
      if (parts.length > 1) return { href: "/schedule", label: t("shell.parent.schedule") };
      break;
    case "ai":
    case "agent":
      return { href: "/ai", label: t("shell.parent.iorbit") };
    case "chat":
      return parts.length > 1 ? { href: "/chat", label: t("shell.parent.relationshipChat") } : { href: "/contacts", label: t("shell.parent.network") };
    case "account":
      if (["signup", "forgot-password", "reset-password"].includes(parts[1] ?? "")) return { href: "/account/login", label: t("shell.parent.signIn") };
      if (parts.length > 1) return { href: "/account", label: t("shell.parent.account") };
      return { href: "/profile", label: t("shell.parent.me") };
    case "admin":
      if (parts.length > 1) return { href: "/admin", label: t("shell.parent.admin") };
      return { href: "/profile", label: t("shell.parent.me") };
    case "party":
      if (parts.length > 1) return { href: "/party", label: t("shell.parent.live") };
      return { href: "/events", label: t("shell.parent.events") };
    case "register":
    case "o":
      return { href: "/events", label: t("shell.parent.events") };
  }
  return { href: "/home", label: t("shell.parent.home") };
}
