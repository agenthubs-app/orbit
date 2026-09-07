import { EventExperienceEditor } from "./event-experience-editor";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";

export const dynamic = "force-dynamic";

export default async function AppEventExperiencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const eventId = decodeURIComponent(id);
  return <><OrbitReferenceStyles /><EventExperienceEditor eventId={eventId} /></>;
}
