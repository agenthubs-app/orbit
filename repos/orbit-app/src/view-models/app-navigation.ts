import { currentTranslator, type OrbitTranslator } from "../i18n/messages";
import { taskListHref } from "./task-list-scope";

// R05 NAV-V3 (RD-02): the tab bar is ホーム / 人脈 / iOrbit / イベント / Task.
// iOrbit is a full-screen page (`/ai`) without the bar, so it is not a MainTab.
// 「マイページ」 is a secondary page opened from the home avatar.
export type MainTab = "home" | "contacts" | "events" | "task";

export const MAIN_TAB_PATHS: Readonly<Record<MainTab, string>> = {
  home: "/home",
  contacts: "/contacts",
  events: "/events",
  task: "/task"
};

export function mainTabForPath(pathname: string): MainTab | null {
  switch (pathname) {
    case "/home": return "home";
    case "/contacts": return "contacts";
    case "/events": return "events";
    case "/task": return "task";
    default: return null;
  }
}

// R05 Task container (RD-20): the four segment slots are frozen in this order.
export const TASK_SEGMENTS = ["calendar", "todo", "plan", "memo"] as const;
export type TaskSegment = (typeof TASK_SEGMENTS)[number];

export function isTaskSegment(value: unknown): value is TaskSegment {
  return typeof value === "string" && (TASK_SEGMENTS as readonly string[]).includes(value);
}

/** The Task page on one segment; extra query values (e.g. To-do `scope`) are kept in order. */
export function taskHref(segment: TaskSegment, params: Readonly<Record<string, string | undefined>> = {}): string {
  const query = new URLSearchParams({ seg: segment });
  for (const [key, value] of Object.entries(params)) if (value !== undefined && key !== "seg") query.set(key, value);
  return "/task?" + query.toString();
}

// R05: where the old Task-area addresses land now. The old route files stay as
// redirects (links, bookmarks, notifications already on devices keep working).
export function legacyTaskRedirect(pathname: string, params: Readonly<Record<string, string | undefined>> = {}): string | null {
  switch (pathname) {
    case "/schedule": return taskHref("calendar", { date: params.date });
    case "/today": return taskHref("todo");
    // The list selection is normalised the same way as everywhere else (taskListHref).
    case "/tasks": return taskListHref({ scope: params.scope, view: params.view });
    case "/followups": return taskListHref({ scope: "relationship", view: params.view });
    case "/notes": return params.contactId ? null : taskHref("memo");
    default: return null;
  }
}

// R03: the back-target labels come from the shell dictionary in the screen language.
// R05: a secondary page returns to the tab (and Task segment) it belongs to.
export function parentForPath(pathname: string, t: OrbitTranslator = currentTranslator()): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  switch (parts[0]) {
    case "settings":
      return parts.length > 1 ? { href: "/settings", label: t("shell.parent.settings") } : { href: "/profile", label: t("shell.parent.me") };
    case "profile":
      return parts.length > 1 ? { href: "/profile", label: t("shell.parent.me") } : { href: "/home", label: t("shell.parent.home") };
    case "contacts":
      if (parts[1] === "new" && parts.length > 2) return { href: "/contacts/new", label: t("shell.parent.importCenter") };
      if (parts[1] === "analysis") return { href: "/contacts/dashboard", label: t("shell.parent.networkAnalysis") };
      return { href: "/contacts", label: t("shell.parent.network") };
    case "events":
      if (parts[2] === "operations" && parts.length > 3) return { href: "/events/" + parts[1] + "/operations", label: t("shell.parent.eventOperations") };
      if (parts.length > 2) return { href: "/events/" + parts[1], label: t("shell.parent.eventDetail") };
      return { href: "/events", label: t("shell.parent.events") };
    case "tasks":
    case "today":
    case "followups":
      return { href: taskHref("todo"), label: t("shell.parent.tasks") };
    case "notes":
      return { href: taskHref("memo"), label: t("shell.parent.notes") };
    case "plans":
      // R23: the plan flow and its editor return to Task › プラン.
      return { href: taskHref("plan"), label: t("shell.parent.plan") };
    case "inbox":
      if (parts.length > 1) return { href: "/inbox", label: t("shell.parent.inbox") };
      break;
    case "schedule":
      return { href: taskHref("calendar"), label: t("shell.parent.schedule") };
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
