import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";

export interface OrbitProfileView {
  bio: string;
  company: string;
  email: string;
  fullName: string;
  headline: string;
  industry: string;
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
  intro: string;
  lineId: string;
  offering: string[];
  seeking: string[];
  title: string;
  topics: string[];
  wechatName: string;
}

export interface OrbitProfileViewModel {
  industries: string[];
  offeringTags: string[];
  profile: OrbitProfileView;
  seekingTags: string[];
  topics: string[];
}
