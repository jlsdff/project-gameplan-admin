import GameEditor from "@/components/games/GameEditor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <GameEditor mode="edit" gameId={id} />;
}