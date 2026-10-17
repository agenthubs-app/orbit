import { APP_SEMANTIC_PREFERENCE_KEY } from "../search/search-model";
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
export async function readAccountSemantic(storage: Storage): Promise<boolean> { return await storage.getItem(APP_SEMANTIC_PREFERENCE_KEY) !== "off"; }
export async function writeAccountSemantic(storage: Storage, enabled: boolean): Promise<void> { await storage.setItem(APP_SEMANTIC_PREFERENCE_KEY, enabled ? "on" : "off"); }
