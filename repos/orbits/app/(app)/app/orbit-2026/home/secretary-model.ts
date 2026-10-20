import type { SecretaryPreviewDTO } from "../../../../../shared/contract/secretary-preview";

/** R10 shows only the three approved event sources with an executable destination. */
export function visibleSecretaryItems(data: SecretaryPreviewDTO) {
  return data.items.filter((item) => ["event_deadline", "event_prep", "event_pick"].includes(item.kind)
    && item.notification.sources.some((source) => source.sourceKind === item.kind)
    && item.notification.target.status === "available" && item.notification.target.href).slice(0, 3);
}
