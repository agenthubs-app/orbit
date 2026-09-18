import { useEffect, useRef, useState } from "react";
import type { createPersonalScheduleClient } from "./personal-schedule-client";

export function PersonalScheduleAssociationSheet({ kind, client, ids, disabled, onToggle, onClose }: { kind: "note" | "contact"; client: ReturnType<typeof createPersonalScheduleClient>; ids: readonly string[]; disabled: boolean; onToggle: (id: string, title: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""); const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<{ id: string; title: string }[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [choosing, setChoosing] = useState(false); const [error, setError] = useState("");
  const generation = useRef(0); const controller = useRef<AbortController | null>(null); const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const token = ++generation.current; const request = new AbortController(); controller.current = request;
    setItems([]); setCursor(null); setError(""); setBusy(true); setChoosing(false);
    const timer = setTimeout(() => {
      void client.searchAssociations(kind, query.trim(), undefined, request.signal).then(page => { if (token === generation.current) { setItems(page.items); setCursor(page.nextCursor); } }).catch(() => { if (token === generation.current) setError("关联列表读取失败，请重试。"); }).finally(() => { if (token === generation.current) setBusy(false); });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); request.abort(); generation.current++; };
  }, [client, kind, query, revision]);
  async function more() {
    if (!cursor || busy) return; const token = generation.current; setBusy(true); setError("");
    try { const page = await client.searchAssociations(kind, query.trim(), cursor, controller.current?.signal); if (token === generation.current) { setItems(previous => [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()]); setCursor(page.nextCursor); } }
    catch { if (token === generation.current) setError("关联列表读取失败，请重试。"); } finally { if (token === generation.current) setBusy(false); }
  }
  async function choose(id: string, title: string) {
    if (choosing || disabled) return;
    if (ids.includes(id)) { onToggle(id, title); return; }
    if (ids.length >= 50) return;
    const token = generation.current; setChoosing(true); setError("");
    try { const verified = await client.association(kind, id); if (token === generation.current) onToggle(verified.id, verified.title); }
    catch { if (token === generation.current) setError("关联对象不可用，请移除或重试"); } finally { if (token === generation.current) setChoosing(false); }
  }
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={kind === "note" ? "关联笔记窗" : "关联人脉窗"} style={{ width: "min(100%, 640px)", maxHeight: "85dvh", overflowY: "auto", background: "var(--surface, white)", color: "var(--ink, black)", borderRadius: "20px 20px 0 0", padding: "24px 20px max(24px, env(safe-area-inset-bottom))" }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") { const nodes = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),[tabindex='0']"); const first = nodes?.[0]; const last = nodes?.[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}><h3>{kind === "note" ? "关联笔记" : "关联人脉"}</h3><p>仅你可见，保存日程后生效。已选 {ids.length}/50</p>
      <input aria-label={kind === "note" ? "搜索笔记" : "搜索相关人脉"} placeholder="标题、姓名或拼音首字母" value={query} disabled={disabled} style={{ width: "100%", minHeight: 44, boxSizing: "border-box" }} onChange={event => setQuery(event.target.value)} />
      {items.map(item => <button key={item.id} type="button" className="btn btn-secondary" role="checkbox" aria-label={item.title} aria-checked={ids.includes(item.id)} disabled={disabled || choosing || (!ids.includes(item.id) && ids.length >= 50)} style={{ display: "block", width: "100%", minHeight: 44, textAlign: "left", marginTop: 8 }} onClick={() => void choose(item.id, item.title)}>{ids.includes(item.id) ? "✓ " : ""}{item.title}</button>)}
      {busy ? <p role="status">正在读取关联列表…</p> : !error && items.length === 0 ? <p>暂无匹配的关联对象</p> : null}
      {error ? <p role="alert">{error}<button type="button" className="btn btn-secondary" onClick={() => setRevision(value => value + 1)}>重试</button></p> : null}
      {cursor ? <button type="button" className="btn btn-secondary" disabled={busy || disabled} onClick={() => void more()}>加载更多</button> : null}
      <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={onClose}>关闭关联窗</button>
    </div>
  </div>;
}
