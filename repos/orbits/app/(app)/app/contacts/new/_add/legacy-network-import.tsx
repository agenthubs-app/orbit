/**
 * R12：「その他」（連絡先 vCard / LinkedIn / CSV / イベントから）在 R16 重写之前的临时落点——原样渲染旧导入屏
 * NetworkImport（`?method=csv|contacts|event`、`?import=`）。名片部分已迁到 `/app/contacts/new/scan`，这里不再进入
 * 名片模式。新界面不能和旧作用域 `[data-orbit-real-page]` 写在同一个文件里（orbit-2026-scope 门禁），所以单独放这里。
 */
import { resolveBusinessCardCaptureAvailability } from "../../../../../../features/acquisition/business-card-capture-availability";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../../orbit-visual-freeze-runtime";
import { NetworkImport, type NetworkImportMethod } from "../../network-0918/network-import";

export function LegacyNetworkImport({ method, importId }: { method: Exclude<NetworkImportMethod, "scan">; importId?: string }) {
  const availability = resolveBusinessCardCaptureAvailability();
  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="network" data-orbit-route="app-contacts-new-route">
        {/* 复核 m6：「名片」方法卡去新的读取页，不再在这里打开旧的名片上传。 */}
        <NetworkImport availability={{ available: availability.available, reason: availability.reason }} importId={importId} initialMethod={method} scanHref="/app/contacts/new/scan" />
      </div>
    </>
  );
}
