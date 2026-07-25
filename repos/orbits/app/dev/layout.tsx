/**
 * `/dev` 分组 layout。
 *
 * `app/globals.css` 是内部 workbench 样式表（capability 调试面板、foundation
 * 参考页、mock registry、knowledge wiki、orbit-ai trace debugger），规则全部
 * 收在 `.orbit-dev-root` 前缀下。这里统一 import 一次，并把根类挂到所有
 * `/dev/**` 页面外层，产品路由（`app/(app)/app`）不再引入这份样式表。
 */
import "../globals.css";
import type { ReactNode } from "react";

export default function DevLayout({ children }: { children: ReactNode }) {
  return <div className="orbit-dev-root">{children}</div>;
}
