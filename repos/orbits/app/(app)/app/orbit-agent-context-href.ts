import { agentHrefForPrompt } from "./orbit-product-href";

export type OrbitAgentContextKind = "contact" | "event";

export interface OrbitAgentContextHrefInput {
  details?: string;
  id: string;
  kind: OrbitAgentContextKind;
  label: string;
  language: "en" | "zh";
}

export function agentHrefForContext(input: OrbitAgentContextHrefInput): string {
  const label = input.label.trim();
  const id = input.id.trim();
  const details = input.details?.trim();
  const identity = [
    label ? `“${label}”` : "",
    id ? `ID: ${id}` : "",
    details ?? "",
  ]
    .filter(Boolean)
    .join(" · ");

  if (input.language === "en") {
    const subject =
      input.kind === "contact"
        ? `the contact ${identity}`
        : `the event ${identity}`;
    const request =
      input.kind === "contact"
        ? "Summarize our current relationship, the supporting evidence, and the best next step."
        : "Assess its fit with my goals and network, then suggest whether and how I should participate and prepare.";

    return agentHrefForPrompt(
      `Using the current Orbit records for ${subject}, ${request} Do not perform any external action.`,
    );
  }

  const subject =
    input.kind === "contact" ? `联系人${identity}` : `活动${identity}`;
  const request =
    input.kind === "contact"
      ? "总结当前关系、支持证据和最合适的下一步"
      : "评估它与我的目标和人脉的匹配度，并建议是否参与以及如何准备";

  return agentHrefForPrompt(
    `请基于 Orbit 当前记录中的${subject}，${request}。不要执行任何外部操作。`,
  );
}
