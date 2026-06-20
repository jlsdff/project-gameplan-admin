import { DecrementStat, IncrementStat } from "@/lib/live-stats/stat-command";
import { StatTracker } from "@/lib/live-stats/stat-tracker";
import { GameRecordPlayerStats, IncrementableStatKey } from "@/types/models";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";


interface UseStatTrackerParams {
    liveStatId?: string,
    stats?: GameRecordPlayerStats[]
}

export const useStatTracker = ({ liveStatId, stats }: UseStatTrackerParams) => {
  const trackerRef = useRef(new StatTracker());
  const [canUndo, setCanUndo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncUndoState = useCallback(() => {
    setCanUndo(trackerRef.current.hasHistory());
  }, []);

  const executeCommand = useCallback(
    async (
      statDocId: string,
      key: IncrementableStatKey,
      type: "increment" | "decrement",
      amount = 1
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        if(!stats || !liveStatId) throw new Error("Stats not found")
        const command = trackerRef.current.buildCommand(
          stats, statDocId, key, liveStatId, type, amount
        );
        await trackerRef.current.execute(command);
        syncUndoState();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update stat");
      } finally {
        setIsLoading(false);
      }
    },
    [stats, liveStatId, syncUndoState]
  );

  const increment = useCallback(
    (statDocId: string, key: IncrementableStatKey, amount = 1) =>
      executeCommand(statDocId, key, "increment", amount),
    [executeCommand]
  );

  const decrement = useCallback(
    (statDocId: string, key: IncrementableStatKey, amount = 1) =>
      executeCommand(statDocId, key, "decrement", amount),
    [executeCommand]
  );

  const undo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await trackerRef.current.undo();
      syncUndoState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to undo");
    } finally {
      setIsLoading(false);
    }
  }, [syncUndoState]);

  return { increment, decrement, undo, canUndo, isLoading, error };
};
