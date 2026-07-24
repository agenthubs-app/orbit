import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createAuthSessionStorage } from "./auth-session-storage";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

export const nativeAuthSessionStorage = createAuthSessionStorage({
  legacy: {
    delete: (key) => AsyncStorage.removeItem(key),
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value)
  },
  secure: {
    delete: (key) => SecureStore.deleteItemAsync(key, secureStoreOptions),
    get: (key) => SecureStore.getItemAsync(key, secureStoreOptions),
    set: (key, value) =>
      SecureStore.setItemAsync(key, value, secureStoreOptions)
  }
});
