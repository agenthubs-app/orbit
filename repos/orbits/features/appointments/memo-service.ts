import { AppointmentError } from "./contract";
import type { AppointmentService } from "./service";
import type { HumanEncounterRecord, HumanEncounterService } from "../encounters/service";

export interface AppointmentMemoEntry {
  appointmentId: string;
  completedAt: string;
  contactId: string;
  eventId: string;
  scheduledAt: string;
}

export interface AppointmentMemoService {
  getEntry(input: {
    actorId: string;
    appointmentId: string;
    contactId: string;
    eventId: string;
  }): Promise<AppointmentMemoEntry>;
  capture(input: {
    actorId: string;
    appointmentId: string;
    commitments?: readonly string[] | null;
    contactId: string;
    eventId: string;
    idempotencyKey: string;
    nextStep?: string | null;
    noteText?: string | null;
  }): Promise<HumanEncounterRecord>;
}

function required(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", `${label} is invalid.`);
  }
  return value.trim();
}

async function resolveEntry(
  appointments: Pick<AppointmentService, "get">,
  input: { actorId: string; appointmentId: string; contactId: string; eventId: string },
): Promise<AppointmentMemoEntry> {
  const actorId = required(input.actorId, "Actor");
  const appointmentId = required(input.appointmentId, "Appointment");
  const contactId = required(input.contactId, "Contact");
  const eventId = required(input.eventId, "Event");
  const appointment = await appointments.get({ actorId, appointmentId });
  if (appointment.contactIdsByActor[actorId] !== contactId || appointment.eventId !== eventId) {
    throw new AppointmentError("APPOINTMENT_FORBIDDEN", "This memo target is not the actor's appointment contact and event.");
  }
  if (appointment.status !== "completed" || !appointment.confirmed) {
    throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "A meeting memo can only be recorded after the appointment is completed.");
  }
  const completion = [...appointment.history].reverse().find((entry) => entry.command === "complete");
  const completedAt = completion?.at ?? "";
  const scheduledAt = appointment.confirmed.startsAtUtc;
  const scheduledEnd = Date.parse(scheduledAt) + appointment.confirmed.durationMinutes * 60_000;
  if (!completion || !Number.isFinite(Date.parse(completedAt)) || Date.parse(completedAt) < scheduledEnd) {
    throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "The appointment does not contain a valid persisted completion time.");
  }
  return { appointmentId, completedAt, contactId, eventId, scheduledAt };
}

export function createAppointmentMemoService(input: {
  appointments: Pick<AppointmentService, "get">;
  encounters: Pick<HumanEncounterService, "capture">;
}): AppointmentMemoService {
  return {
    getEntry: (value) => resolveEntry(input.appointments, value),
    async capture(value) {
      const entry = await resolveEntry(input.appointments, value);
      return input.encounters.capture({
        actorId: value.actorId,
        commitments: value.commitments,
        connectionId: null,
        contactId: entry.contactId,
        eventId: entry.eventId,
        idempotencyKey: value.idempotencyKey,
        nextStep: value.nextStep,
        noteText: value.noteText,
        observedAt: entry.completedAt,
        privacy: "private",
        talked: "yes",
        tags: ["appointment-memo"],
        voiceMemoReference: null,
      });
    },
  };
}
