import assert from "node:assert/strict";
import test from "node:test";

test("public events route exposes catalogue events without actor-private records", async () => {
  const { GET } = await import("../../app/api/events/public/route");
  const response = await GET();
  const body = (await response.json()) as {
    data?: {
      events?: Array<{
        code?: string;
        id?: string;
        organizer?: string;
      }>;
      organizer?: {
        name?: string;
      };
    };
    success?: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok((body.data?.events?.length ?? 0) > 0);
  assert.equal(body.data?.organizer?.name, "Orbit 人脉测试空间");
  assert.ok(
    body.data?.events?.some(
      (event) =>
        event.id === "event_signup_02" &&
        event.code === "EVTSIGNUP02" &&
        event.organizer === body.data?.organizer?.name,
    ),
  );
  assert.equal(
    body.data?.events?.some((event) => event.id?.startsWith("event:live-record:")),
    false,
  );
});
