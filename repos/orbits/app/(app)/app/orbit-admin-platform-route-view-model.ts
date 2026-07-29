export interface OrbitAdminEventView {
  cap: number;
  checkedin: number;
  code: string;
  endsAt: string;
  g: string;
  id: string;
  matched: number;
  name: string;
  phase: number;
  registered: number;
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

export interface OrbitAdminFeedView {
  company: string;
  g: string;
  id: string;
  initial: string;
  kind: string;
  name: string;
  t: string;
  title: string;
}

export interface OrbitAdminViewModel {
  adminEvents: OrbitAdminEventView[];
  adminFeed: OrbitAdminFeedView[];
  adminFunnel: Array<[string, number, number]>;
  adminMembers: OrbitAdminMemberView[];
  adminOrg: { g: string; initial: string; name: string; owner: string; sub: string };
  adminPhases: string[];
  adminStats: Array<{ delta: string; g: string; icon: string; label: string; value: string }>;
}

export interface OrbitPlatformReviewView {
  desc: string;
  facts: Array<[string, string]>;
  flags: string[];
  g: string;
  id: string;
  letter: string;
  name: string;
  org: string;
  submitted: string;
}

export interface OrbitPlatformAccountView {
  events: number;
  g: string;
  letter: string;
  name: string;
  owner: string;
  status: string;
}

export interface OrbitPlatformViewModel {
  orgAccounts: OrbitPlatformAccountView[];
  platformStats: Array<{ icon: string; label: string; note: string; tone: string; value: string }>;
  reviewQueue: OrbitPlatformReviewView[];
}
