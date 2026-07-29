export interface OrbitAdminEventView {
  code: string;
  endsAt: string;
  g: string;
  id: string;
  name: string;
  startsAt: string;
  status: string;
  summary: string;
  themeColor: string;
  venue: string;
}

export interface OrbitAdminMemberView {
  email: string;
  g: string;
  initial: string;
  name: string;
  role: string;
}

export interface OrbitAdminViewModel {
  adminEvents: OrbitAdminEventView[];
  adminAccount: OrbitAdminMemberView;
  adminOrg: { g: string; initial: string; name: string; owner: string; sub: string };
  adminStats: Array<{ delta: string; g: string; icon: string; label: string; value: string }>;
}
