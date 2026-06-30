import { readPrototypeScriptAsset } from "./orbit-reference-styles";
import { OrbitLangRuntimeClient } from "./orbit-lang-runtime-client";

export function OrbitLangRuntime() {
  // 旧 prototype 的 i18n runtime 仍作为脚本资产嵌入；React 侧只负责读取并交给 client wrapper。
  const i18nScript = readPrototypeScriptAsset("3fb21a06-dad4-41b9-bec9-3ec6c3d10e46");

  return <OrbitLangRuntimeClient script={i18nScript} />;
}
