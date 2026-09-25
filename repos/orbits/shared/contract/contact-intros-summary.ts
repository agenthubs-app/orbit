export type ContactIntroSourceLabelContract =
  | "朋友介绍"
  | "二维码记录"
  | "关系证据"
  | "联系人记录";

export interface ContactIntroSummaryCandidateContract {
  displayName: string;
  hasReferralPath: boolean;
  id: string;
  organization: string;
  role: string;
  sourceLabel: ContactIntroSourceLabelContract;
  strengthScore: number;
}

export interface ContactIntrosSummaryContract {
  candidates: readonly ContactIntroSummaryCandidateContract[];
  referralCandidateCount: number;
  totalContacts: number;
}
