import { LegacyTaskRedirect } from "../../components/LegacyTaskRedirect";

// app/followups retains its existing private wrapper before this compatibility hop.
// R05: the old follow-up list is the Task page's To-do segment, relationship scope
// (keeps `view`); a push from an old screen puts Task at the bottom of the stack.
export function FollowupsScreen() {
  return <LegacyTaskRedirect />;
}
