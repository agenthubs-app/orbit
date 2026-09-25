import type { ContactIntroCandidateView } from "./contact-pipeline";
import { contactsToSummaries } from "./contacts";
import type { ContactIntrosSummaryContract } from "../api/contract/contact-intros-summary";

const NEXT_ACTION = "先确认双方需求，再写一段引荐词。";

export interface ContactIntrosSummaryView {
  candidates: ContactIntroCandidateView[];
  introCandidateCount: number;
  totalContactCount: number;
}

export function contactIntrosSummaryToView(
  summary: ContactIntrosSummaryContract
): ContactIntrosSummaryView {
  const contacts = contactsToSummaries({
    contacts: summary.candidates.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      organization: candidate.organization,
      role: candidate.role,
      value: { valueTypes: candidate.hasReferralPath ? ["referral_path"] : [] },
    })),
  });

  return {
    totalContactCount: summary.totalContacts,
    introCandidateCount: summary.referralCandidateCount,
    candidates: summary.candidates.map((candidate, index) => {
      const contact = contacts[index]!;
      const organization = contact.organization === "Independent" ? "" : contact.organization;
      return {
        contactId: contact.id,
        detail: [organization, contact.role].filter(Boolean).join(" · ") || "关系信息待补充",
        id: contact.id,
        name: contact.name,
        nextAction: NEXT_ACTION,
        reason: candidate.hasReferralPath
          ? "有明确的引荐路径，适合先整理双方需求。"
          : "来自朋友介绍，适合先整理双方需求。",
        sourceLabel: candidate.sourceLabel,
        strengthLabel: `${candidate.strengthScore}分`,
      };
    }),
  };
}
