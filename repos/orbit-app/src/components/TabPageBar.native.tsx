import { useIsFocused, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";

import type { MainTab } from "../view-models/app-navigation";
import { OrbitTabBar } from "./OrbitTabBar";
import { currentCoveredTab, setCoveredTab } from "./tab-bar-cover";

// D07: like iOS hidesBottomBarWhenPushed, the bar belongs to the tab page. The root
// layout draws it while a tab page is on top; while a secondary page covers a tab page
// (pushing in, shown, popping out) that tab page draws its own copy here, so the native
// transition moves and covers the bar together with the page. The page hands the bar
// back to the root only once it is on top again and its transition has ended.
/** A tab page's own copy of the bar while a secondary page covers it (native only). */
export function TabPageBar({ tab }: { tab: MainTab }) {
  const focused = useIsFocused();
  const navigation = useNavigation();
  const [settling, setSettling] = useState(false);
  const wasFocused = useRef(focused);
  if (wasFocused.current !== focused) {
    wasFocused.current = focused;
    // Coming back on top: keep drawing the page's copy until the pop has finished.
    if (focused && !settling) setSettling(true);
  }
  useEffect(() => {
    if (!settling) return;
    const done = () => setSettling(false);
    const unsubscribe = navigation.addListener("transitionEnd" as never, done);
    const fallback = setTimeout(done, SETTLE_FALLBACK_MS);
    return () => { unsubscribe(); clearTimeout(fallback); };
  }, [navigation, settling]);
  const drawn = !focused || settling;
  // Only a page settling back on top keeps the root bar away: while it is merely covered
  // the path is a secondary page's (the root bar is hidden anyway), and an older copy of
  // the same tab left deeper in the stack must not hide the bar of the one on top.
  useEffect(() => {
    if (settling) setCoveredTab(tab);
    else if (currentCoveredTab() === tab) setCoveredTab(null);
  }, [settling, tab]);
  useEffect(() => () => { if (currentCoveredTab() === tab) setCoveredTab(null); }, [tab]);
  return drawn ? <OrbitTabBar active={tab} /> : null;
}

/** If a transition end is never reported (an interrupted gesture), hand back after the push time. */
const SETTLE_FALLBACK_MS = 700;

