import assert from "node:assert/strict";
import test from "node:test";

import {
  ORBIT_API_ENDPOINTS,
  reminderPath,
  remindersPath,
  taskActivitiesPath,
  taskPath,
  taskSuggestionAcceptPath,
  taskSuggestionDismissPath,
  taskSuggestionSnoozePath,
  taskSuggestionsPath,
  tasksPath,
  todayPath,
} from "../src/api/endpoints";

test("task endpoints encode ids and filters for Today and task management", () => {
  assert.equal(ORBIT_API_ENDPOINTS.today, "/api/today");
  assert.equal(ORBIT_API_ENDPOINTS.taskSuggestions, "/api/task-suggestions");
  assert.equal(ORBIT_API_ENDPOINTS.devicePushToken, "/api/devices/push-token");
  assert.equal(ORBIT_API_ENDPOINTS.notificationPreferences, "/api/notification-preferences");
  assert.equal(ORBIT_API_ENDPOINTS.scheduleItems, "/api/schedule-items");
  assert.equal(todayPath("Asia/Tokyo"), "/api/today?timeZone=Asia%2FTokyo");
  assert.equal(tasksPath("completed"), "/api/tasks?status=completed");
  assert.equal(taskPath("task:one/two"), "/api/tasks/task%3Aone%2Ftwo");
  assert.equal(remindersPath("task", "task:one/two"), "/api/reminders?targetType=task&targetId=task%3Aone%2Ftwo");
  assert.equal(reminderPath("reminder:one/two"), "/api/reminders/reminder%3Aone%2Ftwo");
  assert.equal(
    taskActivitiesPath("task:one/two"),
    "/api/tasks/task%3Aone%2Ftwo/activities",
  );
  assert.equal(
    taskSuggestionsPath("relationship"),
    "/api/task-suggestions?category=relationship",
  );
  assert.equal(
    taskSuggestionAcceptPath("suggestion:one/two"),
    "/api/task-suggestions/suggestion%3Aone%2Ftwo/accept",
  );
  assert.equal(
    taskSuggestionDismissPath("suggestion:one/two"),
    "/api/task-suggestions/suggestion%3Aone%2Ftwo/dismiss",
  );
  assert.equal(
    taskSuggestionSnoozePath("suggestion:one/two"),
    "/api/task-suggestions/suggestion%3Aone%2Ftwo/snooze",
  );
});
