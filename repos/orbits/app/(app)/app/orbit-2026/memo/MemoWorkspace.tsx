"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { memoCopy } from "../copy/memo";
import { Button, CategoryTabs, Chip, EmptyState, Modal, Orbit2026Scope, RetryCard, SearchField, Skeleton, TextField, ToastProvider, useToast } from "../ui";
import { activeMemoMentionQuery, insertMemoMention, memoContactIds, memoPage, memoRequest, memoTabForKind, rebaseMemoMentions, type MemoMentionCandidate, type MemoRow, type MemoTab } from "./memo-model";
import styles from "./memo.module.css";

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
  const t = useCallback((entry: typeof memoCopy[keyof typeof memoCopy]) => pickCopy(entry, language), [language]);
  const toast = useToast();
  const [tab, setTab] = useState<MemoTab>("all");
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [notes, setNotes] = useState<MemoRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<MemoTab, number | null>>({ all: null, meeting: null, free: null });
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
      if (!more) setSelected(value => value && rows.some(row => row.id === value) ? value : rows[0]?.id ?? "");
    } catch {
      if (generation.current === current) setFailed(true);
    } finally {
      if (generation.current === current) { setLoading(false); setMoreLoading(false); }
    }
  }, [cursor, settledQuery, tab]);
  useEffect(() => { setNotes(null); setCursor(undefined); void read(); return () => { generation.current++; }; }, [tab, settledQuery]); // read is intentionally triggered only by the query, not each page cursor
  useEffect(() => {
    const controller = new AbortController();
    setCounts({ all: null, meeting: null, free: null });
    for (const kind of ["all", "meeting", "free"] as const) {
      const params = new URLSearchParams({ limit: "20", noteKind: kind });
      if (settledQuery) params.set("q", settledQuery);
      void fetch(`/api/notes?${params}`, { credentials: "same-origin", signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(String(response.status)); return memoPage(dataOf(await response.json())); })
        .then(page => { if (!controller.signal.aborted && page) setCounts(previous => ({ ...previous, [kind]: page.total })); })
        .catch(() => { /* The current list keeps its own retry state. */ });
    }
    return () => controller.abort();
  }, [settledQuery]);
  const select = (id: string) => {
    pinnedId.current = id;
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("memo", id);
    window.history.replaceState(window.history.state, "", url);
  };
  const current = useMemo(() => notes?.find(row => row.id === selected) ?? notes?.[0], [notes, selected]);
  const contactKey = current?.contactIds.join("\u0000") ?? "";
  useEffect(() => {
    if (!current?.contactIds.length) { setResolvedContacts({}); return; }
    const controller = new AbortController();
    void Promise.all(current.contactIds.slice(0, 20).map(async id => {
      try {
        const response = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { credentials: "same-origin", signal: controller.signal });
        const contact = response.ok ? asRecord(dataOf(await response.json())?.contact) : null;
        return contact?.id === id && typeof contact.displayName === "string" ? [id, contact.displayName] as const : null;
      } catch { return null; }
    })).then(entries => { if (!controller.signal.aborted) setResolvedContacts(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null))); });
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
  useEffect(() => {
    if ((!editorOpen && !current?.eventIds.length) || !online) { setEventOptions([]); return; }
    const controller = new AbortController();
    void fetch("/api/events", { credentials: "same-origin", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(String(response.status)); return dataOf(await response.json()); })
      .then(data => { if (!controller.signal.aborted) setEventOptions(Array.isArray(data?.events) ? data.events.flatMap((raw): MemoMentionCandidate[] => {
        const item = asRecord(raw);
        return item && typeof item.id === "string" && typeof item.title === "string" && item.sample !== true ? [{ id: item.id, label: item.title, kind: "event" }] : [];
      }) : []); })
      .catch(() => { if (!controller.signal.aborted) { setEventOptions([]); setOptionError(true); } });
    return () => controller.abort();
  }, [editorOpen, online, current?.eventIds.join("\u0000")]);
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
  const options: { key: MemoTab; label: string }[] = (["all", "meeting", "free"] as const).map(key => ({ key, label: `${t(memoCopy[key])}${counts[key] === null ? "" : ` ${counts[key]}`}` }));
  const kindOptions: { key: "meeting" | "free"; label: string }[] = (["meeting", "free"] as const).map(key => ({ key, label: t(memoCopy[key]) }));
  const shownContacts = contactOptions.filter(option => !optionQuery || option.label.toLocaleLowerCase(language).includes(optionQuery.toLocaleLowerCase(language)));
  const shownEvents = eventOptions.filter(option => !optionQuery || option.label.toLocaleLowerCase(language).includes(optionQuery.toLocaleLowerCase(language))).slice(0, 20);
  const draftContactCount = editor ? memoContactIds(editor.draft.contactIds, editor.draft.mentions).length : 0;
  return <main className={styles.page}>
    <div className={styles.grid}>
      <section className={styles.list} aria-label={t(memoCopy.all)}>
        <SearchField value={query} onChange={setQuery} placeholder={t(memoCopy.search)} />
        <CategoryTabs<MemoTab> label={t(memoCopy.all)} options={options} value={tab} onChange={setTab} />
        {loading && notes === null ? <Skeleton lines={5} /> : null}
        {failed && notes === null ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(); }} /> : null}
        {notes?.length === 0 ? <EmptyState title={query ? t(memoCopy.noResult) : t(memoCopy.empty)} message={t(memoCopy.emptyBody)} /> : null}
        {notes ? <div className={styles.srOnly} aria-live="polite">{notes.length} / {total}</div> : null}
        {notes?.map(row => <Button key={row.id} label={row.title} aria-label={row.title} className={`${styles.row} ${current?.id === row.id ? styles.selected : ""}`} aria-pressed={current?.id === row.id} onClick={() => select(row.id)} trailing={<>
          <span className={styles.rowIcon} aria-hidden>{row.noteKind === "meeting" ? "🤝" : row.noteKind === "voice" ? "🎙️" : "✍️"}</span>
          <time className={styles.rowDate}>{new Date(row.updatedAt).toLocaleDateString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" })}</time>
          <span className={styles.rowBody}>{row.body.replace(/\s+/gu, " ")}</span>
          <span className={styles.rowTags}><span>{t(memoCopy[memoTabForKind(row.noteKind)])}</span>{row.noteKind === "voice" ? <span>{t(memoCopy.voice)}</span> : null}</span>
        </>} />)}
        {cursor ? <Button label={t(memoCopy.loadMore)} loading={moreLoading} onClick={() => { void read(true); }} /> : null}
        {failed && notes ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(Boolean(cursor)); }} /> : null}
      </section>
      <section className={styles.detail} aria-label={current?.title ?? t(memoCopy.empty)}>
        {current ? <><div className={styles.detailHead}><div><span className={styles.kind}>{t(memoCopy[memoTabForKind(current.noteKind)])}</span><h2>{current.title}</h2><time>{new Date(current.updatedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")}</time></div><Button label={t(memoCopy.edit)} onClick={() => openEditor(current)} disabled={!online || current.sample === true} /></div>
          <p className={styles.body}>{memoBody(current, resolvedContacts, resolvedEvents)}</p>
          <div className={styles.chips}>{current.noteKind === "voice" ? <Chip label={t(memoCopy.voice)} /> : null}{current.contactIds.map(id => resolvedContacts[id] ? <a key={`c:${id}`} href={`/app/contacts/${encodeURIComponent(id)}`} aria-label={`${t(memoCopy.people)}: ${resolvedContacts[id]}`}><Chip label={resolvedContacts[id]} /></a> : <Chip key={`c:${id}`} label={id} />)}{current.eventIds.map(id => resolvedEvents[id] ? <a key={`e:${id}`} href={`/app/events/${encodeURIComponent(id)}`} aria-label={`${t(memoCopy.events)}: ${resolvedEvents[id]}`}><Chip label={resolvedEvents[id]} /></a> : <Chip key={`e:${id}`} label={id} />)}</div>
          {current.usedForPlan ? <p className={styles.meta}>{t(memoCopy.planUse)}</p> : null}
        </> : notes ? <EmptyState title={t(memoCopy.empty)} message={t(memoCopy.emptyBody)} /> : null}
      </section>
    </div>
    <Modal open={Boolean(editor)} title={editor?.id ? t(memoCopy.edit) : t(memoCopy.add)} size={680} form onClose={() => { if (!saving) setEditor(null); }}>
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
    </Modal>
  </main>;
}
