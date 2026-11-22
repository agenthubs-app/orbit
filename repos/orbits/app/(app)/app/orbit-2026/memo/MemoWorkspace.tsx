"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { memoCopy } from "../copy/memo";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { Bone, Button, CategoryTabs, Chip, EmptyState, Icon, IconButton, Modal, Orbit2026Scope, RetryCard, SearchField, Skeleton, TextField, ToastProvider, useStandardCopy, useToast } from "../ui";
import { activeMemoMentionQuery, insertMemoMention, memoContactIds, memoPage, memoRequest, memoTabForKind, rebaseMemoMentions, type MemoMentionCandidate, type MemoRow, type MemoTab } from "./memo-model";
import styles from "./memo.module.css";
import { useAreaChanges } from "../../orbit-change-watch";

type Counts = Record<MemoTab, number | null>;
const countsKey = (query: string) => `memo:counts:${query}`;
const PHONE_QUERY = "(max-width: 767px)";

type Draft = { title: string; body: string; kind: "meeting" | "free" | "voice"; usedForPlan: boolean; contactIds: string[]; eventIds: string[]; mentions: MemoRow["mentions"] };
const emptyDraft = (): Draft => ({ title: "", body: "", kind: "free", usedForPlan: false, contactIds: [], eventIds: [], mentions: [] });
const mutationKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`;
const asRecord = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const dataOf = (value: unknown) => asRecord(asRecord(value)?.data);

function memoBody(row: MemoRow, contacts: Readonly<Record<string, string>>, events: Readonly<Record<string, string>>): ReactNode {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const mention of [...row.mentions].sort((left, right) => left.start - right.start)) {
    if (mention.start < offset || row.body.slice(mention.start, mention.end) !== mention.displayText) continue;
    parts.push(row.body.slice(offset, mention.start));
    const contactId = (mention.entityType ?? "contact") === "contact" ? mention.contactId : undefined;
    const eventId = mention.entityType === "event" ? mention.eventId : undefined;
    const href = contactId && row.contactIds.includes(contactId) && contacts[contactId]
      ? `/app/contacts/${encodeURIComponent(contactId)}`
      : eventId && row.eventIds.includes(eventId) && events[eventId]
        ? `/app/events/${encodeURIComponent(eventId)}` : null;
    parts.push(href ? <a key={`${mention.start}:${mention.end}`} href={href}>{mention.displayText}</a> : <span key={`${mention.start}:${mention.end}`}>{mention.displayText}</span>);
    offset = mention.end;
  }
  parts.push(row.body.slice(offset));
  return parts;
}

export function MemoTaskSlot({ initialAdd = false, initialSelectedId }: { initialAdd?: boolean; initialSelectedId?: string }) {
  const { language } = useOrbitLanguage();
  return <MemoWorkspace language={language} initialAdd={initialAdd} initialSelectedId={initialSelectedId} />;
}

export function MemoWorkspace({ language, initialAdd = false, initialSelectedId }: { language: OrbitLanguage; initialAdd?: boolean; initialSelectedId?: string }) {
  return <Orbit2026Scope language={language}><ToastProvider><Workspace language={language} initialAdd={initialAdd} initialSelectedId={initialSelectedId} /></ToastProvider></Orbit2026Scope>;
}

function Workspace({ language, initialAdd, initialSelectedId }: { language: OrbitLanguage; initialAdd: boolean; initialSelectedId?: string }) {
  // The account first, so the remembered counts are this account's.
  useSharedReadAccount();
  const t = useCallback((entry: typeof memoCopy[keyof typeof memoCopy]) => pickCopy(entry, language), [language]);
  const toast = useToast();
  const standard = useStandardCopy();
  const [tab, setTab] = useState<MemoTab>("all");
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [notes, setNotes] = useState<MemoRow[] | null>(null);
  const [total, setTotal] = useState(0);
  // null = not read yet: the tab row is a skeleton until all three counts have answered together.
  const [counts, setCounts] = useState<Counts | null>(() => lastAnswer<Counts>(countsKey("")) ?? null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState(initialSelectedId ?? "");
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [editor, setEditor] = useState<{ id?: string; version?: number; draft: Draft; key: string } | null>(initialAdd ? { draft: emptyDraft(), key: mutationKey() } : null);
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState<"conflict" | "other" | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [caret, setCaret] = useState(0);
  const [linkQuery, setLinkQuery] = useState("");
  const [contactOptions, setContactOptions] = useState<MemoMentionCandidate[]>([]);
  const [eventOptions, setEventOptions] = useState<MemoMentionCandidate[]>([]);
  const [optionError, setOptionError] = useState(false);
  const [resolvedContacts, setResolvedContacts] = useState<Record<string, string>>({});
  // Which contact / event id lists have finished resolving: until then their chips are bones, not raw ids.
  const [contactsFor, setContactsFor] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<string | null>(null);
  const bodyInput = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const pinnedId = useRef(initialSelectedId ?? "");
  const editorOpen = Boolean(editor);
  const activeMention = editor ? activeMemoMentionQuery(editor.draft.body, caret, editor.draft.mentions) : null;
  const optionQuery = (activeMention?.query ?? linkQuery).trim();
  useEffect(() => { const timer = window.setTimeout(() => setSettledQuery(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const read = useCallback(async (more = false) => {
    const current = ++generation.current;
    if (more && !cursor) return;
    if (more) setMoreLoading(true); else { setLoading(true); setFailed(false); }
    try {
      const params = new URLSearchParams({ limit: "20", noteKind: tab });
      if (settledQuery) params.set("q", settledQuery);
      if (more && cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/notes?${params}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const envelope: unknown = await response.json();
      const data = typeof envelope === "object" && envelope !== null && "data" in envelope ? (envelope as { data: unknown }).data : null;
      const page = memoPage(data);
      if (!page) throw new Error("invalid memo page");
      if (generation.current !== current) return;
      let rows = page.notes;
      if (!more && tab === "all" && pinnedId.current && !rows.some(row => row.id === pinnedId.current)) {
        try {
          const detail = await fetch(`/api/notes/${encodeURIComponent(pinnedId.current)}`, { credentials: "same-origin" });
          const detailData = detail.ok ? dataOf(await detail.json()) : null;
          const selectedPage = memoPage({ notes: [detailData?.note], total: 1 });
          if (selectedPage?.notes[0]?.id === pinnedId.current) rows = [selectedPage.notes[0], ...rows];
        } catch { /* The first page remains readable if an old link is gone. */ }
      }
      if (generation.current !== current) return;
      setNotes(previous => more ? [...(previous ?? []), ...rows.filter(row => !previous?.some(item => item.id === row.id))] : rows);
      setTotal(page.total); setCursor(page.nextCursor);
      // The tab counts come with the list (same server read); a "load more" page carries the same numbers.
      if (!more && page.kindCounts) { setCounts(page.kindCounts); rememberAnswer(countsKey(settledQuery), page.kindCounts); }
      if (!more) setSelected(value => value && rows.some(row => row.id === value) ? value : rows[0]?.id ?? "");
    } catch {
      if (generation.current === current) setFailed(true);
    } finally {
      if (generation.current === current) { setLoading(false); setMoreLoading(false); }
    }
  }, [cursor, settledQuery, tab]);
  useEffect(() => { setNotes(null); setCursor(undefined); void read(); return () => { generation.current++; }; }, [tab, settledQuery]); // read is intentionally triggered only by the query, not each page cursor
  // Notes changed elsewhere: the list and the tab counts read again behind what is shown.
  useAreaChanges(["memo"], () => { void read(); });
  // A new search keeps the shown numbers until the list read brings the new ones (or the remembered ones for that search).
  useEffect(() => {
    const remembered = lastAnswer<Counts>(countsKey(settledQuery));
    if (remembered) setCounts(remembered);
  }, [settledQuery]);
  const select = (id: string) => {
    pinnedId.current = id;
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("memo", id);
    window.history.replaceState(window.history.state, "", url);
  };
  // Phone (<768, memo-empty-entry-proposal P2 / P3): two screens like Apple Notes. The list alone, and a tapped
  // note full screen over it (the list keeps its scroll underneath). ?memo=<id> is the open note, so the detail
  // is linkable; opening pushes a history entry, so the browser's back returns to the list. ≥768 is unchanged.
  const [phone, setPhone] = useState(false);
  const [phoneDetail, setPhoneDetail] = useState(false);
  const openedFrom = useRef("");
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    // A link straight to a note (?memo=<id>) opens it on the phone.
    if (query.matches && new URL(window.location.href).searchParams.get("memo")) setPhoneDetail(true);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get("memo");
      if (id && window.matchMedia(PHONE_QUERY).matches) { pinnedId.current = id; setSelected(id); setPhoneDetail(true); }
      else setPhoneDetail(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const detailOpen = phone && phoneDetail;
  const openRow = (id: string) => {
    if (!window.matchMedia(PHONE_QUERY).matches) { select(id); return; }
    pinnedId.current = id; setSelected(id); openedFrom.current = id;
    const url = new URL(window.location.href);
    url.searchParams.set("memo", id);
    // Keep the router's own state fields: Next's popstate handling needs them to restore without a reload.
    window.history.pushState({ ...(window.history.state ?? {}), orbitMemoDetail: true }, "", url);
    setPhoneDetail(true);
  };
  const backToList = () => {
    if ((window.history.state as { orbitMemoDetail?: boolean } | null)?.orbitMemoDetail) { window.history.back(); return; }
    // Opened from a link: there is no list entry behind it, so the address loses ?memo= in place.
    const url = new URL(window.location.href);
    url.searchParams.delete("memo");
    window.history.replaceState(window.history.state, "", url);
    setPhoneDetail(false);
  };
  useEffect(() => {
    if (detailOpen) { document.querySelector<HTMLElement>("[data-memo-back]")?.focus({ preventScroll: true }); return; }
    const id = openedFrom.current;
    if (id) document.querySelector<HTMLElement>(`[data-memo-row="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }, [detailOpen]);
  const current = useMemo(() => notes?.find(row => row.id === selected) ?? notes?.[0], [notes, selected]);
  const contactKey = current?.contactIds.join("\u0000") ?? "";
  useEffect(() => {
    if (!current?.contactIds.length) { setResolvedContacts({}); setContactsFor(contactKey); return; }
    const controller = new AbortController();
    void Promise.all(current.contactIds.slice(0, 20).map(async id => {
      try {
        const response = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { credentials: "same-origin", signal: controller.signal });
        const contact = response.ok ? asRecord(dataOf(await response.json())?.contact) : null;
        return contact?.id === id && typeof contact.displayName === "string" ? [id, contact.displayName] as const : null;
      } catch { return null; }
    })).then(entries => { if (!controller.signal.aborted) { setResolvedContacts(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null))); setContactsFor(contactKey); } });
    return () => controller.abort();
  }, [contactKey]);
  useEffect(() => {
    if (!editorOpen || !online) { setContactOptions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/contacts/search", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: optionQuery, limit: 20 }), signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(String(response.status)); return dataOf(await response.json()); })
        .then(data => { if (!controller.signal.aborted) setContactOptions(Array.isArray(data?.contacts) ? data.contacts.flatMap((raw): MemoMentionCandidate[] => {
          const item = asRecord(raw);
          return item && typeof item.id === "string" && typeof item.displayName === "string" && item.sample !== true ? [{ id: item.id, label: item.displayName, kind: "contact" }] : [];
        }) : []); })
        .catch(() => { if (!controller.signal.aborted) { setContactOptions([]); setOptionError(true); } });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editorOpen, online, optionQuery]);
  const eventKey = current?.eventIds.join("\u0000") ?? "";
  useEffect(() => {
    if ((!editorOpen && !current?.eventIds.length) || !online) { setEventOptions([]); return; }
    const controller = new AbortController();
    void fetch("/api/events", { credentials: "same-origin", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(String(response.status)); return dataOf(await response.json()); })
      .then(data => { if (!controller.signal.aborted) setEventsFor(eventKey); if (!controller.signal.aborted) setEventOptions(Array.isArray(data?.events) ? data.events.flatMap((raw): MemoMentionCandidate[] => {
        const item = asRecord(raw);
        return item && typeof item.id === "string" && typeof item.title === "string" && item.sample !== true ? [{ id: item.id, label: item.title, kind: "event" }] : [];
      }) : []); })
      .catch(() => { if (!controller.signal.aborted) { setEventsFor(eventKey); setEventOptions([]); setOptionError(true); } });
    return () => controller.abort();
  }, [editorOpen, online, eventKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // A memo's linked people / events: resolved names (or, once resolving has answered, the id it could not name).
  const contactsSettled = contactsFor === contactKey;
  const eventsSettled = !current?.eventIds.length || !online || eventsFor === eventKey;
  const linksSettled = contactsSettled && eventsSettled;
  const resolvedEvents = Object.fromEntries(eventOptions.map(option => [option.id, option.label]));
  const openEditor = (row?: MemoRow) => {
    setWriteError(null); setTokenError(false);
    setCaret(0); setLinkQuery(""); setOptionError(false);
    setEditor(row ? { id: row.id, version: row.version, draft: { title: row.title, body: row.body, kind: row.noteKind === "meeting" || row.noteKind === "voice" ? row.noteKind : "free", usedForPlan: row.usedForPlan === true, contactIds: [...row.manualContactIds], eventIds: [...row.eventIds], mentions: row.mentions }, key: mutationKey() } : { draft: emptyDraft(), key: mutationKey() });
  };
  useEffect(() => { if (initialAdd) openEditor(); }, [initialAdd]);
  async function save() {
    if (!editor || saving || !online) return;
    setWriteError(null);
    let payload: ReturnType<typeof memoRequest>;
    try { payload = memoRequest(editor.draft); } catch { setWriteError("other"); return; }
    setSaving(true);
    try {
      const response = await fetch(editor.id ? `/api/notes/${encodeURIComponent(editor.id)}` : "/api/notes", {
        method: editor.id ? "PATCH" : "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, ...(editor.id ? { expectedVersion: editor.version } : {}), idempotencyKey: editor.key }),
      });
      if (!response.ok) { setWriteError(response.status === 409 ? "conflict" : "other"); return; }
      const envelope = await response.json() as { data?: { note?: { id?: string } } };
      const id = envelope.data?.note?.id;
      const saved = memoPage({ notes: [envelope.data?.note], total: 1 })?.notes[0];
      setEditor(null); toast.success(t(memoCopy.saved));
      if (id) pinnedId.current = id;
      if (tab !== "all") setTab("all");
      await read();
      if (id) {
        if (saved) setNotes(previous => previous?.some(row => row.id === id) ? previous : [saved, ...(previous ?? [])]);
        select(id);
      }
    } catch { setWriteError("other"); }
    finally { setSaving(false); }
  }
  const patch = (next: Partial<Draft>) => setEditor(value => value ? { ...value, key: mutationKey(), draft: { ...value.draft, ...next } } : value);
  const changeBody = (body: string) => {
    if (!editor) return;
    const mentions = rebaseMemoMentions(editor.draft.body, body, editor.draft.mentions);
    if (!mentions) { setTokenError(true); return; }
    setTokenError(false); patch({ body, mentions });
  };
  const chooseOption = (option: MemoMentionCandidate) => {
    if (!editor) return;
    if (activeMention) {
      const inserted = insertMemoMention(editor.draft.body, editor.draft.mentions, activeMention, option);
      patch({ body: inserted.body, mentions: inserted.mentions });
      const nextCursor = activeMention.start + `@${option.label.trim()} `.length;
      setCaret(nextCursor);
      requestAnimationFrame(() => { bodyInput.current?.focus(); bodyInput.current?.setSelectionRange(nextCursor, nextCursor); });
    } else if (option.kind === "contact") {
      patch({ contactIds: editor.draft.contactIds.includes(option.id) ? editor.draft.contactIds.filter(id => id !== option.id) : [...editor.draft.contactIds, option.id] });
    } else {
      patch({ eventIds: editor.draft.eventIds.includes(option.id) ? editor.draft.eventIds.filter(id => id !== option.id) : [...editor.draft.eventIds, option.id] });
    }
  };
  const options: { key: MemoTab; label: string }[] = (["all", "meeting", "free"] as const).map(key => ({ key, label: `${t(memoCopy[key])}${counts?.[key] == null ? "" : ` ${counts[key]}`}` }));
  const kindOptions: { key: "meeting" | "free"; label: string }[] = (["meeting", "free"] as const).map(key => ({ key, label: t(memoCopy[key]) }));
  const shownContacts = contactOptions.filter(option => !optionQuery || option.label.toLocaleLowerCase(language).includes(optionQuery.toLocaleLowerCase(language)));
  const shownEvents = eventOptions.filter(option => !optionQuery || option.label.toLocaleLowerCase(language).includes(optionQuery.toLocaleLowerCase(language))).slice(0, 20);
  const draftContactCount = editor ? memoContactIds(editor.draft.contactIds, editor.draft.mentions).length : 0;
  const editorModal = <Modal open={Boolean(editor)} title={editor?.id ? t(memoCopy.edit) : t(memoCopy.add)} size={680} form onClose={() => { if (!saving) setEditor(null); }}>
    {editor ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
      <TextField label={t(memoCopy.title)} value={editor.draft.title} onChange={event => patch({ title: event.target.value })} disabled={saving} />
      <CategoryTabs label={t(memoCopy.meeting)} options={kindOptions} value={memoTabForKind(editor.draft.kind)} onChange={kind => patch({ kind, usedForPlan: kind === "meeting" && editor.draft.usedForPlan })} />
      <label className={styles.bodyLabel}>{t(memoCopy.body)}<textarea ref={bodyInput} value={editor.draft.body} onChange={event => { changeBody(event.target.value); setCaret(event.target.selectionStart); }} onSelect={event => setCaret(event.currentTarget.selectionStart)} disabled={saving} rows={9} /></label>
      {tokenError ? <p role="alert" className={styles.error}>{t(memoCopy.tokenEdit)}</p> : null}
      <div className={styles.linkPicker}>
        {activeMention ? <p className={styles.meta}>{t(memoCopy.mentionChoice)}</p> : <SearchField value={linkQuery} onChange={setLinkQuery} placeholder={t(memoCopy.linkSearch)} />}
        {optionError ? <p role="alert" className={styles.error}>{t(memoCopy.optionsFailed)}</p> : null}
        <div className={styles.optionGroup}><strong>{t(memoCopy.people)}</strong><div className={styles.optionRows}>{shownContacts.map(option => <Button key={option.id} label={`${activeMention ? "@" : "+ "}${option.label}`} onClick={() => chooseOption(option)} disabled={saving} />)}</div></div>
        <div className={styles.optionGroup}><strong>{t(memoCopy.events)}</strong><div className={styles.optionRows}>{shownEvents.map(option => <Button key={option.id} label={`${activeMention ? "@" : "+ "}${option.label}`} onClick={() => chooseOption(option)} disabled={saving} />)}</div></div>
        {!activeMention && (editor.draft.contactIds.length || editor.draft.eventIds.length) ? <div className={styles.selectedLinks}>
          {editor.draft.contactIds.map(id => <Button key={`c:${id}`} label={`${t(memoCopy.removeLink)} ${contactOptions.find(option => option.id === id)?.label ?? resolvedContacts[id] ?? id}`} onClick={() => chooseOption({ id, label: id, kind: "contact" })} disabled={saving} />)}
          {editor.draft.eventIds.map(id => <Button key={`e:${id}`} label={`${t(memoCopy.removeLink)} ${eventOptions.find(option => option.id === id)?.label ?? id}`} onClick={() => chooseOption({ id, label: id, kind: "event" })} disabled={saving} />)}
        </div> : null}
      </div>
      {editor.draft.eventIds.length ? <p className={styles.meta}>{t(memoCopy.eventUnlink)}</p> : null}
      <label className={styles.planUse}><input type="checkbox" checked={editor.draft.usedForPlan} disabled={saving || editor.draft.kind !== "meeting" || draftContactCount !== 1} onChange={event => patch({ usedForPlan: event.target.checked })} />{t(memoCopy.planUse)}</label>
      {editor.draft.kind !== "meeting" || draftContactCount !== 1 ? <p className={styles.meta}>{t(memoCopy.planNeedsOne)}</p> : null}
      {writeError ? <p role="alert" className={styles.error}>{t(writeError === "conflict" ? memoCopy.conflict : memoCopy.saveFailed)}</p> : null}
      <div className={styles.actions}><Button label={t(memoCopy.cancel)} onClick={() => setEditor(null)} disabled={saving} /><Button type="submit" label={t(memoCopy.save)} variant="primary" loading={saving} disabled={!online || !editor.draft.title.trim() || !editor.draft.body.trim()} /></div>
    </form> : null}
  </Modal>;
  // No notes at all (not a search or a kind filter that came back empty): one empty state for the whole
  // workspace — no search row, no kind tabs, no detail panel (memo-empty-entry-proposal P1 / T1 / D1).
  const nothingYet = notes?.length === 0 && !query.trim() && !settledQuery && (tab === "all" || counts?.all === 0);
  // Phone: the header's add button folds away with the shell header, so the workspace carries its own entry
  // (the ＋ by the search field, or the empty state's button). From 768 up both are hidden: the header has it.
  const add = () => openEditor();
  if (nothingYet) return <main className={styles.page}>
    <section className={styles.emptyCard} aria-label={t(memoCopy.empty)}>
      <span className={styles.emptyMark} aria-hidden><Icon name="note" size={20} /></span>
      <EmptyState inset title={t(memoCopy.empty)} />
      <ul className={styles.uses}>
        <li><span className={styles.useMark} aria-hidden>🤝</span><span><strong>{t(memoCopy.meeting)}</strong>{t(memoCopy.useMeeting)}</span></li>
        <li><span className={styles.useMark} aria-hidden>✍️</span><span><strong>{t(memoCopy.free)}</strong>{t(memoCopy.useFree)}</span></li>
        <li><span className={styles.useMark} aria-hidden><Icon name="at" size={16} /></span><span><strong>{t(memoCopy.useLink)}</strong>{t(memoCopy.useLinkBody)}</span></li>
        <li><span className={styles.useMark} aria-hidden><Icon name="target" size={16} /></span><span><strong>{t(memoCopy.usePlan)}</strong>{t(memoCopy.usePlanBody)}</span></li>
      </ul>
      <Button className={styles.phoneAdd} label={t(memoCopy.add)} icon="plus" variant="primary" block onClick={add} disabled={!online} title={!online ? t(memoCopy.needsNetwork) : undefined} />
    </section>
    {editorModal}
  </main>;
  return <main className={styles.page}>
    <div className={`${styles.grid} ${notes?.length === 0 ? styles.gridNoDetail : ""}`}>
      <section className={styles.list} aria-label={t(memoCopy.all)} inert={detailOpen || undefined}>
        <div className={styles.searchRow}>
          <SearchField value={query} onChange={setQuery} placeholder={t(memoCopy.search)} />
          <IconButton className={styles.plus} icon="plus" label={t(memoCopy.add)} onClick={add} disabled={!online} title={!online ? t(memoCopy.needsNetwork) : t(memoCopy.add)} />
        </div>
        {counts ? <CategoryTabs<MemoTab> label={t(memoCopy.all)} options={options} value={tab} onChange={setTab} />
          : <div className={styles.tabsPending} role="progressbar" aria-busy aria-label={standard.loading.loading}>{[72, 64, 88].map(width => <Bone key={width} width={width} height={34} round />)}</div>}
        {notes === null && !failed ? <Skeleton lines={5} /> : null}
        {failed && notes === null ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(); }} /> : null}
        {notes?.length === 0 ? <p className={styles.noResult}>{t(memoCopy.noResult)}</p> : null}
        {notes ? <div className={styles.srOnly} aria-live="polite">{notes.length} / {total}</div> : null}
        {notes?.map(row => <Button key={row.id} label={row.title} aria-label={row.title} className={`${styles.row} ${current?.id === row.id ? styles.selected : ""}`} aria-pressed={current?.id === row.id} data-memo-row={row.id} onClick={() => openRow(row.id)} trailing={<>
          <span className={styles.rowIcon} aria-hidden>{row.noteKind === "meeting" ? "🤝" : row.noteKind === "voice" ? "🎙️" : "✍️"}</span>
          <time className={styles.rowDate}>{new Date(row.updatedAt).toLocaleDateString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" })}</time>
          <span className={styles.rowBody}>{row.body.replace(/\s+/gu, " ")}</span>
          <span className={styles.rowTags}><span>{t(memoCopy[memoTabForKind(row.noteKind)])}</span>{row.noteKind === "voice" ? <span>{t(memoCopy.voice)}</span> : null}</span>
        </>} />)}
        {cursor ? <Button label={t(memoCopy.loadMore)} loading={moreLoading} onClick={() => { void read(true); }} /> : null}
        {failed && notes ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(Boolean(cursor)); }} /> : null}
      </section>
      {notes?.length === 0 ? null : <section className={`${styles.detail} ${detailOpen ? styles.detailOpen : ""}`} aria-label={current?.title ?? t(memoCopy.empty)} data-memo-detail={detailOpen ? "open" : undefined}
        onKeyDown={detailOpen ? event => { if (event.key === "Escape" && !editor) backToList(); } : undefined}>
        {/* Phone only (P3): round back to the list, 「编辑」 on the right. */}
        {current ? <div className={styles.phoneBar}>
          <IconButton data-memo-back="" icon="left" label={standard.nav.back} onClick={backToList} />
          <Button label={t(memoCopy.edit)} size="sm" onClick={() => openEditor(current)} disabled={!online || current.sample === true} />
        </div> : null}
        {current ? <><div className={styles.detailHead}><div><span className={styles.kind}>{t(memoCopy[memoTabForKind(current.noteKind)])}</span><h2>{current.title}</h2><time>{new Date(current.updatedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")}</time></div><Button className={styles.wideEdit} label={t(memoCopy.edit)} onClick={() => openEditor(current)} disabled={!online || current.sample === true} /></div>
          {linksSettled || !current.mentions.length ? <p className={styles.body}>{memoBody(current, resolvedContacts, resolvedEvents)}</p>
            : <div className={styles.body}><Skeleton lines={3} /></div>}
          <div className={styles.chips}>{current.noteKind === "voice" ? <Chip label={t(memoCopy.voice)} /> : null}{!contactsSettled ? current.contactIds.map(id => <Bone key={`c:${id}`} width={72} height={28} round />) : current.contactIds.map(id => resolvedContacts[id] ? <a key={`c:${id}`} href={`/app/contacts/${encodeURIComponent(id)}`} aria-label={`${t(memoCopy.people)}: ${resolvedContacts[id]}`}><Chip label={resolvedContacts[id]} /></a> : <Chip key={`c:${id}`} label={id} />)}{!eventsSettled ? current.eventIds.map(id => <Bone key={`e:${id}`} width={88} height={28} round />) : current.eventIds.map(id => resolvedEvents[id] ? <a key={`e:${id}`} href={`/app/events/${encodeURIComponent(id)}`} aria-label={`${t(memoCopy.events)}: ${resolvedEvents[id]}`}><Chip label={resolvedEvents[id]} /></a> : <Chip key={`e:${id}`} label={id} />)}</div>
          {current.usedForPlan ? <p className={styles.meta}>{t(memoCopy.planUse)}</p> : null}
        </> : null}
      </section>}
    </div>
    {editorModal}
  </main>;
}
