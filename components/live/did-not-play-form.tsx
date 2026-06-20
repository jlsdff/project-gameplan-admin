// PublishGameDidNotPlayStep.tsx

import { GameRecordPlayerStats, Player } from "@/types/models";
import { AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Button } from "../ui/button";

interface PublishGameDidNotPlayStepProps {
  teamAZeroStatPlayers: GameRecordPlayerStats[];
  teamBZeroStatPlayers: GameRecordPlayerStats[];
  teamAPlayers: Player[];
  teamBPlayers: Player[];
  didNotPlayIds: string[];
  isLoading: boolean;
  error: string | null;
  onToggle: (statId: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}

const PlayerCheckList = ({
  statPlayers,
  allPlayers,
  didNotPlayIds,
  onToggle,
  isLoading,
}: {
  statPlayers: GameRecordPlayerStats[];
  allPlayers: Player[];
  didNotPlayIds: string[];
  onToggle: (id: string) => void;
  isLoading: boolean;
}) => {
  if (statPlayers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        All players have recorded stats
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {statPlayers.map((stat) => {
        const player = allPlayers.find((p) => p.id === stat.playerId);
        const isChecked = didNotPlayIds.includes(stat.id);

        return (
          <label
            key={stat.id}
            className={`flex items-center gap-2 rounded-md border px-3 py-3 cursor-pointer transition-colors
              ${isChecked ? "bg-muted text-muted-foreground" : "hover:bg-accent"}
              ${isLoading ? "opacity-50 pointer-events-none" : ""}
            `}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(stat.id)}
              disabled={isLoading}
              className="accent-primary"
            />
            <span className="font-bold text-sm shrink-0">#{player?.number}</span>
            <span className="text-sm truncate">
              {player?.firstname} {player?.lastname}
            </span>
          </label>
        );
      })}
    </div>
  );
};

export const PublishGameDidNotPlayStep = ({
  teamAZeroStatPlayers,
  teamBZeroStatPlayers,
  teamAPlayers,
  teamBPlayers,
  didNotPlayIds,
  isLoading,
  error,
  onToggle,
  onBack,
  onConfirm,
}: PublishGameDidNotPlayStepProps) => {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Review Did Not Play</AlertDialogTitle>
        <AlertDialogDescription>
          Step 2 of 2 — Checked players will be excluded from the game record.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="overflow-y-auto flex-1 flex flex-col gap-4 pr-1">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Team A</h3>
          <PlayerCheckList
            statPlayers={teamAZeroStatPlayers}
            allPlayers={teamAPlayers}
            didNotPlayIds={didNotPlayIds}
            onToggle={onToggle}
            isLoading={isLoading}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Team B</h3>
          <PlayerCheckList
            statPlayers={teamBZeroStatPlayers}
            allPlayers={teamBPlayers}
            didNotPlayIds={didNotPlayIds}
            onToggle={onToggle}
            isLoading={isLoading}
          />
        </div>
      </div>

      <AlertDialogFooter>
        <div className="flex flex-col gap-1 items-end">
          <div className="flex gap-2">
              <AlertDialogCancel disabled={isLoading} onClick={onBack}>
                ← Back
              </AlertDialogCancel>
              <Button disabled={isLoading} onClick={onConfirm}>  {/* ← Button, not AlertDialogAction */}
                {isLoading ? "Publishing..." : "Publish"}
            </Button>
          </div>
          <div>
            <span className="text-red-700 text-sm">Once published, this live stats record will be deleted.</span>
          </div>
        </div>
      </AlertDialogFooter>
    </>
  );
};