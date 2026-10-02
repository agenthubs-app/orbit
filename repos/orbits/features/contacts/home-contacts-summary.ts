import type { ContactsListSearchFilterInput, ContactsListSearchResult } from "./contract";
import type { ContactsListSearchAndFilterService } from "./service";
import { createContactsListSearchAndFilterService } from "./service-factory";
import { createConfiguredHomeContactsSummaryReader } from "./storage/home-contacts-summary-postgres-reader";
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";

/**
 * W0041: the two contact numbers Home shows. Home used to compose the whole
 * contacts page model (every owned contact, relationship and cited evidence
 * row) only to read `ledger.knownPeople` and the non-archived count.
 */
export interface HomeContactsSummary {
  /** Contacts whose status is not archived (Home's "in progress"). */
  inProgress: number;
  /** The contacts page model's `ledger.knownPeople`. */
  knownPeople: number;
}

/** Mirrors the contacts page model: a structured failure keeps its code and evidence; anything else throws. */
export type HomeContactsSummaryResult =
  | ({ success: true } & HomeContactsSummary)
  | { success: false; error: { code: string; evidenceIds: readonly string[] } };

export interface HomeContactsSummaryService {
  readSummary(actorId?: string | null): Promise<HomeContactsSummaryResult>;
}

/** Throws exactly where the contacts page model's list read throws (invalid versions, ambiguity, SQL). */
export type HomeContactsSummaryReader = (actorId: string) => Promise<HomeContactsSummary>;

/** The contacts page model's list input when there are no search params. */
export function homeContactsListInput(actorId?: string | null): ContactsListSearchFilterInput {
  return {
    query: null,
    sourceFilters: [],
    statusFilters: [],
    tagFilters: [],
    valueFilters: [],
    actorId,
  };
}

export function homeContactsSummaryFromListResult(
  result: ContactsListSearchResult,
): HomeContactsSummaryResult {
  if (result.success === false) {
    return {
      success: false,
      error: { code: result.error.code, evidenceIds: [...(result.error.evidenceIds ?? [])] },
    };
  }
  return {
    success: true,
    inProgress: result.data.contacts.filter((contact) => contact.status !== "archived").length,
    knownPeople: result.data.contacts.length,
  };
}

/** Mock / hybrid: the same list service the page model used; its data never touches a database. */
export function createListHomeContactsSummaryService(
  listService: ContactsListSearchAndFilterService,
): HomeContactsSummaryService {
  return {
    async readSummary(actorId) {
      return homeContactsSummaryFromListResult(
        await listService.listContacts(homeContactsListInput(actorId)),
      );
    },
  };
}

/**
 * Live: one counting statement. The page model's structured failures (no
 * actor, live store not configured) come from the live list service itself,
 * which returns them before any read (its provider and this reader share one
 * database configuration, so both are configured or neither is).
 */
export function createLiveHomeContactsSummaryService(input: {
  listService: ContactsListSearchAndFilterService;
  reader: HomeContactsSummaryReader | null;
}): HomeContactsSummaryService {
  return {
    async readSummary(actorId) {
      const normalizedActorId = actorId?.trim();
      if (!input.reader || !normalizedActorId) {
        return homeContactsSummaryFromListResult(
          await input.listService.listContacts(homeContactsListInput(actorId)),
        );
      }
      return { success: true, ...(await input.reader(normalizedActorId)) };
    },
  };
}

// Same capability id and modes as the app contacts factory the page model
// resolves (`contacts`: live, mock; hybrid falls back to mock), and the list
// service is resolved through the same contacts list factory, so mode
// selection and resolution failures match the page model exactly.
export const homeContactsSummaryServiceFactory =
  createModuleServiceFactory<HomeContactsSummaryService>({
    capabilityId: "contacts",
    implementations: {
      live: ({ requestedMode }) =>
        createLiveHomeContactsSummaryService({
          listService: createContactsListSearchAndFilterService(requestedMode),
          reader: createConfiguredHomeContactsSummaryReader(),
        }),
      mock: ({ requestedMode }) =>
        createListHomeContactsSummaryService(
          createContactsListSearchAndFilterService(requestedMode),
        ),
    },
  });

export function createHomeContactsSummaryService(
  mode?: ModuleMode | string,
): HomeContactsSummaryService {
  const resolution = homeContactsSummaryServiceFactory.create(mode);
  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }
  return resolution.service;
}
