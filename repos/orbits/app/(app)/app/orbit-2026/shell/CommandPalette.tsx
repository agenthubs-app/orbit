"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useOrbitAsk } from "../../orbit-global-ask/orbit-ask-context";
import { orbitAskPageContext } from "../../orbit-global-ask/orbit-ask-routes";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { shellCopy } from "../copy/shell";
import { Avatar, Chip, Icon, Kbd, Modal, fillCopy } from "../ui";
import styles from "./palette.module.css";

type Person = { id: string; contactId: string; displayName: string; organization?: string | null; role?: string | null };

/**
 * ⌘K / Ctrl+K anywhere in the shell opens the palette — also while typing in a
 * field (like Linear / Slack), but plain keys never do. Registered once, by the
 * shell (not in a dialog file the orbit-modal-standard gate scans).
 */
export function useCommandPaletteShortcut(open: () => void): void {
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        latest.current();
      }
    };
    const onRequest = () => latest.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("orbit:open-palette", onRequest);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("orbit:open-palette", onRequest); };
  }, []);
}

/** People search over the existing natural search endpoint; at most 6 rows. */
export async function searchPeople(query: string, signal?: AbortSignal): Promise<Person[]> {
  const response = await fetch("/api/search/relationships", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }), signal });
  if (!response.ok) return [];
  const body = (await response.json()) as { success?: boolean; data?: { results?: Person[] } };
  return (body.success && Array.isArray(body.data?.results) ? body.data!.results! : []).slice(0, 6);
}

// R07 ⌘K panel (01-system.html:375 / 570): Modal top 680. Type to search people;
// ↑ ↓ move, ↵ opens the person; ⌘↵ (or the last row) hands the text to iOrbit with
// the current page as context — the same hand-off the floating ask used
// (stashPendingAsk → /app/agent, or the page's own ask target).
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ask = useOrbitAsk();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const context = orbitAskPageContext(pathname, language);
  const t = (entry: (typeof shellCopy)[keyof typeof shellCopy]) => pickCopy(entry, language);

  const input = useRef<HTMLInputElement>(null);
  // The dialog mounts through a portal a commit later and then focuses its first
  // control (閉じる); the palette starts in the field, so focus it after that, for a
  // few frames at most.
  useEffect(() => {
    if (!open) { setQuery(""); setPeople([]); setCursor(0); return; }
    let frames = 0;
    let id = 0;
    const settle = () => {
      const field = input.current;
      if (field && field.closest("[role='dialog']") && document.activeElement !== field) field.focus();
      if (++frames < 6) id = requestAnimationFrame(settle);
    };
    id = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(id);
  }, [open]);
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !trimmed) { setPeople([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPeople(trimmed, controller.signal).then(setPeople).catch(() => setPeople([])).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query]);
  useEffect(() => setCursor(0), [people]);

  const askRow = people.length;
  const handToIorbit = () => {
    const text = query.trim();
    if (!text || !ask) return;
    onClose();
    ask.submit(text, context);
  };
  const choose = (index: number) => {
    if (index === askRow) { handToIorbit(); return; }
    const person = people[index];
    if (!person) return;
    onClose();
    router.push(`/app/contacts/${encodeURIComponent(person.contactId || person.id)}`);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(askRow, value + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)); }
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handToIorbit(); }
    else if (event.key === "Enter") { event.preventDefault(); choose(cursor); }
  };
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <Modal open={open} onClose={onClose} title={t(shellCopy.paletteLabel)} size={680} top
      hint={<span className={styles.keys}><Kbd>↑↓</Kbd><Kbd>↵</Kbd>{t(shellCopy.paletteHintOpen)}<Kbd>⌘↵</Kbd>{t(shellCopy.paletteHintAsk)}</span>}>
      <div className={styles.field}>
        <Icon name="search" size={20} />
        <input
          ref={input}
          className={styles.input}
          role="combobox"
          aria-expanded={query.trim().length > 0}
          aria-controls={listId}
          aria-activedescendant={query.trim() ? optionId(cursor) : undefined}
          aria-label={t(shellCopy.palettePlaceholder)}
          placeholder={t(shellCopy.palettePlaceholder)}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {context ? <Chip tone="lav" label={fillCopy(pickCopy(shellCopy.paletteContext, language), { page: context })} /> : null}
      </div>
      {query.trim() ? (
        <div id={listId} role="listbox" aria-label={t(shellCopy.paletteLabel)} className={styles.list}>
          <div className={styles.group}>{t(shellCopy.palettePeople)}</div>
          {people.map((person, index) => (
            <div key={person.id} id={optionId(index)} role="option" aria-selected={cursor === index} className={`${styles.row} ${cursor === index ? styles.rowOn : ""}`} onMouseEnter={() => setCursor(index)} onMouseDown={(event) => { event.preventDefault(); choose(index); }}>
              <Avatar name={person.displayName} size="sm" />
              <span className={styles.rowText}><b>{person.displayName}</b><small>{[person.role, person.organization].filter(Boolean).join(" · ")}</small></span>
            </div>
          ))}
          {!people.length ? <div className={styles.empty} role="status">{searching ? t(shellCopy.paletteSearching) : t(shellCopy.paletteNoResults)}</div> : null}
          <div id={optionId(askRow)} role="option" aria-selected={cursor === askRow} className={`${styles.row} ${styles.askRow} ${cursor === askRow ? styles.rowOn : ""}`} onMouseEnter={() => setCursor(askRow)} onMouseDown={(event) => { event.preventDefault(); choose(askRow); }}>
            <Icon name="sparkle" size={20} />
            <span className={styles.rowText}><b>{t(shellCopy.paletteAsk)}</b><small>{query.trim()}</small></span>
            <Kbd>⌘↵</Kbd>
          </div>
          <p className={styles.privacy} data-orbit-agent-privacy-boundary="">{t(shellCopy.paletteAskPrivacy)}</p>
        </div>
      ) : null}
    </Modal>
  );
}
