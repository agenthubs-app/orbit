import { getOrbitEventDetailViewModel } from "./orbit-landing-route-view-model";
import { getOrbitProfileViewModel } from "./orbit-profile-route-view-model";
import {
  orbitRegisterEmptyProfile,
  type OrbitRegisterProfileForm,
  type OrbitRegisterViewModel,
} from "./register/register-view-model-contract";

export { orbitRegisterEmptyProfile };
export type { OrbitRegisterProfileForm, OrbitRegisterViewModel };

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
