/**
 * 管理员登录入口。
 *
 * 这里只挂载管理员登录组件和共享视觉 runtime，不在 route 中处理认证逻辑。
 */
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAdminLogin } from "../admin/orbit-real-admin";

export default function LoginAdminPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminLogin />
    </>
  );
}
