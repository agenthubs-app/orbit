// R17 受付：心跳用的设备 id（本机固定，AsyncStorage）。
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_KEY = "orbit.host.kioskDevice";
export async function kioskDeviceId(): Promise<string> {
  const fresh = `kiosk-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    const saved = await AsyncStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    await AsyncStorage.setItem(DEVICE_KEY, fresh);
  } catch { /* 存不了就每次给新的 */ }
  return fresh;
}
