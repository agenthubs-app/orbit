// R17 受付的本机存储入口（Web 打包 / 测试）：没有 expo-sqlite 时用内存实现（离线受付只活到关页）。
// 原生走 kiosk-store.native.ts（expo-sqlite）。
import { memoryKioskStore, type KioskStore } from "./kiosk-queue";

let shared: KioskStore | null = null;
export async function openKioskStore(): Promise<KioskStore> {
  shared ??= memoryKioskStore();
  return shared;
}
