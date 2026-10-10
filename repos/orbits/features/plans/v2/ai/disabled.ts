/**
 * R23（复核 M6）：live 但没配置 AI 时的实现——每一步都回答「不可用」，由服务层按失败降级处理
 * （C1 / C3 / C4 / C5 规则、C2 规则下书、C6 / C7 失败卡）。不记账、不联网、不产生任何演示内容。
 */
import type { PlanAiOutcome, PlanFlowAi } from "./types";

const disabled = async <T>(): Promise<PlanAiOutcome<T>> => ({ ok: false, reason: "disabled" });

export function createDisabledPlanFlowAi(): PlanFlowAi {
  return { background: disabled, firstDraft: disabled, fix: disabled, goalKind: disabled, id: "mock", ladder: disabled, members: disabled, questions: disabled };
}
