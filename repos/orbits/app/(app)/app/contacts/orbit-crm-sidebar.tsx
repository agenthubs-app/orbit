"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";

export type CrmSidebarActive =
  | "list"
  | "pipeline"
  | "graph"
  | "intros"
  | "dashboard"
  | "allActions"
  | "import"
  | "scan";

type Item = {
  key: CrmSidebarActive;
  icon: string;
  href: string;
  count?: number;
  label: { en: string; zh: string };
};

/**
 * Counts a caller can supply for the badge column. UI-audit fix C1: these used
 * to be the literals 128 / 24 / 6 baked into this module, so the sidebar
 * asserted "全部人脉 128" next to a list rendering 4 contacts, "跟进管线 24"
 * beside 4 pipeline cards, and "引荐记录 6" above a page whose own KPI said 4.
 * Every 名片夹 page showed the contradiction simultaneously.
 *
 * A page that does not know a given count omits it and the badge is simply not
 * rendered — an absent number is honest, a fabricated one is not.
 */
export type CrmSidebarCounts = Partial<Record<CrmSidebarActive, number>>;

const WALLET_ITEMS: Item[] = [
  { key: "list", icon: "wallet", href: "/app/contacts", label: { en: "All contacts", zh: "全部人脉" } },
  { key: "pipeline", icon: "network", href: "/app/contacts/pipeline", label: { en: "Pipeline", zh: "跟进管线" } },
  { key: "graph", icon: "share", href: "/app/contacts/graph", label: { en: "Network graph", zh: "人脉图谱" } },
  { key: "intros", icon: "users", href: "/app/contacts/intros", label: { en: "Introductions", zh: "引荐记录" } },
  { key: "dashboard", icon: "grid", href: "/app/contacts/dashboard", label: { en: "Dashboard", zh: "人脉表盘" } },
  { key: "allActions", icon: "list", href: "/app/contacts/all-actions", label: { en: "All actions", zh: "操作账本" } },
];

const CAPTURE_ITEMS: Item[] = [
  { key: "import", icon: "download", href: "/app/contacts/new", label: { en: "Import hub", zh: "导入中心" } },
  { key: "scan", icon: "scan", href: "/app/contacts/new", label: { en: "Scan card", zh: "扫名片" } },
];

function NavGroup({
  active,
  counts,
  items,
  label,
  t,
}: {
  active?: CrmSidebarActive;
  counts: CrmSidebarCounts;
  items: Item[];
  label: { en: string; zh: string };
  t: (copy: { en: string; zh: string }) => string;
}) {
  return (
    <>
      <div className="eyebrow" style={{ padding: "0 12px 10px" }}>{t(label)}</div>
      {items.map((item) => {
        const on = active === item.key;
        const count = counts[item.key] ?? item.count;
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
            {count != null ? (
              <span style={{ fontFamily: "var(--ff-mono)", fontSize: 12, opacity: 0.8 }}>{count}</span>
            ) : null}
          </a>
        );
      })}
    </>
  );
}

/** Shared CRM left sidebar — one source of truth so every 名片夹 page is pixel-identical.
 *  Renders the full ORBIT_LEFT_SIDEBAR_WIDTH column (bg + border + padding). */
export function CrmSidebar({
  active,
  counts = {},
}: {
  active?: CrmSidebarActive;
  counts?: CrmSidebarCounts;
}) {
  const { t } = useOrbitLanguage();
  return (
    <aside style={{ background: "var(--bg-sunken)", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "22px 14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <NavGroup active={active} counts={counts} items={WALLET_ITEMS} label={{ en: "Wallet", zh: "名片夹" }} t={t} />
        <div style={{ height: 18 }} />
        <NavGroup active={active} counts={counts} items={CAPTURE_ITEMS} label={{ en: "Capture", zh: "采集" }} t={t} />
      </div>
    </aside>
  );
}
