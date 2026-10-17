"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { globalSearchResponseSchema } from "../../../../../shared/api-schema/global-search";
import type { GlobalSearchResponse, GlobalSearchType } from "../../../../../shared/contract/global-search";

// R30 (search/DESIGN.md §6, E3 / E7 / E8): one fetch per query after 250 ms, the previous one aborted, 429 shown once
// and not retried; the capability answer (empty query) is fetched on open; recent searches live in this browser only.
export const RECENT_SEARCHES_KEY = "orbit.search.recent";
export const RECENT_SEARCHES_MAX = 5;
export const SEARCH_DEBOUNCE_MS = 250;
/** 意味検索的用户偏好（DESIGN §2.1：设置里关掉后客户端送 0）。只存这台设备；设置页的开关界面归 R18（交接表 R30-06）。 */
export const SEMANTIC_PREFERENCE_KEY = "orbit.search.semantic";

export function readSemanticPreference(): boolean {
  try { return window.localStorage.getItem(SEMANTIC_PREFERENCE_KEY) !== "off"; } catch { return true; }
}

export function writeSemanticPreference(on: boolean): void {
  try { window.localStorage.setItem(SEMANTIC_PREFERENCE_KEY, on ? "on" : "off"); } catch { /* private mode etc. */ }
}

export type SearchFilter = "all" | GlobalSearchType;
export type SearchStatus = "idle" | "searching" | "ready" | "rate_limited" | "failed";

export function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
}

export function writeRecentSearches(items: readonly string[]): void {
  try { window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, RECENT_SEARCHES_MAX))); } catch { /* private mode etc. */ }
}

export function rememberSearch(recent: readonly string[], query: string): string[] {
  const text = query.trim();
  if (!text) return [...recent];
  return [text, ...recent.filter((item) => item !== text)].slice(0, RECENT_SEARCHES_MAX);
}

/** `semantic`: true → 1, false → 0 (the user turned it off), undefined → not sent (the account has no semantic search). */
export function searchUrl(input: { query: string; filter: SearchFilter; semantic?: boolean; limit?: number }): string {
  const params = new URLSearchParams();
  params.set("q", input.query.trim());
  if (input.filter !== "all") params.set("types", input.filter);
  if (input.semantic !== undefined) params.set("semantic", input.semantic ? "1" : "0");
  if (input.limit) params.set("limit", String(input.limit));
  return `/api/search/global?${params.toString()}`;
}

export async function fetchGlobalSearch(url: string, signal?: AbortSignal): Promise<{ ok: true; data: GlobalSearchResponse } | { ok: false; reason: "rate_limited" | "failed" }> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: "failed" };
  const body = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
  const parsed = body?.success ? globalSearchResponseSchema.safeParse(body.data) : null;
  return parsed?.success ? { data: parsed.data, ok: true } : { ok: false, reason: "failed" };
}

export function useGlobalSearch(open: boolean, query: string, filter: SearchFilter) {
  const [capability, setCapability] = useState<GlobalSearchResponse | null>(null);
  const [result, setResult] = useState<GlobalSearchResponse | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [recent, setRecent] = useState<string[]>([]);
  const [preferSemantic, setPreferSemantic] = useState(true);
  const available = capability?.semantic.available ?? false;
  const semantic = available ? preferSemantic : undefined;
  const controller = useRef<AbortController | null>(null);

  // Open: the capability answer (types, semantic, examples) and this browser's recent searches.
  useEffect(() => {
    if (!open) { setResult(null); setStatus("idle"); return; }
    setRecent(readRecentSearches());
    setPreferSemantic(readSemanticPreference());
    const abort = new AbortController();
    fetchGlobalSearch(searchUrl({ filter: "all", query: "" }), abort.signal).then((answer) => { if (answer.ok) setCapability(answer.data); }).catch(() => undefined);
    return () => abort.abort();
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    controller.current?.abort();
    if (!open || !trimmed) { setResult(null); setStatus("idle"); return; }
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => {
      setStatus("searching");
      fetchGlobalSearch(searchUrl({ filter, query: trimmed, semantic }), abort.signal).then((answer) => {
        if (abort.signal.aborted) return;
        if (answer.ok === true) { setResult(answer.data); setStatus("ready"); return; }
        setResult(null);
        setStatus(answer.ok === false ? answer.reason : "failed");
      }).catch(() => { if (!abort.signal.aborted) { setResult(null); setStatus("failed"); } });
    }, SEARCH_DEBOUNCE_MS);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [open, query, filter, semantic]);

  const remember = useCallback((text: string) => {
    setRecent((current) => { const next = rememberSearch(current, text); writeRecentSearches(next); return next; });
  }, []);
  const clearRecent = useCallback(() => { setRecent([]); writeRecentSearches([]); }, []);
  const removeRecent = useCallback((text: string) => {
    setRecent((current) => { const next = current.filter((item) => item !== text); writeRecentSearches(next); return next; });
  }, []);

  return { capability, clearRecent, recent, removeRecent, remember, result, semanticOn: semantic === true, status };
}
