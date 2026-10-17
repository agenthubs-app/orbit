import { useEffect, useState } from "react";
import { useAccountPath } from "./useAccountProfile";
import type { accountDesignFixtures } from "../../../fixtures/account-design";

type Fixtures = typeof accountDesignFixtures;
export function useAccountDesign() {
  const path = useAccountPath();
  const [fixtures, setFixtures] = useState<Fixtures | null>(null);
  useEffect(() => {
    let live = true;
    if (typeof __DEV__ === "undefined" || !__DEV__ || !path.includes("?design=")) { setFixtures(null); return; }
    // Metro folds this positive branch before collecting dependencies; an early
    // return alone still leaves the otherwise unreachable import in its graph.
    if (__DEV__) void import("../../../fixtures/account-design").then(value => { if (live) setFixtures(value.accountDesignFixtures); });
    return () => { live = false; };
  }, [path]);
  const variant: "empty" | "few" | "many" = path.endsWith("25") ? "empty" : path.endsWith("50") ? "few" : "many";
  return fixtures ? { fixtures, variant } : null;
}
