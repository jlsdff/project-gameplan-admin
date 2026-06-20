import { getTeamsByIds } from "@/lib/teams/crud";
import { League, Team } from "@/types/models";
import { useEffect, useState } from "react";

export default function useFetchParticipatingTeams(league: League | null): {
    teams: Team[],
    loading: boolean
    error: Error | null
} {

    const [loading, setLoading] = useState<boolean>(true);
    const [teams, setTeams] = useState<Team[]>([]);
    const [error, setError] = useState<Error | null>(null);

    const fetchTeams = async () => {

        try {
            if(league) {
                const teams = await getTeamsByIds(league?.participatingTeams);
                setTeams(teams)
            }
        } catch (error) {
            setError(error as Error);
        } finally {
            setLoading(false)
        }
    }

    useEffect(( ) => {
        fetchTeams();
    }, [league])

    return {teams, loading, error}



}