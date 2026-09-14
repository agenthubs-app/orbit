import { Redirect, type Href, useLocalSearchParams } from "expo-router";
import { taskListHref } from "../../view-models/task-list-scope";

// app/followups retains its existing private wrapper before this compatibility hop.
export function FollowupsScreen() {
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  return <Redirect href={taskListHref({ scope: "relationship", view: params.view }) as Href} />;
}
