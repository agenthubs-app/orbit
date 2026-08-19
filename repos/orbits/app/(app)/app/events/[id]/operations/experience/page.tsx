import { EventExperienceEditor } from "./event-experience-editor";

export const dynamic = "force-dynamic";

export default async function AppEventExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = decodeURIComponent(id);
  return <EventExperienceEditor eventId={eventId} />;
}
