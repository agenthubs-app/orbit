import { createConfiguredTransactionalPostgresRuntime } from "../../shared/storage/transactional-postgres";
import type { AccountLanguagePreferenceService } from "./contract";
import { createLiveAccountLanguagePreferenceService } from "./live-service";
import { createTransactionalStorageAccountLanguagePreferenceProvider } from "./storage/account-language-live-record-provider";

export function createConfiguredAccountLanguagePreferenceService(): AccountLanguagePreferenceService | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const provider = createTransactionalStorageAccountLanguagePreferenceProvider({
    client: runtime.client,
    workspaceId: runtime.workspaceId,
  });
  return createLiveAccountLanguagePreferenceService({ provider });
}
