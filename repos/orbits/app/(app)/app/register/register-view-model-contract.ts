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
  event: {
    code: string;
    name: string;
    theme: string;
  };
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
