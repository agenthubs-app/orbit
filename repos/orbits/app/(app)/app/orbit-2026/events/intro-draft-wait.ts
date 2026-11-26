// 确认页等 AI 写自我介绍（RegisterFlow）：最多等 `waitMs`，到时先给兜底，之后才回来的结果交给 `late`。纯函数，测试见 tests/events/r27-join-intro-draft.test.ts。

/** 等 AI 写自我介绍最多多久：模型单次 60 秒（generateEventPersona 的 requestTimeoutMs）+ 网络余量。 */
export const INTRO_DRAFT_WAIT_MS = 70_000;

export type IntroDraftOutcome = { state: "idle" | "failed"; text: string };

/** 结果 → 显示什么：AI 写成 = 那段文字；没写成（资料里的介绍或空）= 兜底并说明。 */
export function introDraftOutcome(result: { ok: boolean; selfIntro?: { source: string; text: string } | null }): IntroDraftOutcome {
  const text = result.ok ? result.selfIntro?.text ?? "" : "";
  return { state: result.ok && result.selfIntro?.source === "ai_draft" ? "idle" : "failed", text };
}

export async function waitForIntroDraft<T>(request: Promise<T>, waitMs = INTRO_DRAFT_WAIT_MS, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))): Promise<{ timedOut: false; value: T } | { timedOut: true; late: Promise<T> }> {
  const first = await Promise.race([request.then((value) => ({ value })), sleep(waitMs).then(() => "timeout" as const)]);
  return first === "timeout" ? { late: request, timedOut: true } : { timedOut: false, value: first.value };
}
