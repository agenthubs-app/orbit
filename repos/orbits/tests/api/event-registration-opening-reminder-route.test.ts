import assert from "node:assert/strict";
import test from "node:test";

import { createEventRegistrationOpeningReminderHandlers } from "../../app/api/events/[id]/registration-opening-reminder/handler";
import { createEventRegistrationOpeningReminderService } from "../../features/events/registration/opening-reminder-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const context = { params: Promise.resolve({ id: "event:route-reminder" }) };

test("opening-reminder route requires an actor and only subscribes indeterminate windows", async () => {
  const anonymous = createEventRegistrationOpeningReminderHandlers({
    reminders: null,
    resolveActor: async () => null,
  });
  assert.equal((await anonymous.GET(new Request("http://localhost/api"), context)).status, 401);

  const service = createEventRegistrationOpeningReminderService({
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:route-reminder",
  });
  const request = () => new Request("http://localhost/api", {
    body: JSON.stringify({ eventTitle: "AI 商务对接会" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const closed = createEventRegistrationOpeningReminderHandlers({
    readAvailability: async () => "registration_closed",
    reminders: service,
    resolveActor: async () => ({ id: "account:route-reminder" }),
  });
  assert.equal((await closed.POST(request(), context)).status, 409);

  const unavailable = createEventRegistrationOpeningReminderHandlers({
    readAvailability: async () => "unavailable",
    reminders: service,
    resolveActor: async () => ({ id: "account:route-reminder" }),
  });
  const subscribedResponse = await unavailable.POST(request(), context);
  assert.equal(subscribedResponse.status, 200);
  const subscribed = await subscribedResponse.json() as {
    data?: { state?: string };
    success?: boolean;
  };
  assert.equal(subscribed.success, true);
  assert.equal(subscribed.data?.state, "subscribed");

  const statusResponse = await unavailable.GET(
    new Request("http://localhost/api"),
    context,
  );
  const status = await statusResponse.json() as {
    data?: { state?: string };
  };
  assert.equal(status.data?.state, "subscribed");
});
