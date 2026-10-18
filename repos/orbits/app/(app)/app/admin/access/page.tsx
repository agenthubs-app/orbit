/**
 * 管理员访问入口。
 *
 * 这是 admin access 子路由的登录壳，实际登录 UI 复用 `OrbitRealAdminLogin`。
 */
import { OrbitRealAdminLogin } from "../orbit-real-admin-login";

export default function AdminAccessPage() {
  return <OrbitRealAdminLogin />;
}
