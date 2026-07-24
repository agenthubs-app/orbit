"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Shared dialog behavior for every modal surface: initial focus, a Tab focus
 * trap, Escape-to-close, and focus restoration on unmount. Attach the returned
 * ref to the dialog card element (which should carry role="dialog" and
 * aria-modal="true").
 */
export function useOrbitModalA11y(onClose: () => void) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Callers often pass an inline closure for onClose, which would otherwise
  // change identity every render and re-run the mount effect below (stealing
  // focus back to the first focusable element on every parent re-render).
  // Keeping the latest onClose in a ref lets the effect depend only on the
  // stable `focusable` callback.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const focusable = useCallback(() => {
    const root = cardRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }, []);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const items = focusable();
    (items[0] ?? cardRef.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;

      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [focusable]);

  return cardRef;
}
