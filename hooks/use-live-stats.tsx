import { getInitialData } from "@/lib/live-stats/crud";
import { League, Player, Team } from "@/types/models";
import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";


export default function useFetchLiveStats(id:string ) {

    const [league, setLeague] = useState<League>();
    const [teamA, setTeamA] = useState<Team>();
    const [teamB, setTeamB] = useState<Team>();
    const [players, setPlayers] = useState<Player[]>();
    const [fetchingStatus, setFetchingStatus] = useState<boolean>(true);

    const fetchData = useCallback(async () => {

        try {

            const initialData = await getInitialData(id);

            setLeague(initialData.league)
            setTeamA(initialData.teamA)
            setTeamB(initialData.teamB)
            setPlayers(initialData.players)

        } catch(error){

            const message =
                typeof error === "object" && error !== null && "message" in error
                ? String((error as { message?: string }).message)
                : "";
            toast.error(message)

        }finally {
            setFetchingStatus(false)
        }
        
        
    }, [])

    useEffect(() => {
        fetchData()
    }, [])

    return {
        league, 
        teamA,
        teamB,
        players,
        fetchingStatus,
    }
}