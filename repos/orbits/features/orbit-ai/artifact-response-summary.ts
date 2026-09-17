import { contactArtifactToDisplay } from "../../shared/api-schema/ai-artifacts";
import type { OrbitAgentArtifactPayload } from "./artifact-contract";

export function contactArtifactResponseSummary(artifacts: readonly OrbitAgentArtifactPayload[], locale: "en" | "zh", contactIntent = false): string | null {
  const contacts = artifacts.slice(0, 16).filter(value => value.task.kind === "contact_recommendations").map(contactArtifactToDisplay);
  const displays = contacts.filter(value => value.status === "ready");
  const items = displays.flatMap(value => value.sections.flatMap(section => section.items));
  if (items.length === 0) {
    if (!contactIntent) return null;
    if (contacts.some(value => value.status === "pending")) return locale === "zh" ? "人脉匹配尚未完成，暂时没有可复核的候选结果。" : "Contact matching is not finished. No candidates are available for review yet.";
    if (contacts.some(value => value.status === "failed")) return locale === "zh" ? "人脉匹配失败，暂时没有可复核的候选结果。" : "Contact matching failed. No candidates are available for review.";
    if (contacts.some(value => value.status === "empty")) return locale === "zh" ? "这次没有匹配到候选人。可以缩小目标或补充关系资料后再查询。" : "No candidates matched this request. Try a narrower goal or add relationship information.";
    return locale === "zh" ? "这次没有可验证的人脉匹配结果，无法确认有哪些候选人。" : "No verified contact results are available, so I cannot confirm any candidates.";
  }
  const allHaveEvidence = items.every(value => value.evidenceIds.length > 0);
  const summary = displays[0]?.summary.trim().slice(0, 512);
  const introduction = allHaveEvidence && displays.length === 1 && summary ? summary : locale === "zh" ? `已匹配 ${items.length} 位候选人，请复核可用的推荐依据。` : `Found ${items.length} candidates. Review the available recommendation evidence.`;
  const candidates = items.slice(0, 3).map(value => [value.title.slice(0, 120), value.reason?.slice(0, 240)].filter(Boolean).join(" · "));
  const review = locale === "zh" ? "请在下方结果中复核推荐原因和关系证据，点击查看已有联系人详情。" : "Review the reasons and relationship evidence below, then open the existing contact details.";
  return [introduction, ...candidates, review].join("\n").slice(0, 4096);
}
