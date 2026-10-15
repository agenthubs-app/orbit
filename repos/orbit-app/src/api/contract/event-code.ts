// R27 — 参加コード → event: `GET /api/events/by-code/[code]` (App `/register/〈コード〉`; the Web resolves it on the server page).
// Owner: 甲 (R27). Used by: events (参加コード, App). An unknown code is not an error: `eventId` is null.

export interface EventCodeResolveResponse {
  /** The code as looked up (trimmed, upper-case). */
  code: string;
  eventId: string | null;
  sample?: true;
}
