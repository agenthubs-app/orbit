// R08 contract 1 — home widget layout. Owner: 乙 (R10). Used by: App and Web home.
// The default layout lives with the schema (shared/api-schema/home-layout.ts):
// contract files carry no runtime values.
export type HomeWidgetKey = "today" | "planScore" | "nextEvent" | "network" | "secretary" | "pending" | "week" | "eventPick" | "memo" | "deadline";

export interface HomeWidgetSlot {
  key: HomeWidgetKey;
  size: "s" | "m";
}

export interface HomeLayoutContract {
  revision: number;
  app: readonly HomeWidgetSlot[];
  web: readonly HomeWidgetSlot[];
  /** When the person closed the 「長押しで並べ替え」 hint. */
  hintDismissedAt?: string;
}

/** PUT /api/home/layout — 409 when expectedRevision is stale. */
export interface HomeLayoutUpdateInput {
  expectedRevision: number;
  mutationId: string;
  app: readonly HomeWidgetSlot[];
  web: readonly HomeWidgetSlot[];
  hintDismissedAt?: string;
}
