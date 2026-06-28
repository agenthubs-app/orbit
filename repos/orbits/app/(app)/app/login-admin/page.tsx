import { OrbitLangRuntime } from "../orbit-lang-runtime";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealAdminLogin } from "../admin/orbit-real-admin";

export default function LoginAdminPage() {
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLangRuntime />
      <OrbitVisualFreezeRuntime />
      <OrbitRealAdminLogin />
    </>
  );
}
