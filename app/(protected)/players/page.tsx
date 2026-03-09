import PlayersInfiniteTable from "@/components/players/PlayersInfiniteTable";

export default function PlayersPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-6xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Players</h1>
          <p className="text-sm text-slate-600">
            Browse players.
          </p>
        </header>
        <PlayersInfiniteTable />
      </section>
    </main>
  );
}
