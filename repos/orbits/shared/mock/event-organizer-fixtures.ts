/**
 * 本地 mock 运行时的主办方投影。
 *
 * 这里不伪造 auth_users；credentials 账号由 live/demo seed 创建。
 * mock 只保留同一套稳定的主办方、Account、Profile 和 Event owner 关系，
 * 这样本地关系图不会把“主办方”降级成一段孤立的展示字符串。
 */

export interface MockEventOrganizerAccountFixture {
  readonly accountId: string;
  readonly contactId: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly key: string;
  readonly organizerId: string;
  readonly organization: string;
  readonly role: string;
}

export const MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES = [
  {
    accountId: "account_orbit_generated",
    contactId: null,
    displayName: "agenthubs",
    email: "agenthubs.app@gmail.com",
    key: "xiaoyu",
    organizerId: "organizer_orbit_xiaoyu",
    organization: "Orbit",
    role: "Orbit operator",
  },
  {
    accountId: "account_orbit_organizer_yuhang_wei",
    contactId: "contact_090",
    displayName: "魏宇航",
    email: "yuhang-wei@organizers.orbit.example.test",
    key: "yuhang-wei",
    organizerId: "organizer_orbit_yuhang_wei",
    organization: "Nanshan Community",
    role: "Community Organizer",
  },
  {
    accountId: "account_orbit_organizer_kaori_ito",
    contactId: "contact_005",
    displayName: "伊藤香織",
    email: "kaori-ito@organizers.orbit.example.test",
    key: "kaori-ito",
    organizerId: "organizer_orbit_kaori_ito",
    organization: "Yokohama Foods",
    role: "Marketing Lead",
  },
  {
    accountId: "account_orbit_organizer_tomoko_takahashi",
    contactId: "contact_003",
    displayName: "高橋智子",
    email: "tomoko-takahashi@organizers.orbit.example.test",
    key: "tomoko-takahashi",
    organizerId: "organizer_orbit_tomoko_takahashi",
    organization: "Aoba Foods",
    role: "Investor Partner",
  },
  {
    accountId: "account_orbit_organizer_zimo_yuan",
    contactId: "contact_085",
    displayName: "袁子墨",
    email: "zimo-yuan@organizers.orbit.example.test",
    key: "zimo-yuan",
    organizerId: "organizer_orbit_zimo_yuan",
    organization: "Cedar Community",
    role: "Marketing Lead",
  },
  {
    accountId: "account_orbit_organizer_aya_yoshida",
    contactId: "contact_066",
    displayName: "吉田彩",
    email: "aya-yoshida@organizers.orbit.example.test",
    key: "aya-yoshida",
    organizerId: "organizer_orbit_aya_yoshida",
    organization: "Morning Light Capital",
    role: "Community Organizer",
  },
  {
    accountId: "account_orbit_organizer_yusuke_maeda",
    contactId: "contact_027",
    displayName: "前田祐介",
    email: "yusuke-maeda@organizers.orbit.example.test",
    key: "yusuke-maeda",
    organizerId: "organizer_orbit_yusuke_maeda",
    organization: "Umeda Technologies",
    role: "Investor Partner",
  },
  {
    accountId: "account_orbit_organizer_misaki_nakajima",
    contactId: null,
    displayName: "中島美咲",
    email: "misaki-nakajima@organizers.orbit.example.test",
    key: "misaki-nakajima",
    organizerId: "organizer_orbit_misaki_nakajima",
    organization: "Tokyo FinTech Network",
    role: "Community Lead",
  },
  {
    accountId: "account_orbit_organizer_rena_morikawa",
    contactId: null,
    displayName: "森川玲奈",
    email: "rena-morikawa@organizers.orbit.example.test",
    key: "rena-morikawa",
    organizerId: "organizer_orbit_rena_morikawa",
    organization: "Tokyo Fashion Council",
    role: "Program Lead",
  },
  {
    accountId: "account_orbit_organizer_daniel_kim",
    contactId: null,
    displayName: "Daniel Kim",
    email: "daniel-kim@organizers.orbit.example.test",
    key: "daniel-kim",
    organizerId: "organizer_orbit_daniel_kim",
    organization: "Climate Founders Japan",
    role: "Community Director",
  },
  {
    accountId: "account_orbit_organizer_takuma_ishii",
    contactId: null,
    displayName: "石井拓真",
    email: "takuma-ishii@organizers.orbit.example.test",
    key: "takuma-ishii",
    organizerId: "organizer_orbit_takuma_ishii",
    organization: "Infra Operators Guild",
    role: "Operations Lead",
  },
  {
    accountId: "account_orbit_organizer_jianing_chen",
    contactId: null,
    displayName: "陈嘉宁",
    email: "jianing-chen@organizers.orbit.example.test",
    key: "jianing-chen",
    organizerId: "organizer_orbit_jianing_chen",
    organization: "East Asia Venture Circle",
    role: "Investor and Community Organizer",
  },
  {
    accountId: "account_orbit_organizer_naoki_yamamoto",
    contactId: null,
    displayName: "山本直樹",
    email: "naoki-yamamoto@organizers.orbit.example.test",
    key: "naoki-yamamoto",
    organizerId: "organizer_orbit_naoki_yamamoto",
    organization: "Kansai Global Business Association",
    role: "Program Lead",
  },
  {
    accountId: "account_orbit_organizer_yuchen_zhou",
    contactId: null,
    displayName: "周雨晨",
    email: "yuchen-zhou@organizers.orbit.example.test",
    key: "yuchen-zhou",
    organizerId: "organizer_orbit_yuchen_zhou",
    organization: "Japan-China Innovation Network",
    role: "Community Lead",
  },
] as const satisfies readonly MockEventOrganizerAccountFixture[];

export const MOCK_EVENT_ORGANIZER_ASSIGNMENTS = [
  { eventId: "event_01", organizerKey: "yuhang-wei" },
  { eventId: "event_02", organizerKey: "xiaoyu" },
  { eventId: "event_03", organizerKey: "kaori-ito" },
  { eventId: "event_04", organizerKey: "tomoko-takahashi" },
  { eventId: "event_05", organizerKey: "zimo-yuan" },
  { eventId: "event_06", organizerKey: "aya-yoshida" },
  { eventId: "event_07", organizerKey: "misaki-nakajima" },
  { eventId: "event_08", organizerKey: "xiaoyu" },
  { eventId: "event_09", organizerKey: "yusuke-maeda" },
  { eventId: "event_10", organizerKey: "rena-morikawa" },
  { eventId: "event_signup_01", organizerKey: "naoki-yamamoto" },
  { eventId: "event_signup_02", organizerKey: "xiaoyu" },
  { eventId: "event_signup_03", organizerKey: "yuchen-zhou" },
] as const;

export function validateMockEventOrganizerFixtures(): readonly string[] {
  const errors: string[] = [];
  const accounts = MOCK_EVENT_ORGANIZER_ACCOUNT_FIXTURES;
  const assignments = MOCK_EVENT_ORGANIZER_ASSIGNMENTS;
  const accountKeys = new Set(accounts.map((account) => account.key));

  if (accounts.length !== 14) errors.push("expected 14 mock organizer identities");
  if (new Set(accounts.map((account) => account.accountId)).size !== accounts.length) {
    errors.push("mock organizer account IDs must be unique");
  }
  if (new Set(accounts.map((account) => account.organizerId)).size !== accounts.length) {
    errors.push("mock organizer IDs must be unique");
  }
  if (new Set(assignments.map((assignment) => assignment.eventId)).size !== assignments.length) {
    errors.push("mock event organizer assignments must be unique");
  }
  if (assignments.some((assignment) => !accountKeys.has(assignment.organizerKey))) {
    errors.push("mock event organizer assignments must reference an identity");
  }
  if (accounts.filter((account) => account.contactId !== null).length !== 6) {
    errors.push("expected six mock organizer identities linked to contacts");
  }
  if (accounts.filter((account) => account.contactId === null).length !== 8) {
    errors.push("expected eight mock organizer identities without a contact link");
  }

  return Object.freeze(errors);
}
