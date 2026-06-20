import LiveEditor from "@/components/live/live-editor";


export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <LiveEditor id={id} />
}