/**
 * W0054：人脉分析门槛的服务端读取——与引导第 1 步同一条计数语句（`CONFIRMED_CONTACT_COUNT_SQL`，
 * 只返回一个整数）。读失败返回 null：调用方按「未知」处理，照旧渲染（快照服务自身在不足 3 位时
 * 也只返回 insufficient、不下发叙述），不因为一次计数失败把整页 AI 块换成门槛卡。
 */
import { createConfiguredConfirmedContactCounter, type ConfirmedContactCounter } from "../guide/progress";
import { analysisThreshold, type AnalysisThreshold } from "./analysis-threshold";

export type AnalysisThresholdReader = (actorId: string) => Promise<AnalysisThreshold | null>;

export async function readAnalysisThreshold(
  actorId: string,
  count?: ConfirmedContactCounter,
): Promise<AnalysisThreshold | null> {
  try {
    return analysisThreshold(await (count ?? createConfiguredConfirmedContactCounter())(actorId));
  } catch (error) {
    console.error(JSON.stringify({ actorId, error: error instanceof Error ? error.name : "unknown", event: "analysis_threshold_read_failed" }));
    return null;
  }
}
