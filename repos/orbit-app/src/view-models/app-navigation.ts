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

export function parentForPath(pathname: string): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  switch (parts[0]) {
    case "settings":
      return parts.length > 1 ? { href: "/settings", label: "设置" } : { href: "/profile", label: "我的" };
    case "contacts":
      if (parts[1] === "new" && parts.length > 2) return { href: "/contacts/new", label: "导入中心" };
      if (parts[1] === "analysis") return { href: "/contacts/dashboard", label: "人脉分析" };
      return { href: "/contacts", label: "人脉" };
    case "events":
      if (parts[2] === "operations" && parts.length > 3) return { href: "/events/" + parts[1] + "/operations", label: "活动运营" };
      if (parts.length > 2) return { href: "/events/" + parts[1], label: "活动详情" };
      return { href: "/events", label: "活动" };
    case "tasks":
      if (parts.length > 1) return { href: "/tasks", label: "待办" };
      break;
    case "inbox":
      if (parts.length > 1) return { href: "/inbox", label: "收件箱" };
      break;
    case "schedule":
      if (parts.length > 1) return { href: "/schedule", label: "日程" };
      break;
    case "ai":
    case "agent":
      return { href: "/ai", label: "IORBIT" };
    case "chat":
      return parts.length > 1 ? { href: "/chat", label: "关系对话" } : { href: "/contacts", label: "人脉" };
    case "account":
      if (["signup", "forgot-password", "reset-password"].includes(parts[1] ?? "")) return { href: "/account/login", label: "登录" };
      if (parts.length > 1) return { href: "/account", label: "账号" };
      return { href: "/profile", label: "我的" };
    case "admin":
      if (parts.length > 1) return { href: "/admin", label: "管理" };
      return { href: "/profile", label: "我的" };
    case "party":
      if (parts.length > 1) return { href: "/party", label: "现场" };
      return { href: "/events", label: "活动" };
    case "register":
    case "o":
      return { href: "/events", label: "活动" };
  }
  return { href: "/home", label: "首页" };
}
