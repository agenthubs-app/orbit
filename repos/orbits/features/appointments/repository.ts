import type { AppointmentAggregate, AppointmentOutboxEvent } from "./contract";

export interface AppointmentMutationInput {
  actorId: string;
  appointmentId: string;
  command: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestHash: string;
}

export interface AppointmentMutationResult {
  appointment: AppointmentAggregate;
  replayed: boolean;
}

export interface AppointmentRepository {
  create(input: {
    appointment: AppointmentAggregate;
    command: "create";
    idempotencyKey: string;
    requestHash: string;
  }): Promise<AppointmentMutationResult>;
  getForActor(appointmentId: string, actorId: string): Promise<AppointmentAggregate | null>;
  listForActor(actorId: string): Promise<readonly AppointmentAggregate[]>;
  mutate(
    input: AppointmentMutationInput,
    operation: (current: AppointmentAggregate) => {
      appointment: AppointmentAggregate;
      outbox: readonly AppointmentOutboxEvent[];
    },
  ): Promise<AppointmentMutationResult>;
}
