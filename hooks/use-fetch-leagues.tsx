import { useEffect, useState } from "react";
import { League } from "@/types/models";
import { getLeagues } from "@/lib/leagues/crud";



export default function useFetchLeagues(): {
    leagues: League[];
    loading: boolean;
    error: Error | null;
} {

    const [leagues, setLeagues] = useState<League[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchLeagues = async () => {
        try {
            const fetchedLeagues = await getLeagues();
            setLeagues(fetchedLeagues);
        }
        catch (error) {
            console.error("Error fetching leagues:", error);
            setError(error as Error);
        }
        finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchLeagues();
    }, 
    [])

    return { leagues, loading, error };


}