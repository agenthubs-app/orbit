"use client";

import type { OrbitAdminViewModel } from "../orbit-admin-platform-route-view-model";
import type { OrbitLanguage } from "../orbit-language-core";
import { formatOrbitDateTime } from "../orbit-datetime";
import { eventCoverPhoto } from "../orbit-event-cover-photo";
import { EventCover } from "../events/orbit-event-cover";
import { adminText } from "../orbit-2026/copy/admin";
import { Avatar, Card, Chip, ListRow, RowChevron } from "../orbit-2026/ui";
import { HostShell } from "./orbit-real-admin-shell";
import styles from "./Admin.module.css";

export function OrbitRealAdminWorkspace({ viewModel, language }: { viewModel: OrbitAdminViewModel; language: OrbitLanguage }) {
  const counts = {
    all: viewModel.adminEvents.length,
    active: viewModel.adminEvents.filter((event) => event.status === "active").length,
    upcoming: viewModel.adminEvents.filter((event) => event.status === "upcoming").length,
    ended: viewModel.adminEvents.filter((event) => event.status === "ended").length,
  };
  return (
    <HostShell active="dash" language={language} viewModel={viewModel}>
      <header className={styles.head}>
        <div><p className={styles.eyebrow}>{adminText("workspace", language)}</p><h1 className={styles.title}>{adminText("dashboardTitle", language)}</h1></div>
        <Chip label={adminText("readOnly", language)} />
      </header>
      <div className={styles.grid}>
        {(["all", "active", "upcoming", "ended"] as const).map((key) => <Card key={key}><div className={styles.stat}><span className={styles.statValue}>{counts[key]}</span><span className={styles.statLabel}>{adminText(key, language)}</span></div></Card>)}
      </div>
      <Card className={styles.section} title={adminText("eventSource", language)} trailing={<span className={styles.meta}>{adminText("eventCount", language).replace("{count}", String(counts.all))}</span>}>
        {viewModel.adminEvents.length === 0 ? <p className={styles.body}>{adminText("noEvents", language)}</p> : (
          <div className={styles.list}>
            {viewModel.adminEvents.map((event) => <ListRow key={event.id} title={event.name} subtitle={`${formatOrbitDateTime(event.startsAt, language)} · ${event.venue}`} leading={<EventCover className={styles.eventCover} g={event.g} imageAlt={event.name} imageSizes="44px" imageUrl={eventCoverPhoto(event.code)} monogram={eventCoverPhoto(event.code) ? null : { text: event.name.slice(0, 1), size: 18 }} style={{ borderRadius: "var(--r-sm)", flexShrink: 0, height: 44, width: 44 }} />} trailing={<RowChevron />} href={`/app/events/${encodeURIComponent(event.id)}`} />)}
          </div>
        )}
      </Card>
      <Card className={styles.section} title={adminText("accountProfile", language)}>
        <ListRow title={viewModel.adminAccount.name} subtitle={viewModel.adminAccount.email || adminText("emailUnavailable", language)} leading={<Avatar name={viewModel.adminAccount.name} />} />
      </Card>
      <Card variant="flat" className={styles.section} title={adminText("dataBoundary", language)}><p className={styles.body}>{adminText("boundary", language)}</p></Card>
    </HostShell>
  );
}
