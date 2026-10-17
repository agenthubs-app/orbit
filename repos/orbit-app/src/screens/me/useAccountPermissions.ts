import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { actOnPermission, type AccountPermissionStatus } from "./permission-action";
import type { AccountPermissionRow } from "./AccountSettingsContent";

export function useAccountPermissions() {
  const [states, setStates] = useState<Partial<Record<"camera" | "notification", AccountPermissionStatus>>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let live = true;
    async function read() {
      try {
        const [camera, notification] = await Promise.all([ImagePicker.getCameraPermissionsAsync(), Notifications.getPermissionsAsync()]);
        if (live) { setStates({ camera: camera.status, notification: notification.status }); setFailed(false); }
      } catch { if (live) setFailed(true); }
    }
    void read(); const listener = AppState.addEventListener("change", state => { if (state === "active") void read(); });
    return () => { live = false; listener.remove(); };
  }, []);
  const rows: AccountPermissionRow[] = (["camera", "notification"] as const).flatMap(key => {
    const status = states[key];
    if (!status) return [];
    return [{ key, status, onPress: () => { void actOnPermission(status, {
      request: async () => { const permission = key === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await Notifications.requestPermissionsAsync(); setStates(value => ({ ...value, [key]: permission.status })); },
      openSettings: () => Linking.openSettings(),
    }).catch(() => setFailed(true)); } }];
  });
  // No native calendar adapter exists in this build; server OAuth records are not OS permission.
  return { rows, failed };
}
