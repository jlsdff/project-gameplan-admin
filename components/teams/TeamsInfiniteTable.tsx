"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import algoliaClient from "@/lib/algolia/algolia";
import { deleteTeam, getTeamsPage } from "@/lib/teams/crud";
import { Team } from "@/types/models";

type TeamRow = Team & { id: string };
type AlgoliaTeamHit = {
  objectID: string;
  id?: string;
  teamName?: string;
  teamAbbr?: string;
  teamLogo?: string;
  wins?: string | number;
  losses?: string | number;
  players?: string[];
};

const ALGOLIA_TEAMS_INDEX = "teams";

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export default function TeamsInfiniteTable() {
  const PAGE_SIZE = 20;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["teams", PAGE_SIZE],
    queryFn: ({ pageParam }) =>
      getTeamsPage(
        PAGE_SIZE,
        pageParam as QueryDocumentSnapshot<DocumentData> | null,
      ),
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.lastVisible : undefined,
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const {
    data: algoliaHits,
    error: algoliaError,
    isFetching: isSearchingAlgolia,
  } = useQuery({
    queryKey: ["teams", "algolia", debouncedSearchTerm],
    enabled: Boolean(ALGOLIA_TEAMS_INDEX) && debouncedSearchTerm.length > 0,
    queryFn: async () => {
      const response = await algoliaClient.searchForHits<AlgoliaTeamHit>({
        requests: [
          {
            indexName: ALGOLIA_TEAMS_INDEX,
            query: debouncedSearchTerm,
            hitsPerPage: 50,
          },
        ],
      });

      return response.results[0]?.hits ?? [];
    },
  });

  const isSearching = debouncedSearchTerm.length > 0;

  const searchedTeams = useMemo<TeamRow[]>(() => {
    if (!algoliaHits) {
      return [];
    }

    return algoliaHits.map((hit) => ({
      id: hit.id ?? hit.objectID,
      teamName: hit.teamName ?? "",
      teamAbbr: hit.teamAbbr ?? "",
      teamLogo: hit.teamLogo ?? "",
      wins: toNumber(hit.wins),
      losses: toNumber(hit.losses),
      players: Array.isArray(hit.players) ? hit.players : [],
    }));
  }, [algoliaHits]);

  const teams = useMemo(
    () => (isSearching ? searchedTeams : data?.pages.flatMap((page) => page.teams) ?? []),
    [data, isSearching, searchedTeams],
  );

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => deleteTeam(teamId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team deleted.");
    },
    onError: (mutationError) => {
      const message =
        typeof mutationError === "object" && mutationError !== null && "message" in mutationError
          ? String((mutationError as { message?: string }).message)
          : "";

      toast.error(
        message.toLowerCase().includes("permission")
          ? "You do not have permission to delete teams."
          : "Unable to delete team right now. Please try again.",
      );
    },
  });

  const columns = useMemo<ColumnDef<TeamRow>[]>(
    () => [
      {
        accessorKey: "teamName",
        header: "Team Name",
        cell: ({ row }) => row.original.teamName,
      },
      {
        accessorKey: "teamAbbr",
        header: "Abbreviation",
        cell: ({ row }) => row.original.teamAbbr || "-",
      },
      {
        accessorKey: "wins",
        header: "Wins",
        cell: ({ row }) => row.original.wins,
      },
      {
        accessorKey: "losses",
        header: "Losses",
        cell: ({ row }) => row.original.losses,
      },
      {
        id: "playersCount",
        header: "Players",
        cell: ({ row }) => row.original.players?.length ?? 0,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/teams/new?teamId=${row.original.id}`}>
                <PencilLine className="size-4" />
                Edit
              </Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleteTeamMutation.isPending}
              onClick={() => {
                const confirmed = window.confirm(
                  `Delete ${row.original.teamName}? This action cannot be undone.`,
                );

                if (!confirmed) {
                  return;
                }

                void deleteTeamMutation.mutateAsync(row.original.id);
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [deleteTeamMutation.isPending, deleteTeamMutation],
  );

  const table = useReactTable({
    data: teams,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  useEffect(() => {
    if (isSearching) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isSearching]);

  if (isLoading) {
    return (
      <div className="flex min-h-75 items-center justify-center gap-2 text-slate-600">
        <Spinner className="size-5" />
        <span>Loading teams...</span>
      </div>
    );
  }

  if (error && !isSearching) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load teams.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search teams"
          className="max-w-sm"
        />
        {!ALGOLIA_TEAMS_INDEX && (
          <p className="text-xs text-amber-700">
            Set NEXT_PUBLIC_ALGOLIA_TEAMS_INDEX to enable search.
          </p>
        )}
        {isSearching && isSearchingAlgolia && (
          <p className="inline-flex items-center gap-2 text-xs text-slate-600">
            <Spinner className="size-3" />
            Searching...
          </p>
        )}
        {isSearching && algoliaError && (
          <p className="text-xs text-red-700">Algolia search failed. Please try again.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No teams found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div
        ref={loadMoreRef}
        className="flex min-h-10 items-center justify-center text-sm text-slate-600"
      >
        {!isSearching && isFetchingNextPage && (
          <span className="inline-flex items-center gap-2">
            <Spinner className="size-4" />
            Loading more...
          </span>
        )}
        {!isSearching && !hasNextPage && teams.length > 0 && <span>End of teams list.</span>}
        {!isSearching && !isFetchingNextPage && hasNextPage && isFetching && <span>Updating...</span>}
        {isSearching && !isSearchingAlgolia && !algoliaError && (
          <span>{teams.length} result(s) found.</span>
        )}
      </div>
    </div>
  );
}