import { inboxAppTargetHref } from "../../view-models/inbox-target";

/** A Web API target that opens the equivalent native tab or detail route. */
export function homeAppTargetHref(raw: string | null): string | null {
  const href = inboxAppTargetHref(raw);
  if (!href) return null;
  if (href.startsWith("/tasks")) {
    const url = new URL(href, "https://app.local");
    const tab = url.searchParams.get("tab");
    const seg = tab === "calendar" || tab === "plan" || tab === "memo" ? tab : "todo";
    const params = new URLSearchParams({ seg });
    for (const [key, value] of url.searchParams) if (key !== "tab") params.set(key, value);
    return `/task?${params}`;
  }
  if (href === "/agent" || href.startsWith("/agent?")) return href.replace(/^\/agent/u, "/ai");
  if (["/contacts", "/events", "/inbox", "/task", "/plans", "/notes", "/ai", "/home"].some(path => href === path || href.startsWith(`${path}/`) || href.startsWith(`${path}?`))) return href;
  return null;
}
