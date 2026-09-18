import { useEffect, useRef, useState } from "react";
import { localParts, validTimeZone } from "../../../../features/tasks/local-date-time";

export function PersonalScheduleDateTimePicker({ kind, value, zone, disabled: saving, onCancel, onConfirm }: { kind: "date" | "time"; value: string; zone: string; disabled: boolean; onCancel(): void; onConfirm(value: string): void }) {
  const available = validTimeZone(zone);
  const disabled = saving || !available;
  const today = localParts(Date.now(), available ? zone : "UTC");
  const [selected, setSelected] = useState(value || (kind === "date" ? today.date : today.time));
  const [month, setMonth] = useState((kind === "date" && value ? value : today.date).slice(0, 7));
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } };
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [onCancel]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelectorAll<HTMLElement>("[aria-checked='true']").forEach(node => node.scrollIntoView({ block: "center" }));
    panel.current?.querySelector<HTMLElement>("[aria-selected='true'],[aria-checked='true'],button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const first = new Date(`${month}-01T12:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const navigate = (amount: number) => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1)).toISOString().slice(0, 7));
  const shortcut = (offset: number) => { const day = new Date(`${today.date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + offset); const date = day.toISOString().slice(0, 10); setSelected(date); setMonth(date.slice(0, 7)); };
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={kind === "date" ? "日期" : "时间"} style={{ width: "min(100%,640px)", boxSizing: "border-box", maxHeight: "85dvh", overflowY: "auto", background: "var(--surface, white)", color: "var(--ink, black)", borderRadius: "20px 20px 0 0", padding: "20px 16px max(24px,env(safe-area-inset-bottom))" }} onKeyDown={event => {
      if (event.key === "Tab") { const nodes = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),[tabindex='0']"); const first = nodes?.[0]; const last = nodes?.[nodes.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44 }} onClick={onCancel}>取消</button><strong>{kind === "date" ? "日期" : "时间"}</strong><button type="button" className="btn btn-primary" style={{ minHeight: 44, minWidth: 44 }} disabled={disabled} onClick={() => { if (!disabled) onConfirm(selected); }}>完成</button></div>
      {!available ? <p role="alert">时区不可用，草稿已保留。</p> : null}
      {kind === "date" ? <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}><button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44 }} aria-label="上个月" disabled={disabled} onClick={() => navigate(-1)}>‹</button><strong>{new Intl.DateTimeFormat("zh", { year: "numeric", month: "long", timeZone: "UTC" }).format(first)}</strong><button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44 }} aria-label="下个月" disabled={disabled} onClick={() => navigate(1)}>›</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", marginTop: 12 }}>{["日", "一", "二", "三", "四", "五", "六"].map(day => <span key={day} style={{ textAlign: "center", padding: 8 }}>{day}</span>)}{Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; return <button key={date} type="button" aria-label={date} aria-selected={selected === date} disabled={disabled} onClick={() => setSelected(date)} style={{ minHeight: 44, borderRadius: 8, border: selected === date ? "2px solid currentColor" : "1px solid transparent", background: selected === date ? "var(--surface-secondary,#eee)" : "transparent", color: "inherit", fontWeight: date === today.date ? 800 : 400 }}>{i + 1}</button>; })}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}><button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44 }} disabled={disabled} onClick={() => shortcut(0)}>今天</button><button type="button" className="btn btn-secondary" style={{ minHeight: 44, minWidth: 44 }} disabled={disabled} onClick={() => shortcut(1)}>明天</button></div>
      </> : <div style={{ display: "flex", gap: 16, height: 264, marginTop: 12 }}>{([24, 60] as const).map((count, index) => <div key={index} role="radiogroup" aria-label={index === 0 ? "小时" : "分钟"} style={{ flex: 1, overflowY: "auto" }}>{Array.from({ length: count }, (_, part) => { const label = String(part).padStart(2, "0"); return <button key={part} type="button" role="radio" aria-label={`${index === 0 ? "HH" : "mm"} ${label}`} aria-checked={selected.split(":")[index] === label} disabled={disabled} style={{ display: "block", width: "100%", minHeight: 44, borderRadius: 8, border: selected.split(":")[index] === label ? "2px solid currentColor" : "1px solid transparent", background: "transparent", color: "inherit" }} onClick={() => { const parts = selected.split(":"); parts[index] = label; setSelected(parts.join(":")); }}>{label}</button>; })}</div>)}</div>}
    </div>
  </div>;
}
