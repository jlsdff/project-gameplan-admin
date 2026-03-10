"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getPlayersPage, deletePlayer } from "@/lib/players/crud";
import algoliaClient from "@/lib/algolia/algolia";
import { Player } from "@/types/models";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { Ellipsis, PencilLine, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";

type PlayerRow = Player & { id: string };
type AlgoliaPlayerHit = {
  objectID: string;
  id?: string;
  firstname?: string;
  lastname?: string;
  middlename?: string | null;
  number?: string | number | null;
};

const ALGOLIA_PLAYERS_INDEX = "players" ;

export default function PlayersInfiniteTable() {
  const PAGE_SIZE = 20;
  const router = useRouter();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);

  const openPlayerProfile = (playerId: string) => {
    window.open(`https://projectgameplan.ph/players/${playerId}`, "_blank", "noopener,noreferrer");
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["players", PAGE_SIZE],
    queryFn: ({ pageParam }) =>
      getPlayersPage(
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
    queryKey: ["players", "algolia", debouncedSearchTerm],
    enabled: Boolean(ALGOLIA_PLAYERS_INDEX) && debouncedSearchTerm.length > 0,
    queryFn: async () => {
      const response = await algoliaClient.searchForHits<AlgoliaPlayerHit>({
        requests: [
          {
            indexName: ALGOLIA_PLAYERS_INDEX as string,
            query: debouncedSearchTerm,
            hitsPerPage: 50,
          },
        ],
      });

      return response.results[0]?.hits ?? [];
    },
  });

  const deletePlayersMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deletePlayer(id)));
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      setDeleteTargetIds([]);
      setRowSelection({});
      await queryClient.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const isSearching = debouncedSearchTerm.length > 0;

  const searchedPlayers = useMemo<PlayerRow[]>(() => {
    if (!algoliaHits) {
      return [];
    }

    return algoliaHits.map((hit) => ({
      id: hit.id ?? hit.objectID,
      firstname: hit.firstname ?? "",
      lastname: hit.lastname ?? "",
      middlename: hit.middlename ?? null,
      number: typeof hit.number === "string"
        ? hit.number
        : typeof hit.number === "number"
          ? String(hit.number)
          : null,
    }));
  }, [algoliaHits]);

  const players = useMemo(
    () => (isSearching ? searchedPlayers : data?.pages.flatMap((page) => page.players) ?? []),
    [data, isSearching, searchedPlayers],
  );

  const columns = useMemo<ColumnDef<PlayerRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all loaded rows"
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) =>
              table.toggleAllPageRowsSelected(checked === true)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select player ${row.original.id}`}
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          />
        ),
      },
      {
        accessorKey: "lastname",
        header: "Last Name",
        cell: ({ row }) => row.original.lastname,
      },
      {
        accessorKey: "firstname",
        header: "First Name",
        cell: ({ row }) => row.original.firstname,
      },
      {
        accessorKey: "middlename",
        header: "Middle Name",
        cell: ({ row }) => row.original.middlename ?? "-",
      },
      {
        accessorKey: "number",
        header: "Number",
        cell: ({ row }) => row.original.number ?? "-",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Open row actions">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/players/patch/${row.original.id}`)}>
                <PencilLine className="size-4" />
                Update
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setDeleteTargetIds([row.original.id]);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [router],
  );

  const table = useReactTable({
    data: players,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  const selectedCount = table.getSelectedRowModel().rows.length;

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
        <span>Loading players...</span>
      </div>
    );
  }

  if (error && !isSearching) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load players.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search players"
          className="max-w-sm"
        />
        {!ALGOLIA_PLAYERS_INDEX && (
          <p className="text-xs text-amber-700">
            Set NEXT_PUBLIC_ALGOLIA_PLAYERS_INDEX to enable search.
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {selectedCount > 0
            ? `${selectedCount} player(s) selected`
            : "Select rows to delete players"}
        </p>
        <Button
          variant="destructive"
          size="sm"
          disabled={selectedCount === 0}
          onClick={() => {
            const ids = table
              .getSelectedRowModel()
              .rows.map((row) => row.original.id);
            if (!ids.length) {
              return;
            }
            setDeleteTargetIds(ids);
            setDeleteDialogOpen(true);
          }}
        >
          <Trash2 className="size-4" />
          Delete Selected
        </Button>
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
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => openPlayerProfile(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onClick={
                        cell.column.id === "select" || cell.column.id === "actions"
                          ? (event) => event.stopPropagation()
                          : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No players found.
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
        {!isSearching && !hasNextPage && players.length > 0 && <span>End of players list.</span>}
        {!isSearching && !isFetchingNextPage && hasNextPage && isFetching && <span>Updating...</span>}
        {isSearching && !isSearchingAlgolia && !algoliaError && (
          <span>{players.length} result(s) found.</span>
        )}
      </div>

      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Confirm delete</h2>
            <p className="mt-2 text-sm text-slate-600">
              {deleteTargetIds.length === 1
                ? "Are you sure you want to delete this player?"
                : `Are you sure you want to delete ${deleteTargetIds.length} players?`}
            </p>
            <p className="mt-1 text-xs text-slate-500">This action cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDeleteTargetIds([]);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deletePlayersMutation.mutate(deleteTargetIds)}
                disabled={deletePlayersMutation.isPending}
              >
                {deletePlayersMutation.isPending ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
