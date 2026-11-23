"use client";

/**
 * agent-design AG11（设计稿 §3.6、§10「@ 选择器」；获批视觉稿 2026-11-19，D1–D8）：网页 iOrbit 输入框的 @ 选择器。
 *
 * - 输入框左边的「＋」是真按钮（读屏名和提示都叫「添加上下文」，D5）；在句子里打 @ 也打开同一个选择器。
 * - 选择器从输入框上方展开（浮层，不推动页面），顶上是搜索框和分类（全部、联系人、笔记、待办、日程、活动、我去过，D3/D4），
 *   结果按类分组，每条带类型标签和区分行；没找到的类在底部一句交代。键盘 ↑↓／回车／Esc。
 * - 打 @ 打开时选一条就关；点「＋」打开时可以连选几条，底部「完成（N）」，按顺序插到光标处（D6）。
 * - 选中后句子里留着着色的「@名字」，输入框上方一行标签（类型 + 名字 + ×，同名的再带一小段区分信息，D1）；点 × 句子里的字
 *   留下、去掉 @（D2）；改了标记里的字，那一条不再跟着发。自己打的「@名字」没在选择器里点过，就是普通文字。
 * - 选中的记录打不开了：标签变虚线写「打不开了」，句子里的 @ 划掉，照样能发（D7）。
 *
 * 选中只是告诉 Orbit「我说的是这一条」，不是允许改它；这里不做任何写入。纯计算在 shared/compute/agent-references.ts。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { agentReferenceCheckResultSchema, agentReferenceSearchResultSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentReferenceCandidateContract, AgentReferenceSearchKind, AgentReferenceSearchResultContract } from "../../../../../shared/contract/agent-v1";
import {
  atTriggerOf,
  bindingHolds,
  insertReference,
  markedSegments,
  reconcileBindings,
  REFERENCE_KINDS,
  referenceAllLabel,
  referenceChipHint,
  referenceDetailLine,
  referenceKindLabel,
  referencesForSend,
  removeBinding,
  sameNamedKeys,
  type ReferenceBinding,
  type ReferenceLanguage,
} from "../../../../../shared/compute/agent-references";
import { iorbitCopy } from "../../orbit-2026/copy/iorbit";
import { Icon } from "../../orbit-2026/ui";
import styles from "./IOrbit2026.module.css";

type Copy = { ja: string; zh: string; en: string };
const KIND_CLASS: Record<AgentReferenceSearchKind, string> = { attendance: "kindWent", contact: "kindContact", event: "kindEvent", memo: "kindMemo", schedule: "kindSchedule", todo: "kindTodo" };

function fill(copy: string, values: Record<string, string | number>): string {
  return copy.replace(/\{(\w+)\}/gu, (_, key: string) => String(values[key] ?? ""));
}

export const candidateKey = (candidate: { type: string; id: string }) => `${candidate.type}:${candidate.id}`;

export function KindBadge({ kind, language }: { kind: AgentReferenceSearchKind; language: ReferenceLanguage }) {
  return <span className={`${styles.kindBadge} ${styles[KIND_CLASS[kind]]}`}>{referenceKindLabel(kind, language)}</span>;
}

/* ── the composer's state: draft text, picked records and the open picker ─────────────────── */

export type PickerState = null | { mode: "at"; start: number } | { mode: "plus"; caret: number };

export interface ReferenceComposer {
  bindings: ReferenceBinding[];
  picker: PickerState;
  /** The words typed after the @ (the search), or the plus picker's own words. */
  query: string;
  setPlusQuery(query: string): void;
  /** The textarea changed: move or drop the marks, open or follow the @ picker. */
  onTextChange(next: string, caret: number): void;
  openPlus(caret: number): void;
  close(): void;
  pick(candidate: AgentReferenceCandidateContract): { text: string; caret: number };
  pickMany(candidates: readonly AgentReferenceCandidateContract[]): { text: string; caret: number };
  remove(binding: ReferenceBinding): string;
  /** ⌘Z right after an edit that dropped a mark: the words and the mark come back together. */
  undo(current: string): { text: string } | null;
  markGone(keys: ReadonlySet<string>): void;
  forSend(text: string): ReturnType<typeof referencesForSend>;
  clear(): void;
}

export function useReferenceComposer(text: string, setText: (text: string) => void, language: ReferenceLanguage): ReferenceComposer {
  const [bindings, setBindings] = useState<ReferenceBinding[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [plusQuery, setPlusQuery] = useState("");
  const [caret, setCaret] = useState(0);
  const undoRef = useRef<{ before: { text: string; bindings: ReferenceBinding[] }; after: string } | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const query = picker?.mode === "at" ? text.slice(picker.start + 1, Math.max(picker.start + 1, caret)) : plusQuery;

  const onTextChange = useCallback((next: string, nextCaret: number) => {
    const previous = textRef.current;
    const kept = reconcileBindings(previous, next, bindingsRef.current);
    undoRef.current = kept.length < bindingsRef.current.length ? { after: next, before: { bindings: bindingsRef.current, text: previous } } : null;
    setBindings(kept);
    setCaret(nextCaret);
    setText(next);
    setPicker((current) => {
      if (current?.mode === "plus") return current;
      const trigger = atTriggerOf(next, nextCaret, kept);
      if (current?.mode === "at") return trigger && trigger.start === current.start ? current : null;
      const typedAt = next.length > previous.length && next[nextCaret - 1] === "@";
      return typedAt && trigger ? { mode: "at", start: trigger.start } : null;
    });
  }, [setText]);

  const toPicked = useCallback((candidate: AgentReferenceCandidateContract) => {
    const hint = referenceChipHint(candidate, language);
    return { id: candidate.id, name: candidate.name, type: candidate.type, ...(candidate.eventKind ? { eventKind: candidate.eventKind } : {}), ...(hint ? { hint } : {}) };
  }, [language]);

  const pick = useCallback((candidate: AgentReferenceCandidateContract) => {
    const current = textRef.current;
    const from = picker?.mode === "at" ? picker.start : picker?.mode === "plus" ? picker.caret : caret;
    const to = picker?.mode === "at" ? Math.max(caret, picker.start + 1) : from;
    const out = insertReference(current, from, to, bindingsRef.current, toPicked(candidate));
    setBindings(out.bindings);
    setText(out.text);
    setCaret(out.caret);
    setPicker(null);
    setPlusQuery("");
    return { caret: out.caret, text: out.text };
  }, [caret, picker, setText, toPicked]);

  const pickMany = useCallback((candidates: readonly AgentReferenceCandidateContract[]) => {
    let state = { bindings: bindingsRef.current, caret: picker?.mode === "plus" ? picker.caret : caret, text: textRef.current };
    for (const candidate of candidates) {
      const out = insertReference(state.text, state.caret, state.caret, state.bindings, toPicked(candidate));
      state = out;
    }
    setBindings(state.bindings);
    setText(state.text);
    setCaret(state.caret);
    setPicker(null);
    setPlusQuery("");
    return { caret: state.caret, text: state.text };
  }, [caret, picker, setText, toPicked]);

  const remove = useCallback((binding: ReferenceBinding) => {
    const out = removeBinding(textRef.current, bindingsRef.current, binding);
    undoRef.current = { after: out.text, before: { bindings: bindingsRef.current, text: textRef.current } };
    setBindings(out.bindings);
    setText(out.text);
    return out.text;
  }, [setText]);

  return {
    bindings,
    clear: () => { setBindings([]); setPicker(null); setPlusQuery(""); undoRef.current = null; },
    close: () => { setPicker(null); setPlusQuery(""); },
    forSend: (current) => referencesForSend(current, bindingsRef.current),
    markGone: (keys) => setBindings((current) => current.map((binding) => (keys.has(candidateKey(binding)) ? { ...binding, gone: true } : binding))),
    onTextChange,
    openPlus: (at) => { setCaret(at); setPicker({ caret: at, mode: "plus" }); setPlusQuery(""); },
    pick,
    pickMany,
    picker,
    query,
    remove,
    setPlusQuery,
    undo: (current) => {
      const saved = undoRef.current;
      if (!saved || saved.after !== current) return null;
      undoRef.current = null;
      setBindings(saved.before.bindings);
      setText(saved.before.text);
      return { text: saved.before.text };
    },
  };
}

/* ── search ─────────────────────────────────────────────────────────────────────────────── */

type SearchState = { status: "loading" | "ready" | "error"; result: AgentReferenceSearchResultContract | null };

function useReferenceSearch(query: string, kind: AgentReferenceSearchKind | null, request: typeof fetch): SearchState {
  const [state, setState] = useState<SearchState>({ result: null, status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ result: current.result, status: "loading" }));
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      if (kind) params.set("kind", kind);
      request(`/api/agent/references/search?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
          const parsed = agentReferenceSearchResultSchema.safeParse(body?.data);
          if (!response.ok || !parsed.success) throw new Error("REFERENCE_SEARCH_FAILED");
          if (!controller.signal.aborted) setState({ result: parsed.data, status: "ready" });
        })
        .catch(() => { if (!controller.signal.aborted) setState({ result: null, status: "error" }); });
    }, 120);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, kind, request]);
  return state;
}

/** D7: whether the picked records can still be opened (checked when the page comes back to the front). */
export async function checkPickedReferences(bindings: readonly ReferenceBinding[], request: typeof fetch = fetch): Promise<Set<string>> {
  if (!bindings.length) return new Set();
  const response = await request("/api/agent/references/check", {
    body: JSON.stringify({ references: bindings.map((binding) => ({ id: binding.id, type: binding.type, ...(binding.eventKind ? { eventKind: binding.eventKind } : {}) })) }),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  const parsed = agentReferenceCheckResultSchema.safeParse(body?.data);
  if (!response.ok || !parsed.success) return new Set();
  return new Set(parsed.data.references.filter((item) => !item.accessible).map(candidateKey));
}

/* ── the picker panel ──────────────────────────────────────────────────────────────────── */

export interface PickerKeys {
  /** Keys typed in the textarea while the @ picker is open; true when the picker used the key. */
  onKeyDown(event: ReactKeyboardEvent): boolean;
}

export function ReferencePicker({ composer, language, t, request = fetch, keysRef, onPicked }: {
  composer: ReferenceComposer;
  language: ReferenceLanguage;
  t: (copy: Copy) => string;
  request?: typeof fetch;
  keysRef: { current: PickerKeys | null };
  onPicked(result: { text: string; caret: number }): void;
}) {
  const picker = composer.picker!;
  const [kind, setKind] = useState<AgentReferenceSearchKind | null>(null);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<AgentReferenceCandidateContract[]>([]);
  const search = useReferenceSearch(composer.query, kind, request);
  const picked = useMemo(() => new Set(composer.bindings.map(candidateKey)), [composer.bindings]);
  const groups = (search.result?.groups ?? []).map((group) => ({ ...group, items: group.items.filter((item) => !picked.has(candidateKey(item))) }));
  const flat = groups.flatMap((group) => group.items);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => setActive(0), [composer.query, kind]);
  useEffect(() => { if (picker.mode === "plus") searchRef.current?.focus(); }, [picker.mode]);
  const close = composer.close;
  useEffect(() => {
    // A press outside the composer closes the picker (the page itself never moves).
    if (typeof document === "undefined") return undefined;
    const outside = (event: MouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest("[data-orbit-agent-chat-composer]")) close(); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [close]);

  const choose = (candidate: AgentReferenceCandidateContract) => {
    if (picker.mode === "at") onPicked(composer.pick(candidate));
    else setChosen((current) => (current.some((item) => candidateKey(item) === candidateKey(candidate)) ? current.filter((item) => candidateKey(item) !== candidateKey(candidate)) : [...current, candidate]));
  };
  const keys = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); composer.close(); return true; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : flat.length - 1)) % flat.length);
      return true;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing && flat[active]) { event.preventDefault(); choose(flat[active]); return true; }
    return false;
  };
  keysRef.current = { onKeyDown: keys };

  const empty = search.status === "ready" && !kind && composer.query.trim() ? groups.filter((group) => !group.items.length && !group.unavailable).map((group) => referenceKindLabel(group.type, language)) : [];
  const unavailable = groups.filter((group) => group.unavailable).map((group) => referenceKindLabel(group.type, language));
  const title = t(iorbitCopy.addContext);
  let index = -1;
  const rows: ReactNode[] = groups.filter((group) => group.items.length).map((group) => (
    <div key={group.type} role="group" aria-label={referenceKindLabel(group.type, language)} className={styles.pickerGroup}>
      <div className={styles.pickerGroupTitle}>{referenceKindLabel(group.type, language)}</div>
      {group.items.map((item) => {
        index += 1;
        const at = index;
        const selected = chosen.some((entry) => candidateKey(entry) === candidateKey(item));
        const detail = referenceDetailLine(item, language);
        return <button key={candidateKey(item)} type="button" role="option" aria-selected={at === active || selected} data-orbit-reference-option={candidateKey(item)} className={`btn ${styles.pickerRow} ${at === active ? styles.pickerRowActive : ""}`}
          onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(at)} onClick={() => choose(item)}>
          <span className={styles.pickerRowText}><b>{item.name}</b>{detail ? <small>{detail}</small> : null}</span>
          {picker.mode === "plus" ? <span className={`${styles.pickerCheck} ${selected ? styles.pickerCheckOn : ""}`} aria-hidden>{selected ? "✓" : ""}</span> : null}
          <KindBadge kind={item.type} language={language} />
        </button>;
      })}
    </div>
  ));
  return (
    <div className={styles.picker} role="dialog" aria-label={title} data-orbit-reference-picker={picker.mode}>
      <div className={styles.pickerSearch}>
        <span aria-hidden className={styles.pickerSearchIcon}><Icon name="search" size={15} /></span>
        <input ref={searchRef} aria-label={t(iorbitCopy.refSearch)} placeholder={t(iorbitCopy.refSearch)} value={composer.query} readOnly={picker.mode === "at"}
          onChange={(event) => composer.setPlusQuery(event.target.value)} onKeyDown={(event) => { keys(event); }} />
      </div>
      <div className={styles.pickerKinds} role="toolbar" aria-label={t(iorbitCopy.refKinds)}>
        {([null, ...REFERENCE_KINDS] as const).map((item) => <button key={item ?? "all"} type="button" aria-pressed={kind === item} className={`btn ${styles.pickerKind} ${kind === item ? styles.pickerKindOn : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => setKind(item)}>{item ? referenceKindLabel(item, language) : referenceAllLabel(language)}</button>)}
      </div>
      <div className={styles.pickerList} role="listbox" aria-label={title} aria-busy={search.status === "loading"}>
        {rows}
        {search.status === "loading" && !flat.length ? <p className={styles.pickerNote}>{t(iorbitCopy.refLoading)}</p> : null}
        {search.status === "ready" && !flat.length ? <p className={styles.pickerNote}>{t(iorbitCopy.refNone)}</p> : null}
        {search.status === "error" ? <p className={styles.pickerNote} role="alert">{fill(t(iorbitCopy.refUnavailable), { kinds: title })}</p> : null}
      </div>
      <div className={styles.pickerFoot}>
        <span>{empty.length && flat.length ? fill(t(iorbitCopy.refNoneFor), { kinds: empty.join(language === "en" ? ", " : "、"), q: composer.query.trim() }) : unavailable.length ? fill(t(iorbitCopy.refUnavailable), { kinds: unavailable.join(language === "en" ? ", " : "、") }) : ""}</span>
        {picker.mode === "plus"
          ? <button type="button" className={`btn ${styles.pickerDone}`} disabled={!chosen.length} onClick={() => onPicked(composer.pickMany(chosen))}>{fill(t(iorbitCopy.refDone), { n: chosen.length })}</button>
          : <span className={styles.pickerKeys}>{t(iorbitCopy.refKeys)}</span>}
      </div>
    </div>
  );
}

/* ── chips above the sentence, and the coloured sentence ───────────────────────────────── */

export function ReferenceChips({ composer, language, t, onRemoved }: { composer: ReferenceComposer; language: ReferenceLanguage; t: (copy: Copy) => string; onRemoved(text: string): void }) {
  const same = sameNamedKeys(composer.bindings);
  const gone = composer.bindings.some((binding) => binding.gone);
  return <div className={styles.chipsBlock}>
    <div className={styles.chips} role="list" aria-label={t(iorbitCopy.refPicked)} data-orbit-reference-chips>
      {composer.bindings.map((binding) => <span key={`${candidateKey(binding)}@${binding.start}`} role="listitem" className={`${styles.chip} ${binding.gone ? styles.chipGone : ""}`} data-orbit-reference-chip={candidateKey(binding)}>
        <KindBadge kind={binding.type} language={language} />
        <b>{binding.name}</b>
        {binding.gone ? <span className={styles.chipGoneText}>{t(iorbitCopy.refGone)}</span> : same.has(`${binding.type}:${binding.name}`) && binding.hint ? <span className={styles.chipHint}>{binding.hint}</span> : null}
        <button type="button" className={`btn ${styles.chipRemove}`} aria-label={fill(t(iorbitCopy.refRemove), { name: binding.name })} onClick={() => onRemoved(composer.remove(binding))}>×</button>
      </span>)}
    </div>
    {gone ? <p className={styles.chipsNote}>{t(iorbitCopy.refGoneHint)}</p> : null}
  </div>;
}

/** The sentence behind the transparent textarea, with the picked 「@名字」 coloured (struck through when it can't open). */
export function MarkedMirror({ text, bindings, mirrorRef }: { text: string; bindings: readonly ReferenceBinding[]; mirrorRef: { current: HTMLDivElement | null } }) {
  return <div ref={mirrorRef} aria-hidden className={styles.mirror}>
    {markedSegments(text, bindings).map((segment, index) => (segment.binding ? <span key={index} className={`${styles.mark} ${segment.binding.gone ? styles.markGone : ""}`}>{segment.text}</span> : <span key={index}>{segment.text}</span>))}
    {"​"}
  </div>;
}

export { bindingHolds };
