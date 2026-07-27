"use client";

import type { ReactNode } from "react";

import type {
  OrbitContactsViewModel,
  OrbitContactStrength,
  OrbitContactView,
} from "../orbit-contacts-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import { Avatar, Icon } from "../orbit-reference-primitives";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../orbit-layout-constants";
import { CrmSidebar } from "./orbit-crm-sidebar";

type Translate = (copy: { en: string; zh: string }) => string;

interface DistributionRow {
  count: number;
  label: string;
  percentage: number;
}

const strengthColor: Record<OrbitContactStrength, string> = {
  dormant: "var(--text-3)",
  medium: "var(--sky)",
  strong: "var(--live)",
  weak: "var(--accent)",
};

function distribution(
  contacts: readonly OrbitContactView[],
  values: (contact: OrbitContactView) => readonly string[],
  limit = 6,
): DistributionRow[] {
  const counts = new Map<string, number>();

  for (const contact of contacts) {
    const labels = values(contact)
      .map((value) => value.trim())
      .filter(Boolean);

    for (const label of new Set(labels.length ? labels : ["未分类"])) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const highest = Math.max(1, ...counts.values());

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      count,
      label,
      percentage: Math.round((count / highest) * 100),
    }));
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function RelationshipMap({
  contacts,
  t,
}: {
  contacts: readonly OrbitContactView[];
  t: Translate;
}) {
  const points = contacts.slice(0, 160).map((contact, index) => {
    const hash = stableHash(`${contact.id}:${index}`);
    const angle = ((hash % 360) * Math.PI) / 180;
    const baseRadius =
      contact.strength === "strong"
        ? 58
        : contact.strength === "medium"
          ? 94
          : contact.strength === "weak"
            ? 128
            : 154;
    const radius = baseRadius + ((hash >>> 9) % 19) - 9;

    return {
      contact,
      x: 190 + Math.cos(angle) * radius,
      y: 190 + Math.sin(angle) * radius,
    };
  });

  return (
    <section className="card" style={{ minHeight: 430, padding: 18 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
        <Icon color="var(--accent)" name="share" size={17} />
        <h2 className="h-section" style={{ margin: 0 }}>
          {t({ en: "Relationship map", zh: "关系星图" })}
        </h2>
      </div>
      <p style={{ color: "var(--text-3)", fontSize: 12, margin: "6px 0 4px" }}>
        {t({
          en: `${contacts.length} source-backed contacts · one dot per contact`,
          zh: `${contacts.length} 位有来源依据的联系人 · 每个光点代表一位联系人`,
        })}
      </p>
      <svg
        aria-label={t({ en: "Relationship map", zh: "关系星图" })}
        role="img"
        style={{ display: "block", margin: "0 auto", maxWidth: 430, width: "100%" }}
        viewBox="0 0 380 380"
      >
        {[58, 94, 128, 154].map((radius) => (
          <circle
            cx="190"
            cy="190"
            fill="none"
            key={radius}
            opacity="0.34"
            r={radius}
            stroke="var(--border-strong)"
          />
        ))}
        {points.map(({ contact, x, y }) => (
          <g key={contact.id}>
            <circle
              cx={x}
              cy={y}
              fill={strengthColor[contact.strength]}
              opacity={contact.dormant ? 0.5 : 0.88}
              r={contact.strength === "strong" ? 5 : 3.5}
            />
            <title>{contact.displayName}</title>
          </g>
        ))}
        <circle cx="190" cy="190" fill="var(--accent)" r="19" />
        <text
          dominantBaseline="middle"
          fill="var(--on-dark)"
          fontSize="12"
          fontWeight="700"
          textAnchor="middle"
          x="190"
          y="191"
        >
          {t({ en: "You", zh: "我" })}
        </text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {(
          [
            ["strong", { en: "Strong", zh: "强关系" }],
            ["medium", { en: "Medium", zh: "中关系" }],
            ["weak", { en: "Weak", zh: "弱关系" }],
            ["dormant", { en: "Dormant", zh: "沉睡" }],
          ] as const
        ).map(([strength, label]) => (
          <span
            key={strength}
            style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 6 }}
          >
            <i style={{ background: strengthColor[strength], borderRadius: 999, height: 7, width: 7 }} />
            {t(label)}
            <strong style={{ color: "var(--ink)" }}>
              {contacts.filter((contact) => contact.strength === strength).length}
            </strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <article className="card" style={{ padding: 16 }}>
      <div style={{ alignItems: "center", color: "var(--text-3)", display: "flex", fontSize: 12, gap: 7 }}>
        <Icon name={icon} size={15} />
        {label}
      </div>
      <strong
        style={{
          color: "var(--ink)",
          display: "block",
          fontFamily: "var(--ff-display)",
          fontSize: 30,
          marginTop: 8,
        }}
      >
        {value}
      </strong>
    </article>
  );
}

function DistributionCard({
  rows,
  title,
}: {
  rows: readonly DistributionRow[];
  title: string;
}) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <h2 className="h-section" style={{ margin: 0 }}>{title}</h2>
      <div style={{ display: "grid", gap: 13, marginTop: 18 }}>
        {rows.map((row) => (
          <div key={row.label}>
            <div style={{ alignItems: "center", display: "flex", fontSize: 13, justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-2)" }}>{row.label}</span>
              <strong style={{ color: "var(--ink)" }}>{row.count}</strong>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 999, height: 7, marginTop: 7, overflow: "hidden" }}>
              <span
                style={{
                  background: "linear-gradient(90deg,var(--accent),var(--sky))",
                  borderRadius: 999,
                  display: "block",
                  height: "100%",
                  width: `${row.percentage}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyDashboard({ t }: { t: Translate }) {
  return (
    <section
      className="card"
      data-orbit-contacts-dashboard-empty
      style={{
        alignItems: "center",
        display: "grid",
        justifyItems: "center",
        minHeight: 430,
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          alignItems: "center",
          background: "var(--accent-soft)",
          borderRadius: 999,
          color: "var(--accent)",
          display: "flex",
          height: 60,
          justifyContent: "center",
          width: 60,
        }}
      >
        <Icon name="users" size={27} />
      </span>
      <div style={{ marginTop: 18, maxWidth: 500 }}>
        <h2 className="h-title" style={{ margin: 0 }}>
          {t({ en: "Your network starts here", zh: "从第一位联系人开始建立人脉" })}
        </h2>
        <p style={{ color: "var(--text-3)", lineHeight: 1.7, margin: "10px 0 0" }}>
          {t({
            en: "There is no relationship data in this account yet. Import contacts, scan a business card, or add someone manually to build this dashboard.",
            zh: "这个账户还没有任何人脉数据。导入联系人、扫描名片或手动添加后，表盘会根据真实记录生成。",
          })}
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 20 }}>
        <a className="btn btn-primary" href="/app/contacts/new">
          <Icon color="var(--on-dark)" name="plus" size={17} />
          {t({ en: "Add a contact", zh: "添加联系人" })}
        </a>
        <a className="btn btn-ghost" href="/app/contacts/new">
          <Icon name="scan" size={17} />
          {t({ en: "Scan a card", zh: "扫描名片" })}
        </a>
      </div>
    </section>
  );
}

function DashboardBody({
  compact = false,
  viewModel,
}: {
  compact?: boolean;
  viewModel: OrbitContactsViewModel;
}) {
  const { t } = useOrbitLanguage();
  const contacts = viewModel.connections;
  const followups = contacts.filter((contact) => contact.nextAction);
  const industries = distribution(contacts, (contact) => [contact.industry]);
  const values = distribution(contacts, (contact) => contact.valueTags);
  const events = new Set(contacts.map((contact) => contact.lastEventId).filter(Boolean));
  const metrics = [
    { icon: "users", label: t({ en: "Total contacts", zh: "总人脉" }), value: contacts.length },
    { icon: "star", label: t({ en: "Strong ties", zh: "强关系" }), value: contacts.filter((contact) => contact.strength === "strong").length },
    { icon: "arrow", label: t({ en: "Needs follow-up", zh: "待跟进" }), value: followups.length },
    { icon: "clock", label: t({ en: "Dormant", zh: "沉睡关系" }), value: contacts.filter((contact) => contact.dormant || contact.strength === "dormant").length },
    { icon: "grid", label: t({ en: "Industries", zh: "行业数" }), value: industries.length },
    { icon: "calendar", label: t({ en: "Source groups", zh: "来源分组" }), value: events.size },
  ];

  if (contacts.length === 0) {
    return <EmptyDashboard t={t} />;
  }

  return (
    <>
      <div style={{ alignItems: compact ? "flex-start" : "flex-end", display: "flex", flexDirection: compact ? "column" : "row", gap: 14, justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 className="h-display" style={{ margin: 0 }}>{t({ en: "Network dashboard", zh: "人脉表盘" })}</h1>
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: "6px 0 0" }}>
            {t({ en: "Computed from this account's relationship records", zh: "根据当前账户的人脉记录实时生成" })}
          </p>
        </div>
        <a className="btn btn-ghost btn-sm" href="/app/contacts">
          {t({ en: "View all contacts", zh: "查看全部人脉" })}
        </a>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(6,minmax(0,1fr))" }}>
        {metrics.map((metric) => <MetricCard {...metric} key={metric.label} />)}
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: compact ? "1fr" : "minmax(0,1.35fr) minmax(300px,.65fr)", marginTop: 16 }}>
        <RelationshipMap contacts={contacts} t={t} />
        <section className="card" style={{ padding: 18 }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <h2 className="h-section" style={{ margin: 0 }}>{t({ en: "Next actions", zh: "下一步行动" })}</h2>
            <span className="chip">{followups.length}</span>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {followups.slice(0, 6).map((contact) => (
              <a
                className="card-flat"
                href={`/app/contacts/${encodeURIComponent(contact.id)}`}
                key={contact.id}
                style={{ alignItems: "center", color: "inherit", display: "flex", gap: 11, padding: 11, textDecoration: "none" }}
              >
                <Avatar g={contact.g} letter={contact.initial} size={38} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: "var(--ink)", display: "block", fontSize: 14 }}>{contact.displayName}</strong>
                  <span style={{ color: "var(--text-3)", display: "block", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {contact.nextAction?.text}
                  </span>
                </span>
                <Icon color="var(--text-4)" name="chevR" size={16} />
              </a>
            ))}
            {followups.length === 0 ? (
              <div className="card-flat" style={{ color: "var(--text-3)", fontSize: 13, padding: 16 }}>
                {t({ en: "No follow-up action is waiting.", zh: "当前没有待跟进动作。" })}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: compact ? "1fr" : "repeat(2,minmax(0,1fr))", marginTop: 16 }}>
        <DistributionCard rows={industries} title={t({ en: "Industry distribution", zh: "行业分布" })} />
        <DistributionCard rows={values} title={t({ en: "Relationship value", zh: "关系价值分布" })} />
      </div>
    </>
  );
}

function AppShell({
  children,
  viewModel,
}: {
  children: ReactNode;
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <main className="orbit-page" data-orbit-real-page="contacts-dashboard">
      <div className="orbit-desktop-only" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div style={{ display: "grid", gridTemplateColumns: `${ORBIT_LEFT_SIDEBAR_WIDTH}px 1fr`, height: "calc(100dvh - 64px)", minHeight: 0 }}>
          <CrmSidebar active="dashboard" counts={{ list: viewModel.connections.length }} />
          <div className="scroll" data-appscroll style={{ overflowY: "auto", padding: "28px 32px 60px" }}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

export function OrbitRealCardsDashboard({
  viewModel,
}: {
  viewModel: OrbitContactsViewModel;
}) {
  return (
    <>
      <AppShell viewModel={viewModel}>
        <DashboardBody viewModel={viewModel} />
      </AppShell>
      <main className="orbit-mobile-only" data-orbit-real-page="contacts-dashboard" style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="cards" />
        <div className="scroll" data-appscroll style={{ padding: "18px 18px 42px" }}>
          <DashboardBody compact viewModel={viewModel} />
        </div>
      </main>
    </>
  );
}
