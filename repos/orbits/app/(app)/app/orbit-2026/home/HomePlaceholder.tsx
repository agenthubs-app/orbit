"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { HomeWidgetKey, HomeWidgetSlot } from "../../../../../shared/contract/home-layout";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { todoPageSchema } from "../../../../../shared/api-schema/todo-page";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { monthHeading } from "../shell/month-heading";
import { ShellBellButton, ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage } from "../shell/slots";
import { Button, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { ContactDrawer } from "../network/ContactDrawer";
import { HomeCardBody, useGuideProgress, useSecretaryPreview } from "./HomeCards";
import { homeCopy } from "./home-copy";
import { addHomeWidget, HOME_CATALOG, homeOpeningGeometry, moveHomeWidget, removeHomeWidget, resizeHomeWidget } from "./home-model";
import { useHomeLayout } from "./use-home-layout";
import { homeRailSuggestions } from "./home-rail-model";
import { useHomeResource } from "./use-home-resource";
import styles from "./home.module.css";

type Category = "all" | (typeof HOME_CATALOG)[number]["category"];
type T = (key: keyof typeof homeCopy) => string;
const TITLE: Record<HomeWidgetKey, keyof typeof homeCopy> = {
  today: "today", pending: "pending", week: "week", planScore: "planScore", nextEvent: "nextEvent",
  eventPick: "eventPick", network: "network", secretary: "secretary", memo: "memo", deadline: "week",
};
const CATEGORY: readonly { key: Category; title: keyof typeof homeCopy }[] = [
  { key: "all", title: "all" }, { key: "today", title: "todayCategory" }, { key: "network", title: "networkCategory" },
  { key: "event", title: "eventCategory" }, { key: "plan", title: "planCategory" }, { key: "secretary", title: "secretaryCategory" },
];
const railScheduleRow = z.object({ id: z.string(), title: z.string(), startsAt: z.string(), state: z.string() });
const railSchedule = z.object({ scheduleItems: z.array(z.unknown()) });

export function HomePlaceholder() {
  const { language } = useOrbitLanguage();
  return <Orbit2026Scope language={language} className={styles.scope}><ToastProvider><HomeWorkspace /></ToastProvider></Orbit2026Scope>;
}

function HomeWorkspace() {
  const { language } = useOrbitLanguage();
  const t: T = (key) => pickCopy(homeCopy[key], language);
  const { month, range } = monthHeading(language);
  const toast = useToast();
  const { layout, reload, save, saving, state } = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HomeWidgetSlot[] | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [hintHidden, setHintHidden] = useState(false);
  const [dragged, setDragged] = useState<HomeWidgetKey | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secretary = useSecretaryPreview();
  const railTodo = useHomeResource("/api/todo/page", todoPageSchema);
  const railPlan = useHomeResource("/api/agent/plans/v2/summary", planV2SummaryResponseSchema);
  const railEvents = useHomeResource("/api/schedule-items", railSchedule);
  const guide = useGuideProgress();
  const items = editing ? draft ?? [...layout.web] : layout.web;
  const recommendations = homeRailSuggestions({
    secretary: secretary.kind === "ready" ? secretary.data : null,
    todo: railTodo.kind === "ready" ? railTodo.data : null,
    plan: railPlan.kind === "ready" ? railPlan.data : null,
    schedule: railEvents.kind === "ready" ? railEvents.data.scheduleItems.flatMap((raw) => {
      const parsed = railScheduleRow.safeParse(raw); return parsed.success ? [parsed.data] : [];
    }) : null,
  });

  useEffect(() => { if (!editing) setDraft(null); }, [editing]);
  const enter = () => { if (state === "error") return; setDraft([...layout.web]); setEditRevision(layout.revision); setEditing(true); };
  const finish = async () => {
    if (!draft || JSON.stringify(draft) === JSON.stringify(layout.web)) { setEditing(false); return; }
    const result = await save({ web: draft }, editRevision ?? undefined);
    if (result.kind === "saved") setEditing(false);
    else if (result.kind === "conflict") { setDraft(null); setEditing(false); toast.error(t("unavailable")); }
    else toast.error(t("unavailable"), { action: { label: t("retry"), onSelect: () => void finish() } });
  };
  const remove = (key: HomeWidgetKey) => {
    const before = [...items];
    setDraft(removeHomeWidget(before, key));
    toast.info(t(TITLE[key]), { undo: () => setDraft(before) });
  };
  const dismissHint = async () => {
    setHintHidden(true);
    const result = await save({ hintDismissedAt: new Date().toISOString() });
    if (result.kind !== "saved") { setHintHidden(false); toast.error(t("unavailable")); }
  };
  const holdStart = () => { if (!editing) hold.current = setTimeout(enter, 400); };
  const holdEnd = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };

  const rail = editing ? <WidgetLibrary slots={items} t={t} onAdd={(slot) => setDraft(addHomeWidget(items, slot))} />
    : <div className={styles.rail}><div className={styles.railBrand}>✨ iOrbit</div><div className={styles.railIntro}><strong>{t("railHello")}</strong><p>{t("railAbout")}</p></div><h2>✨ {t("nextMove")}</h2>{recommendations.length ? recommendations.map((item) =>
      <Link key={item.key} href={item.href} className={styles.railItem}>{item.title}<small>✨ {t(item.source === "secretary" ? "secretary" : item.source === "today" ? "today" : item.source === "plan" ? "planScore" : "schedule")} · {t("fromHome")}</small></Link>)
      : <p className={styles.subtle}>{t("empty")}</p>}<Link href="/app/inbox" className={styles.cardLink}>{t("showAll")} →</Link></div>;

  return <>
    <ShellPage title={month} subtitle={range} left={<ShellSearchButton />}
      right={<><ShellBellButton /><Button label={editing ? t("done") : t("edit")} icon="grid" onClick={() => { if (editing) void finish(); else enter(); }} disabled={saving || state === "error"} /></>}
      rightRail={rail} railCount={recommendations.length} phoneFold />
    <main className={styles.body} data-home-layout-state={state} data-home-editing={editing}>
      {state === "error" ? <div className={styles.failure}><span>{t("unavailable")}</span><button type="button" onClick={() => void reload()}>{t("retry")}</button></div> : null}
      {state === "loading" ? <p className={styles.subtle} role="status">{t("loading")}</p> : null}
      {state !== "error" && state !== "loading" ? <>
        {!editing && !layout.hintDismissedAt && !hintHidden ? <div className={styles.hint}><span>✦ {t("hint")}</span><button type="button" aria-label={t("close")} onClick={() => void dismissHint()}>×</button></div> : null}
        {editing ? <div className={styles.hint}><span>{t("dragHint")}</span><button type="button" onClick={() => setEditing(false)}>{t("done")}</button></div> : null}
        <div className={`${styles.grid} ${homeOpeningGeometry(layout) && JSON.stringify(items) === JSON.stringify(layout.web) ? styles.opening : ""}`}>
          {items.map((slot, index) => <section key={slot.key} className={`${styles.card} ${slot.size === "m" ? styles.medium : styles.small}`} data-widget={slot.key}
            draggable={editing} onDragStart={() => setDragged(slot.key)} onDragOver={(event) => { if (editing) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); if (dragged) setDraft(moveHomeWidget(items, dragged, index)); setDragged(null); }}
            onPointerDown={holdStart} onPointerUp={holdEnd} onPointerCancel={holdEnd} onPointerLeave={holdEnd}>
            <header className={styles.cardHead}><h2>{t(TITLE[slot.key])}</h2>
              {editing ? <div className={styles.controls}>
                <button type="button" aria-label={`${t(TITLE[slot.key])} ${t("moveUp")}`} disabled={index === 0} onClick={() => setDraft(moveHomeWidget(items, slot.key, index - 1))}>↑</button>
                <button type="button" aria-label={`${t(TITLE[slot.key])} ${t("moveDown")}`} disabled={index === items.length - 1} onClick={() => setDraft(moveHomeWidget(items, slot.key, index + 1))}>↓</button>
                <button type="button" aria-label={`${t(TITLE[slot.key])} ${t("size")}`} onClick={() => setDraft(resizeHomeWidget(items, slot.key, slot.size === "s" ? "m" : "s"))}>{slot.size === "s" ? t("small") : t("medium")}</button>
                <button type="button" aria-label={`${t(TITLE[slot.key])} ${t("remove")}`} onClick={() => remove(slot.key)}>−</button>
              </div> : null}
            </header>
            <HomeCardBody widget={slot.key} secretary={secretary} onContact={setContact} guide={guide.kind === "ready" && guide.data.kind === "progress" ? guide.data : null} />
          </section>)}
        </div>
        {editing ? <div className={styles.mobileLibrary}><WidgetLibrary slots={items} t={t} onAdd={(slot) => setDraft(addHomeWidget(items, slot))} /></div> : null}
      </> : null}
    </main>
    {contact ? <ContactDrawer contactId={contact} onClose={() => setContact(null)} /> : null}
  </>;
}

function WidgetLibrary({ slots, t, onAdd }: { slots: readonly HomeWidgetSlot[]; t: T; onAdd: (slot: HomeWidgetSlot) => void }) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const available = HOME_CATALOG.filter((item) => !slots.some((slot) => slot.key === item.key)
    && (category === "all" || item.category === category)
    && t(TITLE[item.key]).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className={styles.library}><h2>{t("add")}</h2><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} />
    <div className={styles.categories}>{CATEGORY.map((item) => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => setCategory(item.key)}>{t(item.title)}</button>)}</div>
    <div className={styles.libraryRows}>{available.map((item) => <div key={item.key}><span>{t(TITLE[item.key])}</span><button type="button" disabled={slots.length >= 10} onClick={() => onAdd({ key: item.key, size: "s" })}>+ {t("small")}</button><button type="button" disabled={slots.length >= 10} onClick={() => onAdd({ key: item.key, size: "m" })}>+ {t("medium")}</button></div>)}</div>
  </div>;
}
