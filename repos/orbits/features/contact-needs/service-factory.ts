import { resolveFeatureMode, type FeatureMode } from "../../shared/config/feature-mode";
import { createContactsListSearchAndFilterService } from "../contacts/service-factory";
import { createProfileService } from "../profile/service-factory";
import { createContactNeedsService, type ContactNeedsService } from "./service";

export function createConfiguredContactNeedsService(
  mode: FeatureMode = resolveFeatureMode(),
): ContactNeedsService {
  const profile = createProfileService(mode);
  const contacts = createContactsListSearchAndFilterService(mode);
  return createContactNeedsService({
    loadProfile: (actorId) => profile.getProfile({ actorId }),
    loadContacts: (actorId) => contacts.listContacts({ actorId }),
  });
}
