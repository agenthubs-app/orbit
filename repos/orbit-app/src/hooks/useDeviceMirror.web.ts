import { useWebMirrorStatus } from "./useWebMirrorStatus";

/** LF1, browser: the mirror is a local source only while it is active (secure origin, OPFS, IndexedDB, Web Crypto). */
export function useDeviceMirror(): boolean {
  return useWebMirrorStatus().mode === "local-mirror";
}
