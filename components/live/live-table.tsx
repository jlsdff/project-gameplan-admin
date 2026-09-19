"use client"

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import useInfiniteLiveStats from "@/hooks/use-infinite-live-stats";
import { useEffect, useMemo, useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { League, LiveStatsForm, Team } from "@/types/models";
import { getTeam } from "@/lib/teams/crud";
import { getLeague } from "@/lib/leagues/crud";
import { Skeleton } from "../ui/skeleton";
import { Timestamp } from "firebase/firestore";
import { Trash } from "lucide-react";
import { deleteLiveStats } from "@/lib/live-stats/crud";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

const columnHelper = createColumnHelper<LiveStatsForm & {id: string}>();

export default function LiveStatsTable() {

    const [teams, setTeams] = useState<Team[]>([])
    const [leagues, setLeagues] = useState<League[]>([])
    const router = useRouter()
    const queryClient = useQueryClient()

    const columns = useMemo(() => [
        columnHelper.accessor('leagueId', {
            header: "LEAGUE",
            cell: (info) => {
                const league = leagues.find((l) => l.id === info.getValue());
                return <span>{league ? league.title : <Skeleton className="w-12 h-4 bg-slate-900/50"/>}</span>;
            },
        }),
        columnHelper.accessor('teamAId', {
            header: () => <span>TEAM A</span>,
            cell: (info) => {
                const team = teams.find((t) => t.id === info.getValue());
                return <span>{team ? team.teamName : <Skeleton className="w-12 h-4 bg-slate-900/50"/>}</span>;
            },
        }),
        columnHelper.accessor('teamBId', {
            header: () => <span>TEAM B</span>,
            cell: (info) => {
                const team = teams.find((t) => t.id === info.getValue());
                return <span>{team ? team.teamName : <Skeleton className="w-12 h-4 bg-slate-900/50"/>}</span>;
            },
        }),
        columnHelper.accessor<"createdAt", Timestamp>('createdAt', {
            header: "DATE CREATED",
            cell: (info) => {
                const date = info.getValue().toDate()
                return <span>{date.toLocaleDateString()}</span>
            }
        }),
        columnHelper.display({
            id: 'actions',
            header: "ACTIONS",
            cell: (info) => (
                <Button 
                    variant='destructive' 
                    size="xs" 
                    className="cursor-pointer"
                    onClick={ e => {
                        e.stopPropagation();
                        deleteLiveStats(info.row.original.id)
                            .then(() => {
                                queryClient.invalidateQueries({queryKey: ['live-stats']})
                                toast.success("Deletion successful")
                            })
                            .catch( e => toast.error("Deleting unsuccessful"))
                    }}
                     >
                    <Trash data-icon='inline-start' /> 
                    Delete
                </Button>
            )
        })
    ], [leagues, teams])

    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status, 
    } = useInfiniteLiveStats();

    const table = useReactTable({ 
        columns, 
        data : data ?? [],
        getCoreRowModel: getCoreRowModel()
    })

    const uniqueLeagueIds = useMemo(
    () => [...new Set(data?.map((row) => row.leagueId) ?? [])],
    [data]
    );

    const uniqueTeamIds = useMemo(
    () => [
        ...new Set([
        ...(data?.map((row) => row.teamAId) ?? []),
        ...(data?.map((row) => row.teamBId) ?? []),
        ]),
    ],
    [data]
    );

    useEffect(() => {
        if (!uniqueLeagueIds.length) return;

        const missingLeagueIds = uniqueLeagueIds.filter((id) => !leagues.some((l) => l.id === id));

        missingLeagueIds.forEach((id) => {
            getLeague(id)
                .then((league) => setLeagues((prev) => (prev.some((item) => item.id === league.id) ? prev : [...prev, league])))
                .catch((e) => console.error(e));
        });
    }, [uniqueLeagueIds, leagues]);

    useEffect(() => {
        if (!uniqueTeamIds.length) return;

        const missingTeamIds = uniqueTeamIds.filter((id) => !teams.some((t) => t.id === id));

        missingTeamIds.forEach((id) => {
            getTeam(id)
                .then((team) => setTeams((prev) => (prev.some((item) => item.id === team.id) ? prev : [...prev, team])))
                .catch((e) => console.error(e));
        });
    }, [uniqueTeamIds, teams]);

    
    return (
        <section className="bg-slate-100 p-4 rounded-xl">
        <Table>

            <TableHeader>

                {
                    table.getHeaderGroups().map( headerGroup => (
                        <TableRow key={headerGroup.id} >
                            {
                                headerGroup.headers.map( header => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext(),
                                        )}
                                    </TableHead>
                                ))
                            }
                        </TableRow>
                    ))
                }
                
            </TableHeader>
            <TableBody>
                {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                    <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-200 "
                    onClick={e => router.push(`/live/edit/${row.original.id}`)}
                    >
                    {row.getVisibleCells().map((cell) => (
                        <TableCell
                        key={cell.id}
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

            <TableFooter className="bg-transparent hover:bg-transparent">
                <TableRow>
                    <TableCell colSpan={4} className="text-center ">
                        <Button 
                            className=""
                            size='sm'
                            variant='ghost'
                            onClick={() => fetchNextPage()} 
                            disabled={!hasNextPage || isFetching}
                        >
                                Load More
                        </Button>
                    </TableCell>
                </TableRow>
            </TableFooter>

        </Table>
        </section>
    )
}