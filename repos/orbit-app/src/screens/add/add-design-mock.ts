// R12 像素门禁的本机开关（同 Web `ORBIT_REDESIGN_MOCK`）：只在开发包里、Metro 带
// `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=<名>[,<名>…]` 时生效；正式包（__DEV__ = false）永远关闭。
//   add-scan     名刺批次 `contacts/new/scan/design-<状态>` 用设计稿示例数据渲染（不读写服务器）；
//   no-keyboard  加人页的输入框聚焦时不弹软键盘（App 画板画了光标 / 候补下拉，但从不画系统键盘）。
export type AddDesignMock = "add-scan" | "no-keyboard";

export function addDesignMock(name: AddDesignMock, env: string | undefined = process.env.EXPO_PUBLIC_ORBIT_REDESIGN_MOCK, dev: boolean = typeof __DEV__ !== "undefined" && __DEV__): boolean {
  if (!dev || !env) return false;
  const listed = env.split(",").map((entry) => entry.trim());
  return listed.includes("all") || listed.includes(name);
}
