import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";

export type HomeRead<T> = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: T };

/** Each mounted card reads only its own source; a failed card cannot clear its siblings. */
export function useHomeRead<T>(client: OrbitApiClient, path: string, schema: ZodType<T>): HomeRead<T> & { retry: () => void } {
  const [state, setState] = useState<HomeRead<T>>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void client.get<unknown>(path).then(result => {
      if (!active) return;
      const parsed = result.success ? schema.safeParse(result.data) : null;
      setState(parsed?.success ? { kind: "ready", data: parsed.data } : { kind: "error" });
    }).catch(() => { if (active) setState({ kind: "error" }); });
    return () => { active = false; };
  }, [client, path, schema, version]));
  return { ...state, retry };
}
