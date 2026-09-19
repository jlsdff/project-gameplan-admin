"use client"

import { useInfiniteQuery } from "@tanstack/react-query";
import { getInifiniteLiveStats } from "@/lib/live-stats/crud";
import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useMemo } from "react";

const PAGE_SIZE = 2;

const getLiveStats = ({ pageParam }:
    { pageParam: QueryDocumentSnapshot<DocumentData> | null }
) => getInifiniteLiveStats(PAGE_SIZE, pageParam);

export default function useInfiniteLiveStats() {

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
            getNextPageParam: (lastPage) => lastPage.hasMore 
                ? lastPage.lastVisible 
                : undefined,
            retry: false,
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