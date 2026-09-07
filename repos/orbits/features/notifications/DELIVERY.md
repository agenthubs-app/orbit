# Durable proactive notification delivery

`AgentSignal` remains the source lifecycle (`new`, `snoozed`, `dismissed`,
`resolved`). `notificationDeliveries` is only the delivery ledger. Completion
still belongs to the task/action domain; a read or push receipt does not resolve
the source signal.

The scheduler materializes one delivery intent per actor, active device, signal
revision, phase, and channel. The deterministic delivery id includes the device
id, so repeated scheduler ticks are idempotent and revoking one installation
does not affect another. Production scheduler calls do not invoke the Expo adapter;
`npm run notification:worker` claims due rows with a database lease and sends
them through the adapter.

Push data contains only the opaque `deliveryId`. Signal identity, phase, event
metadata, and target details stay behind the authenticated delivery endpoint;
the mobile client opens `/inbox?deliveryId=...` and fetches the server record
after unlock. Lock-screen content is intentionally a generic privacy-safe
summary, and opening a notification never marks its source completed.

Push device tokens are encrypted at rest with AES-256-GCM. A configured
database requires the dedicated `ORBIT_PUSH_TOKEN_KEY` (base64-encoded
32-byte key); records store only ciphertext, IV, authentication tag, and a
SHA-256 `tokenHash`. The worker decrypts only in memory immediately before a
provider call and never logs token or key material.

The production worker enumerates actor ids with an active, granted push
device from the server store, then processes each actor through an isolated
delivery/device/preferences service. No token is returned by enumeration. Set
`ORBIT_EXPO_PUSH_ENDPOINT` and `ORBIT_EXPO_PUSH_ACCESS_TOKEN` before starting
it. The Expo send response is only a provider ticket: the delivery remains
`receipt_pending` until a configured receipt reconciler verifies it. Set
`ORBIT_EXPO_PUSH_RECEIPT_ENDPOINT` to enable receipt polling; only a verified
`ok` receipt becomes `sent`/`deliveredAt`. `DeviceNotRegistered` receipts revoke
that device and terminal-fail only its delivery. Without a receipt endpoint,
provider tickets remain pending rather than being mislabeled delivered.

Quiet-hours claims are rescheduled to the next quiet-hours end using the
actor's IANA time zone (including DST transitions); they are not terminal
suppression. Invalid preferences fail closed.

A user snooze creates a new delivery revision keyed by the chosen
`snoozedUntil`, so it is not mistaken for a duplicate of the original send.
Immediately before a Signal-owned delivery reaches the provider, the worker
refreshes source truth; acknowledged, dismissed, resolved, or missing signals
are persisted as `source_inactive` suppression. Opening a notification still
does not complete the underlying task.

Post-event reminders are materialized only from the canonical Event Core SQL
intent reader. It joins published event/version rows with an actor-owned
accepted relationship pair and suppresses rows with an attributed encounter,
agent action, or appointment in the explicit action window. The worker applies
the `proactive_reminders` pilot gate (global switch plus exact event allowlist)
before creating a per-device `post_event` delivery. Pair/contact/title details
never enter the push payload.
