"use client";

/**
 * agent-design AG14 (approved visual draft 2026-11-20, boards 6–8, D5, D7–D10): the memory part of 「设置 › iOrbit 使用的
 *信息」 on the web. Two switches, the groups of shared/compute/agent-memory-view.ts (the rule the App runs too), add,
 * edit in place (D9: the web unfolds the row), delete after a question, a last day. What the user does here is their
 * own action: no card, saved at once. `?memory=<id>` (「修改 ›」 of an answer's memory chip, D5) opens that entry ready
 * to edit. A failed save keeps the words typed and says so; a failed delete leaves the row where it was.
 */
import { useEffect, useId, useRef, useState } from "react";

import { MEMORY_TASKS, memoryEditorInput, memoryExpiryAfter, memorySettingsView, memoryTaskLabel, isStandingRule, type MemoryRowView } from "../../../../../shared/compute/agent-memory-view";
import type { AgentMemoryEntryContract, AgentMemoryListContract, AgentMemoryTaskContract } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { standardCopyFor } from "../copy/standard";
import { ConfirmDialog, Icon, Toggle, WhyBody, WhyButton } from "../ui";
import styles from "./MemorySettings.module.css";

type Editing = { memoryId: string | "new"; content: string; task: AgentMemoryTaskContract | null; rule: boolean; validUntil: string | null; picking: boolean; failed: boolean };

const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export async function readMemoryList(): Promise<AgentMemoryListContract> {
  const response = await fetch("/api/agent/memory", { cache: "no-store" });
  const body = await response.json() as { data?: AgentMemoryListContract };
  if (!response.ok || !Array.isArray(body.data?.memories) || !body.data?.settings) throw new Error("Memory unavailable");
  return body.data;
}

export function MemorySettings({ list, language, why, onList }: { list: AgentMemoryListContract; language: OrbitLanguage; why: string; onList(next: AgentMemoryListContract): void }) {
  const words = standardCopyFor(language).memorySettings;
  const today = localDay();
  const whyId = useId();
  const [whyOpen, setWhyOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<AgentMemoryEntryContract | null>(null);
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);
  const opened = useRef(false);
  const view = memorySettingsView({ entries: list.memories, expanded, language, ruleLimit: list.ruleLimit, settings: list.settings, today, words });

  const startEdit = (entry: AgentMemoryEntryContract | null) => {
    setRemoveFailed(null);
    setEditing(entry
      ? { content: entry.content, failed: false, memoryId: entry.memoryId, picking: false, rule: isStandingRule(entry.category), task: entry.appliesTo[0] ?? null, validUntil: entry.validUntil }
      : { content: "", failed: false, memoryId: "new", picking: false, rule: false, task: "event.recommend", validUntil: null });
  };

  // D5: 「修改 ›」 of a memory chip opens this page with the entry ready to edit (its group unfolded).
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const wanted = new URLSearchParams(window.location.search).get("memory");
    const entry = wanted ? list.memories.find((item) => item.memoryId === wanted) : null;
    if (!entry) return;
    const group = !entry.appliesTo.length ? "unsorted" : isStandingRule(entry.category) ? "rules" : "weighed";
    setExpanded(new Set([group]));
    startEdit(entry);
    requestAnimationFrame(() => document.querySelector(`[data-orbit-memory-row="${CSS.escape(entry.memoryId)}"]`)?.scrollIntoView({ block: "center" }));
  }, []); // the first list only

  const refresh = async () => onList(await readMemoryList());
  const switchTo = async (key: "enabled" | "allowConversationLearning", on: boolean) => {
    if (busy) return;
    setBusy(true);
    setSwitchFailed(false);
    try {
      const response = await fetch("/api/agent/memory/settings", { body: JSON.stringify({ [key]: on }), headers: { "content-type": "application/json" }, method: "PATCH" });
      if (!response.ok) throw new Error("Settings not saved");
      onList({ ...list, settings: { ...list.settings, [key]: on } });
    } catch { setSwitchFailed(true); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!editing || busy || !editing.content.trim()) return;
    const before = editing.memoryId === "new" ? null : list.memories.find((item) => item.memoryId === editing.memoryId) ?? null;
    const input = memoryEditorInput({ before, content: editing.content, rule: editing.rule, task: editing.task, validUntil: editing.validUntil });
    setBusy(true);
    try {
      const response = await fetch(before ? `/api/agent/memory/${encodeURIComponent(before.memoryId)}` : "/api/agent/memory", { body: JSON.stringify(input), headers: { "content-type": "application/json" }, method: before ? "PATCH" : "POST" });
      if (!response.ok) throw new Error("Memory not saved");
      setEditing(null);
      await refresh().catch(() => undefined);
    } catch {
      // Board 7: the words typed stay; the panel stays open with one red line.
      setEditing((current) => (current ? { ...current, failed: true } : current));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    const entry = removing;
    if (!entry || busy) return;
    setRemoving(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/agent/memory/${encodeURIComponent(entry.memoryId)}?expectedRevision=${entry.revision}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Memory not deleted");
      if (editing?.memoryId === entry.memoryId) setEditing(null);
      setRemoveFailed(null);
      await refresh().catch(() => undefined);
    } catch { setRemoveFailed(entry.memoryId); }
    finally { setBusy(false); }
  };

  const editor = (state: Editing) => {
    const ruleDisabled = view.rulesFull && !(state.memoryId !== "new" && list.memories.find((item) => item.memoryId === state.memoryId && isStandingRule(item.category)));
    const pill = (on: boolean) => `${styles.pill} ${on ? styles.pillOn : ""}`;
    const month = memoryExpiryAfter(today, 1);
    const three = memoryExpiryAfter(today, 3);
    const custom = Boolean(state.validUntil && state.validUntil !== month && state.validUntil !== three);
    return (
      <div className={styles.editor} data-orbit-memory-editor={state.memoryId}>
        {state.failed ? <p className={`${styles.strip} ${styles.stripRed}`} role="alert">{words.saveFailed}</p> : null}
        <input className={styles.field} aria-label={words.content} placeholder={words.contentPlaceholder} value={state.content} autoFocus onChange={(event) => setEditing({ ...state, content: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void save(); }} />
        <div className={styles.editorRow}>
          <label className={styles.fieldGroup}><span>{words.usedIn.replace(/[：:]\s*\{where\}$/u, "").replace("{where}", "")}</span>
            <select className={styles.select} value={state.task ?? ""} onChange={(event) => setEditing({ ...state, task: (event.target.value || null) as AgentMemoryTaskContract | null })}>
              {state.task === null ? <option value="">—</option> : null}
              {MEMORY_TASKS.map((task) => <option key={task} value={task}>{memoryTaskLabel(task, words)}</option>)}
            </select>
          </label>
          <div className={styles.fieldGroup}><span>{words.group}</span>
            <div className={styles.pills}>
              <button type="button" className={`btn ${pill(state.rule)}`} aria-pressed={state.rule} disabled={ruleDisabled} onClick={() => setEditing({ ...state, rule: true })}>{words.rules}</button>
              <button type="button" className={`btn ${pill(!state.rule)}`} aria-pressed={!state.rule} onClick={() => setEditing({ ...state, rule: false })}>{words.weighed}</button>
            </div>
          </div>
          <div className={styles.fieldGroup}><span>{words.expiry}</span>
            <div className={styles.pills}>
              <button type="button" className={`btn ${pill(!state.validUntil)}`} aria-pressed={!state.validUntil} onClick={() => setEditing({ ...state, picking: false, validUntil: null })}>{words.noExpiry}</button>
              <button type="button" className={`btn ${pill(state.validUntil === month)}`} aria-pressed={state.validUntil === month} onClick={() => setEditing({ ...state, picking: false, validUntil: month })}>{words.oneMonth}</button>
              <button type="button" className={`btn ${pill(state.validUntil === three)}`} aria-pressed={state.validUntil === three} onClick={() => setEditing({ ...state, picking: false, validUntil: three })}>{words.threeMonths}</button>
              {state.picking || custom
                ? <input type="date" className={`${styles.pill} ${styles.pillOn} ${styles.date}`} aria-label={words.pickDay} min={today} value={state.validUntil ?? ""} onChange={(event) => setEditing({ ...state, validUntil: event.target.value || null })} />
                : <button type="button" className={`btn ${pill(false)}`} onClick={() => setEditing({ ...state, picking: true })}>{words.pickDay}</button>}
            </div>
          </div>
        </div>
        <div className={styles.editorFoot}>
          <button type="button" className={`btn ${styles.textButton}`} onClick={() => setEditing(null)}>{words.cancel}</button>
          <button type="button" className={`btn ${styles.save}`} disabled={busy || !state.content.trim()} onClick={() => void save()}>{words.save}</button>
        </div>
      </div>
    );
  };

  const row = (item: MemoryRowView, action: "edit" | "fill" | "keep") => {
    if (editing?.memoryId === item.memoryId) return <div key={item.memoryId} data-orbit-memory-row={item.memoryId}>{editor(editing)}</div>;
    return (
      <div key={item.memoryId} className={`${styles.row} ${item.expired ? styles.expired : ""}`} data-orbit-memory-row={item.memoryId} data-orbit-memory-expired={item.expired || undefined}>
        <div className={styles.rowBody}>
          <b>{item.content}</b>
          {item.expired && item.metaLead ? <span className={styles.meta}>{item.metaLead}<span className={styles.warn}>{item.expiredText}</span></span> : <span className={styles.meta}>{item.meta}</span>}
          {removeFailed === item.memoryId ? <span className={styles.warn} role="alert">{words.deleteFailed}</span> : null}
        </div>
        {action === "keep" ? <button type="button" className={`btn ${styles.act}`} disabled={busy} onClick={() => setRemoving(view.conflicts.find((pair) => pair.rows.some((other) => other.memoryId === item.memoryId))?.rows.find((other) => other.memoryId !== item.memoryId)?.entry ?? null)}>{words.keepThis}</button>
          : action === "fill" ? <button type="button" className={`btn ${styles.act}`} onClick={() => startEdit(item.entry)}>{words.fillIn}</button>
            : item.expired ? <>
              <button type="button" className={`btn ${styles.act}`} onClick={() => startEdit(item.entry)}>{words.extend}</button>
              <button type="button" className={`btn ${styles.act} ${styles.actRed}`} disabled={busy} onClick={() => setRemoving(item.entry)}>{words.delete}</button>
            </> : <>
              <button type="button" className={`btn ${styles.round}`} aria-label={words.edit} onClick={() => startEdit(item.entry)}><Icon name="edit" size={16} /></button>
              <button type="button" className={`btn ${styles.round}`} aria-label={words.delete} disabled={busy} onClick={() => setRemoving(item.entry)}><Icon name="x" size={16} /></button>
            </>}
      </div>
    );
  };

  return (
    <section id="memory" className={styles.card} data-orbit-memory-settings data-orbit-memory-dim={view.dim || undefined}>
      <div className={styles.head}>
        <h2>{words.title}</h2>
        <WhyButton open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} controls={whyId} />
        <button type="button" className={`btn ${styles.add}`} onClick={() => startEdit(null)} disabled={editing?.memoryId === "new"}><Icon name="plus" size={16} />{words.add}</button>
      </div>
      <WhyBody id={whyId} open={whyOpen}>{why}</WhyBody>
      <div className={styles.switches}>
        {view.switches.map((item) => (
          <div key={item.key} className={styles.switchRow} data-orbit-memory-switch={item.key}>
            <div><b>{item.title}</b><span>{item.note}</span></div>
            <Toggle checked={item.on} label={item.title} disabled={busy} onChange={(next) => void switchTo(item.key, next)} />
          </div>
        ))}
      </div>
      {switchFailed ? <p className={`${styles.strip} ${styles.stripRed}`} role="alert">{words.saveFailed}</p> : null}
      {editing?.memoryId === "new" ? editor(editing) : null}
      {view.empty && editing?.memoryId !== "new" ? <div className={styles.empty} data-orbit-memory-empty><b>{view.empty.title}</b><span>{view.empty.note}</span></div> : null}
      {view.conflicts.map((pair) => (
        <div key={pair.rows.map((item) => item.memoryId).join("|")} className={`${styles.group} ${view.dim ? styles.dim : ""}`} data-orbit-memory-conflict>
          <p className={styles.strip}>{pair.note}</p>
          {pair.rows.map((item) => row(item, "keep"))}
        </div>
      ))}
      {view.groups.map((group) => (
        <div key={group.key} className={`${styles.group} ${view.dim ? styles.dim : ""}`} data-orbit-memory-group={group.key}>
          <div className={styles.groupHead}><b>{group.title}</b><span>{group.note}</span></div>
          {group.full ? <p className={styles.strip}>{group.full}</p> : null}
          {group.rows.slice(0, group.shown).map((item) => row(item, group.key === "unsorted" ? "fill" : "edit"))}
          {group.moreLabel ? <button type="button" className={`btn ${styles.more} ${expanded.has(group.key) ? styles.moreUp : ""}`} aria-expanded={expanded.has(group.key)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>{group.moreLabel}</button> : null}
        </div>
      ))}
      <ConfirmDialog open={removing !== null} title={words.deleteTitle} message={removing?.content} confirmLabel={words.delete} cancelLabel={words.cancel} destructive onConfirm={() => void remove()} onCancel={() => setRemoving(null)} />
    </section>
  );
}
