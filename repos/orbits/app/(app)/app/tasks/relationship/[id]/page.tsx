import { RelationshipLifecycleEditor } from "./relationship-lifecycle-editor";
export default async function RelationshipLifecyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let connectionId = id;
  try { connectionId = decodeURIComponent(id); } catch { /* Preserve invalid input for the API's controlled rejection. */ }
  return <RelationshipLifecycleEditor connectionId={connectionId} />;
}
