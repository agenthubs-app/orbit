import { NextResponse } from "next/server";

import { runtimeBoundaryHeaders, success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { agentV1EntryEnabled } from "../../../../../features/agent-v1/entry/mode";

export const dynamic = "force-dynamic";

// agent-design AG07：客户端开对话前问一次该用哪一版协议。ORBIT_AGENT_V1_MODE=on 时是 3（新入口、结果文档、确认卡），否则是 2。
// 不读任何记录，不需要账号以外的东西。
export async function GET(): Promise<Response> {
  const mode = resolveFeatureMode();
  return NextResponse.json(success({ protocolVersion: agentV1EntryEnabled() ? 3 : 2 }), { headers: { ...runtimeBoundaryHeaders(mode), "cache-control": "no-store" }, status: 200 });
}
