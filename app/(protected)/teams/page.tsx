import TeamsInfiniteTable from "@/components/teams/TeamsInfiniteTable";

export default function TeamsPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <section className="mx-auto max-w-6xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Teams</h1>
          <p className="text-sm text-slate-600">Browse teams.</p>
        </header>
        <TeamsInfiniteTable />
      </section>
    </main>
  );
}
