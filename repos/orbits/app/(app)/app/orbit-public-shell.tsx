import { Icon, Logo } from "./orbit-reference-primitives";

export function productHref(prototypeHref: string) {
  if (prototypeHref === "/") return "/app";
  if (prototypeHref === "/explore") return "/app/events";
  if (prototypeHref === "/agent") return "/app/agent";
  if (prototypeHref.startsWith("/agent?")) return `/app/agent?${prototypeHref.split("?")[1]}`;
  if (prototypeHref === "/home") return "/app/account/login";
  if (prototypeHref === "/home/events") return "/app/home/events";
  if (prototypeHref === "/home/profile") return "/app/profile";
  if (prototypeHref === "/home/schedule") return "/app/followups";
  if (prototypeHref === "/home/cards") return "/app/contacts";
  if (prototypeHref === "/home/cards/scan") return "/app/contacts/new";
  if (prototypeHref.startsWith("/home/cards/")) return `/app/contacts/${prototypeHref.split("/").pop()}`;
  if (prototypeHref === "/party") return "/app/party";
  if (prototypeHref.startsWith("/events/")) return `/app/events/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/o/")) return `/app/o/${prototypeHref.split("/").pop()}`;
  if (prototypeHref.startsWith("/register")) return `/app/register${prototypeHref.includes("?") ? `?${prototypeHref.split("?")[1]}` : ""}`;
  return `/app${prototypeHref}`;
}

export function PublicTopNav({ active = "events" }: { active?: "events" | "schedule" | "cards" | "agent" }) {
  return (
    <div className="orbit-desktop-only">
      <header className="orbit-top-nav">
        <a href="/app" aria-label="Orbit" style={{ textDecoration: "none" }}>
          <Logo size={25} />
        </a>
        <a className="orbit-agent-btn" href="/app/agent">
          <Icon name="sparkle" size={15} />
          Orbit Agent
        </a>
        <nav aria-label="Public" className="orbit-nav-links">
          {[
            ["/explore", "活动浏览", "events"],
            ["/home/schedule", "日程", "schedule"],
            ["/home/cards", "名片夹", "cards"],
          ].map(([href, label, key]) => (
            <a
              className={`orbit-nav-link${active === key ? " is-active" : ""}`}
              key={href}
              href={productHref(href)}
            >
              {label}
            </a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
          <span className="mono" style={{ color: "var(--text-3)", fontSize: 12.5 }}>中 / 日</span>
          <a aria-label="我的" href="/app/account/login" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none" }}>
            <span className="avatar g-indigo" style={{ fontSize: 14.28, height: 34, width: 34 }}>李</span>
          </a>
        </div>
      </header>
    </div>
  );
}

export function PublicBottomTab({ active = "events" }: { active?: "home" | "agent" | "events" | "me" }) {
  const tabs = [
    ["home", "/app", "home", "首页"],
    ["agent", "/app/agent", "sparkle", "Orbit Agent"],
    ["events", "/app/events", "calendar", "活动浏览"],
    ["me", "/app/account/login", "user", "我的"],
  ];

  return (
    <div style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.92)", borderTop: "1px solid var(--border)", bottom: 0, display: "flex", height: 62, left: 0, position: "fixed", right: 0, zIndex: 60 }}>
      {tabs.map(([key, href, icon, label]) => (
        <a key={key} href={href} style={{ alignItems: "center", background: "none", border: "none", color: key === active ? "var(--accent)" : "var(--text-4)", display: "flex", flex: 1, flexDirection: "column", gap: 3, paddingTop: 9, textDecoration: "none" }}>
          <Icon name={icon} size={21} stroke={key === active ? 2 : 1.7} />
          <span style={{ fontSize: 9.5, fontWeight: key === active ? 650 : 500, whiteSpace: "nowrap" }}>{label}</span>
        </a>
      ))}
    </div>
  );
}
