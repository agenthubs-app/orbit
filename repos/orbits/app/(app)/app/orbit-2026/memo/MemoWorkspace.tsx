"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { memoCopy } from "../copy/memo";
import { Button, CategoryTabs, Chip, EmptyState, Modal, Orbit2026Scope, RetryCard, SearchField, Skeleton, TextField, ToastProvider, useToast } from "../ui";
import { memoPage, memoRequest, memoTabForKind, rebaseMemoMentions, type MemoRow, type MemoTab } from "./memo-model";
import styles from "./memo.module.css";

type Draft = { title: string; body: string; kind: "meeting" | "free" | "voice"; usedForPlan: boolean; contactIds: string[]; eventIds: string[]; mentions: MemoRow["mentions"] };
const emptyDraft = (): Draft => ({ title: "", body: "", kind: "free", usedForPlan: false, contactIds: [], eventIds: [], mentions: [] });
const mutationKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`;

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
  const generation = useRef(0);
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
      setNotes(previous => more ? [...(previous ?? []), ...page.notes.filter(row => !previous?.some(item => item.id === row.id))] : page.notes);
      setTotal(page.total); setCursor(page.nextCursor);
      if (!more) setSelected(value => value && page.notes.some(row => row.id === value) ? value : page.notes[0]?.id ?? "");
    } catch {
      if (generation.current === current) setFailed(true);
    } finally {
      if (generation.current === current) { setLoading(false); setMoreLoading(false); }
    }
  }, [cursor, settledQuery, tab]);
  useEffect(() => { setNotes(null); setCursor(undefined); void read(); return () => { generation.current++; }; }, [tab, settledQuery]); // read is intentionally triggered only by the query, not each page cursor
  const select = (id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("memo", id);
    window.history.replaceState(window.history.state, "", url);
  };
  const current = useMemo(() => notes?.find(row => row.id === selected) ?? notes?.[0], [notes, selected]);
  const openEditor = (row?: MemoRow) => {
    setWriteError(null); setTokenError(false);
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
      setEditor(null); toast.success(t(memoCopy.saved));
      await read();
      if (id) select(id);
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
  const options: { key: MemoTab; label: string }[] = (["all", "meeting", "free"] as const).map(key => ({ key, label: t(memoCopy[key]) }));
  const kindOptions: { key: "meeting" | "free"; label: string }[] = (["meeting", "free"] as const).map(key => ({ key, label: t(memoCopy[key]) }));
  return <main className={styles.page}>
    <div className={styles.heading}><h2>{t(memoCopy.all)}</h2><Button label={t(memoCopy.add)} icon="plus" variant="accent" data-task-add="" disabled={!online} title={!online ? t(memoCopy.needsNetwork) : undefined} onClick={() => openEditor()} /></div>
    <div className={styles.grid}>
      <section className={styles.list} aria-label={t(memoCopy.all)}>
        <SearchField value={query} onChange={setQuery} placeholder={t(memoCopy.search)} />
        <CategoryTabs<MemoTab> label={t(memoCopy.all)} options={options} value={tab} onChange={setTab} />
        {loading && notes === null ? <Skeleton lines={5} /> : null}
        {failed && notes === null ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(); }} /> : null}
        {notes?.length === 0 ? <EmptyState title={query ? t(memoCopy.noResult) : t(memoCopy.empty)} message={t(memoCopy.emptyBody)} /> : null}
        {notes ? <div className={styles.count} aria-live="polite">{notes.length} / {total}</div> : null}
        {notes?.map(row => <Button key={row.id} label={row.title} className={`${styles.row} ${current?.id === row.id ? styles.selected : ""}`} aria-pressed={current?.id === row.id} onClick={() => select(row.id)} />)}
        {cursor ? <Button label={t(memoCopy.loadMore)} loading={moreLoading} onClick={() => { void read(true); }} /> : null}
        {failed && notes ? <RetryCard title={t(memoCopy.retry)} onRetry={() => { void read(Boolean(cursor)); }} /> : null}
      </section>
      <section className={styles.detail} aria-label={current?.title ?? t(memoCopy.empty)}>
        {current ? <><div className={styles.detailHead}><div><span className={styles.kind}>{t(memoCopy[memoTabForKind(current.noteKind)])}</span><h2>{current.title}</h2><time>{new Date(current.updatedAt).toLocaleString(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-US")}</time></div><Button label={t(memoCopy.edit)} onClick={() => openEditor(current)} disabled={!online || current.sample === true} /></div>
          <p className={styles.body}>{current.body}</p>
          <div className={styles.chips}>{current.noteKind === "voice" ? <Chip label={t(memoCopy.voice)} /> : null}{current.contactIds.map(id => <Chip key={`c:${id}`} label={id} />)}{current.eventIds.map(id => <Chip key={`e:${id}`} label={id} />)}</div>
          {current.usedForPlan ? <p className={styles.meta}>{t(memoCopy.planUse)}</p> : null}
        </> : notes ? <EmptyState title={t(memoCopy.empty)} message={t(memoCopy.emptyBody)} /> : null}
      </section>
    </div>
    <Modal open={Boolean(editor)} title={editor?.id ? t(memoCopy.edit) : t(memoCopy.add)} size={680} form onClose={() => { if (!saving) setEditor(null); }}>
      {editor ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
        <TextField label={t(memoCopy.title)} value={editor.draft.title} onChange={event => patch({ title: event.target.value })} disabled={saving} />
        <CategoryTabs label={t(memoCopy.meeting)} options={kindOptions} value={memoTabForKind(editor.draft.kind)} onChange={kind => patch({ kind, usedForPlan: kind === "meeting" && editor.draft.usedForPlan })} />
        <label className={styles.bodyLabel}>{t(memoCopy.body)}<textarea value={editor.draft.body} onChange={event => changeBody(event.target.value)} disabled={saving} rows={9} /></label>
        {tokenError ? <p role="alert" className={styles.error}>{t(memoCopy.tokenEdit)}</p> : null}
        {editor.draft.eventIds.length ? <p className={styles.meta}>{t(memoCopy.eventUnlink)}</p> : null}
        <label className={styles.planUse}><input type="checkbox" checked={editor.draft.usedForPlan} disabled={saving || editor.draft.kind !== "meeting" || editor.draft.contactIds.length !== 1} onChange={event => patch({ usedForPlan: event.target.checked })} />{t(memoCopy.planUse)}</label>
        {editor.draft.kind !== "meeting" || editor.draft.contactIds.length !== 1 ? <p className={styles.meta}>{t(memoCopy.planNeedsOne)}</p> : null}
        {writeError ? <p role="alert" className={styles.error}>{t(writeError === "conflict" ? memoCopy.conflict : memoCopy.saveFailed)}</p> : null}
        <div className={styles.actions}><Button label={t(memoCopy.cancel)} onClick={() => setEditor(null)} disabled={saving} /><Button type="submit" label={t(memoCopy.save)} variant="primary" loading={saving} disabled={!online || !editor.draft.title.trim() || !editor.draft.body.trim()} /></div>
      </form> : null}
    </Modal>
  </main>;
}
