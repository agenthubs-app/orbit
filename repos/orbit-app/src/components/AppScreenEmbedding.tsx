import { createContext, useContext, type ReactNode } from "react";

import type { TaskSegment } from "../view-models/app-navigation";

// R05 Task container: the existing pages placed in a Task segment render through
// AppScreen as page bodies only. The container owns the safe area, the title,
// the segments and the 「＋」, so an embedded AppScreen draws no navigation bar,
// title row, header actions or tab bar — just its scrolling content.
export type AppScreenEmbedding = { segment: TaskSegment };

const EmbeddingContext = createContext<AppScreenEmbedding | null>(null);

export function AppScreenEmbeddingProvider({ segment, children }: { segment: TaskSegment; children: ReactNode }) {
  return <EmbeddingContext.Provider value={{ segment }}>{children}</EmbeddingContext.Provider>;
}

export function useAppScreenEmbedding(): AppScreenEmbedding | null {
  return useContext(EmbeddingContext);
}
