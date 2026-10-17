"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useOrbitAsk } from "../../orbit-global-ask/orbit-ask-context";
import { orbitAskPageContext } from "../../orbit-global-ask/orbit-ask-routes";
import { useOrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { searchCopy } from "../copy/search";
import { filtersFor, panelRows, SearchPanel, type PanelRow } from "../search/SearchPanel";
import { useGlobalSearch, type SearchFilter } from "../search/use-global-search";
import { Modal } from "../ui";

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

// R30 ⌘K panel (b5 #57 / #58 / #59 / #71; search/DESIGN.md §2.1): Modal top 680, kit .cmdk. One global search
// (/api/search/global) answers people / events / conversations with hit ranges; this file only keeps the
// keyboard: ↑ ↓ move over every row, ↵ opens, Tab / Shift+Tab switch the type chip, Esc closes, and ⌘↵ (or the
// 「iOrbit に聞く」 row) puts the text into iOrbit's input without sending it (DESIGN §1: prefill only — the user
// sends; ask.prefill → /app/agent). 「紹介ルートを聞く」 prefills its own question. Typing never sends.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { language } = useOrbitLanguage();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ask = useOrbitAsk();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [cursor, setCursor] = useState(0);
  const context = orbitAskPageContext(pathname, language);
  const search = useGlobalSearch(open, query, filter);
  const state = useMemo(() => ({ capability: search.capability, filter, query, recent: search.recent, result: search.result, status: search.status }), [filter, query, search.capability, search.recent, search.result, search.status]);
  const rows = useMemo<PanelRow[]>(() => panelRows(state), [state]);
  const filters = filtersFor(search.capability?.types ?? search.result?.types);

  const input = useRef<HTMLInputElement>(null);
  // The dialog focuses its first control by default; the palette starts in the field (Modal initialFocus).
  // Closing resets the panel; a new answer puts the cursor back on the first row.
  useEffect(() => { if (!open) { setQuery(""); setFilter("all"); setCursor(0); } }, [open]);
  useEffect(() => setCursor(0), [rows.length, search.result]);

  const askRow = rows.findIndex((row) => row.kind === "ask");
  const handToIorbit = (prompt?: string) => {
    const text = (prompt ?? query).trim();
    if (!text || !ask) return;
    search.remember(text);
    onClose();
    ask.prefill(text, context);
  };
  const choose = (index: number) => {
    if (index === askRow) { handToIorbit(); return; }
    const row = rows[index];
    if (!row) return;
    if (row.kind === "recent" || row.kind === "example") { setQuery(row.text); return; }
    if (row.kind === "alternative" && row.alternative === "ask_iorbit") { handToIorbit(row.prompt); return; }
    if (!("href" in row)) return;
    search.remember(query);
    onClose();
    router.push(row.href);
  };
  const cycle = (step: 1 | -1) => {
    const at = filters.indexOf(filter);
    setFilter(filters[(at + step + filters.length) % filters.length] ?? "all");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(Math.max(rows.length - 1, 0), value + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)); }
    // Like a browser's address bar: Shift+Delete forgets the highlighted recent search (the × does the same by mouse).
    else if (event.key === "Delete" && event.shiftKey && rows[cursor]?.kind === "recent") { event.preventDefault(); const row = rows[cursor]; if (row && "text" in row) search.removeRecent(row.text); }
    else if (event.key === "Tab") { event.preventDefault(); cycle(event.shiftKey ? -1 : 1); }
    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handToIorbit(); }
    else if (event.key === "Enter") { event.preventDefault(); choose(cursor); }
  };
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <Modal open={open} onClose={onClose} title={pickCopy(searchCopy.dialogTitle, language)} size={680} top bare initialFocus={input}
      header={<span hidden />}>
      <SearchPanel state={state} rows={rows} cursor={cursor} onHover={setCursor} onPick={choose} onQueryChange={setQuery} onFilterChange={setFilter}
        onClearRecent={search.clearRecent} onRemoveRecent={search.removeRecent} onKeyDown={onKeyDown} inputRef={input} language={language} listId={listId} optionId={optionId} />
    </Modal>
  );
}
