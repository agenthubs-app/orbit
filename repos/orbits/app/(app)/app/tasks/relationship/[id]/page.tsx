import { RelationshipLifecycleEditor } from "./relationship-lifecycle-editor";
export default async function RelationshipLifecyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RelationshipLifecycleEditor connectionId={id} />;
}
