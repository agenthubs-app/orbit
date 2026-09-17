import type { OrbitAgentArtifactPayload } from "../artifact-contract";

// Query tools already enforce actor ownership and bounded reads. This formats
// their evidence; it never asks a model to invent a result or executes a write.
function plainText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]()#+.!>|~<>-]/g, "\\$&");
}

export function actorQueryReply(
  artifacts: readonly OrbitAgentArtifactPayload[],
  locale: "en" | "zh",
): string | undefined {
  const queries = artifacts.filter(artifact => artifact.task.kind === "data_query");
  if (!queries.length) return undefined;
  const zh = locale === "zh";
  return queries.map(artifact => {
    const view = artifact.result.generatedView;
    const allItems = (view?.sections ?? []).flatMap(section => section.items ?? []);
    const items = allItems.slice(0, 10);
    const lines = items.length ? [zh ? "只读查询结果：" : "Read-only query results:"]
      : [zh ? "本次查询没有找到匹配记录。" : "No matching records in this query."];
    for (const item of items) {
      lines.push("", `- ${plainText(item.title.slice(0, 300))}`);
      for (const field of (item.metadata ?? []).slice(0, 12)) {
        lines.push(`  ${plainText(field.label)}: ${plainText(field.value.slice(0, 200))}`);
      }
      if (item.body) lines.push(`  ${plainText(item.body.slice(0, 500))}`);
    }
    if (artifact.result.dataVisibility?.truncated || allItems.length > items.length) {
      lines.push("", zh ? "以上仅为部分结果；可以继续查询下一页。" : "Partial results; more records can be requested.");
    }
    const visibility = artifact.result.dataVisibility;
    if (visibility) {
      lines.push("", `${zh ? "已读取" : "Read"}: ${visibility.usedDataDomains.join(", ")}. ${zh ? "未读取" : "Not read"}: ${visibility.unreadDataDomains.join(", ")}.`);
    }
    return lines.join("\n");
  }).join("\n\n");
}
