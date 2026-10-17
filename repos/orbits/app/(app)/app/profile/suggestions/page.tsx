import type { AccountDesignSuggestion } from "../../../../../shared/mock/demo-world/account";
import { SuggestionsPage } from "../../orbit-2026/account/SuggestionsPage";

type SearchParams = { design?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export const dynamic = "force-dynamic";

export default async function AppProfileSuggestionsPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const value = process.env.NODE_ENV !== "production" ? first((await searchParams)?.design) : undefined;
  let designCards: AccountDesignSuggestion[] | undefined;
  let sampleExample: AccountDesignSuggestion | undefined;
  if (value === "empty" || value === "few" || value === "many") {
    const { demoAccountSuggestions } = await import("../../../../../shared/mock/demo-world/account");
    designCards = value === "empty" ? [] : value === "few" ? demoAccountSuggestions.slice(0, 2) : demoAccountSuggestions;
    if (value === "empty") sampleExample = demoAccountSuggestions[0];
  }
  return <SuggestionsPage designCards={designCards} sampleExample={sampleExample} />;
}
