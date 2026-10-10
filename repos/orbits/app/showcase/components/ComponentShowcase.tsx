"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { OrbitLanguage } from "../../../shared/contract/language";
import {
  Accordion, Avatar, AvatarStack, Button, Card, CategoryTabs, CheckCircle, Checkbox, Chip, ConfirmCard, ConfirmDialog, ContextMenu,
  CountUp, DegradedCard, Drawer, EmptyState, FilterOption, IconButton, Kbd, ListRow, MacTile, Modal, OfflineBar, Orbit2026Scope,
  Popover, ProgressBar, QuotaChip, Radio, RetryCard, RingChart, RowChevron, SampleBar, SampleTag, SearchField, Segmented, Skeleton,
  Table, TextField, Toggle, ToastProvider, WhyDisclosure, useStandardCopy, useToast,
} from "../../(app)/app/orbit-2026/ui";
import styles from "./components.module.css";

// Developer surface: section names are identifiers (English), sample text is the
// standard wording (R03) so every language can be checked.
type Width = 1440 | 1024 | 390;

export function ComponentShowcase({ language }: { language: OrbitLanguage }) {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [reduced, setReduced] = useState(false);
  const [width, setWidth] = useState<Width>(1440);
  useEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => { if (before === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", before); };
  }, [theme]);
  return (
    <Orbit2026Scope language={language} reducedMotion={reduced} as="main" className={styles.page}>
      <ToastProvider>
        <header className={styles.toolbar}>
          <h1 className={styles.title}>Components · {language}</h1>
          <Segmented<"system" | "light" | "dark"> label="theme" value={theme} onChange={setTheme} segments={[{ key: "system", label: "system" }, { key: "light", label: "light" }, { key: "dark", label: "dark" }]} />
          <Segmented<"1440" | "1024" | "390"> label="width" value={String(width) as "1440" | "1024" | "390"} onChange={(key) => setWidth(Number(key) as Width)} segments={[{ key: "1440", label: "1440" }, { key: "1024", label: "1024" }, { key: "390", label: "390" }]} />
          <label className={styles.inline}><Toggle checked={reduced} onChange={setReduced} label="reduce motion" /> reduce motion</label>
        </header>
        <div className={styles.frame} style={{ maxWidth: width }} data-showcase-width={width}>
          <Sections />
        </div>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={`sc-${name}`}>
      <h2 id={`sc-${name}`} className={styles.sectionName}>{name}</h2>
      <div className={styles.row}>{children}</div>
    </section>
  );
}

function Sections() {
  const copy = useStandardCopy();
  const toast = useToast();
  const [checked, setChecked] = useState({ toggle: true, circle: true, box: false, radio: "a" });
  const [segment, setSegment] = useState<"calendar" | "todo" | "plan" | "notes">("todo");
  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState<string[]>(["a"]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<null | 420 | 480 | 560 | "top">(null);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState<null | "lg" | "md" | "sm">(null);
  const [nested, setNested] = useState(false);
  const [popover, setPopover] = useState(false);
  const [menu, setMenu] = useState(false);
  const [offline, setOffline] = useState(true);
  const popAnchor = useRef<HTMLButtonElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const toggleFilter = (key: string) => setFilters((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  return (
    <>
      <Section name="Button">
        <Button label={copy.action.save} variant="primary" />
        <Button label={copy.action.add} variant="accent" icon="plus" />
        <Button label={copy.action.edit} />
        <Button label={copy.action.later} variant="ghost" />
        <Button label={copy.confirm.delete} variant="danger" />
        <Button label={copy.action.delete} variant="dangerGhost" />
        <Button label={copy.action.delete} variant="dangerSoft" icon="trash" />
        <Button label={copy.action.save} variant="primary" size="sm" />
        <Button label={copy.action.retry} loading />
        <Button label={copy.action.save} disabled />
        <IconButton icon="bell" label={copy.nav.inbox} dot />
        <IconButton icon="search" label={copy.action.open} soft />
        <IconButton icon="more" label={copy.action.open} size={34} />
      </Section>
      <Section name="Card · Chip · Avatar · MacTile · Kbd">
        <Card title={copy.nav.task} trailing={<Button label={copy.action.open} variant="ghost" size="sm" />}><p className={styles.body}>{copy.offline.banner}</p></Card>
        <Card variant="flat"><p className={styles.body}>{copy.error.checkConnection}</p></Card>
        <Card variant="line"><p className={styles.body}>{copy.error.inputKept}</p></Card>
        <div className={styles.row}>
          {(["neutral", "coral", "apricot", "lav", "teal", "blue", "pink", "ok"] as const).map((tone) => <Chip key={tone} tone={tone} label={tone === "ok" ? copy.chip.completed : copy.chip.followUp} />)}
        </div>
        <div className={styles.row}>
          <Avatar name="Hana Yamada" size="lg" /><Avatar name="Aki Tanaka" /><Avatar name="Lin" size="sm" />
          <AvatarStack names={["Yamada", "Sato", "Takahashi", "Lee", "Kim", "Park"]} />
          <MacTile emoji="☕" /><MacTile emoji="🎤" tone="pink" size="sm" />
          <Kbd>⌘</Kbd><Kbd>K</Kbd><Kbd>Esc</Kbd>
        </div>
      </Section>
      <Section name="ListRow (hover actions)">
        <div className={styles.list}>
          <ListRow title="Hana Yamada" subtitle={copy.chip.followUp} leading={<Avatar name="Hana Yamada" />} trailing={<RowChevron />} onSelect={() => undefined}
            hoverActions={[{ key: "done", label: copy.action.complete, icon: "check", tone: "ok", onSelect: () => toast.success(copy.toast.completed) }, { key: "tomorrow", label: copy.action.tomorrow, icon: "clock", onSelect: () => toast.info(copy.toast.movedToTomorrow) }, { key: "delete", label: copy.action.delete, icon: "trash", tone: "coral", onSelect: () => setConfirm(true) }]} />
          <ListRow title="Aki Tanaka" subtitle={copy.chip.upcoming} leading={<Avatar name="Aki Tanaka" />} href="#list" />
        </div>
      </Section>
      <Section name="SearchField · TextField · Accordion · Table">
        <div className={styles.column}>
          <SearchField value={query} onChange={setQuery} placeholder={copy.nav.askIorbit} />
          <TextField label={copy.action.edit} placeholder={copy.nav.askIorbit} />
          <TextField label={copy.action.save} error={copy.toast.saveFailed} defaultValue="Orbit" />
          <Accordion title={copy.aiCard.showWhy}><p>{copy.error.checkConnection}</p></Accordion>
        </div>
        <Table caption="table" rowKey={(row) => row.name} rows={[{ name: "Hana Yamada", state: copy.chip.going }, { name: "Aki Tanaka", state: copy.chip.waitlist }]}
          columns={[{ key: "name", header: copy.nav.network, render: (row) => row.name }, { key: "state", header: copy.nav.events, render: (row) => <Chip label={row.state} tone="lav" /> }]} />
      </Section>
      <Section name="Toast (max 3 · error stays · undo bar)">
        <Button label="success + undo" onClick={() => toast.success(copy.toast.completed, { undo: () => undefined })} />
        <Button label="info + action" onClick={() => toast.info(copy.toast.addedToTasks, { action: { label: copy.action.open, onSelect: () => undefined } })} />
        <Button label="error" onClick={() => toast.error(copy.toast.saveFailed, { action: { label: copy.action.retry, onSelect: () => undefined } })} />
        <Button label="undo bar" onClick={() => toast.success(copy.toast.copied, { undo: () => undefined, keep: true, sub: copy.toast.syncLater })} />
      </Section>
      <Section name="Modal · ConfirmDialog · Drawer · Popover · ContextMenu">
        <Button label="modal 420" onClick={() => setModal(420)} />
        <Button label="modal 480" onClick={() => setModal(480)} />
        <Button label="modal 560" onClick={() => setModal(560)} />
        <Button label="modal top" onClick={() => setModal("top")} />
        <Button label="confirm (destructive)" variant="dangerSoft" onClick={() => setConfirm(true)} />
        <Button label="drawer lg" onClick={() => setDrawer("lg")} />
        <Button label="drawer md" onClick={() => setDrawer("md")} />
        <Button label="drawer sm" onClick={() => setDrawer("sm")} />
        <button ref={popAnchor} type="button" className={`btn ${styles.plain}`} aria-expanded={popover} onClick={() => setPopover(!popover)}>popover</button>
        <button ref={menuAnchor} type="button" className={`btn ${styles.plain}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>context menu</button>
      </Section>
      <Section name="ConfirmCard · WhyDisclosure">
        <ConfirmCard state="pending" title={copy.aiCard.add} detail={copy.draftBoundary.notice} actions={[{ label: copy.aiCard.add, onSelect: () => undefined, primary: true }, { label: copy.aiCard.decline, onSelect: () => undefined }]} />
        <ConfirmCard state="success" title={copy.aiCard.added} actions={[{ label: copy.action.undo, onSelect: () => undefined }]} />
        <ConfirmCard state="failure" title={copy.aiCard.addFailed.replace("{target}", copy.nav.task)} detail={copy.aiCard.nothingWritten} actions={[{ label: copy.action.retry, onSelect: () => undefined, primary: true }]} />
        <WhyDisclosure reason={copy.chip.recommended} />
      </Section>
      <Section name="Toggle · Check · Segmented · Filters">
        <Toggle checked={checked.toggle} onChange={(value) => setChecked({ ...checked, toggle: value })} label={copy.permission.allowNotifications} />
        <CheckCircle checked={checked.circle} onChange={(value) => setChecked({ ...checked, circle: value })} label={copy.action.complete} />
        <Checkbox checked={checked.box} onChange={(value) => setChecked({ ...checked, box: value })} label={copy.action.add} />
        <Radio selected={checked.radio === "a"} onSelect={() => setChecked({ ...checked, radio: "a" })} label="a" />
        <Radio selected={checked.radio === "b"} onSelect={() => setChecked({ ...checked, radio: "b" })} label="b" />
        <Segmented<"calendar" | "todo" | "plan" | "notes"> label={copy.nav.task} value={segment} onChange={setSegment} segments={(["calendar", "todo", "plan", "notes"] as const).map((key) => ({ key, label: copy.taskSegments[key] }))} />
        <CategoryTabs label={copy.nav.network} value={category} onChange={setCategory} options={[{ key: "all", label: copy.filter.clear, count: 247 }, { key: "event", label: copy.nav.events, count: 18 }]} />
        <FilterOption label={copy.chip.followUp} selected={filters.includes("a")} count={12} onToggle={() => toggleFilter("a")} />
        <FilterOption label={copy.chip.upcoming} selected={filters.includes("b")} onToggle={() => toggleFilter("b")} />
      </Section>
      <Section name="Progress · Ring · CountUp">
        <div className={styles.column}><ProgressBar value={0.62} label="62%" /><ProgressBar value={0.9} tone="coral" thin label="90%" /></div>
        <RingChart label="72%" center="72" segments={[{ value: 0.5, color: "var(--plum-700)" }, { value: 0.22, color: "var(--rose-500)" }]} />
        <CountUp value={247} className={styles.number} />
      </Section>
      <Section name="States">
        <EmptyState title={copy.nav.task} message={copy.error.checkConnection} steps={[{ label: copy.action.add, state: "done" }, { label: copy.action.edit, state: "now" }, { label: copy.action.save, state: "later" }]} ghostRows={2} action={{ label: copy.action.add, onSelect: () => undefined }} />
        <div className={styles.column}><Skeleton onRetry={() => undefined} /></div>
        <div className={styles.column}>
          <OfflineBar offline={offline} pending={3} />
          <Button label="online / offline" size="sm" onClick={() => setOffline(!offline)} />
          <SampleBar trailing={<SampleTag />} />
          <div className={styles.row}><QuotaChip left={12} /><QuotaChip left={0} /></div>
        </div>
        <RetryCard title={copy.error.loadFailed.replace("{item}", copy.nav.network)} onRetry={() => undefined} onViewCached={() => undefined} />
        <DegradedCard onRetry={() => undefined} />
      </Section>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={copy.nav.task} description={copy.error.checkConnection} size={modal === "top" || modal === null ? 560 : modal} top={modal === "top"}
        hint={<><Kbd>Esc</Kbd>{copy.action.close}</>} actions={<><Button label={copy.action.cancel} onClick={() => setModal(null)} /><Button label="nested confirm" variant="primary" onClick={() => setNested(true)} /></>} />
      <ConfirmDialog open={nested} title={copy.confirm.deleteTitle.replace("{item}", copy.nav.task)} message={copy.confirm.irreversible} confirmLabel={copy.confirm.delete} destructive onConfirm={() => setNested(false)} onCancel={() => setNested(false)} />
      <ConfirmDialog open={confirm} title={copy.confirm.deleteTitle.replace("{item}", copy.nav.task)} message={copy.confirm.irreversible} confirmLabel={copy.confirm.delete} destructive
        onConfirm={() => { setConfirm(false); toast.success(copy.toast.deleted, { undo: () => undefined }); }} onCancel={() => setConfirm(false)} />
      <Drawer open={drawer !== null} onClose={() => setDrawer(null)} title={copy.nav.network} size={drawer ?? "lg"} footer={<><Button label={copy.action.cancel} onClick={() => setDrawer(null)} /><Button label="nested confirm" variant="primary" onClick={() => setNested(true)} /></>}>
        <ListRow title="Hana Yamada" subtitle={copy.chip.followUp} leading={<Avatar name="Hana Yamada" />} />
        <p className={styles.body}>{copy.offline.banner}</p>
      </Drawer>
      <Popover open={popover} onClose={() => setPopover(false)} anchor={popAnchor} label="popover"><p className={styles.body}>{copy.error.checkConnection}</p></Popover>
      <ContextMenu open={menu} onClose={() => setMenu(false)} anchor={menuAnchor} label="context menu"
        items={[{ key: "open", label: copy.action.open, icon: "right", onSelect: () => undefined }, { key: "copy", label: copy.action.copy, icon: "copy", onSelect: () => toast.success(copy.toast.copied) }, { key: "delete", label: copy.action.delete, icon: "trash", destructive: true, onSelect: () => setConfirm(true) }]} />
    </>
  );
}
