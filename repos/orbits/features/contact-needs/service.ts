import type { FeatureMode } from "../../shared/config/feature-mode";
import type { ContactNeedsMatchesPayloadContract } from "../../shared/contract/contact-needs";
import type { ContactsListSearchResult } from "../contacts/contract";
import type { ProfileResult } from "../profile/contract";
import { CONTACT_NEEDS_SCORING_VERSION, scoreContactsForNeed } from "./scoring";

export type ContactNeedsFailureCode = "CONTACT_NEED_CHANGED" | "CONTACT_NEEDS_SOURCE_UNAVAILABLE";
export type ContactNeedsResult =
  | { success: true; data: ContactNeedsMatchesPayloadContract }
  | { success: false; error: { code: ContactNeedsFailureCode } };

export interface ContactNeedsDependencies {
  loadProfile(actorId: string): ProfileResult | Promise<ProfileResult>;
  loadContacts(actorId: string): ContactsListSearchResult | Promise<ContactsListSearchResult>;
  now?: () => string;
}

export interface ContactNeedsService {
  getMatches(input: { actorId: string }): Promise<ContactNeedsResult>;
}

function versionsMatch(left: ProfileResult, right: ProfileResult): boolean {
  if (!left.success || !right.success) return false;
  return left.data.profile?.updatedAt === right.data.profile?.updatedAt
    && left.data.profile?.relationshipGoal === right.data.profile?.relationshipGoal;
}

function payload(input: {
  goal: string;
  goalVersion: string | null;
  contacts: ContactsListSearchResult & { success: true };
  now: string;
}): ContactNeedsMatchesPayloadContract {
  const ranked = scoreContactsForNeed(input.goal, input.contacts.data.contacts);
  const state = !input.goal ? "unconfigured" : ranked.criteria.length === 0 ? "needs_clarification" : "ready";
  return {
    schemaVersion: 1,
    state,
    goal: input.goal,
    goalVersion: input.goalVersion,
    dataVersion: ranked.dataVersion,
    scoringVersion: CONTACT_NEEDS_SCORING_VERSION,
    generatedAt: input.now,
    criteria: ranked.criteria,
    matches: state === "unconfigured" ? [] : ranked.matches,
    provenance: {
      generationMethod: "rule-based-contact-needs-ranking",
      databaseQueryExecuted: input.contacts.data.provenance.databaseQueryExecuted,
      aiProviderRequested: false,
      externalNetworkRequested: false,
      businessDataWritten: false,
    },
  };
}

export function createContactNeedsService(dependencies: ContactNeedsDependencies): ContactNeedsService {
  const now = dependencies.now ?? (() => new Date().toISOString());
  return {
    async getMatches({ actorId }) {
      const firstProfile = await dependencies.loadProfile(actorId);
      if (!firstProfile.success || !firstProfile.data.profile) {
        return { success: false, error: { code: "CONTACT_NEEDS_SOURCE_UNAVAILABLE" } };
      }
      const contacts = await dependencies.loadContacts(actorId);
      if (!contacts.success) {
        return { success: false, error: { code: "CONTACT_NEEDS_SOURCE_UNAVAILABLE" } };
      }
      const secondProfile = await dependencies.loadProfile(actorId);
      if (!versionsMatch(firstProfile, secondProfile)) {
        return { success: false, error: { code: "CONTACT_NEED_CHANGED" } };
      }
      const goal = firstProfile.data.profile.relationshipGoal.trim();
      return {
        success: true,
        data: payload({
          goal,
          goalVersion: firstProfile.data.profile.updatedAt,
          contacts,
          now: now(),
        }),
      };
    },
  };
}

export function contactNeedsFailureStatus(code: ContactNeedsFailureCode): 409 | 503 {
  return code === "CONTACT_NEED_CHANGED" ? 409 : 503;
}

export function contactNeedsFailureMessage(code: ContactNeedsFailureCode): string {
  return code === "CONTACT_NEED_CHANGED"
    ? "Your relationship need changed while matches were being calculated. Refresh and try again."
    : "Contact need matches are temporarily unavailable.";
}

export function contactNeedsFailureAppCode(code: ContactNeedsFailureCode): "CONFLICT" | "SERVICE_UNAVAILABLE" {
  return code === "CONTACT_NEED_CHANGED" ? "CONFLICT" : "SERVICE_UNAVAILABLE";
}

export type ContactNeedsFeatureMode = FeatureMode;
