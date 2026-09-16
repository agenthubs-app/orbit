import { useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";

interface MobileViewportState {
  keyboardVisible: boolean;
  visibleHeight: number | null;
}

const KEYBOARD_INSET_MINIMUM = 120;
const MOBILE_VIEWPORT_MAXIMUM = 768;
const UNZOOMED_SCALE_TOLERANCE = 0.01;

interface ViewportBaseline {
  height: number;
  width: number;
}

function viewportHeight() {
  const viewport = window.visualViewport;
  return Math.round(viewport?.height ?? window.innerHeight);
}

function isEditableElement(element: Element | null) {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable);
}

function readViewport(baseline: ViewportBaseline): MobileViewportState {
  const viewport = window.visualViewport;
  const visibleHeight = viewportHeight();
  const scale = viewport?.scale ?? 1;
  const unzoomed = Math.abs(scale - 1) <= UNZOOMED_SCALE_TOLERANCE;
  const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
  const editableFocused = isEditableElement(document.activeElement);
  const keyboardThreshold = Math.max(
    KEYBOARD_INSET_MINIMUM,
    Math.round(baseline.height * 0.18)
  );
  const keyboardVisible =
    window.innerWidth <= MOBILE_VIEWPORT_MAXIMUM &&
    touchCapable &&
    unzoomed &&
    editableFocused &&
    baseline.height - visibleHeight >= keyboardThreshold;

  if (!keyboardVisible && unzoomed && (!editableFocused || !touchCapable)) {
    baseline.height = Math.max(window.innerHeight, visibleHeight);
    baseline.width = window.innerWidth;
  }

  return {
    keyboardVisible,
    visibleHeight
  };
}

export function useMobileViewport(): MobileViewportState {
  const baseline = useRef<ViewportBaseline | null>(null);
  const [state, setState] = useState<MobileViewportState>({
    keyboardVisible: false,
    visibleHeight: null
  });
  const [keyboardFallbackVisible, setKeyboardFallbackVisible] = useState(false);

  useEffect(() => {
    baseline.current = {
      height: Math.max(window.innerHeight, viewportHeight()),
      width: window.innerWidth
    };
    const update = () => {
      if (baseline.current) setState(readViewport(baseline.current));
    };
    const resetBaseline = () => {
      baseline.current = {
        height: Math.max(window.innerHeight, viewportHeight()),
        width: window.innerWidth
      };
      update();
    };
    const updateForWindowResize = () => {
      if (!baseline.current || Math.abs(window.innerWidth - baseline.current.width) > 1) {
        resetBaseline();
        return;
      }
      update();
    };
    const viewport = window.visualViewport;
    setKeyboardFallbackVisible(Keyboard.isVisible());
    update();
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardFallbackVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardFallbackVisible(false));
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", updateForWindowResize);
    window.addEventListener("orientationchange", resetBaseline);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      show.remove();
      hide.remove();
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", updateForWindowResize);
      window.removeEventListener("orientationchange", resetBaseline);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return {
    ...state,
    keyboardVisible: state.keyboardVisible || keyboardFallbackVisible
  };
}
