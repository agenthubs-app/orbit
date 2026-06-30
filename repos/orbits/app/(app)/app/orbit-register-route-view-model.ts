import { getOrbitEventDetailViewModel, type OrbitLandingEventView } from "./orbit-landing-route-view-model";
import { getOrbitProfileViewModel } from "./orbit-profile-route-view-model";

export interface OrbitRegisterProfileForm {
  bio: string;
  company: string;
  industry: string;
  intro: string;
  level: string;
  lineId: string;
  name: string;
  offering: string[];
  phone: string;
  seeking: string[];
  title: string;
  topics: string[];
  wechatName: string;
}

export interface OrbitRegisterViewModel {
  event: Pick<OrbitLandingEventView, "code" | "name" | "theme">;
  industryOptions: string[];
  levelOptions: string[];
  offeringTags: string[];
  profilePreview: OrbitRegisterProfileForm;
  seekingTags: string[];
  topics: string[];
}

export const orbitRegisterEmptyProfile: OrbitRegisterProfileForm = {
  bio: "",
  company: "",
  industry: "",
  intro: "",
  level: "",
  lineId: "",
  name: "",
  offering: [],
  phone: "",
  seeking: [],
  title: "",
  topics: [],
  wechatName: "",
};

export function getOrbitRegisterViewModel(code = ""): OrbitRegisterViewModel {
  const event = getOrbitEventDetailViewModel(code);
  const profile = getOrbitProfileViewModel();

  return {
    event: {
      code: event.code,
      name: event.name,
      theme: event.theme,
    },
    industryOptions: profile.industries,
    levelOptions: ["Founder / partner", "Executive", "Director / lead", "Manager", "Individual contributor"],
    offeringTags: profile.offeringTags,
    profilePreview: {
      ...orbitRegisterEmptyProfile,
      bio: profile.profile.bio,
      company: profile.profile.company,
      industry: profile.profile.industry,
      intro: profile.profile.intro,
      lineId: profile.profile.lineId,
      name: profile.profile.fullName,
      offering: profile.profile.offering,
      seeking: profile.profile.seeking,
      title: profile.profile.title,
      topics: profile.profile.topics,
      wechatName: profile.profile.wechatName,
    },
    seekingTags: profile.seekingTags,
    topics: profile.topics,
  };
}
