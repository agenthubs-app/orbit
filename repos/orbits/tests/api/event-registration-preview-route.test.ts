import assert from "node:assert/strict";
import test from "node:test";

import { createEventRegistrationPreviewHandler } from "../../app/api/events/[id]/registration/preview/handler";
import {
  CLUSTER_PREVIEW_MIN_BUCKET,
  registrationClusterPreview,
} from "../../features/events/registration/cluster-preview";
import type { EventRegistration } from "../../features/events/registration/contract";

const EVENT = "demo-event-1";

function registration(input: {
  id: string;
  industry?: string;
  status?: EventRegistration["status"];
}): EventRegistration {
  return {
    cancelledAt: null,
    eventId: EVENT,
    id: `registration:${input.id}`,
    participantProfile: {
      answers: input.industry ? { industry: input.industry } : {},
      createdAt: "2026-08-01T00:00:00.000Z",
      eventId: EVENT,
      id: `profile:${input.id}`,
      updatedAt: "2026-08-01T00:00:00.000Z",
      userId: `user:${input.id}`,
    },
    participantProfileId: `profile:${input.id}`,
    reactivatedAt: null,
    registeredAt: "2026-08-01T00:00:00.000Z",
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: input.status ?? "rsvped",
    updatedAt: "2026-08-01T00:00:00.000Z",
    userId: `user:${input.id}`,
  };
}

function many(industry: string, count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    registration({ id: `${prefix}-${index}`, industry }),
  );
}

test("cluster preview only publishes buckets at or above the privacy threshold", () => {
  const preview = registrationClusterPreview([
    ...many("互联网", CLUSTER_PREVIEW_MIN_BUCKET, "net"),
    ...many("制造业", CLUSTER_PREVIEW_MIN_BUCKET - 1, "mfg"),
    registration({ id: "no-industry" }),
  ]);

  assert.equal(preview.total, CLUSTER_PREVIEW_MIN_BUCKET * 2);
  assert.deepEqual(preview.buckets, [
    { count: CLUSTER_PREVIEW_MIN_BUCKET, label: "互联网" },
  ]);
});

test("cluster preview falls back to the role segment of positioning", () => {
  const preview = registrationClusterPreview(
    Array.from({ length: CLUSTER_PREVIEW_MIN_BUCKET }, (_, index) => {
      const item = registration({ id: `pos-${index}` });
      return {
        ...item,
        participantProfile: {
          ...item.participantProfile,
          answers: { positioning: "创始人 @ Orbit" },
        },
      };
    }),
  );

  assert.deepEqual(preview.buckets, [
    { count: CLUSTER_PREVIEW_MIN_BUCKET, label: "创始人" },
  ]);
});

test("cluster preview ignores cancelled registrations", () => {
  const preview = registrationClusterPreview([
    registration({ id: "cancelled", industry: "互联网", status: "cancelled" }),
    registration({ id: "active", industry: "互联网" }),
  ]);

  assert.equal(preview.total, 1);
  assert.deepEqual(preview.buckets, []);
});

test("cluster preview floors bucket counts to threshold bands", () => {
  const preview = registrationClusterPreview([
    ...many("互联网", CLUSTER_PREVIEW_MIN_BUCKET * 2 - 1, "net"),
    ...many("制造业", CLUSTER_PREVIEW_MIN_BUCKET + 2, "mfg"),
  ]);

  assert.deepEqual(preview.buckets, [
    { count: CLUSTER_PREVIEW_MIN_BUCKET, label: "互联网" },
    { count: CLUSTER_PREVIEW_MIN_BUCKET, label: "制造业" },
  ]);
});

test("preview route returns aggregate buckets without personal data", async () => {
  const handler = createEventRegistrationPreviewHandler({
    listRegistrations: async () => many("互联网", CLUSTER_PREVIEW_MIN_BUCKET, "net"),
    loadEvent: async () => ({ id: EVENT }) as never,
    resolveAdmissionControlled: async () => false,
  });

  const response = await handler(new Request("http://localhost/api"), {
    params: Promise.resolve({ id: EVENT }),
  });
  const body = (await response.json()) as {
    data: { buckets: readonly unknown[]; total: number };
    success: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.total, CLUSTER_PREVIEW_MIN_BUCKET);
  assert.deepEqual(body.data.buckets, [
    { count: CLUSTER_PREVIEW_MIN_BUCKET, label: "互联网" },
  ]);
  assert.equal(JSON.stringify(body).includes("user:"), false);
});

test("preview route 404s for unknown events", async () => {
  const handler = createEventRegistrationPreviewHandler({
    listRegistrations: async () => [],
    loadEvent: async () => null,
    resolveAdmissionControlled: async () => false,
  });

  const response = await handler(new Request("http://localhost/api"), {
    params: Promise.resolve({ id: "missing" }),
  });

  assert.equal(response.status, 404);
});

test("preview route reports admission control and caches per event", async () => {
  let listCalls = 0;
  let clock = 1_000;
  const handler = createEventRegistrationPreviewHandler({
    listRegistrations: async () => {
      listCalls += 1;
      return many("互联网", CLUSTER_PREVIEW_MIN_BUCKET, "net");
    },
    loadEvent: async () => ({ id: EVENT }) as never,
    now: () => clock,
    resolveAdmissionControlled: async () => true,
  });
  const request = () =>
    handler(new Request("http://localhost/api"), {
      params: Promise.resolve({ id: EVENT }),
    });

  const first = (await (await request()).json()) as {
    data: { admissionControlled: boolean };
  };
  assert.equal(first.data.admissionControlled, true);
  clock += 30_000;
  await request();
  assert.equal(listCalls, 1);
  clock += 31_000;
  await request();
  assert.equal(listCalls, 2);
});
