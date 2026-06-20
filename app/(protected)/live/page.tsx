import LiveStatsTable from "@/components/live/live-table";
import { Button } from "@/components/ui/button";
import { Shield, TrendingUp } from "lucide-react";
import Link from "next/link";


export default function LivePage({}) {

    return (

        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">

            <section className="mx-auto max-w-7xl space-y-6">
            <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/15 md:px-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                        <TrendingUp className="size-3.5"/>
                        Live Stats
                    </div>
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">View and edit live stats</h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                        Review existing live stats records and jump into the editor to update details.
                        </p>
                    </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                    <Button asChild>
                        <Link href="/live/new">New Live Stats</Link>
                    </Button>
                    </div>
                </div>
            </header>

            <LiveStatsTable />
            
            </section>


            
        </main>
    )
}