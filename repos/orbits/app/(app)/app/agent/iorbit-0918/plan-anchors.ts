/**
 * W0051（review P2）：计划页条目锚点的唯一来源。计划页的需求容器输出这个 id，洞察的「依据：计划需求」链接也用它，
 * 两边不会对不上。纯函数，客户端可用。
 */
export function planNeedAnchorId(needId: string): string {
  return `plan-need-${needId}`;
}

/** 依据链接：计划页 + 需求锚点（片段按 URL 编码，浏览器定位时解码后与 id 精确相等）。 */
export function planNeedHref(needId: string, planHref = "/app/agent/plan"): string {
  return `${planHref}#${encodeURIComponent(planNeedAnchorId(needId))}`;
}
