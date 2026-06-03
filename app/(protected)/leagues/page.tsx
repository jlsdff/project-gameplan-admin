"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLeagues } from "@/lib/leagues/crud";
import type { League } from "@/types/models";
import { CalendarDays, Ellipsis, PencilLine, Shield, Users } from "lucide-react";

type LeagueRow = League & { id: string };

function getLeagueTeamCount(league: LeagueRow) {
  const teamsField = (league.participatingTeams ?? league.participatingteams) as unknown;

  if (Array.isArray(teamsField)) {
    return teamsField.length;
  }

  if (teamsField && typeof teamsField === "object") {
    return Object.keys(teamsField as Record<string, unknown>).length;
  }

  return 0;
}

function getFriendlyErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to view leagues.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to load leagues right now. Please try again.";
}

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLeagues = async () => {
      setLoading(true);
      setError(null);

      try {
        const leagueDocs = await getLeagues();

        if (cancelled) {
          return;
        }

        setLeagues(
          leagueDocs.sort((left, right) => {
            return left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title);
          }),
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadLeagues();

    return () => {
      cancelled = true;
    };
  }, []);

  const leagueStats = useMemo(
    () => ({
      total: leagues.length,
      ongoing: leagues.filter((league) => league.status === "Ongoing").length,
      finished: leagues.filter((league) => league.status === "Finished").length,
    }),
    [leagues],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/15 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                <Shield className="size-3.5" />
                Leagues
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">View and edit leagues</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                  Review existing league records and jump into the editor to update details.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/leagues/new">Create League</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/teams" className="text-gray-900">Review Teams</Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total leagues</p>
              <p className="mt-1 text-white">{leagueStats.total}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ongoing</p>
              <p className="mt-1 text-white">{leagueStats.ongoing}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Finished</p>
              <p className="mt-1 text-white">{leagueStats.finished}</p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
            <Spinner className="size-5" />
            <span className="text-sm text-slate-600">Loading leagues...</span>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-lg shadow-slate-900/5">
            <p className="font-medium">Failed to load leagues.</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : leagues.length > 0 ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leagues.map((league) => (
                  <TableRow key={league.id}>
                    <TableCell className="font-medium text-slate-950">
                      <div className="space-y-1">
                        <p>{league.title || "Untitled league"}</p>
                        <p className="text-xs text-slate-500">{league.leagueImage ? "Has cover image" : "No cover image"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <CalendarDays className="size-4 text-slate-500" />
                        {league.startDate || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {league.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{league.venue || "-"}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <Users className="size-4 text-slate-500" />
                        {getLeagueTeamCount(league)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`Open actions for ${league.title || "league"}`}>
                            <Ellipsis className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/leagues/patch/${league.id}`}>
                              <PencilLine className="size-4" />
                              Edit League
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-semibold text-slate-950">No leagues yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create the first league to start managing season records.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button asChild>
                <Link href="/leagues/new">Create League</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
