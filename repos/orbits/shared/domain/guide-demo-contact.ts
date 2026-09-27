/**
 * 引导期示例联系人的 id 规则（W0005）。零依赖，网页前端（示例数据）与服务端（页面、写接口）共用。
 *
 * 示例联系人只存在于前端（`app/(app)/app/_demo/demo-network.ts`），id 统一以 `demo:` 开头，
 * 不对应任何存储记录：联系人写接口见到它在读 body、建 service／runtime 之前直接拒绝；
 * 联系人详情页在不处于示例时对它返回 404。
 */
export const DEMO_CONTACT_ID_PREFIX = "demo:";

/** 已解码的 id 是否是示例联系人。 */
export function isDemoContactId(id: string): boolean {
  return id.startsWith(DEMO_CONTACT_ID_PREFIX);
}

/** 路由参数里的 id（可能原样 `demo:x`，也可能 URL 编码 `demo%3Ax`）是否是示例联系人。 */
export function isDemoContactRouteId(id: string): boolean {
  if (isDemoContactId(id)) return true;
  try {
    return isDemoContactId(decodeURIComponent(id));
  } catch {
    return false;
  }
}
