/**
 * 管理员访问入口。
 *
 * 这是 admin access 子路由的登录壳，实际登录 UI 复用 `OrbitRealAdminLogin`。
 */
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitRealAdminLogin } from "../orbit-real-admin";

export default function AdminAccessPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminLogin />
    </>
  );
}
