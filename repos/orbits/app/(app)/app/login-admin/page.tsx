/**
 * 管理员登录入口。
 *
 * 这里只挂载管理员登录组件和共享视觉 runtime，不在 route 中处理认证逻辑。
 */
import { OrbitRealAdminLogin } from "../admin/orbit-real-admin-login";

export default function LoginAdminPage() {
  return <OrbitRealAdminLogin />;
}
