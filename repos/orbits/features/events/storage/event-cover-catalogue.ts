/**
 * Cover artwork for the seeded event catalogue.
 *
 * This used to be a lookup table inside the App (two copies of it), which meant
 * only the screens that knew about the table could show a cover: the home
 * recommendation feed had no artwork at all. Covers are event data, so the table
 * lives here, the seed writes `coverPath` onto the event record, and every read
 * path serves whatever the record carries.
 *
 * Files are served by this app's own origin from `public/orbit-covers/`.
 */
export const EVENT_COVER_PATHS: Readonly<Record<string, string>> = {
  event_01: "/orbit-covers/restaurant.jpg",
  event_02: "/orbit-covers/events/ai-workflow-poc-roundtable.jpg",
  event_03: "/orbit-covers/events/cross-border-ecommerce-meetup.jpg",
  event_04: "/orbit-covers/events/investor-founder-salon.jpg",
  event_05: "/orbit-covers/events/chinese-business-community-salon.jpg",
  event_06: "/orbit-covers/chip.jpg",
  event_07: "/orbit-covers/finance.jpg",
  event_08: "/orbit-covers/ai.jpg",
  event_09: "/orbit-covers/fashion.jpg",
  event_10: "/orbit-covers/fashion.jpg",
  event_signup_01: "/orbit-covers/events/kansai-business-connect.jpg",
  event_signup_02: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
  event_signup_03: "/orbit-covers/events/investor-founder-salon.jpg",
};

/** A cover path for a seeded event, or null when the event has no artwork yet. */
export function eventCoverPathFor(eventId: string): string | null {
  return EVENT_COVER_PATHS[eventId] ?? null;
}
