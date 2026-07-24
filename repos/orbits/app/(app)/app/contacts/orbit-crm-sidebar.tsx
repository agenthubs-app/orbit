"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

export type CrmSidebarActive =
  | "list"
  | "pipeline"
  | "graph"
  | "intros"
  | "dashboard"
  | "import"
  | "scan";

type Item = {
  key: CrmSidebarActive;
  icon: string;
  href: string;
  count?: number;
  label: { en: string; zh: string };
};

const WALLET_ITEMS: Item[] = [
  { key: "list", icon: "wallet", href: "/app/contacts", count: 128, label: { en: "All contacts", zh: "全部人脉" } },
  { key: "pipeline", icon: "network", href: "/app/contacts/pipeline", count: 24, label: { en: "Pipeline", zh: "跟进管线" } },
  { key: "graph", icon: "share", href: "/app/contacts/graph", label: { en: "Network graph", zh: "人脉图谱" } },
  { key: "intros", icon: "users", href: "/app/contacts/intros", count: 6, label: { en: "Introductions", zh: "引荐记录" } },
  { key: "dashboard", icon: "grid", href: "/app/contacts/dashboard", label: { en: "Dashboard", zh: "人脉表盘" } },
];

const CAPTURE_ITEMS: Item[] = [
  { key: "import", icon: "download", href: "/app/contacts/new", label: { en: "Import hub", zh: "导入中心" } },
  { key: "scan", icon: "scan", href: "/app/contacts/new", label: { en: "Scan card", zh: "扫名片" } },
];

function NavGroup({
  active,
  items,
  label,
  t,
}: {
  active?: CrmSidebarActive;
  items: Item[];
  label: { en: string; zh: string };
  t: (copy: { en: string; zh: string }) => string;
}) {
  return (
    <>
      <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t(label)}</div>
      {items.map((item) => {
        const on = active === item.key;
        return (
          <a
            href={item.href}
            key={item.key}
            style={{
              alignItems: "center",
              background: on ? "var(--accent-soft)" : "transparent",
              borderRadius: 11,
              color: on ? "var(--accent)" : "var(--text-2)",
              display: "flex",
              fontFamily: "var(--ff)",
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              gap: 12,
              padding: "10px 12px",
              textDecoration: "none",
            }}
          >
            <Icon name={item.icon} size={19} stroke={on ? 2 : 1.7} />
            <span style={{ flex: 1 }}>{t(item.label)}</span>
            {item.count != null ? (
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.8 }}>{item.count}</span>
            ) : null}
          </a>
        );
      })}
    </>
  );
}

/** Shared CRM left sidebar — one source of truth so every 名片夹 page is pixel-identical.
 *  Renders the full ORBIT_LEFT_SIDEBAR_WIDTH column (bg + border + padding). */
export function CrmSidebar({ active }: { active?: CrmSidebarActive }) {
  const { t } = useOrbitLanguage();
  return (
    <aside style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "22px 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <NavGroup active={active} items={WALLET_ITEMS} label={{ en: "Wallet", zh: "名片夹" }} t={t} />
        <div style={{ height: 18 }} />
        <NavGroup active={active} items={CAPTURE_ITEMS} label={{ en: "Capture", zh: "采集" }} t={t} />
      </div>
    </aside>
  );
}
