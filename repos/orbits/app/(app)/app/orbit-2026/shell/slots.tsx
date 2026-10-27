"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";

// R07 shell slots (frozen): a page fills the main header and the optional right
// rail by rendering <ShellPage …/> anywhere in its tree; the shell draws them.
//   title / subtitle — the centred main title (mainhead);
//   left / right     — buttons either side of the title;
//   demoPill         — the sample-mode pill (ShellDemoPill), shown next to the title;
//   rightRail        — the rail content (≥1280; 768–1279 the shell adds a 次の一手
//                      button after `right` that opens it as a drawer; `false` hides the rail);
//   railLabel        — what the rail is when it is not 次の一手 (iOrbit: 会話リスト): its name, the button and the drawer title;
//   phoneBare        — below 768 the page is full screen: no brand bar, no bottom capsule (R27 会場モード, b12 #364).
//   phoneFold        — the page draws its own heading below 768 (b6 / b8 390: home, Task),
//                      so the shell keeps only the demo pill there; other pages keep the row.
// Shell-drawn header buttons for the slots: ShellSearchButton (🔍 → ⌘K) and
// ShellBellButton (🔔 → 受信箱, unread dot).
// Node slots render inside the shell, not inside the page: anything they need
// from the page (demo mode, page state) must be read in the page and passed in
// as props (see ShellDemoPill). Several <ShellPage>s may be mounted at once; each
// sets only the slots it names, the later-mounted one wins a slot both name.
export type ShellSlots = {
  title?: string;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  demoPill?: ReactNode;
  rightRail?: ReactNode | false;
  railLabel?: string;
  railCount?: number;
  phoneFold?: boolean;
  /** < 768: a full-screen page (no brand bar, no bottom capsule) — R27 会場モード (b12 #364). */
  phoneBare?: boolean;
};

type SetSlots = (id: string, slots: ShellSlots | null) => void;

const SlotsContext = createContext<ShellSlots | null>(null);
// The setter lives in its own context and never changes, so a <ShellPage> does not
// re-render (and re-run its effect) every time the slots change.
const SetSlotsContext = createContext<SetSlots | null>(null);

const SLOT_KEYS = ["title", "subtitle", "left", "right", "demoPill", "rightRail", "railLabel", "railCount", "phoneFold", "phoneBare"] as const;
const sameSlots = (a: ShellSlots, b: ShellSlots) => SLOT_KEYS.every((key) => Object.is(a[key], b[key]));

export function ShellSlotsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ReadonlyArray<readonly [string, ShellSlots]>>([]);
  const set = useCallback<SetSlots>((id, part) => setEntries((current) => {
    const index = current.findIndex(([key]) => key === id);
    if (part === null) return index === -1 ? current : current.filter(([key]) => key !== id);
    if (index === -1) return [...current, [id, part] as const];
    if (sameSlots(current[index]![1], part)) return current;
    const next = [...current];
    next[index] = [id, part] as const;
    return next;
  }), []);
  const slots = useMemo<ShellSlots>(() => {
    const merged: ShellSlots = {};
    for (const [, part] of entries) for (const key of SLOT_KEYS) if (part[key] !== undefined) (merged as Record<string, unknown>)[key] = part[key];
    return merged;
  }, [entries]);
  return (
    <SetSlotsContext.Provider value={set}>
      <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
    </SetSlotsContext.Provider>
  );
}

export function useShellSlots(): ShellSlots {
  return useContext(SlotsContext) ?? {};
}

/** Whether the page renders inside the shell (signed in, a framed page); false in tests of a page on its own. */
export function useInShell(): boolean {
  return useContext(SetSlotsContext) !== null;
}

/** Sets the shell slots while mounted. Outside the shell (signed out, tests) it renders nothing. */
export function ShellPage(props: ShellSlots) {
  const id = useId();
  const set = useContext(SetSlotsContext);
  const { title, subtitle, left, right, demoPill, rightRail, railLabel, railCount, phoneFold, phoneBare } = props;
  useEffect(() => {
    if (!set) return;
    set(id, { title, subtitle, left, right, demoPill, rightRail, railLabel, railCount, phoneFold, phoneBare });
  }, [set, id, title, subtitle, left, right, demoPill, rightRail, railLabel, railCount, phoneFold, phoneBare]);
  useEffect(() => (set ? () => set(id, null) : undefined), [set, id]);
  return null;
}
