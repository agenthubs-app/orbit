import { readPrototypeScriptAsset } from "./orbit-reference-styles";
import { OrbitLangRuntimeClient } from "./orbit-lang-runtime-client";

export function OrbitLangRuntime() {
  const i18nScript = readPrototypeScriptAsset("3fb21a06-dad4-41b9-bec9-3ec6c3d10e46");

  return <OrbitLangRuntimeClient script={i18nScript} />;
}
