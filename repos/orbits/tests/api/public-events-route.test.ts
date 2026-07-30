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
  assert.equal(body.data?.organizer?.name, "Orbit");
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

test("public event detail route exposes one catalogue event without an actor", async () => {
  const { GET } = await import("../../app/api/events/public/[id]/route");
  const response = await GET(new Request("http://localhost/api/events/public/event_signup_02"), {
    params: Promise.resolve({ id: "event_signup_02" }),
  });
  const body = (await response.json()) as {
    data?: { event?: { id?: string; title?: string } };
    success?: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.event?.id, "event_signup_02");
  assert.ok(body.data?.event?.title);
});

test("public event detail route rejects an unknown catalogue id", async () => {
  const { GET } = await import("../../app/api/events/public/[id]/route");
  const response = await GET(new Request("http://localhost/api/events/public/missing"), {
    params: Promise.resolve({ id: "missing" }),
  });
  const body = (await response.json()) as {
    error?: { code?: string };
    success?: boolean;
  };

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "NOT_FOUND");
});
