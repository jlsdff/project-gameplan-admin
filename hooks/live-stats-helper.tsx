import { summarizeTeam } from "@/components/games/GameEditor";
import { db } from "@/lib/firebase/firebase";
import { GamePlayerStats, GameRecordPlayerStats, League, Player, Team } from "@/types/models"
import { collection, doc, DocumentSnapshot, getDocs, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner";

type LiveStatProps = {
    id: string;
    league: League | undefined;
    teamA: Team | undefined;
    teamB: Team | undefined;
    players: Player[] | undefined;
}

export default function useLiveStats({
    id, league, teamA, teamB, players
}: LiveStatProps) {

    const [ snap, setSnap ] = useState<DocumentSnapshot>();
    const [teamAPlayingPlayers, setTeamAPlayingPlayers] = useState<string[]>()
    const [teamBPlayingPlayers, setTeamBPlayingPlayers] = useState<string[]>()
    const [stats, setStats] = useState<GamePlayerStats[]>();

    useEffect(() => {
        if (!id) {
            setSnap(undefined)
            setTeamAPlayingPlayers(undefined)
            setTeamBPlayingPlayers(undefined)
            return;
        }

        const liveStatsDoc = doc(db, 'live-stats', id)

        const unsubscribe = onSnapshot(liveStatsDoc, (snapshot) => {
            if (snapshot.exists()) {
                setSnap(snapshot)
                setTeamAPlayingPlayers(snapshot.data().playingPlayers?.teamA ?? [])
                setTeamBPlayingPlayers(snapshot.data().playingPlayers?.teamB ?? [])
            } else {
                toast.error("Live Stats Document not found in the database.")
            }
        })

        return () => unsubscribe();
    }, [id])

    useEffect(() => {
        if (!id) {
            setStats(undefined)
            return;
        }

        const liveStatsDoc = doc(db, 'live-stats', id)
        const ref = collection(liveStatsDoc, 'stats')

        const unsubscribe = onSnapshot(ref, (snapshot) => {
            if (!snapshot.empty) {
                const sts: GameRecordPlayerStats[] = [];
                snapshot.forEach((doc) => {
                    sts.push({
                        ...(doc.data() as Omit<GameRecordPlayerStats, 'id' | 'playerId'>),
                        id: doc.id,
                        playerId: doc.data().id,
                    });
                });
                setStats(sts);
            } else {
                setStats([]);
                toast.error("No stats found in this Live Stats document.");
            }
        });

        return () => unsubscribe();
    }, [id])


    const teamAPlayers = useMemo(():Player[] | undefined => {

        if(!teamA || !players){
            return
        }

        const teamAPlayers:Player[] = teamA.players.map(
            (player) => {
                return players.find( p => p.id == player) as Player
            }
        )

        return teamAPlayers

    }, [players])

    const teamBPlayers = useMemo(():Player[] | undefined => {

        if(!teamB || !players){
            return
        }
        
        const teamBPlayers:Player[] = teamB.players.map(
            (player) => {
                return players.find( (p) => p.id == player) as Player
            }
        )

        return teamBPlayers;
        
    }, [players])

    
    const teamAStats = useMemo(() => {

        const teamAPlayerStats = stats?.filter( st => {
            if(!st.playerId) return
            return teamA?.players?.includes(st?.playerId)
        })

        if(!teamAPlayerStats) return;

        return summarizeTeam(teamAPlayerStats)

    }, [stats])

    const teamBStats = useMemo(() => {

        const teamBPlayerStats = stats?.filter( st => {
            if(!st.playerId) return
            return teamB?.players?.includes(st?.playerId)
        })

        if(!teamBPlayerStats) return;

        return summarizeTeam(teamBPlayerStats)
    }, [stats])
    

    return {
        snap,
        teamAPlayers,
        teamBPlayers,
        teamAStats,
        teamBStats,
        teamAPlayingPlayers,
        teamBPlayingPlayers,
        stats
    }



}