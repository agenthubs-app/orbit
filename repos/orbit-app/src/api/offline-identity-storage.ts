import * as SecureStore from "expo-secure-store";
import { createOfflineIdentityStorage } from "./offline-identity";

// Same protection class as the stored session cookie (native-auth-session-storage.ts).
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export const offlineIdentityStorage = createOfflineIdentityStorage({
  delete: (key) => SecureStore.deleteItemAsync(key, secureStoreOptions),
  get: (key) => SecureStore.getItemAsync(key, secureStoreOptions),
  set: (key, value) => SecureStore.setItemAsync(key, value, secureStoreOptions)
});
