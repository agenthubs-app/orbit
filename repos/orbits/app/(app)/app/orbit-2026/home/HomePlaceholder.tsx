"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { HomeWidgetKey, HomeWidgetSlot } from "../../../../../shared/contract/home-layout";
import { planV2SummaryResponseSchema } from "../../../../../shared/api-schema/plan-v2";
import { todoPageSchema } from "../../../../../shared/api-schema/todo-page";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { monthHeading } from "../shell/month-heading";
import { DefaultRail, ShellBellButton, ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage } from "../shell/slots";
import { Button, Icon, MacTile, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import type { AvatarTone } from "../ui/Basics";
import { ContactDrawer } from "../network/ContactDrawer";
import { HOME_HEAD, HomeCardBody, useGuideProgress, useSecretaryPreview } from "./HomeCards";
import { homeCopy } from "./home-copy";
import { addHomeWidget, HOME_CATALOG, homeContactCopyKeys, homeOpeningGeometry, homeTodoPagePath, moveHomeWidget, removeHomeWidget, resizeHomeWidget } from "./home-model";
import { useHomeLayout } from "./use-home-layout";
import { homeRailSuggestions, type HomeRailSuggestion } from "./home-rail-model";
import { useHomeResource } from "./use-home-resource";
import styles from "./home.module.css";
import { RailAsk, RecentSessions } from "./RailParts";
import shellStyles from "../shell/shell.module.css";

type T = (key: keyof typeof homeCopy) => string;
const TITLE: Record<HomeWidgetKey, keyof typeof homeCopy> = {
  today: "today", pending: "pending", week: "week", planScore: "planScore", nextEvent: "nextEvent",
  eventPick: "eventPick", network: "network", secretary: "secretary", memo: "memo", deadline: "week",
};
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
  const [later, setLater] = useState<string[]>([]);
  const [sizing, setSizing] = useState<HomeWidgetKey | null>(null);
  const [dragged, setDragged] = useState<HomeWidgetKey | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secretary = useSecretaryPreview();
  const railTodo = useHomeResource(homeTodoPagePath(), todoPageSchema);
  const railPlan = useHomeResource("/api/agent/plans/v2/summary", planV2SummaryResponseSchema);
  const railEvents = useHomeResource("/api/schedule-items", railSchedule);
  const guide = useGuideProgress();
  const contactCopy = homeContactCopyKeys(guide.kind === "ready" && guide.data.kind === "progress" ? guide.data : null);
  const items = editing ? draft ?? [...layout.web] : layout.web;
  const recommendations = homeRailSuggestions({
    secretary: secretary.kind === "ready" ? secretary.data : null,
    todo: railTodo.kind === "ready" ? railTodo.data : null,
    plan: railPlan.kind === "ready" ? railPlan.data : null,
    schedule: railEvents.kind === "ready" ? railEvents.data.scheduleItems.flatMap((raw) => {
      const parsed = railScheduleRow.safeParse(raw); return parsed.success ? [parsed.data] : [];
    }) : null,
  });

  useEffect(() => { if (!editing) { setDraft(null); setSizing(null); } }, [editing]);
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

  const shown = recommendations.filter((item) => !later.includes(item.key));
  // web.html #0: with nothing to suggest the rail is the shell's iOrbit intro; #1/#2: 「次の一手 · ホームから」.
  const rail = editing ? <WidgetLibrary slots={items} t={t} onAdd={(slot) => setDraft(addHomeWidget(items, slot))} />
    : shown.length ? <NextMoveRail items={shown} t={t} onLater={(key) => setLater((keys) => [...keys, key])} />
    : <DefaultRail intro={contactCopy.intro === "railAbout" ? undefined : { title: t("railHello"), body: t("railAboutReady") }} />;

  return <>
    <ShellPage title={month} subtitle={range} left={<ShellSearchButton />}
      right={editing ? <Button label={t("done")} variant="primary" onClick={() => void finish()} disabled={saving} />
        : <><ShellBellButton /><Button label={t("edit")} icon="grid" onClick={enter} disabled={saving || state === "error"} /></>}
      rightRail={rail} railCount={shown.length} phoneFold />
    <main className={styles.body} data-home-layout-state={state} data-home-editing={editing}>
      {state === "error" ? <div className={styles.failure}><span>{t("unavailable")}</span><Button label={t("retry")} variant="ghost" size="sm" onClick={() => void reload()} /></div> : null}
      {state === "loading" ? <p className={styles.subtle} role="status">{t("loading")}</p> : null}
      {state !== "error" && state !== "loading" ? <>
        {!editing && !layout.hintDismissedAt && !hintHidden ? <div className={styles.hint}><Icon name="grid" size={16} /><span><span className={styles.hintPointer}>{t("hint")}</span><span className={styles.hintTouch}>{t("hintTouch")}</span></span><button type="button" className={`btn ${styles.hintClose}`} aria-label={t("close")} onClick={() => void dismissHint()}><Icon name="x" size={16} /></button></div> : null}
        {editing ? <div className={styles.hint}><Icon name="grid" size={16} /><span>{t("dragHint")}</span><button type="button" className={`btn ${styles.hintClose}`} aria-label={t("done")} onClick={() => void finish()}><Icon name="x" size={16} /></button></div> : null}
        <div className={`${styles.grid} ${homeOpeningGeometry(layout) && JSON.stringify(items) === JSON.stringify(layout.web) ? styles.opening : ""}`}>
          {items.map((slot, index) => <section key={slot.key} className={`${styles.card} ${slot.size === "m" ? styles.medium : styles.small} ${editing ? styles.editing : ""}`} data-widget={slot.key}
            draggable={editing} onDragStart={() => setDragged(slot.key)} onDragOver={(event) => { if (editing) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); if (dragged) setDraft(moveHomeWidget(items, dragged, index)); setDragged(null); }}
            onClickCapture={(event) => { if (!editing) return; event.preventDefault(); if (!(event.target as HTMLElement).closest("button")) setSizing(slot.key); }}
            onPointerDown={holdStart} onPointerUp={holdEnd} onPointerCancel={holdEnd} onPointerLeave={holdEnd}>
            {editing ? <>
              {/* b11 #25: the − badge removes; clicking the card opens 小 4 列 / 中 8 列. ↑↓ stay for the keyboard (visible on focus). */}
              <button type="button" className={`btn ${styles.minus}`} aria-label={`${t(TITLE[slot.key])} ${t("remove")}`} onClick={() => remove(slot.key)}>−</button>
              <div className={styles.controls}>
                <button type="button" className="btn" aria-label={`${t(TITLE[slot.key])} ${t("moveUp")}`} disabled={index === 0} onClick={() => setDraft(moveHomeWidget(items, slot.key, index - 1))}>↑</button>
                <button type="button" className="btn" aria-label={`${t(TITLE[slot.key])} ${t("moveDown")}`} disabled={index === items.length - 1} onClick={() => setDraft(moveHomeWidget(items, slot.key, index + 1))}>↓</button>
                <button type="button" className="btn" aria-label={`${t(TITLE[slot.key])} ${t("size")}`} aria-haspopup="menu" aria-expanded={sizing === slot.key} onClick={() => setSizing(slot.key)}>{slot.size === "s" ? t("small") : t("medium")}</button>
              </div>
              {sizing === slot.key ? <div className={styles.szpop} role="menu" aria-label={`${t(TITLE[slot.key])} ${t("size")}`}>
                {(["s", "m"] as const).map((size) => <button key={size} type="button" role="menuitemradio" aria-checked={slot.size === size} className={`btn ${slot.size === size ? styles.on : ""}`}
                  onClick={() => { setDraft(resizeHomeWidget(items, slot.key, size)); setSizing(null); }}>{t(size === "s" ? "small" : "medium")}<small>{t(size === "s" ? "cols4" : "cols8")}</small></button>)}
              </div> : null}
            </> : null}
            <HomeCardBody widget={slot.key} secretary={secretary} onContact={setContact} guide={guide.kind === "ready" && guide.data.kind === "progress" ? guide.data : null} />
          </section>)}
          {editing ? <button type="button" className={`btn ${styles.addTile}`} onClick={() => document.querySelector<HTMLElement>("[data-home-library] button")?.focus()}><Icon name="plus" size={16} />{t("add")}</button> : null}
        </div>
        {editing ? <div className={styles.mobileLibrary}><WidgetLibrary slots={items} t={t} onAdd={(slot) => setDraft(addHomeWidget(items, slot))} /></div> : null}
      </> : null}
    </main>
    {contact ? <ContactDrawer contactId={contact} onClose={() => setContact(null)} /> : null}
  </>;
}

const RAIL_TILE: Record<HomeRailSuggestion["source"], { emoji: string; tone: AvatarTone }> = {
  today: { emoji: "💌", tone: "pink" }, plan: { emoji: "🙋", tone: "teal" }, schedule: { emoji: "🥂", tone: "lav" }, secretary: { emoji: "⏰", tone: "apricot" },
};

/** web.html #2 rail: kit `.rail h4` + `.sugg` cards (primary action + あとで), 最近の会話, `.assist-in`. */
function NextMoveRail({ items, t, onLater }: { items: readonly HomeRailSuggestion[]; t: T; onLater: (key: string) => void }) {
  // shellStyles.railBody: the shell's own rule lets the 1024 drawer size it (b12 N07b).
  return <div className={`${shellStyles.railBody} ${styles.rail}`}>
    <h2 className={styles.railHead}><MacTile emoji="✨" tone="lav" size="sm" />{t("nextMove")}<span>{t("fromHome")}</span></h2>
    {items.map((item) => { const tile = RAIL_TILE[item.source];
      return <div key={item.key} className={styles.sugg}>
        <div className={styles.suggRow}><MacTile emoji={tile.emoji} tone={tile.tone} size="sm" /><div><b>{item.title}</b>{item.detail ? <span>{item.detail}</span> : null}</div></div>
        <div className={styles.suggActs}><Link className={`btn ${styles.suggGo}`} href={item.href}>{item.actionLabel ?? t(item.draft ? "openDraft" : "open")}</Link>
          <button type="button" className={`btn ${styles.suggLater}`} onClick={() => onLater(item.key)}>{t("later")}</button></div>
      </div>; })}
    <RecentSessions />
    <RailAsk />
  </div>;
}

/** web.html #3 / b11 #25 rail: 「ウィジェットを追加」 tiles at their default size, then what is already on Home (dimmed). */
function WidgetLibrary({ slots, t, onAdd }: { slots: readonly HomeWidgetSlot[]; t: T; onAdd: (slot: HomeWidgetSlot) => void }) {
  const available = HOME_CATALOG.filter((item) => !slots.some((slot) => slot.key === item.key));
  const full = slots.length >= 10;
  return <div className={styles.library} data-home-library="">
    <h2 className={styles.railHead}><Icon name="grid" size={16} />{t("add")}</h2>
    <div className={styles.libHint}>{t("libraryHint")}</div>
    <div className={`${styles.wlib} ${styles.wlibOne}`}>{available.map((item) => <button key={item.key} type="button" className={`btn ${styles.wlibTile}`} disabled={full}
      aria-label={`${t(TITLE[item.key])} ${t(item.size === "s" ? "small" : "medium")}`} onClick={() => onAdd({ key: item.key, size: item.size })}>
      <span className={styles.sz}>{t(item.size === "s" ? "small" : "medium")}</span><b>{HOME_HEAD[item.key].emoji} {t(TITLE[item.key])}</b><span>{t(item.description)}</span><i className={styles.plus}><Icon name="plus" size={16} /></i>
    </button>)}</div>
    {slots.length ? <><h2 className={`${styles.railHead} ${styles.onHomeHead}`}>{t("onHome")}</h2>
      <div className={styles.wlib}>{HOME_CATALOG.filter((item) => slots.some((slot) => slot.key === item.key)).map((item) => <div key={item.key} className={`${styles.wlibTile} ${styles.added}`}><b>{HOME_HEAD[item.key].emoji} {t(TITLE[item.key])}</b></div>)}</div></> : null}
  </div>;
}
