import type { OrbitPartyPersonView } from "../../app/(app)/app/orbit-party-route-view-model";

/** Task 5 弹窗测试共用夹具（与 app-event-live-0918 同一人物形状）。 */
export const MODAL_EVENT_ID = "10000000-0000-4000-8000-000000000001";
export const MODAL_NOW = "2026-09-22T10:00:00.000Z";
export const MODAL_ME = { initial: "L", name: "Li Wei", role: "Investor · Orbit Capital" };
export const DESIGN_MODAL_MOCKS = /山本健|Sakana AI|attEmail|linkedin|LinkedIn|8月10|Alice|alice@orbit\.app|alice_orbit|微信|公司官网|在线|对方愿意被联系|1–2 天内回复|打招呼|寻找合作机会|了解行业趋势|点击录音|最长 3 分钟|后续提醒/u;

export function modalPerson(overrides: Partial<OrbitPartyPersonView> = {}): OrbitPartyPersonView {
  return {
    company: "LoopMatter",
    contactId: null,
    contactRequestDirection: null,
    contactRequestId: null,
    contactRequestRevision: null,
    contactRequestStatus: "none",
    g: "g-indigo",
    groupNumber: 2,
    icebreakers: [],
    id: "participant:aiko",
    industry: "Circular economy",
    initial: "A",
    isRecommended: true,
    memberHint: null,
    name: "Aiko Mori",
    noMatchReason: null,
    offering: "Packaging reuse pilot data\nJapan retail introductions",
    reason: "Her enterprise pilots complement your manufacturing network.",
    score: 91,
    seat: "T2-S3",
    seeking: "Manufacturing buyers",
    summary: "Founder · LoopMatter · Scaling reusable packaging in Japan.",
    title: "Founder",
    topics: ["Reuse systems", "Enterprise procurement"],
    ...overrides,
  };
}

export const t = (copy: { en: string; zh: string }) => copy.zh;

/** 去掉 <style>（EVENTS_STYLES 的 CSS 注释含设计词），只断言页面标记。 */
export function stripStyles(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/gu, "");
}

export function jsonHeaders(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}
