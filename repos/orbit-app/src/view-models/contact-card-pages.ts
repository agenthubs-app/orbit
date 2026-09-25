import type { ContactCardDTO, ContactCardSummaryDTO } from "../api/contract/contact-card-page";
import type { OrbitLanguage } from "../api/contract/language";
import {
  contactsToSummaries, contactDimensionFilterOptions, contactSearchFilterSections,
  type ContactDimensionFilterSelection, type ContactSearchFilterSelection,
} from "./contacts";

/** Adapt a compact API projection into the existing render-only view model.
 * No local search/filter over an incomplete page and no invented global totals.
 */
export function contactCardViews(items: readonly ContactCardDTO[], language: OrbitLanguage) {
  return contactsToSummaries({ contacts: items.map(card => ({
    id: card.id, displayName: card.displayName, organization: card.organization, role: card.role,
    status: card.status, nextAction: card.nextActionPreview,
    ...(card.pendingInitialization ? { lifecycleInitialization: "pending" } : {}),
    value: { valueTypes: card.valueTypes ?? [] },
  })) }, language);
}

export function contactCardFilters(summary: ContactCardSummaryDTO | null, dimensionSelection: ContactDimensionFilterSelection,
  advancedSelection: ContactSearchFilterSelection, language: OrbitLanguage) {
  const options = (values: Record<string, number> | undefined) => Object.entries(values ?? {}).map(([value, count]) => ({ value, count }));
  const availableFilters = { sources: options(summary?.sources), statuses: options(summary?.statuses), values: options(summary?.values), tags: summary?.tags ?? [] };
  const dimensions = contactDimensionFilterOptions({ availableFilters }, dimensionSelection);
  for (const group of [dimensions.actionState, dimensions.relationshipProgress]) {
    for (const option of group) if (option.value === null) option.count = summary?.total ?? 0;
  }
  return { dimensions, advanced: contactSearchFilterSections({ availableFilters }, advancedSelection, language), hasMoreTags: summary?.hasMoreTags ?? false };
}
