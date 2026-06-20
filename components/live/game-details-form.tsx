// PublishGameFormStep.tsx

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameDetailsForm } from "@/hooks/use-publish-game";
import { Player } from "@/types/models";
import { AlertDialogAction, AlertDialogCancel, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Button } from "../ui/button";

interface PublishGameFormStepProps {
  form: GameDetailsForm;
  winningTeamPlayers: Player[];
  isFormValid: boolean;
  onUpdate: <K extends keyof GameDetailsForm>(key: K, value: GameDetailsForm[K]) => void;
  onNext: () => void;
  onClose: () => void;
}

export const PublishGameFormStep = ({
  form,
  winningTeamPlayers,
  isFormValid,
  onUpdate,
  onNext,
  onClose,
}: PublishGameFormStepProps) => {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Game Details</AlertDialogTitle>
        <AlertDialogDescription>Step 1 of 2 — Fill in the game information.</AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {/* Game Number */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Game Number</label>
          <input
            type="number"
            value={form.gameNumber ?? ""}
            onChange={(e) => onUpdate("gameNumber", e.target.valueAsNumber)}
            placeholder="e.g. 1"
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onUpdate("date", e.target.value)}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Time */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Time</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => onUpdate("time", e.target.value)}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Player of the Game */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Player of the Game</label>
          <Select
            value={form.playerOfTheGame ?? ""}
            onValueChange={(value) => onUpdate("playerOfTheGame", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a player" />
            </SelectTrigger>
            <SelectContent>
              {winningTeamPlayers.map((player) => (
                <SelectItem key={player.id} value={player.id ?? ""}>
                  #{player.number} {player.firstname} {player.lastname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
        <Button disabled={!isFormValid} onClick={onNext}>  
          Next →
        </Button>
      </AlertDialogFooter>
    </>
  );
};