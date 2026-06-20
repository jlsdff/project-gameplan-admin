// usePublishGame.ts

import { GameCreateInput, GameRecordPlayerStats, Player } from "@/types/models";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

const STAT_KEYS: (keyof GameRecordPlayerStats)[] = [
  "assists", "blocks", "fouls", "freeThrowsAttempted",
  "freeThrowsMade", "rebounds", "steals", "threePointsAttempted",
  "threePointsMade", "turnovers", "twoPointsAttempted", "twoPointsMade",
];

const hasZeroStats = (stat: GameRecordPlayerStats) =>
  STAT_KEYS.every((key) => stat[key] === 0);

const getTeamPoints = (stats: GameRecordPlayerStats[]) =>
  stats.reduce(
    (sum, s) => sum + s.twoPointsMade * 2 + s.threePointsMade * 3 + s.freeThrowsMade,
    0
  );

export type PublishStep = "form" | "did-not-play";

export interface GameDetailsForm {
  gameNumber: number | null;
  date: string;
  time: string;
  playerOfTheGame: string | null;
}

interface UsePublishGameParams {
  leagueId?: string;
  teamAId?: string;
  teamBId?: string;
  teamAStats?: GameRecordPlayerStats[];
  teamBStats?: GameRecordPlayerStats[];
  teamAPlayers?: Player[];
  teamBPlayers?: Player[];
  onPublish: (input: GameCreateInput) => Promise<void>;
}

export const usePublishGame = ({
  leagueId,
  teamAId,
  teamBId,
  teamAStats,
  teamBStats,
  teamAPlayers,
  teamBPlayers,
  onPublish,
}: UsePublishGameParams) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState<PublishStep>("form");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<GameDetailsForm>({
    gameNumber: null,
    date: "",
    time: "",
    playerOfTheGame: null,
  });

  const [didNotPlayIds, setDidNotPlayIds] = useState<string[]>([]);

  // --- Derived ---

  const teamAZeroStatPlayers = useMemo(
    () => {
      if(!teamAStats) return;
      return teamAStats.filter(hasZeroStats)
    },
    [teamAStats]
  );

  const teamBZeroStatPlayers = useMemo(
    () => {
      if(!teamBStats) return
      return teamBStats.filter(hasZeroStats)
    },
    [teamBStats]
  );

  const winningTeamPlayers = useMemo(() => {

    if(!teamAStats || !teamBStats) return;
    
    const teamAPoints = getTeamPoints(teamAStats);
    const teamBPoints = getTeamPoints(teamBStats);
    const winningStats = teamAPoints >= teamBPoints ? teamAStats : teamBStats;
    const winningPlayers = teamAPoints >= teamBPoints ? teamAPlayers : teamBPlayers;

    // Only include players who actually played (non-zero stats)
    return winningPlayers?.filter((player) =>
      winningStats.some((s) => s.playerId === player.id && !hasZeroStats(s))
    );
  }, [teamAStats, teamBStats, teamAPlayers, teamBPlayers]);

  // --- Form ---

  const updateForm = useCallback(
    <K extends keyof GameDetailsForm>(key: K, value: GameDetailsForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const isFormValid = useMemo(
    () =>
      form.gameNumber !== null &&
      form.date.trim() !== "" &&
      form.time.trim() !== "" &&
      form.playerOfTheGame !== null,
    [form]
  );

  // --- Modal controls ---

  const openModal = useCallback(() => {
    if(!teamAZeroStatPlayers || !teamBZeroStatPlayers) return;
    setStep("form");
    setDidNotPlayIds([
      ...teamAZeroStatPlayers.map((s) => s.id),
      ...teamBZeroStatPlayers.map((s) => s.id),
    ]);
    setError(null);
    setIsModalOpen(true);
  }, [teamAZeroStatPlayers, teamBZeroStatPlayers]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setError(null);
  }, []);

  const goNext = useCallback(() => {
    if (!isFormValid) return;
    setStep("did-not-play");
  }, [isFormValid]);

  const goBack = useCallback(() => {
    setStep("form");
    setError(null);
  }, []);

  // --- Did not play ---

  const toggleDidNotPlay = useCallback((statId: string) => {
    setDidNotPlayIds((prev) =>
      prev.includes(statId)
        ? prev.filter((id) => id !== statId)
        : [...prev, statId]
    );
  }, []);

  // --- Publish ---

  const confirmPublish = useCallback(async () => {
    if (!isFormValid || form.gameNumber === null) return;

    setIsLoading(true);
    setError(null);

    try {
      if(!leagueId || !teamAId || !teamBId || !teamAStats || !teamBStats) {
        toast.error("Publishing Error. Please refresh the page.")
        throw new Error("League id, Team ID, and Team Stats are not ready. Please refresh the page.")
      }
      const input: GameCreateInput = {
        leagueId,
        number: form.gameNumber,
        date: form.date,
        time: form.time,
        playerOfTheGame: form.playerOfTheGame,
        teamAId,
        teamBId,
        teamAPlayers: teamAStats.filter((s) => !didNotPlayIds.includes(s.id)),
        teamBPlayers: teamBStats.filter((s) => !didNotPlayIds.includes(s.id)),
      };

      console.log("PUBLISHING:", input)

      await onPublish(input);
      setIsModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish game");
    } finally {
      setIsLoading(false);
    }
  }, [
    isFormValid, form,
    leagueId, teamAId, teamBId,
    teamAStats, teamBStats,
    didNotPlayIds, onPublish,
  ]);

  return {
    // modal
    isModalOpen, step, isLoading, error,
    openModal, closeModal,
    // form
    form, updateForm, isFormValid, goNext,
    // did not play
    teamAZeroStatPlayers, teamBZeroStatPlayers,
    didNotPlayIds, toggleDidNotPlay,
    // winning team
    winningTeamPlayers,
    // publish
    goBack, confirmPublish,
  };
};