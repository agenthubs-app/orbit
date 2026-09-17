import type { RepairSource } from "../../../features/events/registration/phoneweb-registration-window-repair";

export const repairFixture: RepairSource = {
  database: "orbit_phoneweb_20260916", workspaceId: "workspace:phoneweb-demo",
  events: [
    ...Array.from({ length: 10 }, (_, index) => ({
      event_id: `event_${String(index + 1).padStart(2, "0")}`,
      starts_at: `2026-10-${index === 5 ? "16" : String(17 + index % 6)}T01:00:00.000Z`,
      ends_at: `2026-10-${index === 5 ? "16" : String(17 + index % 6)}T03:00:00.000Z`,
    })),
    { event_id: "event_signup_01", starts_at: "2026-10-25T01:00:00.000Z", ends_at: "2026-10-25T03:00:00.000Z" },
    { event_id: "event_signup_02", starts_at: "2026-10-26T05:00:00.000Z", ends_at: "2026-10-26T07:00:00.000Z" },
    { event_id: "event_signup_03", starts_at: "2026-10-27T09:00:00.000Z", ends_at: "2026-10-27T11:00:00.000Z" },
  ].map((event) => ({ ...event, workspace_id: "workspace:phoneweb-demo", organizer_actor_id: event.event_id === "event_signup_01" ? "user_mu3lykrb_sv4h84" : "user_orbit_primary_qa", event_version: "2", registration_migration_state: "canonical", lifecycle_v2: "published" })),
  configurations: [{
    workspace_id: "workspace:phoneweb-demo", event_id: "event_signup_01", configuration_version: "1",
    check_in_opens_at: "2026-08-18T00:00:00.000Z", event_starts_at: "2026-08-18T01:00:00.000Z", event_ends_at: "2026-08-18T03:00:00.000Z",
    profile_edit_deadline_at: "2026-08-18T00:50:00.000Z", registration_cutoff_at: "2026-08-18T00:55:00.000Z",
    results_available_at: "2026-08-18T01:00:00.000Z", round_one_starts_at: "2026-08-18T01:15:00.000Z", round_two_starts_at: "2026-08-18T02:00:00.000Z",
    recommendation_count: 4, table_size: 6, shard_size: 6, max_attempts_per_task: 3,
    created_at: "2026-09-16T04:36:26.270Z", updated_at: "2026-09-16T04:36:26.270Z",
  }],
  heads: [{ workspace_id: "workspace:phoneweb-demo", event_id: "event_signup_01", configuration_version: "1", revision: "1", updated_at: "2026-09-16T04:36:26.270Z" }],
  policies: [], maxVersions: [{ event_id: "event_signup_01", version: "1" }],
};
