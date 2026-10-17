import { useEffect, useState } from "react";
import { useAccountPath } from "./useAccountProfile";
import type { accountDesignFixtures } from "./design-fixtures";

type Fixtures = typeof accountDesignFixtures;
export function useAccountDesign() {
  const path = useAccountPath();
  const [fixtures, setFixtures] = useState<Fixtures | null>(null);
  useEffect(() => {
    let live = true;
    // Metro removes this import with the false __DEV__ branch in production bundles.
    if (typeof __DEV__ === "undefined" || !__DEV__ || !path.includes("?design=")) { setFixtures(null); return; }
    void import("./design-fixtures").then(value => { if (live) setFixtures(value.accountDesignFixtures); });
    return () => { live = false; };
  }, [path]);
  const variant: "empty" | "few" | "many" = path.endsWith("25") ? "empty" : path.endsWith("50") ? "few" : "many";
  return fixtures ? { fixtures, variant } : null;
}
