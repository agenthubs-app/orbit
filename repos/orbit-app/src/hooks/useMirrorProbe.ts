import { useEffect } from "react";

/**
 * Sprint 0108: a mirror-backed page shows the device copy at once, then asks
 * the server whether anything changed (one conditional manifest read, a 304
 * when nothing did). The mount sync alone is skipped for five minutes after a
 * success, which would leave an offline page looking online with its write
 * entries enabled; this probe is what turns a lost connection into the
 * "as of" notice and disabled writes on every open.
 */
export function useMirrorProbe(refresh: () => unknown, enabled = true): void {
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
}
