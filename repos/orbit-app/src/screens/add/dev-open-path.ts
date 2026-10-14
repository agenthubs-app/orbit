// R26 像素门禁：开发包 + `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK` 含 `open-path` 时，启动后打开门禁脚本写进
// AsyncStorage 的路径（见 add-design-mock.ts），并关掉 LogBox 提示条。正式包永远不读。
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { addDesignMock } from "./add-design-mock";

export const DEV_OPEN_PATH_KEY = "orbit.dev.openPath";

export function useDevOpenPath(): void {
  const router = useRouter();
  useEffect(() => {
    if (!addDesignMock("open-path")) return;
    // 门禁截图时不要 LogBox 的黄条（画板没有）。
    LogBox.ignoreAllLogs();
    let cancelled = false;
    void AsyncStorage.getItem(DEV_OPEN_PATH_KEY).then(async (path) => {
      if (cancelled || !path || !path.startsWith("/")) return;
      await AsyncStorage.removeItem(DEV_OPEN_PATH_KEY);
      router.push(path as Href);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);
}

/** 挂在根布局里（任何初始路由都会经过）。 */
export function DevOpenPath(): null {
  useDevOpenPath();
  return null;
}
