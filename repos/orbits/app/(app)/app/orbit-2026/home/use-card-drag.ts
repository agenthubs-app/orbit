"use client";

// Home edit mode: drag a widget card to a new place with a mouse, a pen or a finger (iOS home
// screen / Notion style). The card follows the pointer and the others slide out of the way as the
// order changes. Mouse drags start after a 4px move; touch and pen start after a short hold so a
// plain swipe still scrolls the page. HTML5 drag-and-drop is not used: it has no touch support and
// no live reflow.
import { useCallback, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";

const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
const TOUCH_HOLD_MS = 220;

type Point = { x: number; y: number };
type Session = {
  key: string; pointerId: number; type: string; el: HTMLElement; start: Point; last: Point;
  grab: Point | null; translate: Point; timer: ReturnType<typeof setTimeout> | null;
};

// Where a card sits in the layout, ignoring a slide animation still in flight (offsets skip transforms).
function layoutRect(el: HTMLElement | undefined) {
  const parent = el?.offsetParent as HTMLElement | null | undefined;
  if (!el || !parent) return null;
  const box = parent.getBoundingClientRect();
  const left = box.left + el.offsetLeft - parent.scrollLeft, top = box.top + el.offsetTop - parent.scrollTop;
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
}

export function useCardDrag<Key extends string>({ enabled, order, onMove }: { enabled: boolean; order: readonly Key[]; onMove: (key: Key, to: number) => void }) {
  const cards = useRef(new Map<Key, HTMLElement>());
  const session = useRef<Session | null>(null);
  const before = useRef<Map<Key, DOMRect> | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState<Key | null>(null);
  const orderRef = useRef(order); orderRef.current = order;
  const moveRef = useRef(onMove); moveRef.current = onMove;

  const place = (s: Session) => {
    if (!s.grab) return;
    const rect = s.el.getBoundingClientRect();
    const base = { x: rect.left - s.translate.x, y: rect.top - s.translate.y };
    s.translate = { x: s.last.x - s.grab.x - base.x, y: s.last.y - s.grab.y - base.y };
    s.el.style.transform = `translate(${s.translate.x}px, ${s.translate.y}px)`;
  };

  // After a reorder: keep the dragged card under the pointer, and slide the others from where they were.
  useLayoutEffect(() => {
    const s = session.current;
    if (s?.grab) place(s);
    const previous = before.current;
    before.current = null;
    if (!previous) return;
    for (const [key, el] of cards.current) {
      if (key === s?.key) continue;
      const from = previous.get(key), to = el.getBoundingClientRect();
      if (!from || (from.left === to.left && from.top === to.top)) continue;
      el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [order]);

  const blockScroll = useCallback((event: TouchEvent) => { if (session.current?.grab) event.preventDefault(); }, []);

  const begin = (s: Session) => {
    const rect = s.el.getBoundingClientRect();
    s.grab = { x: s.start.x - rect.left, y: s.start.y - rect.top };
    try { s.el.setPointerCapture(s.pointerId); } catch { /* the pointer may already be gone */ }
    document.addEventListener("touchmove", blockScroll, { passive: false });
    setDragging(s.key as Key);
    place(s);
  };

  const finish = (cancelled: boolean) => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    document.removeEventListener("touchmove", blockScroll);
    if (!s.grab) return;
    if (!cancelled) suppressClick.current = true;
    const { x, y } = s.translate;
    s.el.style.transform = "";
    s.el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" });
    setDragging(null);
  };

  const target = (point: Point, self: Key): number => {
    const list = orderRef.current;
    for (const key of list) {
      if (key === self) continue;
      const rect = layoutRect(cards.current.get(key));
      if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) return list.indexOf(key);
    }
    return -1;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const s = session.current;
    if (!s || event.pointerId !== s.pointerId) return;
    s.last = { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(s.last.x - s.start.x, s.last.y - s.start.y);
    if (!s.grab) {
      if (s.type === "mouse") { if (distance > MOUSE_SLOP) begin(s); else return; }
      else { if (distance > TOUCH_SLOP) finish(true); return; }
    }
    place(s);
    const to = target(s.last, s.key as Key);
    if (to >= 0 && to !== orderRef.current.indexOf(s.key as Key)) {
      before.current = new Map([...cards.current].map(([key, el]) => [key, el.getBoundingClientRect()]));
      moveRef.current(s.key as Key, to);
    }
  };

  const bind = (key: Key) => ({
    ref: (el: HTMLElement | null) => { if (el) cards.current.set(key, el); else cards.current.delete(key); },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || session.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
      const el = cards.current.get(key);
      if (!el) return;
      const start = { x: event.clientX, y: event.clientY };
      const s: Session = { key, pointerId: event.pointerId, type: event.pointerType, el, start, last: start, grab: null, translate: { x: 0, y: 0 }, timer: null };
      session.current = s;
      if (event.pointerType !== "mouse") s.timer = setTimeout(() => { if (session.current === s) begin(s); }, TOUCH_HOLD_MS);
    },
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => { if (session.current?.pointerId === event.pointerId) finish(false); },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => { if (session.current?.pointerId === event.pointerId) finish(true); },
    onDragStart: (event: DragEvent<HTMLElement>) => { if (enabled) event.preventDefault(); },
  });

  // A drag ends with a click on the card; the caller asks once so it does not open the size menu.
  const consumeClick = () => { const was = suppressClick.current; suppressClick.current = false; return was; };

  return { bind, dragging, consumeClick };
}
