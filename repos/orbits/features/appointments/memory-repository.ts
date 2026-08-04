import { AppointmentError, type AppointmentAggregate, type AppointmentOutboxEvent } from "./contract";
import type { AppointmentMutationResult, AppointmentRepository } from "./repository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface MemoryAppointmentRepository extends AppointmentRepository {
  outbox(): readonly AppointmentOutboxEvent[];
}

export function createMemoryAppointmentRepository(): MemoryAppointmentRepository {
  const aggregates = new Map<string, AppointmentAggregate>();
  const receipts = new Map<string, { appointmentId: string; command: string; requestHash: string; response: AppointmentAggregate }>();
  const events = new Map<string, AppointmentOutboxEvent>();

  function activeRelationshipKey(appointment: AppointmentAggregate): string | null {
    return appointment.status === "cancelled" || appointment.status === "completed"
      ? null
      : `${appointment.eventId ?? ""}\u0000${appointment.relationshipPairId}`;
  }

  function replay(actorId: string, key: string, command: string, requestHash: string): AppointmentMutationResult | null {
    const receipt = receipts.get(`${actorId}\u0000${key}`);
    if (!receipt) return null;
    if (receipt.command !== command || receipt.requestHash !== requestHash) throw new AppointmentError("APPOINTMENT_CONFLICT", "The idempotency key was already used for a different appointment request.");
    return { appointment: clone(receipt.response), replayed: true };
  }

  return {
    async create({ appointment, command, idempotencyKey, requestHash }) {
      const replayed = replay(appointment.ownerActorId, idempotencyKey, command, requestHash);
      if (replayed) return replayed;
      if (aggregates.has(appointment.appointmentId)) {
        throw new AppointmentError("APPOINTMENT_CONFLICT", "The appointment already exists.");
      }
      const relationshipKey = activeRelationshipKey(appointment);
      const existing = relationshipKey
        ? [...aggregates.values()].find((candidate) => activeRelationshipKey(candidate) === relationshipKey)
        : null;
      if (existing) {
        throw new AppointmentError("APPOINTMENT_CONFLICT", `An active appointment already exists for relationship ${appointment.relationshipPairId}.`);
      }
      aggregates.set(appointment.appointmentId, clone(appointment));
      receipts.set(`${appointment.ownerActorId}\u0000${idempotencyKey}`, { appointmentId: appointment.appointmentId, command, requestHash, response: clone(appointment) });
      return { appointment: clone(appointment), replayed: false };
    },
    async getForActor(appointmentId, actorId) {
      const value = aggregates.get(appointmentId);
      if (!value || (value.ownerActorId !== actorId && value.inviteeActorId !== actorId)) return null;
      return clone(value);
    },
    async listForActor(actorId) {
      return [...aggregates.values()].filter((value) => value.ownerActorId === actorId || value.inviteeActorId === actorId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(clone);
    },
    async mutate(input, operation) {
      const replayed = replay(input.actorId, input.idempotencyKey, input.command, input.requestHash);
      if (replayed) return replayed;
      const current = aggregates.get(input.appointmentId);
      if (!current) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "The appointment does not exist.");
      if (current.ownerActorId !== input.actorId && current.inviteeActorId !== input.actorId) throw new AppointmentError("APPOINTMENT_FORBIDDEN", "The actor is not part of this appointment.");
      if (current.version !== input.expectedVersion) throw new AppointmentError("APPOINTMENT_CONFLICT", `Expected version ${input.expectedVersion}, found ${current.version}.`);
      const value = operation(clone(current));
      if (value.appointment.version !== current.version + 1) throw new Error("Appointment mutations must advance exactly one version.");
      aggregates.set(input.appointmentId, clone(value.appointment));
      for (const event of value.outbox) events.set(event.dedupeKey, clone(event));
      receipts.set(`${input.actorId}\u0000${input.idempotencyKey}`, { appointmentId: input.appointmentId, command: input.command, requestHash: input.requestHash, response: clone(value.appointment) });
      return { appointment: clone(value.appointment), replayed: false };
    },
    outbox() { return [...events.values()].map(clone); },
  };
}
