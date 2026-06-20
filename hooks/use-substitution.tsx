import { Player } from "@/types/models";
import { useMemo, useState, useCallback } from "react";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

interface useSubstitutionParams {
    liveStatId: string | undefined;
    teamPlayers: Player[] | undefined;
    playingPlayers: string[] | undefined;
    teamKey: 'teamA' | 'teamB';
}



export default function useSubstitution(
    {liveStatId, teamPlayers, playingPlayers, teamKey} : useSubstitutionParams
) {

    const [selectedOutgoingId, setSelectedOutgoingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const benchPlayers = useMemo(() => {
        if(!teamPlayers || !playingPlayers) return;
        return teamPlayers.filter( player => !playingPlayers.includes(player.id ?? "") )
    }, [teamPlayers, playingPlayers])

    const selectedOutgoingPlayer = useMemo(
        () => {
            if(!teamPlayers) return;
            return teamPlayers.find((player) => player.id === selectedOutgoingId) ?? null
        },
    [teamPlayers, selectedOutgoingId]);

    const selectOutgoing = useCallback((playerId: string) => {
        setSelectedOutgoingId(playerId);
        setIsModalOpen(true);
        setError(null);
    }, []);
    
    const confirmSwap = useCallback(
        async (incomingId: string) => {
        if (!selectedOutgoingId) return;

        setIsLoading(true);
        setError(null);

        try {
            if(!liveStatId || !playingPlayers) return;
            const updatedPlayingPlayers = playingPlayers.map((id) =>
            id === selectedOutgoingId ? incomingId : id
            );

            // Updates only the specific team's array using dot notation
            await updateDoc(doc(db, "live-stats", liveStatId), {
            [`playingPlayers.${teamKey}`]: updatedPlayingPlayers,  // ← new
            });

            setIsModalOpen(false);
            setSelectedOutgoingId(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to substitute player");
        } finally {
            setIsLoading(false);
        }
        },
        [selectedOutgoingId, playingPlayers, liveStatId, teamKey]
    );


    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedOutgoingId(null);
        setError(null);
    }, []);

    return {
        benchPlayers,
        selectedOutgoingPlayer,
        isModalOpen,
        isLoading,
        error,
        selectOutgoing,
        confirmSwap,
        closeModal,
    };
};
