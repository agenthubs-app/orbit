import { z } from "zod";

const count = z.number().int().nonnegative().safe();

export const contactIntroSummaryCandidateSchema = z.object({
  displayName: z.string().min(1).max(256),
  hasReferralPath: z.boolean(),
  id: z.string().min(1).max(1024),
  organization: z.string().max(256),
  role: z.string().max(256),
  sourceLabel: z.enum(["朋友介绍", "二维码记录", "关系证据", "联系人记录"]),
  strengthScore: z.number().finite(),
}).strict();

export const contactIntrosSummarySchema = z.object({
  candidates: z.array(contactIntroSummaryCandidateSchema).max(5),
  referralCandidateCount: count,
  totalContacts: count,
}).strict().superRefine((value, context) => {
  if (value.referralCandidateCount > value.totalContacts || value.candidates.length > value.referralCandidateCount) {
    context.addIssue({ code: "custom", message: "Contact introduction counts are inconsistent." });
  }
  const ids = value.candidates.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Contact introduction candidates must be unique." });
  }
});
