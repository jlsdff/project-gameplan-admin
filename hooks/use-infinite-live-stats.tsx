"use client"

import { useInfiniteQuery } from "@tanstack/react-query";
import { getInifiniteLiveStats } from "@/lib/live-stats/crud";
import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useMemo, useState } from "react";
import { League, Team } from "@/types/models";

export default function useInfiniteLiveStats() {

    const PAGE_SIZE = 2

    const getLiveStats = async ({pageParam}:
        {pageParam: QueryDocumentSnapshot<DocumentData> | null}
    ) => {
        return await getInifiniteLiveStats(PAGE_SIZE, pageParam);
    }

    const [teams, setTeams] = useState<Team[]>([]);
    const [leagues, setLeagues] = useState<League[]>([])

    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status, 
    } = useInfiniteQuery(
        {
            queryKey: ['live-stats', PAGE_SIZE],
            queryFn: getLiveStats,
            initialPageParam: null,
            getNextPageParam: (lastPage, page) => lastPage.hasMore 
                ? lastPage.lastVisible 
                : null
        }
    )

    const flatLiveStat = useMemo(() => {
        return data?.pages.map( page => page.liveStats).flat()
    }, [data])
    
    return {
        data: flatLiveStat,
        error,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status, 
    }
}