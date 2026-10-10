import Storage from "expo-sqlite/kv-store";

// R05 (R01 review m3): a synchronous copy of the appearance choice so the root
// layout can apply it before the first frame — no light/dark flash on a cold
// start. expo-sqlite is already a native dependency; AsyncStorage stays the source.
export const appearanceSyncStore = {
  read(key: string): string | null {
    try { return Storage.getItemSync(key); } catch { return null; }
  },
  write(key: string, value: string): void {
    try { Storage.setItemSync(key, value); } catch { /* the async copy still has it */ }
  },
};
