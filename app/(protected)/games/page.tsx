"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { CalendarDays, Gamepad2, PencilLine, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteGame, getGamesPage } from "@/lib/games/crud";
import { getLeagues } from "@/lib/leagues/crud";
import { getTeams } from "@/lib/teams/crud";

type LeagueOption = {
  id: string;
  title: string;
};

type TeamOption = {
  id: string;
  teamName: string;
  teamAbbr: string;
};

const PAGE_SIZE = 20;

function getTimestampValue(value: unknown, kind: "date" | "time") {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();

    if (kind === "date") {
      return date.toISOString().slice(0, 10);
    }

    return date.toTimeString().slice(0, 5);
  }

  return "-";
}

function getFriendlyErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: string }).message)
      : "";

  if (message.toLowerCase().includes("permission")) {
    return "You do not have permission to view games.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network error. Please check your connection and try again.";
  }

  return "Unable to load games right now. Please try again.";
}

export default function GamesPage() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const {
    data,
    error: gamesError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["games", PAGE_SIZE],
    queryFn: ({ pageParam }) =>
      getGamesPage(PAGE_SIZE, pageParam as QueryDocumentSnapshot<DocumentData> | null),
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.lastVisible : undefined),
  });

  useEffect(() => {
    let cancelled = false;

    const loadMetadata = async () => {
      setMetadataError(null);

      try {
        const [leagueDocs, teamDocs] = await Promise.all([getLeagues(), getTeams()]);

        if (cancelled) {
          return;
        }

        setLeagues(
          leagueDocs.map((league) => ({
            id: league.id,
            title: league.title,
          })),
        );
        setTeams(
          teamDocs.map((team) => ({
            id: team.id,
            teamName: team.teamName,
            teamAbbr: team.teamAbbr,
          })),
        );
      } catch (error) {
        if (!cancelled) {
          setMetadataError(getFriendlyErrorMessage(error));
        }
      }
    };

    void loadMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasNextPage) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];

        if (first?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const games = useMemo(
    () => data?.pages.flatMap((page) => page.games) ?? [],
    [data],
  );

  const leagueMap = useMemo(
    () => new Map(leagues.map((league) => [league.id, league.title])),
    [leagues],
  );
  const teamMap = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => deleteGame(gameId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["games", PAGE_SIZE] });
    },
  });

  async function handleDelete(gameId: string) {
    if (!window.confirm("Delete this game and its mirrored records?")) {
      return;
    }

    setDeletingId(gameId);

    try {
      await deleteGameMutation.mutateAsync(gameId);
      toast.success("Game deleted.");
    } catch (deleteError) {
      toast.error(getFriendlyErrorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f8fafc,#e2e8f0_55%,#cbd5e1)] px-4 py-8 md:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-950/15 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
                <Gamepad2 className="size-3.5" />
                Games
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Manage games</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                  Review, edit, create, and delete game records with mirrored team and player stats.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/games/new">Create Game</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/leagues" className="text-gray-900">
                  Review Leagues
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Loaded games</p>
              <p className="mt-1 text-white">{games.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Loaded leagues</p>
              <p className="mt-1 text-white">{leagues.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Loaded teams</p>
              <p className="mt-1 text-white">{teams.length}</p>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
            <Spinner className="size-5" />
            <span className="text-sm text-slate-600">Loading games...</span>
          </div>
        ) : gamesError || metadataError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-lg shadow-slate-900/5">
            <p className="font-medium">Failed to load games.</p>
            <p className="mt-1 text-sm">{metadataError ?? getFriendlyErrorMessage(gamesError)}</p>
          </div>
        ) : games.length > 0 ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>League</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {games.map((game) => {
                  const leagueTitle = leagueMap.get(game.leagueId) ?? game.leagueId;
                  const teamA = teamMap.get(game.teamA?.id ?? "");
                  const teamB = teamMap.get(game.teamB?.id ?? "");

                  return (
                    <TableRow key={game.id}>
                      <TableCell className="font-medium text-slate-950">
                        <div className="space-y-1">
                          <p>{game.doc || game.id}</p>
                          <p className="text-xs text-slate-500">Game #{game.number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <CalendarDays className="size-4 text-slate-500" />
                          {getTimestampValue(game.date, "date")}
                          <span className="text-slate-400">{getTimestampValue(game.time, "time")}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{leagueTitle}</TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {teamA?.teamName ?? game.teamA?.id ?? "-"} vs {teamB?.teamName ?? game.teamB?.id ?? "-"}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <Users className="size-4 text-slate-500" />
                          {Array.isArray(game.players) ? game.players.length : 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-xs" aria-label={`Open actions for ${game.doc || game.id}`}>
                              <PencilLine className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/games/patch/${game.id}`}>
                                <PencilLine className="size-4" />
                                Edit Game
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => void handleDelete(game.id)}
                              disabled={deletingId === game.id || deleteGameMutation.isPending}
                            >
                              <Trash2 className="size-4" />
                              {deletingId === game.id || deleteGameMutation.isPending ? "Deleting..." : "Delete Game"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div
              ref={loadMoreRef}
              className="flex min-h-12 items-center justify-center border-t border-slate-100 text-sm text-slate-600"
            >
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" />
                  Loading more...
                </span>
              ) : hasNextPage ? (
                <span>Scroll to load more games.</span>
              ) : (
                <span>End of games list.</span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-lg shadow-slate-900/5">
            <h2 className="text-xl font-semibold text-slate-950">No games yet</h2>
            <p className="mt-2 text-sm text-slate-600">Create the first game to start recording stats.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button asChild>
                <Link href="/games/new">Create Game</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
